-- db/migrations/2026-09-09_medidor_qr_free_quota_10.sql
-- MEDIDOR QR V1 — FREE QUOTA ADJUSTMENT: sube el cupo gratuito de
-- 1 Medidor QR/mes a 10 Medidores QR/mes por cuenta. Reemplaza
-- completamente el límite anterior — no es un plan pago, sigue siendo
-- 100% gratis, V1.
--
-- MECANISMO ANTERIOR (2026-09-08_medidor_qr_v1.sql): un
-- UNIQUE(organizer_id, period_key) en medidor_qr_free_usage hacía que
-- solo pudiera existir UNA fila por organizador+período — el límite
-- de "1" era estructural, no un número configurable. Un conteo de "10"
-- no puede expresarse con una constraint UNIQUE simple, así que el
-- mecanismo cambia a un conteo atómico bajo un advisory lock
-- transaccional.
--
-- NUEVO MECANISMO: se retira el UNIQUE (ya no aplica — ahora se
-- permite más de una fila por organizador+período, hasta 10). La
-- autoridad pasa a create_medidor_qr(): toma
-- pg_advisory_xact_lock(hashtextextended(organizer_id || ':' ||
-- period_key, 0)) — serializa únicamente las llamadas concurrentes
-- del MISMO organizador+período (nunca bloquea a otro organizador ni
-- a otro período, cero contención cruzada), cuenta las filas ya
-- existentes de ese organizador+período, y solo si el conteo es < 10
-- procede a insertar el Medidor y la fila de ledger. El chequeo ahora
-- ocurre ANTES de insertar el Medidor (nunca después) — a diferencia
-- del mecanismo anterior (insertar primero, revertir con RAISE
-- EXCEPTION si la cuota ya estaba usada), acá nunca se llega a
-- insertar el Medidor si la cuota ya está agotada, así que no hace
-- falta revertir nada: cero riesgo de huérfanos por diseño, no por
-- rollback.
--
-- Preserva sin cambios: atomicidad bajo concurrencia real (probada en
-- vivo, ver tests/medidorQr.test.mjs), ownership, RLS (revoke all
-- sigue intacto en medidor_qr_free_usage, ver migración base),
-- period_key mensual calendario (currentFreePeriodKey, sin cambios),
-- semántica histórica (eliminar/cerrar/finalizar un Medidor NUNCA
-- devuelve cupo — la fila de ledger es insert-only y nunca se borra),
-- aislamiento entre organizadores, y que solo la CREACIÓN de un
-- Medidor consume una unidad (visitas/respuestas/Excel/clics/edición/
-- descarga del QR nunca tocan esta tabla).
--
-- Idempotente y segura de re-ejecutar: el DROP CONSTRAINT usa IF
-- EXISTS, CREATE OR REPLACE FUNCTION reemplaza limpio con la misma
-- firma exacta (sin necesidad de DROP FUNCTION primero). Aplicar
-- únicamente contra rifex-dev — jamás PROD.

alter table public.medidor_qr_free_usage
  drop constraint if exists medidor_qr_free_usage_one_per_period;

-- El límite vive como literal comentado dentro de la función — mismo
-- criterio que el resto del código de Medidor QR (p.ej. 2-4 opciones
-- hardcodeadas en create_medidor_qr), no hay una tabla de
-- configuración de planes en V1.
create or replace function public.create_medidor_qr(
  p_organizer_id uuid,
  p_period_key text,
  p_organizer_name_snapshot text,
  p_name text,
  p_question text,
  p_options jsonb,
  p_measurement_start timestamptz,
  p_measurement_end timestamptz,
  p_destination_url text,
  p_destination_button_label text,
  p_slug text
) returns jsonb
language plpgsql
as $$
declare
  v_medidor public.medidores_qr;
  v_used_count int;
  v_free_quota_limit constant int := 10;
begin
  if p_options is null or jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) < 2 or jsonb_array_length(p_options) > 4 then
    return jsonb_build_object('ok', false, 'error', 'invalid_options');
  end if;
  if p_name is null or char_length(trim(p_name)) < 1 or char_length(p_name) > 120 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;

  -- Serializa únicamente las llamadas concurrentes del mismo
  -- organizador+período — otros organizadores y otros períodos nunca
  -- se bloquean entre sí. Se libera solo al terminar la transacción
  -- (xact_lock), por eso el conteo + inserción de abajo quedan
  -- atómicos entre sí sin necesitar un `for update` sobre filas que
  -- todavía no existen.
  perform pg_advisory_xact_lock(hashtextextended(p_organizer_id::text || ':' || p_period_key, 0));

  select count(*) into v_used_count
  from public.medidor_qr_free_usage
  where organizer_id = p_organizer_id and period_key = p_period_key;

  if v_used_count >= v_free_quota_limit then
    return jsonb_build_object('ok', false, 'error', 'free_quota_already_used');
  end if;

  begin
    insert into public.medidores_qr (
      organizer_id, organizer_name_snapshot, name, question, options,
      measurement_start, measurement_end, destination_url, destination_button_label, slug
    )
    values (
      p_organizer_id, p_organizer_name_snapshot, p_name, p_question, p_options,
      p_measurement_start, p_measurement_end, p_destination_url, p_destination_button_label, p_slug
    )
    returning * into v_medidor;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'slug_collision');
  end;

  insert into public.medidor_qr_free_usage (organizer_id, period_key, medidor_qr_id)
  values (p_organizer_id, p_period_key, v_medidor.id);

  return jsonb_build_object('ok', true, 'medidor', to_jsonb(v_medidor));
end;
$$;

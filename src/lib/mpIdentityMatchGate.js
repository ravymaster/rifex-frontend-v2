// src/lib/mpIdentityMatchGate.js
// Corrección canónica (2026-08-27) — resuelve y persiste
// mp_identity_match: el control real de que el RUT declarado en Rifex
// coincide con el titular de la cuenta Mercado Pago conectada. Llamado
// desde src/pages/api/mp/oauth/callback.js justo después de conectar, y
// puede volver a llamarse para revalidar (cambio de RUT, reconexión).
//
// Nunca guarda una segunda copia innecesaria del RUT de Mercado Pago —
// solo el resultado de la comparación (estado + fecha + versión de
// regla + motivo estructurado), nunca el número mismo. El access_token
// nunca se registra en logs.
import { createClient } from '@supabase/supabase-js';
import { normalizeRut, isValidRut } from './trustIdentityPolicy.js';
import { MP_MATCH_STATUS, MP_MATCH_RULE_VERSION, evaluateMpIdentityMatch } from './mpIdentityMatchPolicy.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

/**
 * Extrae, de forma defensiva, un RUT normalizado desde la respuesta
 * cruda de GET https://api.mercadopago.com/users/me — NUNCA asume que
 * el campo existe (ver docs/trust/MP_IDENTITY_MATCH_AUDIT.md: no se
 * pudo confirmar en vivo si Chile lo entrega). Revisa las formas
 * conocidas del objeto `identification` en las distintas versiones de
 * la API de Mercado Pago/MercadoLibre; si ninguna aplica, retorna null
 * — nunca inventa un valor.
 */
export function extractMpRutFromUsersMe(me) {
  if (!me || typeof me !== 'object') return null;
  const candidates = [
    me?.identification?.number,
    me?.identification?.id,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      const normalized = normalizeRut(candidate);
      if (isValidRut(normalized)) return normalized;
    }
  }
  return null;
}

/**
 * Resuelve el match real para un usuario ya conectado a Mercado Pago.
 * `usersMeResponse` es la respuesta cruda (ya parseada) de
 * GET /users/me que el callback OAuth ya obtuvo — este módulo nunca
 * vuelve a llamar a Mercado Pago por su cuenta.
 */
export async function resolveMpIdentityMatch({ userId, mpUserId, usersMeResponse }) {
  const { data: onboarding } = await supabase
    .from('trust_onboarding')
    .select('rut_normalized')
    .eq('user_id', userId)
    .maybeSingle();

  const mpRutNormalized = extractMpRutFromUsersMe(usersMeResponse);
  const status = evaluateMpIdentityMatch({
    rifexRutNormalized: onboarding?.rut_normalized || null,
    mpRutNormalized,
  });

  const reasonCode =
    status === MP_MATCH_STATUS.UNAVAILABLE ? 'mp_did_not_return_identification'
    : status === MP_MATCH_STATUS.NEEDS_REVIEW ? 'rifex_rut_not_declared_yet'
    : status === MP_MATCH_STATUS.MISMATCH ? 'rut_mismatch'
    : status === MP_MATCH_STATUS.MATCHED ? 'rut_match'
    : null;

  // Restricción real (Fase 5, punto 6): un mismo mp_user_id no puede
  // dejar 'matched'/'connected' a más de una cuenta Rifex activa a la
  // vez — antes de guardar, revisa si otra cuenta YA tiene este
  // mp_user_id conectado (revoked_at is null). Nunca revela de quién es
  // — el mensaje al usuario nunca nombra la otra cuenta.
  if (mpUserId) {
    const { data: existingOwner } = await supabase
      .from('merchant_gateways')
      .select('user_id')
      .eq('provider', 'mp')
      .eq('mp_user_id', String(mpUserId))
      .is('revoked_at', null)
      .neq('user_id', userId)
      .maybeSingle();
    if (existingOwner) {
      await supabase
        .from('merchant_gateways')
        .update({
          mp_identity_match: MP_MATCH_STATUS.NEEDS_REVIEW,
          mp_identity_matched_at: new Date().toISOString(),
          mp_identity_match_reason: 'mp_account_already_linked_elsewhere',
          mp_match_rule_version: MP_MATCH_RULE_VERSION,
        })
        .eq('user_id', userId)
        .eq('provider', 'mp');
      return { status: MP_MATCH_STATUS.NEEDS_REVIEW, reason: 'mp_account_already_linked_elsewhere' };
    }
  }

  const { error } = await supabase
    .from('merchant_gateways')
    .update({
      mp_identity_match: status,
      mp_identity_matched_at: new Date().toISOString(),
      mp_identity_match_reason: reasonCode,
      mp_match_rule_version: MP_MATCH_RULE_VERSION,
    })
    .eq('user_id', userId)
    .eq('provider', 'mp');
  if (error) {
    console.error('[mpIdentityMatchGate] error guardando match:', error.message);
  }

  return { status, reason: reasonCode };
}

// La invalidación al desconectar (Fase 5, punto 9) vive inline en
// src/pages/api/mp/disconnect.js, dentro del mismo UPDATE que ya limpia
// el resto de la fila — evita una segunda escritura separada que
// podría intercalarse con la primera.

-- DRAW-1: lifecycle temporal de rifa + extensiones + declaraciones legales.
-- Aditiva: no renombra ni elimina ninguna columna existente. Aplicada
-- únicamente en rifex-dev (proyecto DEV), nunca en PROD. Un rollback al
-- código V1 después de esta migración sigue siendo seguro: las columnas
-- nuevas quedan simplemente sin uso si el código deja de leerlas.

ALTER TABLE public.raffles
  ADD COLUMN IF NOT EXISTS sales_end_at timestamptz,
  ADD COLUMN IF NOT EXISTS draw_at timestamptz,
  ADD COLUMN IF NOT EXISTS timezone text,
  ADD COLUMN IF NOT EXISTS extension_limit integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extensions_used integer NOT NULL DEFAULT 0;

-- Auditoría mínima de quién/qué disparó cada sorteo ya persistido
-- (sold-out automático, reconciliación, o sorteo manual explícito).
ALTER TABLE public.raffle_results
  ADD COLUMN IF NOT EXISTS trigger_source text,
  ADD COLUMN IF NOT EXISTS triggered_by uuid;

-- Historial de extensiones de fecha de sorteo. No se sobreescribe nunca:
-- cada extensión agrega una fila nueva.
CREATE TABLE IF NOT EXISTS public.raffle_date_extensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raffle_id uuid NOT NULL,
  previous_draw_at timestamptz,
  new_draw_at timestamptz NOT NULL,
  previous_sales_end_at timestamptz,
  new_sales_end_at timestamptz NOT NULL,
  changed_by uuid NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_raffle_date_extensions_raffle_id
  ON public.raffle_date_extensions(raffle_id);

-- Declaraciones legales del creador (18+, propiedad del premio). Genérica
-- por entity_type/entity_id para reusarse con Campañas más adelante.
CREATE TABLE IF NOT EXISTS public.legal_declarations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  declaration_type text NOT NULL,
  policy_version text NOT NULL DEFAULT 'v1.0',
  accepted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_legal_declarations_entity
  ON public.legal_declarations(entity_type, entity_id);

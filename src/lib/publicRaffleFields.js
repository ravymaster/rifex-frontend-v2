// src/lib/publicRaffleFields.js
// Campos públicos de rifas (2026-11-06): lista CERRADA de columnas de
// `raffles` que pueden llegar a una página o respuesta pública.
//
// Regla: una columna nueva de `raffles` no es pública por defecto — para
// que lo sea hay que agregarla aquí a propósito (y en la migración de
// permisos por columna). Quedan fuera los datos del creador e internos
// (correo, id del creador, plan, forma de pago) y todo lo que se agregue
// en el futuro.
//
// Campos tomados de lo que realmente consumen rifas/[id].jsx (ficha,
// galería, condiciones del premio, fechas, slug/canonical) y
// rifas/[id]/checkout.jsx.
export const PUBLIC_RAFFLE_COLUMNS = Object.freeze([
  'id',
  'slug',
  'title',
  'description',
  'status',
  'theme',
  'price_cents',
  'total_numbers',
  'prize_type',
  'prize_amount_cents',
  'prize_photos',
  'delivery_method',
  'requires_transfer_procedures',
  'transfer_expenses_owner',
  'transfer_conditions',
  'features',
  'timezone',
  'start_date',
  'end_date',
  'sales_end_at',
  'draw_at',
  'extension_limit',
  'extensions_used',
  'created_at',
]);

export const PUBLIC_RAFFLE_SELECT = PUBLIC_RAFFLE_COLUMNS.join(',');

// Rifas heredadas (tabla `rifas`): mismas reglas, sin el id del creador
// (`creador_id`). Alineado con db/migrations/2026-11-06_raffles_public_column_grants.sql.
export const LEGACY_RIFAS_SELECT =
  'id,titulo,descripcion,tipo_premio,precio_clp,cupos,temas,inicio,termino,estado,created_at';

// Segunda barrera, por si una consulta trae más columnas de las públicas
// (p. ej. el detalle necesita `creator_id` en el servidor para calcular el
// nivel de confianza): la respuesta se arma SOLO con la lista blanca.
export function toPublicRaffle(row) {
  if (!row) return null;
  const out = {};
  for (const key of PUBLIC_RAFFLE_COLUMNS) {
    if (key in row) out[key] = row[key];
  }
  return out;
}

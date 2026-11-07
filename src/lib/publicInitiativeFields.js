// src/lib/publicInitiativeFields.js
// Campos públicos de Eventos, Inscripciones, Campañas y Medidor QR
// (2026-11). Mismo criterio que src/lib/publicRaffleFields.js: lista
// CERRADA de columnas que pueden llegar a una página o respuesta pública.
// Una columna nueva no es pública por defecto — hay que agregarla aquí a
// propósito (y en la migración de permisos por columna).
//
// `id` de la iniciativa se mantiene porque las páginas públicas lo usan
// para sus propias llamadas (checkout, registro, tipos de entrada). Nunca
// se publica el id del organizador ni datos de pago, administración o
// participantes.

export const PUBLIC_EVENT_COLUMNS = Object.freeze([
  'id',
  'slug',
  'title',
  'description',
  'cover_image_url',
  'gallery_urls',
  'starts_at',
  'ends_at',
  'timezone',
  'venue_name',
  'address',
  'terms_text',
  'status',
  'capacity',
  'created_at',
]);

export const PUBLIC_TICKET_TYPE_COLUMNS = Object.freeze([
  'id',
  'name',
  'price_cents',
  'quantity_total',
  'quantity_sold',
  'quantity_reserved',
  'max_per_order',
  'sales_start_at',
  'sales_end_at',
  'sort_order',
  'status',
]);

export const PUBLIC_ACTIVITY_COLUMNS = Object.freeze([
  'id',
  'slug',
  'title',
  'description',
  'cover_image_url',
  'starts_at',
  'ends_at',
  'timezone',
  'venue_name',
  'address',
  'modality',
  'instructions',
  'organizer_name_snapshot',
  'capacity',
  'status',
]);

export const PUBLIC_COLECTA_COLUMNS = Object.freeze([
  'id',
  'slug',
  'title',
  'description',
  'cover_image_url',
  'gallery_urls',
  'status',
  'goal_cents',
  'start_at',
  'end_at',
  'created_at',
]);

export const PUBLIC_MEDIDOR_COLUMNS = Object.freeze([
  'id',
  'slug',
  'question',
  'options',
  'status',
  'measurement_start',
  'measurement_end',
  'destination_url',
  'destination_button_label',
]);

export const toSelect = (columns) => columns.join(',');

// Segunda barrera: la respuesta se arma SOLO con la lista blanca, aunque
// la consulta haya traído más columnas para cálculos del servidor.
export function pickPublic(row, columns) {
  if (!row) return null;
  const out = {};
  for (const key of columns) {
    if (key in row) out[key] = row[key];
  }
  return out;
}

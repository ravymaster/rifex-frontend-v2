// src/lib/idOrSlug.js
// RAFFLE VISUAL POLISH (2026-09-07) — helper compartido para resolver un
// segmento de URL que puede ser el UUID interno real o el slug amigable
// nuevo (/rifas/<uuid> sigue funcionando siempre; /rifas/<slug> es el
// link nuevo). Nunca se reemplaza el id real — solo se elige por cuál
// columna filtrar.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

// Devuelve el nombre de columna correcto para un `.eq(col, value)`.
export function idOrSlugColumn(value) {
  return isUuid(value) ? 'id' : 'slug';
}

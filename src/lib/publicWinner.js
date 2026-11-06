// src/lib/publicWinner.js
// Lo único que se publica del ganador de una rifa: número, fecha del
// sorteo y un nombre ENMASCARADO (primer nombre + inicial del apellido,
// p. ej. "Juan P."). Nunca el correo ni el nombre completo, aunque
// `raffle_results` los tenga (los usan las notificaciones internas, que
// corren con service_role y no pasan por aquí).
export const PUBLIC_WINNER_SELECT = 'number,created_at,buyer_name';

export function maskBuyerName(name) {
  if (typeof name !== 'string') return null;
  const clean = name.trim();
  // Si el "nombre" es en realidad un correo (rifas antiguas guardaban el
  // correo como respaldo), no se muestra nada.
  if (!clean || clean.includes('@')) return null;
  const parts = clean.split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (parts.length === 1) return first;
  const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase();
  return `${first} ${lastInitial}.`;
}

export function toPublicWinner(row) {
  if (!row) return null;
  return {
    number: row.number ?? null,
    created_at: row.created_at ?? null,
    display_name: maskBuyerName(row.buyer_name),
  };
}

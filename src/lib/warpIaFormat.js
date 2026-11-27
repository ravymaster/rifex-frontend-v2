// src/lib/warpIaFormat.js
// Formato de celdas del panel «Warp IA» (/ia). Un dato ausente se muestra como
// «No disponible», nunca como cero.
export const NO_DISPONIBLE = 'No disponible';

export function formatCell(row, [field, , kind]) {
  const v = row?.[field];
  if (v === null || v === undefined || v === '') return NO_DISPONIBLE;
  if (kind === 'date') {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return NO_DISPONIBLE;
    try {
      return d.toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Santiago' });
    } catch {
      return NO_DISPONIBLE;
    }
  }
  if (kind === 'int') return typeof v === 'number' ? v.toLocaleString('es-CL') : NO_DISPONIBLE;
  if (kind === 'money') {
    if (typeof v !== 'number') return NO_DISPONIBLE;
    return `${v.toLocaleString('es-CL')}${row.currency ? ` ${row.currency}` : ''}`;
  }
  return String(v);
}


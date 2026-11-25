// src/lib/colectaStatus.js
// Única autoridad para el estado "efectivo" de una Colecta. Una campaña
// activa cuyo end_at ya pasó se comporta como finalizada en todos lados
// (página pública, checkout, dashboard) sin depender de que algo actualice
// la columna status por su cuenta — se calcula siempre al leer.
export function deriveEffectiveStatus(colecta) {
  if (!colecta) return null;
  const { status, end_at } = colecta;
  if (status === 'deleted') return 'deleted';
  if (status === 'draft') return 'draft';
  if (status === 'closed') return 'closed';
  // status === 'active'
  if (end_at && new Date(end_at).getTime() <= Date.now()) return 'finished';
  return 'active';
}

export function isAcceptingContributions(colecta) {
  return deriveEffectiveStatus(colecta) === 'active';
}

export const STATUS_LABEL_ES = {
  draft: 'Borrador',
  active: 'Activa',
  finished: 'Finalizada',
  closed: 'Cerrada',
  deleted: 'Eliminada',
};

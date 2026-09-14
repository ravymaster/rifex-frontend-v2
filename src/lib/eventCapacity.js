// src/lib/eventCapacity.js
// EVENT-8 — núcleo puro de la regla de aforo, compartido por
// api/events/index.js, api/events/[id]/index.js y
// api/events/[id]/ticket-types/*. La autoridad REAL e inescapable vive en
// los triggers SQL de la migración 2026-08-30_event8_capacity_live_attendance.sql
// (_check_event_capacity + los dos triggers que lo invocan) — este módulo
// es un espejo en JS, mismo criterio que src/lib/eventStaffAuth.js frente
// a check_in_event_ticket: validación temprana con mejor UX (evita un
// round-trip a la DB solo para descubrir un formato inválido), nunca un
// reemplazo de la autoridad real. Si este cálculo y el trigger alguna vez
// divergen, el trigger gana siempre.
//
// capacity=null significa "sin aforo definido" — nunca un valor
// inventado (0 sería falso: "no vende nada"). Ver cabecera de la
// migración para la decisión de producto completa.

/**
 * Valida el formato de un valor de `capacity` recibido desde el body de
 * una request. No consulta nada — puro.
 * @returns {{provided:false}|{provided:true,ok:true,value:number|null}|{provided:true,ok:false,error:'invalid_capacity'}}
 */
export function parseCapacityInput(raw) {
  if (raw === undefined) return { provided: false };
  if (raw === null || raw === '') return { provided: true, ok: true, value: null };
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    return { provided: true, ok: false, error: 'invalid_capacity' };
  }
  return { provided: true, ok: true, value: n };
}

/**
 * Cupo "comprometido" de un evento — misma fórmula exacta que
 * _check_event_capacity en SQL:
 *   - tipo ACTIVO: cuenta su quantity_total completo (cupo vendible
 *     configurado, se pueda vender o no en este momento).
 *   - tipo en cualquier OTRO estado (hidden, etc.): cuenta
 *     quantity_sold + quantity_reserved — nunca su quantity_total —
 *     porque un tipo ocultado sigue representando asistentes reales ya
 *     comprometidos, y jamás debe "desaparecer" del cálculo de aforo.
 */
export function computeCommittedCapacity(ticketTypes) {
  return (ticketTypes || []).reduce((total, t) => {
    const contribution = t.status === 'active'
      ? (Number(t.quantity_total) || 0)
      : (Number(t.quantity_sold) || 0) + (Number(t.quantity_reserved) || 0);
    return total + contribution;
  }, 0);
}

/**
 * true si, con el `capacity` dado, la suma comprometida de `ticketTypes`
 * superaría el aforo. capacity=null/undefined siempre retorna false —
 * "sin aforo definido" nunca bloquea nada (ver cabecera del archivo).
 */
export function wouldExceedCapacity(capacity, ticketTypes) {
  if (capacity === null || capacity === undefined) return false;
  return computeCommittedCapacity(ticketTypes) > capacity;
}

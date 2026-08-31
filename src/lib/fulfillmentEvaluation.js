// CUMPLIMIENTO-1 — dominio puro/testeable de evaluación de estado, sin
// scheduler, sin Date.now() escondido. La regla temporal "sin respuestas
// después del plazo" nunca lee el reloj por sí misma: recibe
// `afterDeadline` como contexto explícito que el llamador debe calcular
// y pasar. CUMPLIMIENTO-4 es el primer código real que invoca esta
// función con afterDeadline:true — desde
// src/lib/fulfillmentTimeline.js, siempre con un `now` explícito
// recibido como parámetro, nunca leído del reloj del sistema acá.

export const FULFILLMENT_STATUSES = Object.freeze({
  PENDING_DELIVERY: "pending_delivery",
  CREATOR_REPORTED_DELIVERED: "creator_reported_delivered",
  FULFILLMENT_CONFIRMED: "fulfillment_confirmed",
  DELIVERY_PENDING: "delivery_pending",
  UNDER_REVIEW: "under_review",
  UNCONFIRMED: "unconfirmed",
});

export const CREATOR_RESPONSES = Object.freeze({
  YES: "yes",
  COORDINATING: "coordinating",
  NOT_YET: "not_yet",
});

export const WINNER_RESPONSES = Object.freeze({
  YES: "yes",
  NOT_YET: "not_yet",
});

const VALID_STATUSES = new Set(Object.values(FULFILLMENT_STATUSES));
const VALID_CREATOR_RESPONSES = new Set(Object.values(CREATOR_RESPONSES));
const VALID_WINNER_RESPONSES = new Set(Object.values(WINNER_RESPONSES));

export function isValidFulfillmentStatus(status) {
  return VALID_STATUSES.has(status);
}

export function isValidCreatorResponse(value) {
  return value === null || value === undefined || VALID_CREATOR_RESPONSES.has(value);
}

export function isValidWinnerResponse(value) {
  return value === null || value === undefined || VALID_WINNER_RESPONSES.has(value);
}

/**
 * Evalúa el estado canónico de un caso de cumplimiento a partir de las
 * respuestas actuales de creador/ganador. Función pura: mismo input,
 * mismo output siempre — sin efectos secundarios, sin I/O, sin reloj.
 *
 * Regla de producto (peso de evidencia): la confirmación del propio
 * ganador tiene prioridad para acreditar recepción — "winner yes" cierra
 * el caso incluso si el creador nunca respondió. El silencio nunca se
 * interpreta como incumplimiento ni como fraude.
 *
 * @param {{ creatorResponse?: 'yes'|'coordinating'|'not_yet'|null, winnerResponse?: 'yes'|'not_yet'|null, afterDeadline?: boolean }} input
 * @returns {string} uno de FULFILLMENT_STATUSES
 */
export function evaluateFulfillmentStatus({ creatorResponse = null, winnerResponse = null, afterDeadline = false } = {}) {
  if (!isValidCreatorResponse(creatorResponse)) {
    throw new Error(`invalid_creator_response: ${creatorResponse}`);
  }
  if (!isValidWinnerResponse(winnerResponse)) {
    throw new Error(`invalid_winner_response: ${winnerResponse}`);
  }

  // El ganador confirma recepción -> cumplimiento confirmado, sin
  // importar qué haya dicho o no el creador.
  if (winnerResponse === WINNER_RESPONSES.YES) {
    return FULFILLMENT_STATUSES.FULFILLMENT_CONFIRMED;
  }

  // Creador dice que entregó, pero el ganador dice que no la recibió ->
  // discrepancia real, requiere revisión. Esta combinación ya tiene
  // evidencia explícita en ambos lados — nunca se "degrada" a
  // unconfirmed por vencimiento de plazo (ver ADDENDUM: WINNER_DENIED_
  // RECEIPT pesa distinto que WINNER_NO_RESPONSE, y ambas escalan a
  // revisión interna, nunca se etiquetan como silencio).
  if (creatorResponse === CREATOR_RESPONSES.YES && winnerResponse === WINNER_RESPONSES.NOT_YET) {
    return FULFILLMENT_STATUSES.UNDER_REVIEW;
  }

  // Creador dice que entregó, ganador todavía no respondió nada ->
  // "entrega informada", pendiente de que el ganador confirme. Nunca se
  // sanciona automáticamente por el silencio del ganador. Si el plazo
  // futuro ya venció sin que el ganador respondiera, la regla temporal
  // (todavía no implementada) puede pedir "sin confirmación" pasando
  // afterDeadline:true explícitamente.
  if (creatorResponse === CREATOR_RESPONSES.YES && winnerResponse == null) {
    return afterDeadline ? FULFILLMENT_STATUSES.UNCONFIRMED : FULFILLMENT_STATUSES.CREATOR_REPORTED_DELIVERED;
  }

  // Ninguna de las dos partes ha dicho nada todavía -> estado inicial.
  // Si el plazo futuro ya venció sin ninguna respuesta, la regla
  // temporal puede pedir "sin confirmación".
  if (creatorResponse == null && winnerResponse == null) {
    return afterDeadline ? FULFILLMENT_STATUSES.UNCONFIRMED : FULFILLMENT_STATUSES.PENDING_DELIVERY;
  }

  // Cualquier otra combinación involucra al menos una señal explícita
  // que no es "sí" de ninguna de las dos partes (creador coordinando o
  // diciendo que aún no entrega; o el ganador dice que no la recibió
  // mientras el creador no confirma entrega) -> entrega pendiente. Esta
  // combinación tampoco se relabelea como "unconfirmed" por vencimiento
  // de plazo, porque ya hay evidencia real, no silencio puro.
  return FULFILLMENT_STATUSES.DELIVERY_PENDING;
}

export const ESCALATION_REASONS = Object.freeze({
  WINNER_DENIED_RECEIPT: "winner_denied_receipt",
  WINNER_NO_RESPONSE: "winner_no_response",
});

/**
 * CUMPLIMIENTO-4 — distingue el peso probatorio de un caso no resuelto
 * al cierre del ciclo: una negativa explícita del ganador
 * (`winner_response='not_yet'`) NO es equivalente a su silencio total
 * (`winner_response=null`) — ambas escalan a revisión interna, pero
 * nunca deben presentarse como lo mismo. Función pura, solo aplicable
 * a casos que efectivamente terminan sin `fulfillment_confirmed` (el
 * llamador decide cuándo invocarla, nunca lee el reloj acá).
 *
 * @param {{ winnerResponse?: 'yes'|'not_yet'|null }} input
 * @returns {string|null} uno de ESCALATION_REASONS, o null si el caso
 *   no debería escalar (winnerResponse='yes' -> ya confirmado).
 */
export function determineEscalationReason({ winnerResponse = null } = {}) {
  if (!isValidWinnerResponse(winnerResponse)) {
    throw new Error(`invalid_winner_response: ${winnerResponse}`);
  }
  if (winnerResponse === WINNER_RESPONSES.YES) return null;
  if (winnerResponse === WINNER_RESPONSES.NOT_YET) return ESCALATION_REASONS.WINNER_DENIED_RECEIPT;
  return ESCALATION_REASONS.WINNER_NO_RESPONSE;
}

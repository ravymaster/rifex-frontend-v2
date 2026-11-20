// CUMPLIMIENTO-5 — traducción de estados técnicos a lenguaje humano
// para las vistas /admin/cumplimiento. Compartido entre el listado y
// el expediente para que la traducción nunca diverja entre ambos.
// Auditados contra los valores reales de fulfillmentEvaluation.js,
// fulfillmentCommunications.js y adminFulfillmentReview.js antes de
// mapearlos -- nunca inventados.
export const STATUS_LABEL = {
  pending_delivery: "Pendiente de entrega",
  creator_reported_delivered: "Entrega informada por el creador",
  fulfillment_confirmed: "Cumplimiento confirmado",
  delivery_pending: "Entrega pendiente",
  under_review: "En revisión",
  unconfirmed: "Sin confirmación",
};

export const ESCALATION_REASON_LABEL = {
  winner_denied_receipt: "El ganador informó que aún no recibe el premio.",
  winner_no_response: "No se obtuvo confirmación del ganador dentro del plazo.",
};

export const ADMIN_REVIEW_STATUS_LABEL = {
  null: "Pendiente de revisión",
  in_review: "En revisión",
  resolved: "Resuelto",
  closed_without_determination: "Cerrado sin determinación",
};

export const CREATOR_RESPONSE_LABEL = {
  yes: "Ya entregó el premio",
  coordinating: "Coordinando la entrega",
  not_yet: "Todavía no lo entrega",
};

export const WINNER_RESPONSE_LABEL = {
  yes: "Recibió el premio",
  not_yet: "Todavía no lo recibe",
};

export const COMMUNICATION_TYPE_LABEL = {
  DAY_0_WINNER: "Día 0 — Ganador",
  DAY_0_CREATOR: "Día 0 — Creador",
  DAY_10_WINNER: "Día 10 — Ganador",
  DAY_10_CREATOR: "Día 10 — Creador",
  DAY_15_REMINDER_WINNER: "Día 15 — Recordatorio al ganador",
  DAY_15_REMINDER_CREATOR: "Día 15 — Recordatorio al creador",
  DAY_20_INTERNAL_ESCALATION: "Día 20 — Expediente interno",
  DAY_20_REVIEW_NOTICE_WINNER: "Día 20 — Aviso de revisión al ganador",
  DAY_20_REVIEW_NOTICE_CREATOR: "Día 20 — Aviso de revisión al creador",
};

export const COMMUNICATION_STATUS_LABEL = {
  sent: "Enviado",
  failed: "No se pudo enviar",
  skipped: "Omitido",
  pending: "Pendiente",
};

export const PRIZE_TYPE_LABEL = { physical: "Premio físico", money: "Dinero en efectivo" };

export const DELIVERY_METHOD_LABEL = {
  retira_en_tienda: "Retiro / entrega presencial",
  envio_incluido: "Envío incluido por el creador",
  envio_pagado: "Envío a cargo del ganador",
  a_convenir: "A convenir con el creador",
  envio_creador: "Envío a cargo del creador",
};

export const TRANSFER_OWNER_LABEL = { creator: "el creador", winner: "el ganador" };

export function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short", timeZone: "America/Santiago" });
  } catch {
    return "—";
  }
}

export function ageInDays(iso) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / 86400000);
}

/**
 * Cronología humana construida ÚNICAMENTE a partir de evidencia
 * persistida (case.winner_determined_at + eventos reales) -- nunca se
 * inventa un paso que no tenga respaldo en la base.
 */
export function buildHumanTimeline(fulfillmentCase, events) {
  const items = [];
  if (fulfillmentCase.winner_determined_at) {
    items.push({ at: fulfillmentCase.winner_determined_at, text: "Rifa finalizada y ganador determinado — caso de cumplimiento creado" });
  }
  for (const e of events || []) {
    const meta = e.metadata || {};
    const by = meta.admin_email ? ` (${meta.admin_email})` : "";
    switch (e.event_type) {
      case "case_created":
        // Ya representado por winner_determined_at arriba -- evita duplicar la misma línea.
        break;
      case "creator_response_recorded":
        items.push({ at: e.created_at, text: `Creador respondió: ${CREATOR_RESPONSE_LABEL[meta.response] || meta.response}` });
        break;
      case "winner_response_recorded":
        items.push({ at: e.created_at, text: `Ganador respondió: ${WINNER_RESPONSE_LABEL[meta.response] || meta.response}` });
        break;
      case "creator_late_response_recorded":
        items.push({ at: e.created_at, text: `Creador respondió (fuera de plazo): ${CREATOR_RESPONSE_LABEL[meta.response] || meta.response}` });
        break;
      case "winner_late_response_recorded":
        items.push({ at: e.created_at, text: `Ganador respondió (fuera de plazo): ${WINNER_RESPONSE_LABEL[meta.response] || meta.response}` });
        break;
      case "day20_closed":
        items.push({
          at: e.created_at,
          text: meta.escalation_reason
            ? `Caso cerrado automáticamente y enviado a revisión — ${STATUS_LABEL[e.new_status] || e.new_status}`
            : `Caso cerrado automáticamente — ${STATUS_LABEL[e.new_status] || e.new_status}`,
        });
        break;
      case "admin_review_started":
        items.push({ at: e.created_at, text: `Revisión administrativa iniciada${by}` });
        break;
      case "admin_note_added":
        items.push({ at: e.created_at, text: `Nota interna agregada${by}`, note: meta.note || null });
        break;
      case "admin_review_resolved":
        items.push({ at: e.created_at, text: `Revisión resuelta: ${ADMIN_REVIEW_STATUS_LABEL[meta.resolution] || meta.resolution}${by}`, note: meta.note || null });
        break;
      default:
        // Tipo de evento desconocido/futuro -- se muestra tal cual en vez de ocultarlo silenciosamente.
        items.push({ at: e.created_at, text: e.event_type });
    }
  }
  return items.sort((a, b) => new Date(a.at) - new Date(b.at));
}

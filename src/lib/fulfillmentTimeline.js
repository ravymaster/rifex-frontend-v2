// CUMPLIMIENTO-4 — línea de tiempo Día 10 / Día 15 / Día 20 y
// escalamiento interno. Orquestador puro-en-su-lógica-temporal: NUNCA
// lee el reloj del sistema -- todo llamador (endpoint cron, test, QA)
// debe pasar `now` explícitamente a processFulfillmentTimeline(now).
// No depende de estado en memoria entre llamadas: cada decisión se
// toma releyendo el estado real en base de datos (ledger de
// comunicaciones + closed_at/escalated_at en el caso), por lo que es
// seguro invocarlo repetidamente y desde procesos distintos (ver
// sección "Idempotencia" en docs/cumplimiento/
// CUMPLIMIENTO_4_RESPONSES_AND_TIMELINE.md).
import { createClient } from "@supabase/supabase-js";
import {
  evaluateFulfillmentStatus,
  determineEscalationReason,
} from "./fulfillmentEvaluation.js";
import { CASE_COLUMNS, getOpenFulfillmentCases, insertEvent } from "./fulfillmentCaseService.js";
import {
  ensureCommunicationIntent,
  markAttempt,
  ensureWinnerAccessToken,
  getCommunicationLedgerForCase,
} from "./fulfillmentCommunications.js";
import {
  sendFulfillmentDay10WinnerEmail,
  sendFulfillmentDay10CreatorEmail,
  sendFulfillmentDay15ReminderWinnerEmail,
  sendFulfillmentDay15ReminderCreatorEmail,
  sendFulfillmentInternalEscalationEmail,
  sendFulfillmentReviewNoticeWinnerEmail,
  sendFulfillmentReviewNoticeCreatorEmail,
} from "./mailer.js";

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

export const DAY_10 = 10;
export const DAY_15 = 15;
export const DAY_20 = 20;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// CUMPLIMIENTO-4 sección 12: el expediente interno de Día 20 usa un
// único intent técnico por caso (no hay un "destinatario ganador" ni
// "destinatario creador" real -- va a direcciones internas de Rifex).
// El CHECK de recipient_role (CUMPLIMIENTO-3) solo admite 'winner'/
// 'creator' -- se reutiliza 'creator' como valor técnico fijo y
// arbitrario únicamente para obtener la garantía exactly-once del
// UNIQUE(case_id, communication_type, recipient_role) ya existente, sin
// requerir un tercer valor de enum ni una migración adicional.
const INTERNAL_ESCALATION_ROLE = "creator";

function baseUrl() {
  return (process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
}

function panelCaseLink(raffleId) {
  return `${baseUrl()}/panel/cumplimiento/${raffleId}`;
}

function safeError(err) {
  if (!err) return null;
  const s = typeof err === "string" ? err : err?.message || JSON.stringify(err);
  return String(s).slice(0, 300);
}

/**
 * Días transcurridos desde el ancla del caso (winner_determined_at)
 * hasta `now`, como número real (puede ser fraccionario). Función pura
 * -- nunca lee Date.now() por sí misma, siempre recibe `now` explícito.
 *
 * @param {string} anchorIso
 * @param {Date|string} now
 * @returns {number}
 */
export function daysSince(anchorIso, now) {
  const anchorMs = new Date(anchorIso).getTime();
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  return (nowMs - anchorMs) / MS_PER_DAY;
}

/** ¿`now` ya alcanzó o superó `days` días desde el ancla? */
export function isAtOrAfterDay(anchorIso, now, days) {
  return daysSince(anchorIso, now) >= days;
}

async function getRaffleCreatorEmail(raffleId) {
  const { data, error } = await supabaseAdmin.from("raffles").select("creator_email").eq("id", raffleId).maybeSingle();
  if (error) throw error;
  return data?.creator_email || null;
}

async function finalizeAttempt(intentId, send, onSentFlag, resultRef) {
  if (send?.skipped) {
    await markAttempt(intentId, { status: "skipped" });
  } else if (send?.ok) {
    await markAttempt(intentId, { status: "sent", sent_at: new Date().toISOString(), provider_message_id: send.id || null });
    resultRef[onSentFlag] = true;
  } else {
    await markAttempt(intentId, { status: "failed", last_error_safe: safeError(send?.error) });
  }
}

/**
 * Día 10 -- pregunta a ganador y creador. Idempotente: un intent ya
 * 'sent' nunca se reenvía; reintentos de un intent fallido son seguros
 * (mismo patrón exactly-once-intent de sendDay0Communications).
 */
async function processDay10(fulfillmentCase, now, result) {
  const caseId = fulfillmentCase.raffle_id;

  try {
    const intent = await ensureCommunicationIntent(caseId, "DAY_10_WINNER", "winner");
    if (intent.status !== "sent") {
      const { raw } = await ensureWinnerAccessToken(fulfillmentCase, intent);
      const accessLink = raw ? `${baseUrl()}/cumplimiento/caso/${raw}` : null;
      await markAttempt(intent.id, {
        attempt_count: (intent.attempt_count || 0) + 1,
        first_attempted_at: intent.first_attempted_at || now.toISOString(),
      });
      const send = await sendFulfillmentDay10WinnerEmail({
        to: fulfillmentCase.winner_buyer_email,
        winnerName: fulfillmentCase.winner_buyer_name,
        raffleTitle: fulfillmentCase.raffle_title,
        accessLink,
      });
      await finalizeAttempt(intent.id, send, "day10WinnerSent", result);
    } else {
      result.day10WinnerSent = true;
    }
  } catch (e) {
    console.error("[fulfillmentTimeline] Day10 winner error", e?.message || e);
  }

  try {
    const intent = await ensureCommunicationIntent(caseId, "DAY_10_CREATOR", "creator");
    if (intent.status !== "sent") {
      await markAttempt(intent.id, {
        attempt_count: (intent.attempt_count || 0) + 1,
        first_attempted_at: intent.first_attempted_at || now.toISOString(),
      });
      const creatorEmail = await getRaffleCreatorEmail(caseId);
      const send = await sendFulfillmentDay10CreatorEmail({
        to: creatorEmail,
        raffleTitle: fulfillmentCase.raffle_title,
        panelLink: panelCaseLink(caseId),
      });
      await finalizeAttempt(intent.id, send, "day10CreatorSent", result);
    } else {
      result.day10CreatorSent = true;
    }
  } catch (e) {
    console.error("[fulfillmentTimeline] Day10 creator error", e?.message || e);
  }
}

/**
 * Día 15 -- recordatorio, EXCLUSIVAMENTE a quien todavía no respondió.
 * Si ya respondió, nunca se crea el intent (no hay "reminder" para
 * alguien que ya contestó) -- ver sección 8 del mandato.
 */
async function processDay15(fulfillmentCase, now, result) {
  const caseId = fulfillmentCase.raffle_id;

  if (fulfillmentCase.winner_response == null) {
    try {
      const intent = await ensureCommunicationIntent(caseId, "DAY_15_REMINDER_WINNER", "winner");
      if (intent.status !== "sent") {
        const { raw } = await ensureWinnerAccessToken(fulfillmentCase, intent);
        const accessLink = raw ? `${baseUrl()}/cumplimiento/caso/${raw}` : null;
        await markAttempt(intent.id, {
          attempt_count: (intent.attempt_count || 0) + 1,
          first_attempted_at: intent.first_attempted_at || now.toISOString(),
        });
        const send = await sendFulfillmentDay15ReminderWinnerEmail({
          to: fulfillmentCase.winner_buyer_email,
          winnerName: fulfillmentCase.winner_buyer_name,
          raffleTitle: fulfillmentCase.raffle_title,
          accessLink,
        });
        await finalizeAttempt(intent.id, send, "day15WinnerSent", result);
      } else {
        result.day15WinnerSent = true;
      }
    } catch (e) {
      console.error("[fulfillmentTimeline] Day15 winner error", e?.message || e);
    }
  }

  if (fulfillmentCase.creator_response == null) {
    try {
      const intent = await ensureCommunicationIntent(caseId, "DAY_15_REMINDER_CREATOR", "creator");
      if (intent.status !== "sent") {
        await markAttempt(intent.id, {
          attempt_count: (intent.attempt_count || 0) + 1,
          first_attempted_at: intent.first_attempted_at || now.toISOString(),
        });
        const creatorEmail = await getRaffleCreatorEmail(caseId);
        const send = await sendFulfillmentDay15ReminderCreatorEmail({
          to: creatorEmail,
          raffleTitle: fulfillmentCase.raffle_title,
          panelLink: panelCaseLink(caseId),
        });
        await finalizeAttempt(intent.id, send, "day15CreatorSent", result);
      } else {
        result.day15CreatorSent = true;
      }
    } catch (e) {
      console.error("[fulfillmentTimeline] Day15 creator error", e?.message || e);
    }
  }
}

/**
 * Ensambla el expediente interno de revisión -- solo hechos y
 * respuestas registradas, nunca tokens/secrets/credenciales de
 * Mercado Pago ni datos de otros compradores (ver sección 12/26 del
 * mandato). Función pura sobre el snapshot ya cerrado del caso.
 */
export function buildInternalDossier(fulfillmentCase, { escalationReason, ledger = [] } = {}) {
  return {
    caseReference: fulfillmentCase.raffle_id,
    raffleId: fulfillmentCase.raffle_id,
    raffleTitle: fulfillmentCase.raffle_title,
    creatorId: fulfillmentCase.creator_id,
    winnerTicketNumber: fulfillmentCase.winner_ticket_number,
    winnerReference: fulfillmentCase.winner_buyer_email || fulfillmentCase.winner_purchase_id || null,
    prizeType: fulfillmentCase.prize_type,
    prizeAmountCents: fulfillmentCase.prize_amount_cents,
    deliveryMethod: fulfillmentCase.delivery_method,
    requiresTransferProcedures: fulfillmentCase.requires_transfer_procedures,
    transferExpensesOwner: fulfillmentCase.transfer_expenses_owner,
    transferConditions: fulfillmentCase.transfer_conditions,
    day0At: fulfillmentCase.winner_determined_at,
    winnerResponse: fulfillmentCase.winner_response,
    winnerResponseAt: fulfillmentCase.winner_response_at,
    creatorResponse: fulfillmentCase.creator_response,
    creatorResponseAt: fulfillmentCase.creator_response_at,
    finalStatus: fulfillmentCase.status,
    escalationReason,
    communications: ledger.map((row) => ({
      type: row.communication_type,
      role: row.recipient_role,
      status: row.status,
      sentAt: row.sent_at,
    })),
  };
}

function dossierToHtmlRows(dossier) {
  const row = (label, value) =>
    `<tr><td style="padding:6px 8px;border:1px solid #e5e7eb;background:#f9fafb;width:45%"><b>${label}</b></td><td style="padding:6px 8px;border:1px solid #e5e7eb">${value ?? "-"}</td></tr>`;
  return [
    row("Caso / rifa", dossier.caseReference),
    row("Título de la rifa", dossier.raffleTitle),
    row("Referencia del creador", dossier.creatorId),
    row("Referencia del ganador", dossier.winnerReference),
    row("Número ganador", dossier.winnerTicketNumber),
    row("Tipo de premio", dossier.prizeType),
    row("Modalidad de entrega", dossier.deliveryMethod),
    row("Trámites de transferencia", dossier.requiresTransferProcedures ? `Sí (a cargo de ${dossier.transferExpensesOwner || "-"})` : "No"),
    row("Condiciones declaradas", dossier.transferConditions),
    row("Día 0 (determinación de ganador)", dossier.day0At),
    row("Respuesta del ganador", dossier.winnerResponse ?? "sin respuesta"),
    row("Respuesta del creador", dossier.creatorResponse ?? "sin respuesta"),
    row("Estado final automático", dossier.finalStatus),
    row("Motivo de escalamiento", dossier.escalationReason),
    row("Comunicaciones registradas", dossier.communications.map((c) => `${c.type}:${c.status}`).join(", ") || "-"),
  ].join("");
}

function dossierToText(dossier) {
  return [
    `Caso: ${dossier.caseReference}`,
    `Rifa: ${dossier.raffleTitle}`,
    `Creador: ${dossier.creatorId}`,
    `Ganador: ${dossier.winnerReference}`,
    `Número ganador: ${dossier.winnerTicketNumber}`,
    `Día 0: ${dossier.day0At}`,
    `Respuesta ganador: ${dossier.winnerResponse ?? "sin respuesta"}`,
    `Respuesta creador: ${dossier.creatorResponse ?? "sin respuesta"}`,
    `Estado final: ${dossier.finalStatus}`,
    `Motivo de escalamiento: ${dossier.escalationReason}`,
    `Comunicaciones: ${dossier.communications.map((c) => `${c.type}:${c.status}`).join(", ") || "-"}`,
  ].join("\n");
}

function complianceReviewEmails() {
  const raw = process.env.RIFEX_COMPLIANCE_REVIEW_EMAILS || "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Envía el expediente interno -- exactamente una vez por caso. Usa el
 * mismo ledger exactly-once-intent que el resto de las comunicaciones;
 * un reintento de Día 20 nunca reenvía un expediente ya confirmado.
 */
async function sendInternalEscalation(fulfillmentCase, escalationReason, ledger, result) {
  const caseId = fulfillmentCase.raffle_id;
  try {
    const intent = await ensureCommunicationIntent(caseId, "DAY_20_INTERNAL_ESCALATION", INTERNAL_ESCALATION_ROLE);
    if (intent.status === "sent") {
      result.internalEscalationSent = true;
      return;
    }
    await markAttempt(intent.id, {
      attempt_count: (intent.attempt_count || 0) + 1,
      first_attempted_at: intent.first_attempted_at || new Date().toISOString(),
    });
    const recipients = complianceReviewEmails();
    if (recipients.length === 0) {
      await markAttempt(intent.id, { status: "failed", last_error_safe: "RIFEX_COMPLIANCE_REVIEW_EMAILS not configured" });
      return;
    }
    const dossier = buildInternalDossier(fulfillmentCase, { escalationReason, ledger });
    const send = await sendFulfillmentInternalEscalationEmail({
      to: recipients,
      raffleTitle: fulfillmentCase.raffle_title,
      caseReference: fulfillmentCase.raffle_id,
      dossierHtmlRows: dossierToHtmlRows(dossier),
      dossierText: dossierToText(dossier),
    });
    await finalizeAttempt(intent.id, send, "internalEscalationSent", result);
  } catch (e) {
    console.error("[fulfillmentTimeline] internal escalation error", e?.message || e);
  }
}

/** Aviso de revisión al ganador y al creador -- exactamente una vez cada uno, nunca lenguaje de fraude/culpabilidad. */
async function sendReviewNotices(fulfillmentCase, result) {
  const caseId = fulfillmentCase.raffle_id;

  try {
    const intent = await ensureCommunicationIntent(caseId, "DAY_20_REVIEW_NOTICE_WINNER", "winner");
    if (intent.status !== "sent") {
      const { raw } = await ensureWinnerAccessToken(fulfillmentCase, intent);
      const accessLink = raw ? `${baseUrl()}/cumplimiento/caso/${raw}` : null;
      await markAttempt(intent.id, {
        attempt_count: (intent.attempt_count || 0) + 1,
        first_attempted_at: intent.first_attempted_at || new Date().toISOString(),
      });
      const send = await sendFulfillmentReviewNoticeWinnerEmail({
        to: fulfillmentCase.winner_buyer_email,
        winnerName: fulfillmentCase.winner_buyer_name,
        raffleTitle: fulfillmentCase.raffle_title,
        accessLink,
      });
      await finalizeAttempt(intent.id, send, "reviewNoticeWinnerSent", result);
    } else {
      result.reviewNoticeWinnerSent = true;
    }
  } catch (e) {
    console.error("[fulfillmentTimeline] review notice winner error", e?.message || e);
  }

  try {
    const intent = await ensureCommunicationIntent(caseId, "DAY_20_REVIEW_NOTICE_CREATOR", "creator");
    if (intent.status !== "sent") {
      await markAttempt(intent.id, {
        attempt_count: (intent.attempt_count || 0) + 1,
        first_attempted_at: intent.first_attempted_at || new Date().toISOString(),
      });
      const creatorEmail = await getRaffleCreatorEmail(caseId);
      const send = await sendFulfillmentReviewNoticeCreatorEmail({
        to: creatorEmail,
        raffleTitle: fulfillmentCase.raffle_title,
        panelLink: panelCaseLink(caseId),
      });
      await finalizeAttempt(intent.id, send, "reviewNoticeCreatorSent", result);
    } else {
      result.reviewNoticeCreatorSent = true;
    }
  } catch (e) {
    console.error("[fulfillmentTimeline] review notice creator error", e?.message || e);
  }
}

/**
 * Cierre automático de Día 20. Idempotencia real: el UPDATE solo toca
 * la fila si closed_at todavía es null en ese instante exacto (compare-
 * and-swap vía `.is('closed_at', null)`) -- si dos invocaciones
 * concurrentes del scheduler llegan al mismo caso, como mucho UNA gana
 * el UPDATE; la otra recibe `updated === null` y no reenvía nada. El
 * evento append-only y los correos de escalamiento/aviso solo se
 * disparan cuando ESTA llamada fue la que efectivamente cerró el caso.
 */
async function processDay20(fulfillmentCase, now, result) {
  const caseId = fulfillmentCase.raffle_id;
  const newStatus = evaluateFulfillmentStatus({
    creatorResponse: fulfillmentCase.creator_response,
    winnerResponse: fulfillmentCase.winner_response,
    afterDeadline: true,
  });
  const escalationReason = determineEscalationReason({ winnerResponse: fulfillmentCase.winner_response });
  const previousStatus = fulfillmentCase.status;
  const nowIso = now.toISOString();

  const patch = { status: newStatus, closed_at: nowIso };
  if (escalationReason) {
    patch.escalated_at = nowIso;
    patch.escalation_reason = escalationReason;
  }

  const { data: updated, error } = await supabaseAdmin
    .from("raffle_fulfillment_cases")
    .update(patch)
    .eq("raffle_id", caseId)
    .is("closed_at", null)
    .select(CASE_COLUMNS)
    .maybeSingle();
  if (error) throw error;

  if (!updated) {
    // Otro proceso ya cerró este caso entre la lectura y este UPDATE --
    // no hay nada más que hacer, evita reenvíos duplicados.
    result.day20AlreadyClosed = true;
    return;
  }

  await insertEvent({
    caseId,
    eventType: "day20_closed",
    actorType: "system",
    previousStatus,
    newStatus,
    metadata: { escalation_reason: escalationReason },
  });
  result.day20Closed = true;
  result.day20FinalStatus = newStatus;
  result.day20EscalationReason = escalationReason;

  if (escalationReason) {
    const ledger = await getCommunicationLedgerForCase(caseId);
    await sendInternalEscalation(updated, escalationReason, ledger, result);
    await sendReviewNotices(updated, result);
  }
}

/**
 * Orquestador central de la línea de tiempo de cumplimiento. Recorre
 * todos los casos abiertos (closed_at is null), y para cada uno aplica
 * -- en orden, siempre según el `now` explícito recibido -- Día 10,
 * Día 15 y Día 20 cuando corresponda. Cada etapa es independientemente
 * idempotente (ledger de comunicaciones + guarda closed_at), así que es
 * seguro invocar esta función repetidamente, incluso si quedó "atrasada"
 * (ej. el cron estuvo caído varios días): procesa todas las etapas
 * vencidas en la misma pasada sin duplicar nada.
 *
 * @param {Date} now -- SIEMPRE explícito, nunca Date.now() implícito.
 * @returns {Promise<{ processed: number, results: object[] }>}
 */
export async function processFulfillmentTimeline(now) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error("processFulfillmentTimeline requires an explicit valid Date `now`");
  }

  const cases = await getOpenFulfillmentCases();
  const results = [];

  for (const fulfillmentCase of cases) {
    const anchor = fulfillmentCase.winner_determined_at;
    if (!anchor) continue;

    const result = { raffleId: fulfillmentCase.raffle_id };

    if (isAtOrAfterDay(anchor, now, DAY_10)) {
      await processDay10(fulfillmentCase, now, result);
    }
    if (isAtOrAfterDay(anchor, now, DAY_15)) {
      await processDay15(fulfillmentCase, now, result);
    }
    if (isAtOrAfterDay(anchor, now, DAY_20)) {
      await processDay20(fulfillmentCase, now, result);
    }

    results.push(result);
  }

  return { processed: results.length, results };
}

// CUMPLIMIENTO-1 — servicio de dominio para raffle_fulfillment_cases.
// Todo acceso pasa por service_role (mismo criterio que trust_onboarding/
// event_orders) — nunca hay política RLS para el cliente. Este archivo
// NO está enganchado todavía a drawWinner()/notifyWinnerDrawn() ni a
// ningún endpoint público de respuesta — eso es CUMPLIMIENTO-2+. Existe
// para que CUMPLIMIENTO-2 pueda llamarlo directamente, y para que estas
// pruebas certifiquen el dominio antes de conectarlo a nada en vivo.
import { createClient } from "@supabase/supabase-js";
import {
  evaluateFulfillmentStatus,
  isValidCreatorResponse,
  isValidWinnerResponse,
  FULFILLMENT_STATUSES,
} from "./fulfillmentEvaluation.js";

// createClient() inline (no import de supabaseAdmin.js) — mismo criterio
// que trustIdentityGate.js/mpIdentityMatchGate.js: este módulo se
// importa directamente en tests/fulfillmentCaseService.test.mjs, que
// monkeypatchea SupabaseClient.prototype.from — instancias creadas con
// createClient() comparten ese prototipo sin importar dónde se creen.
const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// CUMPLIMIENTO-4: incluye closed_at/escalated_at/escalation_reason
// (migración 2026-08-30_cumplimiento4_timeline_and_escalation.sql) y
// winner_access_token_hash/winner_access_token_created_at (CUMPLIMIENTO-3
// -- imprescindibles acá para que fulfillmentTimeline.js pueda decidir
// si el token del ganador ya está establecido y estable, sin volver a
// consultar la tabla aparte). Exportada para que fulfillmentTimeline.js
// reutilice la misma lista de columnas en vez de duplicarla.
export const CASE_COLUMNS =
  "raffle_id,creator_id,winner_purchase_id,winner_ticket_number,winner_buyer_email,winner_buyer_name," +
  "raffle_title,prize_type,prize_amount_cents,delivery_method,requires_transfer_procedures," +
  "transfer_expenses_owner,transfer_conditions,raffle_closed_at,winner_determined_at,status," +
  "creator_response,creator_response_at,winner_response,winner_response_at,closed_at,escalated_at," +
  "escalation_reason,winner_access_token_hash,winner_access_token_created_at,created_at,updated_at";

export async function insertEvent({ caseId, eventType, actorType, actorUserId = null, previousStatus = null, newStatus = null, metadata = {} }) {
  const { error } = await supabaseAdmin.from("raffle_fulfillment_events").insert({
    case_id: caseId,
    event_type: eventType,
    actor_type: actorType,
    actor_user_id: actorUserId,
    previous_status: previousStatus,
    new_status: newStatus,
    metadata,
  });
  if (error) throw error;
}

/**
 * Crea (o devuelve, si ya existe) el caso de cumplimiento para una rifa
 * que ya tiene ganador determinado en raffle_results. Exactly-once por
 * diseño de base de datos: raffle_fulfillment_cases.raffle_id es su
 * PRIMARY KEY, mismo patrón que raffle_results ya usa para el sorteo —
 * un segundo INSERT concurrente falla con 23505 y se resuelve re-
 * leyendo, nunca con un "check then insert" desprotegido.
 *
 * @param {string} raffleId
 * @returns {Promise<{ case: object|null, isNew: boolean, reason?: string }>}
 */
export async function ensureFulfillmentCaseForRaffle(raffleId) {
  if (!raffleId) return { case: null, isNew: false, reason: "missing_raffle_id" };

  const { data: existing, error: eExisting } = await supabaseAdmin
    .from("raffle_fulfillment_cases")
    .select(CASE_COLUMNS)
    .eq("raffle_id", raffleId)
    .maybeSingle();
  if (eExisting) throw eExisting;
  if (existing) return { case: existing, isNew: false };

  const { data: result, error: eResult } = await supabaseAdmin
    .from("raffle_results")
    .select("raffle_id,number,buyer_email,buyer_name,purchase_id,created_at")
    .eq("raffle_id", raffleId)
    .maybeSingle();
  if (eResult) throw eResult;
  if (!result) return { case: null, isNew: false, reason: "no_winner_yet" };

  const { data: raffle, error: eRaffle } = await supabaseAdmin
    .from("raffles")
    .select(
      "id,title,creator_id,prize_type,prize_amount_cents,delivery_method,requires_transfer_procedures," +
        "transfer_expenses_owner,transfer_conditions,sales_end_at"
    )
    .eq("id", raffleId)
    .maybeSingle();
  if (eRaffle) throw eRaffle;
  if (!raffle) return { case: null, isNew: false, reason: "raffle_not_found" };
  if (!raffle.creator_id) return { case: null, isNew: false, reason: "raffle_missing_creator_id" };

  const insertRow = {
    raffle_id: raffleId,
    creator_id: raffle.creator_id,
    winner_purchase_id: result.purchase_id ?? null,
    winner_ticket_number: result.number,
    winner_buyer_email: result.buyer_email ?? null,
    winner_buyer_name: result.buyer_name ?? null,
    raffle_title: raffle.title,
    prize_type: raffle.prize_type,
    prize_amount_cents: raffle.prize_amount_cents ?? null,
    delivery_method: raffle.delivery_method ?? null,
    requires_transfer_procedures: raffle.requires_transfer_procedures ?? false,
    transfer_expenses_owner: raffle.transfer_expenses_owner ?? null,
    transfer_conditions: raffle.transfer_conditions ?? null,
    raffle_closed_at: raffle.sales_end_at ?? null,
    winner_determined_at: result.created_at,
    status: FULFILLMENT_STATUSES.PENDING_DELIVERY,
    creator_response: null,
    creator_response_at: null,
    winner_response: null,
    winner_response_at: null,
  };

  const { data: saved, error: eInsert } = await supabaseAdmin
    .from("raffle_fulfillment_cases")
    .insert(insertRow)
    .select(CASE_COLUMNS)
    .maybeSingle();

  if (eInsert) {
    // Colisión de PK (23505): otro caller ya creó el caso al mismo
    // tiempo -> re-lee, nunca se trata como error real.
    const { data: again, error: eAgain } = await supabaseAdmin
      .from("raffle_fulfillment_cases")
      .select(CASE_COLUMNS)
      .eq("raffle_id", raffleId)
      .maybeSingle();
    if (eAgain) throw eAgain;
    if (again) return { case: again, isNew: false };
    throw eInsert;
  }

  await insertEvent({
    caseId: raffleId,
    eventType: "case_created",
    actorType: "system",
    newStatus: FULFILLMENT_STATUSES.PENDING_DELIVERY,
    metadata: { winner_ticket_number: result.number },
  });

  return { case: saved, isNew: true };
}

async function recordResponse({ caseId, actorType, response, actorUserId = null, metadata = {} }) {
  const { data: current, error: eCurrent } = await supabaseAdmin
    .from("raffle_fulfillment_cases")
    .select(CASE_COLUMNS)
    .eq("raffle_id", caseId)
    .maybeSingle();
  if (eCurrent) throw eCurrent;
  if (!current) return { case: null, reason: "case_not_found" };

  // Double-submit / retry safety (CUMPLIMIENTO-4): si la respuesta
  // entrante es idéntica a la ya registrada para este actor, es un
  // reintento del mismo submit (doble click, retry de red) — no un
  // cambio de opinión. No se crea un evento nuevo ni se vuelve a
  // escribir la fila: se devuelve el estado actual tal cual, sin ruido
  // en el historial append-only. Un cambio real de valor sí sigue el
  // camino normal más abajo.
  const alreadyRecorded = actorType === "creator" ? current.creator_response : current.winner_response;
  if (alreadyRecorded === response) {
    return { case: current, previousStatus: current.status, newStatus: current.status, noop: true };
  }

  const previousStatus = current.status;
  const now = new Date().toISOString();

  // Respuesta tardía (CUMPLIMIENTO-4 sección 20): el caso ya pasó por
  // el cierre automático de Día 20 (closed_at set). Nunca se reescribe
  // silenciosamente el resultado automático -- status/closed_at/
  // escalation_reason quedan congelados tal como los dejó el cierre.
  // La respuesta SÍ se registra (visible como "última respuesta" en la
  // fila + evento append-only distinguible como tardío), para que
  // quede disponible en la revisión interna sin perder historial.
  if (current.closed_at) {
    await insertEvent({
      caseId,
      eventType: actorType === "creator" ? "creator_late_response_recorded" : "winner_late_response_recorded",
      actorType,
      actorUserId,
      previousStatus,
      newStatus: previousStatus,
      metadata: { ...metadata, response, late: true, received_after_closed_at: current.closed_at },
    });

    const latePatch =
      actorType === "creator"
        ? { creator_response: response, creator_response_at: now }
        : { winner_response: response, winner_response_at: now };

    const { data: updatedLate, error: eUpdateLate } = await supabaseAdmin
      .from("raffle_fulfillment_cases")
      .update(latePatch)
      .eq("raffle_id", caseId)
      .select(CASE_COLUMNS)
      .maybeSingle();
    if (eUpdateLate) throw eUpdateLate;

    return { case: updatedLate, previousStatus, newStatus: previousStatus, late: true };
  }

  const creatorResponse = actorType === "creator" ? response : current.creator_response;
  const winnerResponse = actorType === "winner" ? response : current.winner_response;
  const newStatus = evaluateFulfillmentStatus({ creatorResponse, winnerResponse });

  await insertEvent({
    caseId,
    eventType: actorType === "creator" ? "creator_response_recorded" : "winner_response_recorded",
    actorType,
    actorUserId,
    previousStatus,
    newStatus,
    metadata: { ...metadata, response },
  });

  const patch =
    actorType === "creator"
      ? { creator_response: response, creator_response_at: now, status: newStatus }
      : { winner_response: response, winner_response_at: now, status: newStatus };

  const { data: updated, error: eUpdate } = await supabaseAdmin
    .from("raffle_fulfillment_cases")
    .update(patch)
    .eq("raffle_id", caseId)
    .select(CASE_COLUMNS)
    .maybeSingle();
  if (eUpdate) throw eUpdate;

  return { case: updated, previousStatus, newStatus };
}

/**
 * Registra la respuesta del creador ('yes'|'coordinating'|'not_yet') y
 * recalcula el estado. Cada cambio queda auditado primero en
 * raffle_fulfillment_events antes de sobreescribir la columna mutable.
 */
export async function recordCreatorResponse(caseId, response, { actorUserId = null, metadata = {} } = {}) {
  if (!isValidCreatorResponse(response) || response == null) {
    throw new Error(`invalid_creator_response: ${response}`);
  }
  return recordResponse({ caseId, actorType: "creator", response, actorUserId, metadata });
}

/**
 * Registra la respuesta del ganador ('yes'|'not_yet') y recalcula el
 * estado. El ganador no necesariamente tiene una cuenta Rifex — actorUserId
 * puede quedar null; el mecanismo de autenticación del propio ganador
 * (link firmado, token) es explícitamente CUMPLIMIENTO-2+, no CUMPLIMIENTO-1.
 */
export async function recordWinnerResponse(caseId, response, { actorUserId = null, metadata = {} } = {}) {
  if (!isValidWinnerResponse(response) || response == null) {
    throw new Error(`invalid_winner_response: ${response}`);
  }
  return recordResponse({ caseId, actorType: "winner", response, actorUserId, metadata });
}

/** Lista los casos de un creador, más recientes primero. */
export async function getCreatorCases(creatorId) {
  if (!creatorId) return [];
  const { data, error } = await supabaseAdmin
    .from("raffle_fulfillment_cases")
    .select(CASE_COLUMNS)
    .eq("creator_id", creatorId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

/**
 * CUMPLIMIENTO-4 — casos todavía abiertos (closed_at is null), candidatos
 * a procesamiento de línea de tiempo (Día 10/15/20) por
 * fulfillmentTimeline.js. closed_at is null es la única señal
 * confiable de "el cierre automático de Día 20 no corrió todavía para
 * este caso" -- ver justificación en la migración de CUMPLIMIENTO-4.
 */
export async function getOpenFulfillmentCases() {
  const { data, error } = await supabaseAdmin
    .from("raffle_fulfillment_cases")
    .select(CASE_COLUMNS)
    .is("closed_at", null)
    .not("winner_determined_at", "is", null)
    .order("winner_determined_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

/** Detalle de un caso, con chequeo de ownership incluido en la query. */
export async function getCreatorCaseDetail(creatorId, raffleId) {
  if (!creatorId || !raffleId) return null;
  const { data, error } = await supabaseAdmin
    .from("raffle_fulfillment_cases")
    .select(CASE_COLUMNS)
    .eq("creator_id", creatorId)
    .eq("raffle_id", raffleId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

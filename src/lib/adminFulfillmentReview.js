// CUMPLIMIENTO-5 — mesa de revisión administrativa dentro de /admin.
// Reutiliza exactamente el mismo primitivo de autoridad admin que ya
// protege el resto de /api/admin/* (adminAuth.resolveAdmin) -- este
// archivo NO define ni implementa autorización, solo asume que el
// caller ya la validó. Reutiliza raffle_fulfillment_events (con
// actor_type='admin', ya permitido desde CUMPLIMIENTO-1) como el
// historial append-only de acciones administrativas -- NO se crea
// ninguna tabla nueva de notas/revisión.
import { createClient } from "@supabase/supabase-js";
import { insertEvent } from "./fulfillmentCaseService.js";

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Columnas explícitamente permitidas para la vista administrativa --
// NUNCA "*". Excluye deliberadamente winner_access_token_hash y
// winner_access_token_created_at (mandato sección 12: el token del
// ganador nunca se expone, ni siquiera a un admin real).
export const ADMIN_CASE_COLUMNS =
  "raffle_id,creator_id,winner_purchase_id,winner_ticket_number,winner_buyer_email,winner_buyer_name," +
  "raffle_title,prize_type,prize_amount_cents,delivery_method,requires_transfer_procedures," +
  "transfer_expenses_owner,transfer_conditions,raffle_closed_at,winner_determined_at,status," +
  "creator_response,creator_response_at,winner_response,winner_response_at,closed_at,escalated_at," +
  "escalation_reason,admin_review_status,admin_reviewed_by,admin_reviewed_at,created_at,updated_at";

const ADMIN_REVIEW_RESOLUTIONS = new Set(["resolved", "closed_without_determination"]);

// Tope defensivo del listado -- misma filosofía que RECENT_LIMIT en
// overview.js: al volumen actual de Rifex esto nunca se alcanza, pero
// nunca se hace un select() genuinamente ilimitado desde un endpoint
// admin. Documentado como límite conocido, no oculto.
const LIST_LIMIT = 500;

/**
 * Lista completa de casos de cumplimiento (columnas admin-safe), más
 * recientes primero. Los contadores del resumen /admin se derivan de
 * ESTA misma lista (nunca un contador mantenido por separado) para que
 * nunca puedan desincronizarse entre sí.
 */
export async function listAdminFulfillmentCases() {
  const { data, error } = await supabaseAdmin
    .from("raffle_fulfillment_cases")
    .select(ADMIN_CASE_COLUMNS)
    .order("winner_determined_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (error) throw error;
  return data || [];
}

/**
 * Resumen derivado de la lista de casos -- nunca un contador manual
 * independiente. "Requiere revisión" = escalado Y todavía no resuelto
 * por un admin (admin_review_status no está en {resolved,
 * closed_without_determination}).
 */
export function summarizeAdminFulfillmentCases(cases) {
  const summary = { requires_review: 0, delivery_pending: 0, confirmed: 0, unconfirmed: 0 };
  for (const c of cases) {
    const reviewDone = c.admin_review_status === "resolved" || c.admin_review_status === "closed_without_determination";
    if (c.escalated_at && !reviewDone) summary.requires_review += 1;
    if (c.status === "delivery_pending" || c.status === "pending_delivery" || c.status === "creator_reported_delivered") summary.delivery_pending += 1;
    if (c.status === "fulfillment_confirmed") summary.confirmed += 1;
    if (c.status === "unconfirmed") summary.unconfirmed += 1;
  }
  return summary;
}

/** Expediente de un caso: caso (admin-safe) + comunicaciones + eventos completos (incluye los de actor_type='admin'). */
export async function getAdminFulfillmentCaseDetail(raffleId) {
  if (!raffleId) return null;
  const { data: fulfillmentCase, error: eCase } = await supabaseAdmin
    .from("raffle_fulfillment_cases")
    .select(ADMIN_CASE_COLUMNS)
    .eq("raffle_id", raffleId)
    .maybeSingle();
  if (eCase) throw eCase;
  if (!fulfillmentCase) return null;

  const [{ data: communications, error: eComm }, { data: events, error: eEvents }, { data: raffle, error: eRaffle }] = await Promise.all([
    supabaseAdmin
      .from("raffle_fulfillment_communications")
      .select("communication_type,recipient_role,status,attempt_count,sent_at,created_at")
      .eq("case_id", raffleId)
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("raffle_fulfillment_events")
      .select("event_type,actor_type,actor_user_id,previous_status,new_status,metadata,created_at")
      .eq("case_id", raffleId)
      .order("created_at", { ascending: true }),
    supabaseAdmin.from("raffles").select("creator_email,sales_end_at").eq("id", raffleId).maybeSingle(),
  ]);
  if (eComm) throw eComm;
  if (eEvents) throw eEvents;
  if (eRaffle) throw eRaffle;

  return {
    case: fulfillmentCase,
    creator_email: raffle?.creator_email || null,
    communications: communications || [],
    events: events || [],
  };
}

async function requireEscalatedCase(raffleId) {
  const { data, error } = await supabaseAdmin
    .from("raffle_fulfillment_cases")
    .select(ADMIN_CASE_COLUMNS)
    .eq("raffle_id", raffleId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { case: null, reason: "case_not_found" };
  if (!data.escalated_at) return { case: null, reason: "case_not_escalated" };
  return { case: data, reason: null };
}

/**
 * Inicia (o reabre) la revisión administrativa de un caso escalado.
 * Idempotente: si ya está en 'in_review', no crea un evento ni
 * actualiza nada (mismo patrón de doble-submit-seguro que
 * recordCreatorResponse/recordWinnerResponse). Reabrir un caso
 * previamente 'resolved'/'closed_without_determination' SÍ está
 * permitido -- es una acción real y distinta, no un reintento del
 * mismo click.
 */
export async function startAdminReview(raffleId, { adminId, adminEmail }) {
  const { case: current, reason } = await requireEscalatedCase(raffleId);
  if (!current) return { case: null, reason };

  if (current.admin_review_status === "in_review") {
    return { case: current, noop: true };
  }

  const now = new Date().toISOString();
  await insertEvent({
    caseId: raffleId,
    eventType: "admin_review_started",
    actorType: "admin",
    actorUserId: adminId,
    metadata: { admin_email: adminEmail || null },
  });

  const { data: updated, error } = await supabaseAdmin
    .from("raffle_fulfillment_cases")
    .update({ admin_review_status: "in_review", admin_reviewed_by: adminId, admin_reviewed_at: now })
    .eq("raffle_id", raffleId)
    .select(ADMIN_CASE_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return { case: updated, noop: false };
}

/**
 * Agrega una nota interna administrativa -- SIEMPRE append-only (una
 * fila nueva en raffle_fulfillment_events, nunca una edición). Nunca
 * visible para el creador ni el ganador -- ningún endpoint de
 * creador/ganador lee actor_type='admin'.
 */
export async function addAdminNote(raffleId, { adminId, adminEmail, note }) {
  if (!note || typeof note !== "string" || !note.trim()) {
    throw new Error("invalid_note");
  }
  const { case: current, reason } = await requireEscalatedCase(raffleId);
  if (!current) return { case: null, reason };

  await insertEvent({
    caseId: raffleId,
    eventType: "admin_note_added",
    actorType: "admin",
    actorUserId: adminId,
    metadata: { admin_email: adminEmail || null, note: note.trim().slice(0, 4000) },
  });

  return { case: current, noop: false };
}

/**
 * Resuelve (cierra) la revisión administrativa. Idempotente frente a la
 * MISMA resolución repetida (double-submit). Nunca toca
 * winner_response, creator_response, closed_at, escalation_reason, ni
 * ningún evento histórico -- únicamente agrega un evento nuevo y
 * actualiza el resumen mutable de revisión. La resolución automática de
 * Día 20 y la revisión administrativa son capas independientes que
 * coexisten (mandato sección 10).
 */
export async function resolveAdminReview(raffleId, { adminId, adminEmail, resolution, note }) {
  if (!ADMIN_REVIEW_RESOLUTIONS.has(resolution)) {
    throw new Error(`invalid_resolution: ${resolution}`);
  }
  const { case: current, reason } = await requireEscalatedCase(raffleId);
  if (!current) return { case: null, reason };

  if (current.admin_review_status === resolution) {
    return { case: current, noop: true };
  }

  const now = new Date().toISOString();
  await insertEvent({
    caseId: raffleId,
    eventType: "admin_review_resolved",
    actorType: "admin",
    actorUserId: adminId,
    metadata: { admin_email: adminEmail || null, resolution, note: note ? String(note).trim().slice(0, 4000) : null },
  });

  const { data: updated, error } = await supabaseAdmin
    .from("raffle_fulfillment_cases")
    .update({ admin_review_status: resolution, admin_reviewed_by: adminId, admin_reviewed_at: now })
    .eq("raffle_id", raffleId)
    .select(ADMIN_CASE_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return { case: updated, noop: false };
}

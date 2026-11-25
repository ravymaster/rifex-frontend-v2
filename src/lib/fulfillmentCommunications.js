// CUMPLIMIENTO-3 — comunicaciones Día 0 del caso de cumplimiento +
// acceso seguro del ganador invitado. Reutiliza sendWinnerEmail/
// sendCreatorWinnerEmail (mailer.js) enriquecidos con la información
// del premio/entrega/transferencia y el link seguro del ganador — NUNCA
// un segundo correo separado. Todo acceso a las tablas nuevas pasa por
// service_role (mismo criterio que fulfillmentCaseService.js).
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { sendWinnerEmail, sendCreatorWinnerEmail } from "./mailer.js";

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const CASE_COLUMNS_PUBLIC =
  "raffle_id,raffle_title,prize_type,prize_amount_cents,delivery_method,requires_transfer_procedures," +
  "transfer_expenses_owner,transfer_conditions,status,winner_determined_at,raffle_closed_at";

// ---------------------------------------------------------------------
// Token del ganador: alta entropía (32 bytes = 256 bits), NUNCA
// persistido en texto plano -- solo su hash SHA-256 se guarda. Ver
// justificación completa (por qué se diverge del patrón de
// event_orders.access_token) en la migración
// 2026-08-30_cumplimiento3_communications_and_winner_access.sql.
// ---------------------------------------------------------------------
export function generateWinnerAccessToken() {
  const raw = crypto.randomBytes(32).toString("hex");
  return { raw, hash: hashAccessToken(raw) };
}

export function hashAccessToken(rawToken) {
  return crypto.createHash("sha256").update(String(rawToken)).digest("hex");
}

function baseUrl() {
  return (process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
}

/**
 * Devuelve la fila del ledger para (caseId, type, role), creándola una
 * sola vez si no existe (exactly-once por el UNIQUE constraint real de
 * la migración -- colisión 23505 se resuelve re-leyendo, mismo patrón
 * ya certificado en ensureFulfillmentCaseForRaffle).
 */
export async function ensureCommunicationIntent(caseId, communicationType, recipientRole) {
  const { data: existing, error: eExisting } = await supabaseAdmin
    .from("raffle_fulfillment_communications")
    .select("*")
    .eq("case_id", caseId)
    .eq("communication_type", communicationType)
    .eq("recipient_role", recipientRole)
    .maybeSingle();
  if (eExisting) throw eExisting;
  if (existing) return existing;

  const { data: saved, error: eInsert } = await supabaseAdmin
    .from("raffle_fulfillment_communications")
    .insert({ case_id: caseId, communication_type: communicationType, recipient_role: recipientRole })
    .select("*")
    .maybeSingle();

  if (eInsert) {
    const { data: again, error: eAgain } = await supabaseAdmin
      .from("raffle_fulfillment_communications")
      .select("*")
      .eq("case_id", caseId)
      .eq("communication_type", communicationType)
      .eq("recipient_role", recipientRole)
      .maybeSingle();
    if (eAgain) throw eAgain;
    if (again) return again;
    throw eInsert;
  }
  return saved;
}

export async function markAttempt(intentId, patch) {
  const { error } = await supabaseAdmin.from("raffle_fulfillment_communications").update(patch).eq("id", intentId);
  if (error) throw error;
}

export function safeErrorMessage(err) {
  return safeError(err);
}

/**
 * ¿Ya existe alguna comunicación al ganador (de CUALQUIER tipo --
 * Día 0, Día 10, Día 15) confirmada como 'sent' para este caso, aparte
 * de currentIntentId? CUMPLIMIENTO-4 usa esto para decidir si el token
 * ya está "confirmado y vigente" en el sentido del mandato de la
 * sección 17 -- no solo si ESTE envío puntual ya se mandó.
 */
async function hasConfirmedWinnerCommunication(caseId, excludeIntentId = null) {
  const { data, error } = await supabaseAdmin
    .from("raffle_fulfillment_communications")
    .select("id")
    .eq("case_id", caseId)
    .eq("recipient_role", "winner")
    .eq("status", "sent");
  if (error) throw error;
  return (data || []).some((row) => row.id !== excludeIntentId);
}

/**
 * Genera (o reutiliza) el token de acceso del ganador para un caso.
 * Regla de estabilidad (CUMPLIMIENTO-3 + extendida en CUMPLIMIENTO-4
 * sección 17): mientras NINGÚN envío al ganador (Día 0, Día 10 o Día
 * 15) haya sido confirmado, cada intento sin confirmar puede rotar el
 * token (mismo comportamiento que reintentos de Día 0 ya certificado).
 * En cuanto CUALQUIER envío al ganador queda confirmado 'sent', el
 * token queda congelado para el resto del ciclo de vida del caso --
 * Día 10/15 reutilizan el mismo hash y NO generan un token nuevo. El
 * crudo nunca se recupera desde el hash por diseño: si el token ya
 * está congelado, esta función devuelve raw:null y el email
 * correspondiente se envía sin un link nuevo embebido (referencia al
 * acceso ya entregado en un correo previo, ver mailer.js).
 */
export async function ensureWinnerAccessToken(fulfillmentCase, currentIntent) {
  if (fulfillmentCase.winner_access_token_hash) {
    if (currentIntent.status === "sent") return { raw: null, rotated: false };
    const stableFromOtherSend = await hasConfirmedWinnerCommunication(fulfillmentCase.raffle_id, currentIntent.id);
    if (stableFromOtherSend) return { raw: null, rotated: false };
  }
  const { raw, hash } = generateWinnerAccessToken();
  const { error } = await supabaseAdmin
    .from("raffle_fulfillment_cases")
    .update({ winner_access_token_hash: hash, winner_access_token_created_at: new Date().toISOString() })
    .eq("raffle_id", fulfillmentCase.raffle_id);
  if (error) throw error;
  return { raw, rotated: true };
}

/** Lista completa (append-only) de intents de comunicación de un caso -- usada por el expediente interno de Día 20. */
export async function getCommunicationLedgerForCase(caseId) {
  const { data, error } = await supabaseAdmin
    .from("raffle_fulfillment_communications")
    .select("communication_type,recipient_role,status,attempt_count,sent_at,created_at")
    .eq("case_id", caseId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

/** Intent existente (o null) para (caseId, type, role) -- lectura pura, sin crear fila. Usada por el scheduler para decidir si ya se procesó Día 10/15/20. */
export async function findCommunicationIntent(caseId, communicationType, recipientRole) {
  const { data, error } = await supabaseAdmin
    .from("raffle_fulfillment_communications")
    .select("*")
    .eq("case_id", caseId)
    .eq("communication_type", communicationType)
    .eq("recipient_role", recipientRole)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/**
 * Envía (o reintenta) las comunicaciones Día 0 (ganador + creador) para
 * un caso ya creado. Nunca crea un segundo correo distinto de
 * sendWinnerEmail/sendCreatorWinnerEmail -- los enriquece con premio/
 * entrega/transferencia + el link seguro del ganador. Cada llamada es
 * segura de reintentar: el ledger nunca duplica la intención lógica, y
 * un envío ya confirmado (status='sent') nunca se reenvía.
 */
export async function sendDay0Communications(fulfillmentCase, { raffleTitle, creatorEmail, winnerEmail, winnerName, winnerNumber, raffleLink }) {
  const result = { winnerSent: false, creatorSent: false };
  const caseId = fulfillmentCase.raffle_id;

  const deliveryInfo = {
    prizeType: fulfillmentCase.prize_type,
    deliveryMethod: fulfillmentCase.delivery_method,
    requiresTransferProcedures: fulfillmentCase.requires_transfer_procedures,
    transferExpensesOwner: fulfillmentCase.transfer_expenses_owner,
    transferConditions: fulfillmentCase.transfer_conditions,
  };

  // ---- Ganador ----
  try {
    const winnerIntent = await ensureCommunicationIntent(caseId, "DAY_0_WINNER", "winner");
    if (winnerIntent.status !== "sent") {
      const { raw: rawToken } = await ensureWinnerAccessToken(fulfillmentCase, winnerIntent);
      const accessLink = rawToken ? `${baseUrl()}/cumplimiento/caso/${rawToken}` : null;

      await markAttempt(winnerIntent.id, {
        attempt_count: (winnerIntent.attempt_count || 0) + 1,
        first_attempted_at: winnerIntent.first_attempted_at || new Date().toISOString(),
      });

      const send = await sendWinnerEmail({
        to: winnerEmail,
        winnerName,
        raffleTitle,
        number: winnerNumber,
        raffleLink,
        accessLink,
        ...deliveryInfo,
      });

      if (send?.skipped) {
        await markAttempt(winnerIntent.id, { status: "skipped" });
      } else if (send?.ok) {
        await markAttempt(winnerIntent.id, { status: "sent", sent_at: new Date().toISOString(), provider_message_id: send.id || null });
        result.winnerSent = true;
      } else {
        await markAttempt(winnerIntent.id, { status: "failed", last_error_safe: safeError(send?.error) });
      }
    } else {
      result.winnerSent = true; // ya confirmado en un intento anterior
    }
  } catch (e) {
    console.error("[sendDay0Communications] winner error", e?.message || e);
  }

  // ---- Creador ----
  try {
    const creatorIntent = await ensureCommunicationIntent(caseId, "DAY_0_CREATOR", "creator");
    if (creatorIntent.status !== "sent") {
      await markAttempt(creatorIntent.id, {
        attempt_count: (creatorIntent.attempt_count || 0) + 1,
        first_attempted_at: creatorIntent.first_attempted_at || new Date().toISOString(),
      });

      const send = await sendCreatorWinnerEmail({
        to: creatorEmail,
        raffleTitle,
        number: winnerNumber,
        winnerName,
        winnerEmail,
        raffleLink,
        ...deliveryInfo,
      });

      if (send?.skipped) {
        await markAttempt(creatorIntent.id, { status: "skipped" });
      } else if (send?.ok) {
        await markAttempt(creatorIntent.id, { status: "sent", sent_at: new Date().toISOString(), provider_message_id: send.id || null });
        result.creatorSent = true;
      } else {
        await markAttempt(creatorIntent.id, { status: "failed", last_error_safe: safeError(send?.error) });
      }
    } else {
      result.creatorSent = true;
    }
  } catch (e) {
    console.error("[sendDay0Communications] creator error", e?.message || e);
  }

  return result;
}

function safeError(err) {
  if (!err) return null;
  // Nunca la respuesta cruda del proveedor -- solo un string corto.
  const s = typeof err === "string" ? err : err?.message || JSON.stringify(err);
  return String(s).slice(0, 300);
}

/**
 * Resuelve un caso a partir del token crudo del ganador (nunca del
 * hash directamente). Respuesta genérica si no coincide -- nunca
 * revela si el token tiene un formato plausible, si la rifa existe, o
 * cualquier otra señal útil para enumeración.
 */
export async function getCaseByAccessToken(rawToken) {
  if (!rawToken || typeof rawToken !== "string" || rawToken.length < 32) return null;
  const hash = hashAccessToken(rawToken);
  const { data, error } = await supabaseAdmin
    .from("raffle_fulfillment_cases")
    .select(CASE_COLUMNS_PUBLIC)
    .eq("winner_access_token_hash", hash)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

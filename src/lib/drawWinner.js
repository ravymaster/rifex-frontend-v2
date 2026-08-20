// src/lib/drawWinner.js
// Sorteo del ganador de una rifa, compartido entre el endpoint público
// (gatillado desde el navegador del comprador), el webhook/reconciliación
// de MP (venta que agota la rifa) y el cierre manual desde el panel.
import * as SB from "./supabaseAdmin";
import { sendWinnerEmail, sendCreatorWinnerEmail } from "./mailer";

const supabaseAdmin = SB.default || SB.supabaseAdmin;
const BASE = (process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
const isValidEmail = (s) => typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

/**
 * Sortea (o devuelve el resultado ya existente) para una rifa.
 * @param {string} raffleId
 * @param {{ force?: boolean, triggerSource?: string|null, triggeredBy?: string|null }} opts
 *   force=true salta el chequeo de "agotada" (sorteo manual explícito).
 *   triggerSource/triggeredBy: auditoría mínima (DRAW-1) de qué disparó el
 *   sorteo — 'sold_out_auto' | 'reconcile_auto' | 'manual_draw' | etc. —,
 *   y quién (uid) si fue una acción humana explícita. Nunca afecta la
 *   lógica de selección ni la protección exactly-once existente.
 * @returns {Promise<{ winner: object|null, isNew: boolean, ready: boolean }>}
 */
export async function drawWinner(raffleId, { force = false, triggerSource = null, triggeredBy = null } = {}) {
  if (!raffleId) return { winner: null, isNew: false, ready: false };

  const { data: existing, error: e1 } = await supabaseAdmin
    .from("raffle_results")
    .select("*")
    .eq("raffle_id", raffleId)
    .maybeSingle();
  if (e1) throw e1;
  if (existing) return { winner: existing, isNew: false, ready: true };

  if (!force) {
    const { count: remaining, error: e2 } = await supabaseAdmin
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("raffle_id", raffleId)
      .in("status", ["available", "free", "pending"]);
    if (e2) throw e2;
    if ((remaining ?? 0) > 0) return { winner: null, isNew: false, ready: false };
  }

  const { data: soldTickets, error: e3 } = await supabaseAdmin
    .from("tickets")
    .select("number")
    .eq("raffle_id", raffleId)
    .eq("status", "sold");
  if (e3) throw e3;
  if (!soldTickets?.length) return { winner: null, isNew: false, ready: false };

  const winNum = soldTickets[Math.floor(Math.random() * soldTickets.length)].number;

  const { data: purchase, error: e4 } = await supabaseAdmin
    .from("purchases")
    .select("id,buyer_email,buyer_name,created_at,status,numbers")
    .eq("raffle_id", raffleId)
    .in("status", ["approved", "paid"])
    .contains("numbers", [winNum])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (e4) throw e4;

  const insert = {
    raffle_id: raffleId,
    number: winNum,
    buyer_email: purchase?.buyer_email ?? null,
    buyer_name: purchase?.buyer_name ?? null,
    purchase_id: purchase?.id ?? null,
    trigger_source: triggerSource,
    triggered_by: triggeredBy,
  };

  const { data: saved, error: e5 } = await supabaseAdmin
    .from("raffle_results")
    .insert(insert)
    .select("*")
    .maybeSingle();

  if (e5) {
    // Colisión de PK: otro disparador ya sorteó al mismo tiempo → re-lee.
    const { data: again } = await supabaseAdmin
      .from("raffle_results")
      .select("*")
      .eq("raffle_id", raffleId)
      .maybeSingle();
    return { winner: again || insert, isNew: false, ready: true };
  }

  return { winner: saved, isNew: true, ready: true };
}

/**
 * Manda los correos de "ya hay ganador" al comprador ganador y al creador.
 * Se llama solo cuando drawWinner() devuelve isNew:true (evita duplicados).
 */
export async function notifyWinnerDrawn(raffleId, winner) {
  const { data: raffle } = await supabaseAdmin
    .from("raffles")
    .select("id,title,creator_email")
    .eq("id", raffleId)
    .maybeSingle();

  const raffleTitle = raffle?.title || "Rifa";
  let creatorEmail = raffle?.creator_email || null;
  if (!creatorEmail && process.env.CREATOR_FALLBACK_EMAIL) creatorEmail = process.env.CREATOR_FALLBACK_EMAIL;

  const raffleLink = raffleId ? `${BASE}/rifas/${raffleId}` : BASE || "";
  const results = { winnerEmailed: false, creatorEmailed: false };

  if (isValidEmail(winner?.buyer_email)) {
    try {
      await sendWinnerEmail({
        to: winner.buyer_email,
        winnerName: winner.buyer_name,
        raffleTitle,
        number: winner.number,
        raffleLink,
      });
      results.winnerEmailed = true;
    } catch (e) {
      console.error("[notifyWinnerDrawn] winner email error", e?.message || e);
    }
  }

  if (isValidEmail(creatorEmail)) {
    try {
      await sendCreatorWinnerEmail({
        to: creatorEmail,
        raffleTitle,
        number: winner.number,
        winnerName: winner.buyer_name,
        winnerEmail: winner.buyer_email,
        raffleLink,
      });
      results.creatorEmailed = true;
    } catch (e) {
      console.error("[notifyWinnerDrawn] creator email error", e?.message || e);
    }
  }

  return results;
}

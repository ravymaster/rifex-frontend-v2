// src/lib/paymentReconcile.js
// PRE-LAUNCH-FIX-1 (P0-2): unica fuente de verdad para "que pasa cuando un
// pago de Mercado Pago queda approved". Antes de este fix, webhook.js y
// admin/reconcile-payments.js tenian cada uno su propia copia de esta
// logica, y ambas marcaban `tickets` como sold filtrando por
// raffle_id+number — nunca por purchase_id — lo que permitia que un pago
// de la purchase B sobreescribiera un ticket que en realidad pertenecia a
// la purchase A. Ademas, ambas intentaban escribir `tickets.payment_ref`,
// una columna que nunca existio en el modelo real (existe solo en la
// tabla legacy `rifa_tickets`), asi que esa UPDATE fallaba en silencio en
// cada pago aprobado real — el unico camino que efectivamente marcaba
// sold era checkout/confirm.js, que depende de que el navegador del
// comprador vuelva de Mercado Pago.
//
// Este modulo centraliza la convergencia: cualquier caller (webhook,
// reconciliacion admin, o el acelerador de confirm.js) llega al mismo
// resultado final, autoritativo, sin depender del navegador. La
// actualizacion de tickets pasa SIEMPRE por la RPC
// converge_purchase_tickets_sold(purchase_id) — nunca por raffle_id+number
// sueltos — por lo que un pago de una purchase jamas puede tocar el
// ticket de otra.
import { drawWinner, notifyWinnerDrawn } from "@/lib/drawWinner";
import { sendBuyerApprovedEmail, sendCreatorSaleEmail } from "@/lib/mailer";

const isValidEmail = (s) =>
  typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

/**
 * Aplica un pago de Mercado Pago ya obtenido (vía API real, nunca solo el
 * body del webhook) al estado autoritativo de Rifex. Idempotente: llamar
 * N veces con el mismo `mp` (mismo id, mismo status) produce el mismo
 * resultado final sin efectos adicionales — el upsert de `payments` es
 * idempotente por `mp_payment_id`, y la convergencia de tickets pasa por
 * converge_purchase_tickets_sold(), que ya es idempotente por diseño.
 * @param {object} params
 * @param {import('@supabase/supabase-js').SupabaseClient} params.supabase cliente service-role
 * @param {object} params.mp payload crudo de GET /v1/payments/{id} de MP
 * @param {string} params.fetchedVia 'platform' | 'seller'
 * @returns {Promise<{ok:boolean, status:string, purchaseId:string|null, skipped?:boolean, ticketsConverged?:boolean}>}
 */
export async function applyMpPayment({ supabase, mp, fetchedVia }) {
  const status = String(mp?.status || "").toLowerCase();
  const md = mp?.metadata || {};

  let purchaseId = md.purchase_id || mp?.external_reference || null;
  if (purchaseId && typeof purchaseId !== "string") purchaseId = String(purchaseId);

  let raffleId = md.raffle_id || md.raffleId || md.rid || null;
  let numbers = [];
  if (Array.isArray(md.numbers)) numbers = md.numbers;
  else if (typeof md.numbers === "string") {
    numbers = md.numbers
      .split(",")
      .map((s) => parseInt(String(s).trim(), 10))
      .filter((n) => Number.isFinite(n));
  }
  let buyer_email = (md.buyer_email || mp?.payer?.email || "").trim().toLowerCase();
  let buyer_name = (md.buyer_name || mp?.payer?.first_name || "").toString().trim();

  // La purchase (DB) es SIEMPRE más autoritativa que la metadata del pago
  // para saber qué rifa/números son — la metadata solo rellena huecos si
  // la purchase no aporta el dato.
  let purchaseRow = null;
  if (purchaseId) {
    const { data } = await supabase
      .from("purchases")
      .select("id, raffle_id, numbers, buyer_email, buyer_name, status")
      .eq("id", purchaseId)
      .maybeSingle();
    purchaseRow = data || null;
    if (purchaseRow) {
      if (purchaseRow.raffle_id) raffleId = purchaseRow.raffle_id;
      if (Array.isArray(purchaseRow.numbers) && purchaseRow.numbers.length) numbers = purchaseRow.numbers;
      if (!isValidEmail(buyer_email) && isValidEmail(purchaseRow.buyer_email)) {
        buyer_email = purchaseRow.buyer_email.trim().toLowerCase();
      }
      if (!buyer_name && purchaseRow.buyer_name) buyer_name = String(purchaseRow.buyer_name).trim();
    }
  }

  const amount_cents = Math.round(Number(mp?.transaction_amount || 0) * 100);
  const mpIdStr = String(mp?.id ?? "");

  const applicationFee = Array.isArray(mp?.fee_details)
    ? mp.fee_details.find((f) => f?.type === "application_fee")
    : null;
  const marketplace_fee_cents = applicationFee
    ? Math.round(Number(applicationFee.amount || 0) * 100)
    : null;

  // Idempotente por mp_payment_id — correr esto N veces para el mismo
  // pago nunca crea una segunda fila.
  const { data: payRow, error: payErr } = await supabase
    .from("payments")
    .upsert(
      {
        mp_payment_id: mpIdStr,
        raffle_id: raffleId || null,
        purchase_id: purchaseId || null,
        buyer_email: isValidEmail(buyer_email) ? buyer_email : null,
        buyer_name: buyer_name || null,
        numbers,
        status,
        status_detail: mp?.status_detail || null,
        amount_cents,
        marketplace_fee_cents,
        via: fetchedVia,
      },
      { onConflict: "mp_payment_id" }
    )
    .select()
    .single();
  if (payErr) throw payErr;

  if (status !== "approved") {
    return { ok: true, status, purchaseId, skipped: true };
  }

  if (!purchaseId) {
    // Pago approved sin purchase_id resoluble — no hay a qué ticket
    // converger. Se deja registrado en `payments` para investigación
    // manual; no es un caso que este fix pueda resolver automáticamente.
    return { ok: true, status, purchaseId: null, skipped: true, reason: "no_purchase_id" };
  }

  // Purchase -> approved (idempotente: si ya estaba approved, sigue
  // approved; nunca retrocede un estado ya autoritativo).
  await supabase
    .from("purchases")
    .update({ status: "approved", paid_at: new Date().toISOString() })
    .eq("id", purchaseId)
    .neq("status", "approved");

  // Convergencia autoritativa: SIEMPRE por purchase_id, nunca por
  // raffle_id+number sueltos — así un pago de esta purchase jamás puede
  // tocar el ticket de otra purchase distinta.
  let ticketsConverged = false;
  try {
    const { error: convErr } = await supabase.rpc("converge_purchase_tickets_sold", {
      p_purchase_id: purchaseId,
    });
    if (convErr && convErr.message !== "purchase_not_approved") throw convErr;
    ticketsConverged = !convErr;
  } catch (e) {
    console.error("[paymentReconcile] converge_purchase_tickets_sold error", { purchaseId, err: e?.message || e });
  }

  // Datos de rifa para los emails.
  let raffleTitle = "Rifa";
  let creatorEmail = null;
  if (raffleId) {
    const { data: r } = await supabase
      .from("raffles")
      .select("id,title,creator_email")
      .eq("id", raffleId)
      .maybeSingle();
    if (r) {
      raffleTitle = r.title || raffleTitle;
      creatorEmail = r.creator_email || null;
    }
  }
  if (!creatorEmail && process.env.CREATOR_FALLBACK_EMAIL) {
    creatorEmail = process.env.CREATOR_FALLBACK_EMAIL;
  }

  const BASE = (process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
  const amountCLP = Math.round((amount_cents || 0) / 100);
  const raffleLink = raffleId ? `${BASE}/rifas/${raffleId}` : BASE || "";

  if (isValidEmail(buyer_email) && !payRow?.emailed_buyer) {
    try {
      await sendBuyerApprovedEmail({
        to: buyer_email, buyerName: buyer_name, raffleTitle, numbers,
        amountCLP, paymentId: mpIdStr, raffleLink,
      });
      await supabase.from("payments").update({ emailed_buyer: true }).eq("mp_payment_id", mpIdStr);
    } catch (e) {
      console.error("[paymentReconcile] buyer email error:", e?.message || e);
    }
  }

  if (isValidEmail(creatorEmail) && !payRow?.emailed_creator) {
    try {
      await sendCreatorSaleEmail({
        to: creatorEmail, raffleTitle, numbers, amountCLP,
        buyerEmail: isValidEmail(buyer_email) ? buyer_email : "-",
        paymentId: mpIdStr, raffleLink,
      });
      await supabase.from("payments").update({ emailed_creator: true }).eq("mp_payment_id", mpIdStr);
    } catch (e) {
      console.error("[paymentReconcile] creator email error:", e?.message || e);
    }
  }

  // Sorteo automático si esta venta dejó la rifa agotada — ya idempotente
  // por el PK de raffle_results (drawWinner.js), sin cambios acá.
  if (raffleId) {
    try {
      const draw = await drawWinner(raffleId, { triggerSource: "sold_out_auto" });
      if (draw.isNew) {
        await supabase.from("raffles").update({ status: "closed" }).eq("id", raffleId);
        await notifyWinnerDrawn(raffleId, draw.winner);
      }
    } catch (e) {
      console.error("[paymentReconcile] draw winner error:", e?.message || e);
    }
  }

  return { ok: true, status, purchaseId, ticketsConverged };
}

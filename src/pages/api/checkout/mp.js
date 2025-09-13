// src/pages/api/checkout/mp.js
import { createClient } from "@supabase/supabase-js";
import { MercadoPagoConfig, Preference } from "mercadopago";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY || null;

const supabase = createClient(url, service || anon, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// minutos que dura la reserva
const HOLD_MINUTES = parseInt(process.env.HOLD_MINUTES || "3", 10);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  try {
    const {
      raffle_id,
      raffleId,
      numbers,
      buyer_email,
      buyer_name,
      accepted_terms,
      terms_version,
    } = req.body || {};

    const rid = raffle_id || raffleId;
    if (!rid) return res.status(400).json({ ok: false, error: "missing_raffle_id" });
    if (!Array.isArray(numbers) || numbers.length === 0)
      return res.status(400).json({ ok: false, error: "missing_numbers" });

    // 1) rifa
    const { data: rdata, error: rerr } = await supabase
      .from("raffles")
      .select("*")
      .eq("id", rid)
      .limit(1);

    if (rerr) throw rerr;
    const raffle = (Array.isArray(rdata) && rdata[0]) || null;
    if (!raffle) return res.status(404).json({ ok: false, error: "raffle_not_found" });

    const pricePerNumber = Number(raffle.price_cents || 0) / 100;
    const total = Number((pricePerNumber * numbers.length).toFixed(0)); // CLP entero

    // 2) disponibilidad
    const { data: currentTickets, error: terr } = await supabase
      .from("tickets")
      .select("number,status")
      .eq("raffle_id", rid)
      .in("number", numbers);

    if (terr) throw terr;

    const unavailable = (currentTickets || [])
      .filter((t) => t.status !== "available" && t.status !== "free")
      .map((t) => t.number);

    if (unavailable.length) {
      return res.status(409).json({
        ok: false,
        error: "some_numbers_unavailable",
        details: { unavailable },
      });
    }

    // 3) crear purchase + vencimiento de reserva
    const now = Date.now();
    const holdsUntilIso = new Date(now + HOLD_MINUTES * 60_000).toISOString();

    const insertPurchase = {
      raffle_id: rid,
      numbers,
      status: "pending_payment",     // iniciamos en pendiente
      buyer_email: buyer_email || null,
      buyer_name: buyer_name || null,
      accepted_terms: !!accepted_terms,
      terms_version: terms_version || "v1.0",
      accepted_terms_at: accepted_terms ? new Date(now).toISOString() : null,
      mp_preference_id: null,
      holds_until: holdsUntilIso,     // ⬅️ vencimiento
      paid_at: null,
    };

    const { data: pIns, error: perr } = await supabase
      .from("purchases")
      .insert(insertPurchase)
      .select("*")
      .limit(1);

    if (perr) throw perr;
    const purchase = (Array.isArray(pIns) && pIns[0]) || null;
    if (!purchase) throw new Error("insert_purchase_failed");

    // 4) reservar tickets → pending + hold_until
    const { error: uErr } = await supabase
      .from("tickets")
      .update({ status: "pending", purchase_id: purchase.id, hold_until: holdsUntilIso })
      .eq("raffle_id", rid)
      .in("number", numbers)
      .in("status", ["available", "free"]);

    if (uErr) {
      await supabase.from("purchases").update({ status: "failed" }).eq("id", purchase.id);
      throw uErr;
    }

    // 5) preferencia MP
    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) throw new Error("Missing MP_ACCESS_TOKEN");

    const base =
      process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/+$/, "") ||
      (req.headers.origin ? String(req.headers.origin) : "http://localhost:3000");

    const mpClient = new MercadoPagoConfig({ accessToken });
    const pref = new Preference(mpClient);

    const maxNums = 6;
    const numsPreview =
      numbers.length > maxNums
        ? `${numbers.slice(0, maxNums).join(", ")} y ${numbers.length - maxNums} más`
        : numbers.join(", ");
    const itemTitle = `Rifa: ${raffle.title || "Rifex"} — Números ${numsPreview}`;

    let prefResp;
    try {
      prefResp = await pref.create({
        body: {
          items: [
            {
              id: String(rid),
              title: itemTitle,
              quantity: 1,
              unit_price: total,
              currency_id: "CLP",
            },
          ],
          payer: {
            email: buyer_email || undefined,
            name: buyer_name || undefined,
          },
          metadata: {
            raffle_id: String(rid),
            numbers,
            purchase_id: String(purchase.id),
          },
          statement_descriptor: "RIFEX",
          back_urls: {
            success: `${base}/rifas/${rid}?pay=success`,
            failure: `${base}/rifas/${rid}?pay=failure`,
            pending: `${base}/rifas/${rid}?pay=pending`,
          },
          auto_return: "approved",
          notification_url: `${base}/api/checkout/webhook`,
          external_reference: String(purchase.id),
        },
      });
    } catch (e) {
      // liberar si falla MP
      await supabase
        .from("tickets")
        .update({ status: "available", purchase_id: null, hold_until: null })
        .eq("raffle_id", rid)
        .in("number", numbers)
        .eq("purchase_id", purchase.id);

      await supabase.from("purchases").update({ status: "failed" }).eq("id", purchase.id);
      throw e;
    }

    const mpPreferenceId = prefResp?.id || prefResp?.body?.id || null;
    if (mpPreferenceId) {
      await supabase
        .from("purchases")
        .update({ mp_preference_id: mpPreferenceId })
        .eq("id", purchase.id);
    }

    const initPoint =
      prefResp?.init_point ||
      prefResp?.body?.init_point ||
      prefResp?.sandbox_init_point ||
      prefResp?.body?.sandbox_init_point ||
      null;

    if (!initPoint) {
      return res.status(500).json({ ok: false, error: "no_init_point" });
    }

    return res.status(200).json({
      ok: true,
      url: initPoint,
      init_point: initPoint,
      mp_preference_id: mpPreferenceId,
      purchase_id: purchase.id,
      holds_until: holdsUntilIso,
    });
  } catch (e) {
    console.error("checkout/mp error:", e);
    return res.status(500).json({ ok: false, error: e?.message || "error" });
  }
}


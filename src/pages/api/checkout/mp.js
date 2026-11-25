// src/pages/api/checkout/mp.js
import { createClient } from "@supabase/supabase-js";
import { MercadoPagoConfig, Preference } from "mercadopago";
import { assertCountryGate } from "@/lib/countryGate";
import { resolveAdapterForSeller } from "@/lib/paymentEngine/engine";
import { computePlatformFeeMinor } from "@/lib/paymentEngine/feePolicy";
import { createPaymentIntent } from "@/lib/paymentEngine/contracts";
import { resolveFallbackDecision } from "@/lib/paymentEngine/fallbackPolicy";
import { enforceRateLimit, resolveClientIp } from "@/lib/rateLimit";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || null;

const supabase = createClient(url, service || anon, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const HOLD_MINUTES = parseInt(process.env.HOLD_MINUTES || "15", 10);
const RIFEX_FEE_RATE = 0.07; // 7% de comisión Rifex vía marketplace_fee (redondeo hacia abajo)

// RIFEX RAFFLE EXPERIENCE 2026 — el comprador ya no elige números
// específicos (grilla eliminada), solo una cantidad. La asignación real
// de números sigue pasando 100% por la misma RPC atómica todo-o-nada ya
// certificada (reserve_tickets_for_purchase) — esta función solo decide
// QUÉ candidatos proponerle a esa RPC, nunca reemplaza su garantía de
// atomicidad. Selección "random" real por SQL (order=random()) no está
// disponible vía PostgREST sin una función nueva (habría requerido
// migración + STOP); en su lugar se usa un offset aleatorio acotado +
// shuffle en memoria sobre una ventana pequeña de candidatos — aleatorio
// en la práctica, sin tocar el schema. Si la RPC rechaza el lote elegido
// (alguien más tomó alguno de esos números entre la lectura y la
// escritura), se reintenta con una ventana nueva — nunca dejamos un
// estado parcial, porque la RPC en sí es todo-o-nada.
// Ajustado con evidencia real: bajo ráfagas de concurrencia muy altas
// (20 compradores simultáneos sobre un pool de 100), una ventana de
// candidatos de quantity*3 con solo 4 reintentos dejó UNA solicitud sin
// resolver (assignment_conflict_retry_exhausted — comportamiento seguro,
// nunca un duplicado, pero evitable). Ventana más ancha + más reintentos
// reduce la probabilidad de colisión sin tocar la garantía de atomicidad
// real, que sigue viviendo 100% en la RPC.
const MAX_ASSIGNMENT_RETRIES = 6;
const CANDIDATE_WINDOW_CAP = 200;

async function assignRandomAvailableNumbers(supabase, raffleId, quantity, purchaseId, holdUntilIso) {
  for (let attempt = 1; attempt <= MAX_ASSIGNMENT_RETRIES; attempt++) {
    const { count: availableCount, error: cErr } = await supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("raffle_id", raffleId)
      .in("status", ["available", "free"]);
    if (cErr) throw cErr;
    if ((availableCount || 0) < quantity) {
      return { ok: false, error: "insufficient_availability", available: availableCount || 0 };
    }

    const candidateSize = Math.min(Math.max(quantity * 6, quantity), availableCount, CANDIDATE_WINDOW_CAP);
    const maxOffset = Math.max(0, availableCount - candidateSize);
    const offset = maxOffset > 0 ? Math.floor(Math.random() * (maxOffset + 1)) : 0;

    const { data: candidates, error: candErr } = await supabase
      .from("tickets")
      .select("number")
      .eq("raffle_id", raffleId)
      .in("status", ["available", "free"])
      .order("number", { ascending: true })
      .range(offset, offset + candidateSize - 1);
    if (candErr) throw candErr;

    const pool = (candidates || []).map((t) => t.number);
    if (pool.length < quantity) continue; // la disponibilidad cambió entre el count y el fetch — reintentar

    // Fisher-Yates sobre la ventana de candidatos — aleatoriza cuáles de
    // esos candidatos se proponen, sin necesitar random() en SQL.
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const picked = pool.slice(0, quantity);

    const { error: rErr } = await supabase.rpc("reserve_tickets_for_purchase", {
      p_raffle_id: raffleId,
      p_numbers: picked,
      p_purchase_id: purchaseId,
      p_hold_until: holdUntilIso,
    });
    if (!rErr) return { ok: true, numbers: picked };
    if (rErr.message !== "tickets_unavailable") throw rErr;
    // conflicto real: otro comprador tomó alguno de los candidatos elegidos
    // entre la lectura y la escritura — la RPC no dejó nada a medias,
    // reintentamos con una ventana de candidatos fresca.
  }
  return { ok: false, error: "assignment_conflict_retry_exhausted" };
}

// URL base limpia (sin slash final) y respetando headers si falta env
function resolveBaseUrl(req) {
  const cfg = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/+$/, "");
  if (cfg) return cfg;
  const proto = (req.headers["x-forwarded-proto"] || "https") + "://";
  const host = req.headers.host || "localhost:3000";
  return `${proto}${host}`;
}

function isProdEnv() {
  if (process.env.NODE_ENV === "production") return true;
  if (/rifex\.pro$/i.test(String(process.env.NEXT_PUBLIC_BASE_URL || ""))) return true;
  return false;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method_not_allowed" });

  // PRE-LAUNCH-FIX-1 (P1-3): endpoint público que crea preferencias reales
  // en Mercado Pago (costo/abuso) — límite por IP, ver src/lib/rateLimit.js
  // sobre por qué es por-IP (comprador sin sesión) y sus límites conocidos.
  const ip = resolveClientIp(req);
  if (await enforceRateLimit(req, res, { key: `checkout-mp:${ip}`, maxHits: 20, windowSeconds: 60 })) return;

  try {
    // 1) Body — RIFEX RAFFLE EXPERIENCE 2026: el comprador ya no envía
    // números específicos (grilla eliminada de la UI pública), solo una
    // cantidad. El servidor decide siempre qué números concretos se
    // asignan (assignRandomAvailableNumbers, arriba) — el cliente nunca
    // puede forzar/sugerir un número puntual.
    const {
      raffle_id, raffleId, quantity,
      buyer_email, buyer_name,
      accepted_terms, terms_version,
    } = req.body || {};
    const rid = raffle_id || raffleId;
    if (!rid) return res.status(400).json({ ok: false, error: "missing_raffle_id" });
    const qtyRequested = Number.parseInt(quantity, 10);
    if (!Number.isInteger(qtyRequested) || qtyRequested < 1) {
      return res.status(400).json({ ok: false, error: "invalid_quantity" });
    }

    // 2) Rifa
    const { data: rdata, error: rerr } = await supabase
      .from("raffles")
      .select("id, title, price_cents, total_numbers, creator_id, creator_email, sales_end_at")
      .eq("id", rid)
      .maybeSingle();
    if (rerr) throw rerr;
    if (!rdata) return res.status(404).json({ ok: false, error: "raffle_not_found" });

    const raffle = rdata;

    // Techo real: nunca más que el tamaño total de la rifa — no es un
    // límite nuevo inventado, es el propio total_numbers ya existente.
    if (raffle.total_numbers && qtyRequested > raffle.total_numbers) {
      return res.status(400).json({ ok: false, error: "quantity_exceeds_total" });
    }

    // DRAW-1: gate de tiempo — solo bloquea si la rifa configuró
    // sales_end_at (modelo temporal nuevo). Rifas V1 con sales_end_at=NULL
    // conservan el comportamiento legado exacto (sin gate de tiempo).
    if (raffle.sales_end_at && Date.now() >= new Date(raffle.sales_end_at).getTime()) {
      return res.status(409).json({ ok: false, error: "sales_closed" });
    }

    // Country Gate (G2): país operativo del CREADOR de la rifa, no del
    // comprador (el comprador sigue siendo público, sin sesión). Precondición
    // temprana — antes de reservar tickets ni crear la purchase, para no
    // tener que revertir nada si el país no habilita raffles.
    const gate = await assertCountryGate(raffle.creator_id, "raffles");
    if (!gate.ok) return res.status(403).json({ ok: false, error: gate.reason, message: gate.message });

    const pricePerNumberCents = Number(raffle.price_cents || 0);
    const unitPriceCLP = Math.round(pricePerNumberCents / 100); // CLP entero por número
    const qty = qtyRequested;
    if (!Number.isFinite(unitPriceCLP) || unitPriceCLP <= 0) {
      return res.status(400).json({ ok: false, error: "invalid_price" });
    }

    // 3) Purchase (números aún desconocidos — se completan tras la
    // asignación atómica de abajo) + asignación + reserva
    const now = Date.now();
    const holdsUntilIso = new Date(now + HOLD_MINUTES * 60_000).toISOString();

    const insertPurchase = {
      raffle_id: rid,
      numbers: [],
      status: "pending_payment",
      buyer_email: buyer_email || null,
      buyer_name:  buyer_name  || null,
      accepted_terms: !!accepted_terms,
      terms_version:  terms_version || "v1.0",
      accepted_terms_at: accepted_terms ? new Date(now).toISOString() : null,
      mp_preference_id: null,
      holds_until: holdsUntilIso,
      paid_at: null,
    };
    const { data: pIns, error: perr } = await supabase
      .from("purchases")
      .insert(insertPurchase)
      .select("*")
      .maybeSingle();
    if (perr) throw perr;
    const purchase = pIns;

    // PRE-LAUNCH-FIX-1 (P0-2) + RAFFLE EXPERIENCE 2026: la asignación de
    // candidatos es nueva (arriba), pero la escritura real sigue siendo
    // 100% la misma RPC reserve_tickets_for_purchase() todo-o-nada ya
    // certificada — revierte cualquier reserva parcial y nunca deja un
    // pedido a medias.
    const assignment = await assignRandomAvailableNumbers(supabase, rid, qty, purchase.id, holdsUntilIso);
    if (!assignment.ok) {
      await supabase.from("purchases").update({ status: "failed" }).eq("id", purchase.id);
      if (assignment.error === "insufficient_availability") {
        return res.status(409).json({ ok: false, error: "insufficient_availability", details: { available: assignment.available } });
      }
      return res.status(409).json({ ok: false, error: assignment.error || "assignment_failed" });
    }
    const numbers = assignment.numbers;
    await supabase.from("purchases").update({ numbers }).eq("id", purchase.id);

    // 5) Token del vendedor (mp_accounts o merchant_gateways) + fallback plataforma
    let sellerToken = null;
    {
      const { data: a } = await supabase
        .from("mp_accounts")
        .select("access_token")
        .eq("user_id", raffle.creator_id)
        .maybeSingle();
      sellerToken = a?.access_token || null;
    }
    if (!sellerToken) {
      const { data: g } = await supabase
        .from("merchant_gateways")
        .select("access_token")
        .eq("user_id", raffle.creator_id)
        .eq("provider", "mp")
        .maybeSingle();
      sellerToken = g?.access_token || null;
    }

    const prod = isProdEnv();
    const platformFallback = process.env.MP_ACCESS_TOKEN || null;
    const allowPlatformInProd = process.env.RIFEX_ALLOW_PLATFORM_FALLBACK === "1";
    const accessToken = sellerToken || (allowPlatformInProd ? platformFallback : (!prod ? platformFallback : null));

    if (!accessToken) {
      // liberar reserva si no hay token usable
      await supabase
        .from("tickets")
        .update({ status: "available", purchase_id: null, hold_until: null })
        .eq("raffle_id", rid)
        .in("number", numbers)
        .eq("purchase_id", purchase.id);
      await supabase.from("purchases").update({ status: "failed" }).eq("id", purchase.id);
      return res.status(400).json({ ok:false, error:"merchant_not_connected" });
    }

    // 6) Preferencia
    const base = resolveBaseUrl(req);
    const notificationUrl =
      process.env.MP_WEBHOOK_URL?.replace(/\/+$/, "") || `${base}/api/checkout/webhook`;

    const mpClient = new MercadoPagoConfig({ accessToken });
    const preference = new Preference(mpClient);

    const cleanTitle = `Rifa ${String(raffle.title || "Rifex").slice(0, 60)}`;

    // Comisión Rifex vía marketplace_fee: solo tiene sentido cuando la preferencia
    // se crea con el token OAuth de un vendedor real conectado (no con el token
    // de plataforma usado como fallback), porque ahí es donde MP hace el split.
    const totalCLP = unitPriceCLP * qty;

    // P2/AR2: primer consumidor real del Payment Engine (P1) — resuelve
    // country/currency/provider. Si el motor no resuelve para CL (no
    // debería pasar, ya pasó el Country Gate arriba), cae al comportamiento
    // legado exacto — cero cambio observable garantizado. Si el país
    // autoritativo NO es CL, AR2 exige fail closed: nunca se completa el
    // checkout con configuración/moneda de Chile para otro país.
    let currency = "CLP";
    let providerId = "mercado_pago";
    let engineCountry = null;
    let routed;
    try {
      routed = await resolveAdapterForSeller(raffle.creator_id, "mercadoPago");
    } catch (e) {
      console.warn("[mp][payment-engine] error resolviendo:", e?.message || e);
      routed = { ok: false, reason: "engine_error", country: null };
    }

    const decision = resolveFallbackDecision(routed);
    if (decision === "fail_closed") {
      console.error("[mp][payment-engine] FAIL CLOSED — país no-CL sin motor listo:", routed.country, routed.reason);
      await supabase
        .from("tickets")
        .update({ status: "available", purchase_id: null, hold_until: null })
        .eq("raffle_id", rid)
        .in("number", numbers)
        .eq("purchase_id", purchase.id);
      await supabase.from("purchases").update({ status: "failed" }).eq("id", purchase.id);
      return res.status(400).json({ ok: false, error: "country_payment_engine_unavailable" });
    }
    if (decision === "use_engine") {
      currency = routed.currency || currency;
      providerId = routed.provider || providerId;
      engineCountry = routed.country;
    } else {
      console.warn("[mp][payment-engine] fallback a legado CL:", routed.reason);
    }

    let marketplaceFee = undefined;
    if (sellerToken) {
      const engineFee = computePlatformFeeMinor(totalCLP, engineCountry || "CL", providerId);
      marketplaceFee = engineFee != null
        ? engineFee
        : Math.max(0, Math.min(Math.floor(totalCLP * RIFEX_FEE_RATE), totalCLP)); // fallback exacto, no debería ejecutarse hoy para CL
    }

    try {
      createPaymentIntent({
        country: engineCountry || "CL",
        currency,
        provider: providerId,
        productType: "raffle_ticket",
        sellerId: raffle.creator_id,
        externalReference: String(purchase.id),
        grossAmountMinor: totalCLP,
        platformFeeMinor: marketplaceFee ?? 0,
      });
    } catch (e) {
      console.warn("[mp][payment-engine] contrato neutral no construido (no bloquea):", e?.message || e);
    }

    const prefBody = {
      items: [{
        title: cleanTitle,
        quantity: qty,
        unit_price: unitPriceCLP, // precio por número
        currency_id: currency,
      }],
      ...(marketplaceFee != null ? { marketplace_fee: marketplaceFee } : {}),
      payer: { email: buyer_email || undefined, name: buyer_name || undefined },
      back_urls: {
        success: `${base}/rifas/${rid}?pay=success&pid=${purchase.id}`,
        failure: `${base}/rifas/${rid}?pay=failure&pid=${purchase.id}`,
        pending: `${base}/rifas/${rid}?pay=pending&pid=${purchase.id}`,
      },
      auto_return: "approved",
      binary_mode: true,
      external_reference: String(purchase.id),
      notification_url: notificationUrl,
      statement_descriptor: "RIFEX",
      metadata: {
        raffle_id: String(rid),
        purchase_id: String(purchase.id),
        numbers,
        seller_connected: !!sellerToken,
        marketplace_fee: marketplaceFee ?? 0,
      },
    };

    let prefRes;
    try {
      prefRes = await preference.create({ body: prefBody });
    } catch (e) {
      console.error("[mp] preference.create error", e?.status, e?.message, e?.cause || e);
      // liberar reserva
      await supabase
        .from("tickets")
        .update({ status: "available", purchase_id: null, hold_until: null })
        .eq("raffle_id", rid)
        .in("number", numbers)
        .eq("purchase_id", purchase.id);
      await supabase.from("purchases").update({ status: "failed" }).eq("id", purchase.id);
      return res.status(500).json({ ok:false, error:"mp_preference_failed" });
    }

    const mpPreferenceId = prefRes?.id || prefRes?.body?.id || null;
    if (mpPreferenceId) {
      await supabase.from("purchases").update({ mp_preference_id: mpPreferenceId }).eq("id", purchase.id);
    }

    const initPoint =
      prefRes?.init_point ||
      prefRes?.body?.init_point ||
      prefRes?.sandbox_init_point ||
      prefRes?.body?.sandbox_init_point ||
      null;

    if (!initPoint) {
      console.error("[mp] missing init_point", prefRes);
      return res.status(500).json({ ok:false, error:"no_init_point" });
    }

    return res.status(200).json({
      ok: true,
      url: initPoint,
      init_point: initPoint,
      mp_preference_id: mpPreferenceId,
      purchase_id: purchase.id,
      holds_until: holdsUntilIso,
      seller_connected: !!sellerToken,
      marketplace_fee: marketplaceFee ?? 0,
    });
  } catch (e) {
    console.error("checkout/mp error:", e);
    return res.status(500).json({ ok:false, error: e?.message || "error" });
  }
}

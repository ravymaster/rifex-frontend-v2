// src/pages/api/checkout/colecta.js
// Hermano de checkout/mp.js — mismo patrón (token del vendedor, marketplace_fee
// 7%, metadata inequívoca), archivo propio, sin tocar el original. No procesa
// el webhook (eso es C5) ni marca nada como aprobado — solo crea la intención
// de aporte (pending) y la preference de MP.
import { createClient } from "@supabase/supabase-js";
import { MercadoPagoConfig, Preference } from "mercadopago";
import { isAcceptingContributions } from "@/lib/colectaStatus";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || null;

const supabase = createClient(url, service || anon, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const RIFEX_FEE_RATE = 0.07;
const MIN_AMOUNT_CLP = 500;
const MAX_AMOUNT_CLP = 10_000_000;

const isValidEmail = (s) => typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

function resolveBaseUrl(req) {
  const cfg = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/+$/, "");
  if (cfg) return cfg;
  const proto = (req.headers["x-forwarded-proto"] || "https") + "://";
  const host = req.headers.host || "localhost:3000";
  return `${proto}${host}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method_not_allowed" });

  try {
    // 1) Body — solo lo mínimo. Nunca se acepta creator_id, access_token,
    // marketplace_fee, mp_payment_id ni ningún estado financiero del cliente.
    const { colecta_id, amount_clp, contributor_name, contributor_email, idempotency_key } = req.body || {};
    if (!colecta_id) return res.status(400).json({ ok: false, error: "missing_colecta_id" });

    const amount = Math.round(Number(amount_clp));
    if (!Number.isFinite(amount) || amount < MIN_AMOUNT_CLP || amount > MAX_AMOUNT_CLP) {
      return res.status(400).json({ ok: false, error: "invalid_amount" });
    }

    const name = String(contributor_name || "").trim().slice(0, 120);
    if (!name) return res.status(400).json({ ok: false, error: "missing_name" });

    const email = String(contributor_email || "").trim().toLowerCase();
    if (!isValidEmail(email)) return res.status(400).json({ ok: false, error: "invalid_email" });

    const idemKey = idempotency_key ? String(idempotency_key).slice(0, 100) : null;

    // 2) Colecta real y activa AHORA MISMO — nunca se confía en el estado
    // que tenía la página al cargar, se re-consulta en cada intento.
    const { data: colecta, error: cErr } = await supabase
      .from("colectas")
      .select("id, title, creator_id, status, end_at")
      .eq("id", colecta_id)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!colecta) return res.status(404).json({ ok: false, error: "colecta_not_found" });
    // No alcanza con mirar status: una campaña activa cuyo end_at ya pasó
    // tampoco puede iniciar un checkout — misma autoridad que usa la
    // página pública (deriveEffectiveStatus), nunca el estado que traía la
    // página al cargar.
    if (!isAcceptingContributions(colecta)) return res.status(409).json({ ok: false, error: "colecta_not_active" });

    // 3) Conexión MP del CREADOR (resuelta desde colecta.creator_id, jamás
    // desde algo que mande el cliente) — si no está conectado, no hay forma
    // de cobrar, se corta acá.
    const { data: gw } = await supabase
      .from("merchant_gateways")
      .select("access_token")
      .eq("user_id", colecta.creator_id)
      .eq("provider", "mp")
      .maybeSingle();
    const sellerToken = gw?.access_token || null;
    if (!sellerToken) return res.status(400).json({ ok: false, error: "creator_not_connected" });

    // 4) Idempotencia: si ya existe una fila con esta misma key, se reusa en
    // vez de crear una fila/preference nueva. Si ya tenía un init_point
    // guardado, se devuelve directo (sin volver a llamar a MP).
    let contribution = null;
    if (idemKey) {
      const { data: existing } = await supabase
        .from("colecta_contributions")
        .select("*")
        .eq("idempotency_key", idemKey)
        .maybeSingle();
      if (existing) {
        if (existing.mp_init_point) {
          return res.status(200).json({
            ok: true,
            url: existing.mp_init_point,
            init_point: existing.mp_init_point,
            contribution_id: existing.id,
            marketplace_fee: existing.marketplace_fee_cents != null ? Math.round(existing.marketplace_fee_cents / 100) : undefined,
            reused: true,
          });
        }
        contribution = existing; // se creó la fila pero se cayó antes de tener preference — se retoma
      }
    }

    // 5) Fila pending — el contribution_id que va a la metadata de MP es
    // este id real generado acá, nunca uno mandado por el cliente.
    if (!contribution) {
      const { data: inserted, error: insErr } = await supabase
        .from("colecta_contributions")
        .insert({
          colecta_id: colecta.id,
          amount_cents: amount * 100,
          contributor_email: email,
          contributor_name: name,
          status: "pending",
          idempotency_key: idemKey,
        })
        .select("*")
        .single();
      if (insErr) throw insErr;
      contribution = inserted;
    }

    // 6) Preference de MP con el token del vendedor real.
    const base = resolveBaseUrl(req);
    // Ruta propia, futura — NO se procesa en C4, y a propósito NO se arma con
    // MP_WEBHOOK_URL (ese fallback es de Rifa; reusarlo enviaría los avisos
    // de Colecta al webhook de rifa).
    const notificationUrl = `${base}/api/checkout/webhook-colecta`;

    const mpClient = new MercadoPagoConfig({ accessToken: sellerToken });
    const preference = new Preference(mpClient);

    const rawFee = Math.floor(amount * RIFEX_FEE_RATE);
    const marketplaceFee = Math.max(0, Math.min(rawFee, amount));

    const cleanTitle = `Aporte a "${String(colecta.title || "Colecta").slice(0, 50)}"`;

    const prefBody = {
      items: [{ title: cleanTitle, quantity: 1, unit_price: amount, currency_id: "CLP" }],
      marketplace_fee: marketplaceFee,
      payer: { email, name },
      back_urls: {
        success: `${base}/colectas/${colecta.id}?aporte=success&cid=${contribution.id}`,
        failure: `${base}/colectas/${colecta.id}?aporte=failure&cid=${contribution.id}`,
        pending: `${base}/colectas/${colecta.id}?aporte=pending&cid=${contribution.id}`,
      },
      auto_return: "approved",
      binary_mode: true,
      external_reference: String(contribution.id),
      notification_url: notificationUrl,
      statement_descriptor: "RIFEX",
      metadata: {
        product: "colecta",
        colecta_id: String(colecta.id),
        contribution_id: String(contribution.id),
        marketplace_fee: marketplaceFee,
      },
    };

    let prefRes;
    try {
      prefRes = await preference.create({ body: prefBody });
    } catch (e) {
      console.error("[checkout/colecta] preference.create error", e?.message || e);
      await supabase.from("colecta_contributions").update({ status: "rejected" }).eq("id", contribution.id);
      return res.status(500).json({ ok: false, error: "mp_preference_failed" });
    }

    const mpPreferenceId = prefRes?.id || prefRes?.body?.id || null;
    const initPoint =
      prefRes?.init_point || prefRes?.body?.init_point ||
      prefRes?.sandbox_init_point || prefRes?.body?.sandbox_init_point || null;

    if (!initPoint) {
      console.error("[checkout/colecta] missing init_point", prefRes);
      return res.status(500).json({ ok: false, error: "no_init_point" });
    }

    await supabase
      .from("colecta_contributions")
      .update({ mp_preference_id: mpPreferenceId, mp_init_point: initPoint, marketplace_fee_cents: marketplaceFee * 100 })
      .eq("id", contribution.id);

    return res.status(200).json({
      ok: true,
      url: initPoint,
      init_point: initPoint,
      contribution_id: contribution.id,
      marketplace_fee: marketplaceFee,
    });
  } catch (e) {
    console.error("[checkout/colecta] error", e);
    return res.status(500).json({ ok: false, error: e?.message || "error" });
  }
}

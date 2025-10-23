// src/pages/api/checkout/index.js
import mercadopago from "mercadopago";
import { createClient } from "@supabase/supabase-js";

/**
 * Endpoint: POST /api/checkout
 * Body esperado: { raffleId: string, numbers: number[], buyerEmail?: string }
 * Flujo:
 *  1) Busca la rifa para obtener price_clp y creator_id
 *  2) Obtiene el access token OAuth de MP del creador (merchant_gateways)
 *  3) Crea la preferencia con back_urls a /checkout/* y application_fee = 7%
 *  4) Devuelve { init_point } para redirigir al Checkout Pro
 */

// --- Supabase (service role para servidor) ---
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// Helper: base URL del sitio (prod/preview)
function baseUrl(req) {
  const cfg = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/+$/, "");
  if (cfg) return cfg;
  const proto = (req.headers["x-forwarded-proto"] || "https") + "://";
  const host = req.headers.host || "localhost:3000";
  return `${proto}${host}`;
}

// Redondeo seguro a entero CLP
const roundCLP = (n) => Math.max(0, Math.round(Number(n || 0)));

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  try {
    const { raffleId, numbers, buyerEmail } = req.body || {};
    if (!raffleId || !Array.isArray(numbers) || numbers.length === 0) {
      return res.status(400).json({ error: "missing_raffle_or_numbers" });
    }

    // 1) Rifa -> precio y creador
    const { data: raffle, error: raffleErr } = await supabase
      .from("raffles")
      .select("id, title, price_clp, creator_id")
      .eq("id", raffleId)
      .maybeSingle();

    if (raffleErr || !raffle) {
      return res.status(400).json({ error: "raffle_not_found" });
    }

    const unitPrice = roundCLP(raffle.price_clp);
    if (!unitPrice) {
      return res.status(400).json({ error: "invalid_raffle_price" });
    }

    // 2) Tokens de MP del creador
    const { data: gw, error: gwErr } = await supabase
      .from("merchant_gateways")
      .select("mp_access_token, revoked_at, expires_at, live_mode")
      .eq("user_id", raffle.creator_id)
      .eq("provider", "mp")
      .maybeSingle();

    if (gwErr || !gw?.mp_access_token) {
      return res.status(400).json({ error: "creator_not_connected_mp" });
    }

    // revisa revocado/expirado
    const now = Date.now();
    const isRevoked = !!gw.revoked_at;
    const isExpired = gw.expires_at ? new Date(gw.expires_at).getTime() <= now : false;
    if (isRevoked || isExpired) {
      return res.status(400).json({ error: "access_token_invalid_or_expired" });
    }

    // 3) Configura MP con el token del creador (OAuth)
    mercadopago.configure({ access_token: gw.mp_access_token });

    // Monto total y fee
    const quantity = numbers.length;
    const subtotal = unitPrice * quantity;
    const rifexFee = roundCLP(subtotal * 0.07); // 7% para Rifex (en CLP)

    const BASE = baseUrl(req);

    // 4) Preferencia
    const preference = {
      items: [
        {
          title: raffle.title ? `Rifa: ${raffle.title}` : "Compra de números Rifex",
          unit_price: unitPrice,
          quantity,
          currency_id: "CLP",
        },
      ],
      payer: buyerEmail ? { email: String(buyerEmail).toLowerCase() } : undefined,

      // URLs de retorno en tu frontend
      back_urls: {
        success: `${BASE}/checkout/success`,
        failure: `${BASE}/checkout/failure`,
        pending: `${BASE}/checkout/pending`,
      },
      auto_return: "approved",

      // Comisiones de plataforma (monto fijo en CLP)
      application_fee: rifexFee,

      // Para debugging/conciliación
      external_reference: JSON.stringify({
        raffleId,
        numbers,
        ts: Date.now(),
      }),

      // Opcional: info del vendedor
      marketplace: "Rifex",
      statement_descriptor: "RIFEX",
    };

    const prefRes = await mercadopago.preferences.create(preference);
    const init_point = prefRes?.body?.init_point;

    if (!init_point) {
      return res.status(500).json({ error: "mp_preference_failed", detail: prefRes?.body || null });
    }

    return res.status(200).json({
      init_point,
      amount: subtotal,
      fee: rifexFee,
      live_mode: !!gw.live_mode,
    });
  } catch (e) {
    console.error("[/api/checkout] error:", e?.response?.data || e?.message || e);
    return res.status(500).json({ error: "internal_error" });
  }
}

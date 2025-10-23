// src/pages/api/mp/preference.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// Construye base URL confiable para back_urls (prod/preview/local)
function getBaseUrl(req) {
  const fromEnv = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  const proto = (req.headers["x-forwarded-proto"] || "https") + "://";
  const host = req.headers.host || "localhost:3000";
  return `${proto}${host}`;
}

/**
 * Crea una preferencia de MP usando el access_token del VENDEDOR conectado.
 *
 * Body esperado (JSON):
 *  - raffleId: string (ID de la rifa)
 *  - numbers: number[] (opcional; por si reservas/registros)
 *  - buyerEmail?: string
 *  - amountCLP: number (total en CLP)
 *  - rifexFeeCLP?: number (opcional; fee Rifex en CLP, p.ej. 7%)
 *
 * Opcionalmente puedes aceptar 'sellerUid' directo:
 *  - sellerUid?: string (si lo mandas, no consultamos la rifa)
 */
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  try {
    const {
      raffleId,
      numbers,
      buyerEmail,
      amountCLP,
      rifexFeeCLP,
      sellerUid, // opcional: si ya lo tenés
    } = req.body || {};

    if (!raffleId && !sellerUid) {
      return res.status(400).json({ ok: false, error: "missing_raffleId_or_sellerUid" });
    }
    if (!amountCLP || isNaN(Number(amountCLP)) || Number(amountCLP) <= 0) {
      return res.status(400).json({ ok: false, error: "invalid_amount" });
    }

    // 1) Resolver el seller (dueño de la rifa)
    let creatorUid = sellerUid || null;

    if (!creatorUid) {
      // Ajusta el select a tu esquema real de 'rifas'
      const { data: rf, error: rfErr } = await supabase
        .from("rifas")
        .select("id, user_id, title, price_cents")
        .eq("id", raffleId)
        .maybeSingle();

      if (rfErr) {
        console.error("[mp/preference] rifas error:", rfErr);
        return res.status(500).json({ ok: false, error: "db_error_rifa" });
      }
      if (!rf?.user_id) {
        return res.status(400).json({ ok: false, error: "raffle_not_found" });
      }
      creatorUid = rf.user_id;
    }

    // 2) Leer el token del VENDEDOR conectado a MP
    const { data: gw, error: gwErr } = await supabase
      .from("merchant_gateways")
      .select("mp_access_token, live_mode, linked_email")
      .eq("user_id", creatorUid)
      .eq("provider", "mp")
      .maybeSingle();

    if (gwErr) {
      console.error("[mp/preference] merchant_gateways error:", gwErr);
      return res.status(500).json({ ok: false, error: "db_error_gateway" });
    }
    if (!gw?.mp_access_token) {
      return res.status(400).json({ ok: false, error: "mp_not_connected" });
    }

    const BASE = getBaseUrl(req);

    // 3) Construir payload de preferencia
    const payload = {
      items: [
        {
          title: `Rifa ${raffleId}`,
          quantity: 1,
          currency_id: "CLP",
          unit_price: Number(amountCLP),
        },
      ],
      back_urls: {
        success: `${BASE}/pagos/mp/success`,
        failure: `${BASE}/pagos/mp/failure`,
        pending: `${BASE}/pagos/mp/pending`,
      },
      auto_return: "approved",
      external_reference: `rifa_${raffleId}_${Date.now()}`,
      payer: buyerEmail ? { email: String(buyerEmail) } : undefined,
      // Para Checkout Pro el nombre correcto del fee del marketplace es 'marketplace_fee' (monto fijo en CLP).
      ...(rifexFeeCLP ? { marketplace_fee: Number(rifexFeeCLP) } : {}),
      // Puedes enviar metadata útil para tu backend
      metadata: {
        raffleId,
        numbers: Array.isArray(numbers) ? numbers : [],
        sellerUid: creatorUid,
      },
    };

    // 4) Crear preferencia con el token DEL VENDEDOR
    const prefRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${gw.mp_access_token}`,
      },
      body: JSON.stringify(payload),
    });

    const pref = await prefRes.json();

    if (!prefRes.ok) {
      console.error("[mp/preference] create error:", pref);
      return res.status(400).json({ ok: false, error: "mp_preference_failed", detail: pref });
    }

    // 5) Devolver el URL correcto según ambiente del vendedor
    const redirect = gw.live_mode
      ? pref.init_point
      : (pref.sandbox_init_point || pref.init_point);

    return res.status(200).json({
      ok: true,
      pref_id: pref.id,
      redirect,
      live_mode: gw.live_mode,
      seller_email: gw.linked_email || null,
    });
  } catch (e) {
    console.error("[mp/preference] fatal:", e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
}

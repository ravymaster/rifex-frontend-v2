// src/pages/api/checkout/webhook.js
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { applyMpPayment } from "@/lib/paymentReconcile";

// ==== Runtime + raw body ====
export const config = { api: { bodyParser: false }, runtime: "nodejs" };

// ==== Supabase (service role si está disponible) ====
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = Buffer.alloc(0);
    req.on("data", (chunk) => (data = Buffer.concat([data, chunk])));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function parseMaybeFormUrlEncoded(rawBuf) {
  const txt = rawBuf.toString("utf8");
  const kv = Object.fromEntries(
    txt.split("&").map((p) => {
      const [k, v] = p.split("=");
      return [decodeURIComponent(k || ""), decodeURIComponent(v || "")];
    })
  );
  return kv;
}

function safeJsonParse(buf) {
  try {
    return JSON.parse(buf.toString("utf8"));
  } catch {
    return null;
  }
}

function buildEventId(req, paymentId) {
  const reqId = String(req.headers["x-request-id"] || "");
  const ts = Date.now();
  return `mpw_${paymentId || "noid"}_${reqId || "noreqid"}_${ts}`;
}

function mask(val, keep = 6) {
  const s = String(val || "");
  if (s.length <= keep) return s;
  return `${s.slice(0, keep)}…(${s.length})`;
}

async function fetchPayment(paymentId, hintMpUserId = null) {
  // 1) Intento con token plataforma
  const platformToken = process.env.MP_ACCESS_TOKEN || null;
  if (platformToken) {
    const r = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${platformToken}` },
    });
    if (r.ok) return { ok: true, json: await r.json(), via: "platform" };
    if (![401, 403].includes(r.status)) {
      return { ok: false, status: r.status, json: await r.json().catch(() => ({})), via: "platform" };
    }
  }

  // 2) Fallback: probar token del vendedor si conocemos mp_user_id
  if (hintMpUserId) {
    const { data: gw } = await supabase
      .from("merchant_gateways")
      .select("access_token, mp_user_id")
      .eq("mp_user_id", String(hintMpUserId))
      .eq("provider", "mp")
      .maybeSingle();

    const sellerToken = gw?.access_token || null;
    if (sellerToken) {
      const r2 = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${sellerToken}` },
      });
      if (r2.ok) return { ok: true, json: await r2.json(), via: "seller" };
      return { ok: false, status: r2.status, json: await r2.json().catch(() => ({})), via: "seller" };
    }
  }

  return { ok: false, status: 401, json: { error: "no_token_available" }, via: "none" };
}

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ ok: false, error: "method_not_allowed" });

  let raw = null;
  let eventId = null;

  try {
    raw = await readRawBody(req);
  } catch (e) {
    console.error("[mp webhook] raw body error", e);
    // 200 para que MP no reintente infinito
    return res.status(200).json({ ok: false, error: "raw_body_error" });
  }

  try {
    // ==== Logs base (headers + raw) ====
    const h = Object.fromEntries(
      Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : String(v)])
    );
    delete h.authorization; // nunca loguear tokens
    console.log("[mp webhook] HEADERS:", h);
    console.log("[mp webhook] RAW:", mask(raw.toString("utf8"), 512));

    // ==== Parse del cuerpo ====
    let body = safeJsonParse(raw);
    if (!body) {
      try {
        body = parseMaybeFormUrlEncoded(raw);
      } catch (e) {
        console.error("[mp webhook] body parse error", e);
        return res.status(200).json({ ok: false, error: "invalid_body" });
      }
    }

    // Campos habituales en webhook MP
    const paymentId =
      body?.data?.id ||
      body?.id ||
      body?.resource?.id ||
      (typeof body?.data === "string" ? body.data : null);

    // Eventos que no son de pago
    if (!paymentId) {
      console.log("[mp webhook] no payment id in payload");
      return res.status(200).json({ ok: true, msg: "no_payment_id" });
    }

    eventId = buildEventId(req, paymentId);

    // ==== Validación de firma ====
    // Manifiesto real de MP: "id:{data.id};request-id:{x-request-id};ts:{ts};"
    // (la versión anterior omitía "request-id:" y usaba x-request-id como id,
    // así que nunca validaba nada real, ni en producción).
    //
    // PRE-LAUNCH-FIX-2 (P2-B): antes, si el secreto SÍ estaba configurado
    // pero la firma o el request-id venían AUSENTES, el chequeo entero se
    // saltaba en silencio (el `if` de arriba exigía los tres presentes a la
    // vez) — un atacante podía simplemente omitir el header de firma para
    // evitar la validación, aun con MP_WEBHOOK_SECRET configurado. Ahora:
    // si el secreto está configurado, fail-closed — firma/request-id
    // ausentes o que no calzan se rechazan igual (401). Si el secreto NO
    // está configurado (como hoy en DEV, donde tampoco hay MP_ACCESS_TOKEN
    // así que este endpoint no puede hacer nada útil de todas formas), no
    // hay nada contra qué validar — se documenta explícitamente, nunca se
    // afirma una protección que no existe. Confirmado por lectura (sin
    // revelar el valor) que PROD sí tiene MP_WEBHOOK_SECRET configurado,
    // así que este fail-closed no rompe tráfico real de MP el día que este
    // código se promueva.
    const secret = process.env.MP_WEBHOOK_SECRET;
    if (secret) {
      const signature = req.headers["x-signature"];
      const reqId = req.headers["x-request-id"];
      if (!signature || !reqId) {
        console.error("[mp webhook] secret configurado pero falta x-signature/x-request-id — rechazado", { eventId });
        return res.status(401).json({ ok: false, error: "missing_signature" });
      }
      try {
        const parts = Object.fromEntries(
          String(signature)
            .split(",")
            .map((kv) => kv.trim().split("="))
        );
        const signed = `id:${paymentId};request-id:${reqId};ts:${parts.ts};`;
        const digest = crypto.createHmac("sha256", secret).update(signed).digest("hex");

        if (digest !== parts.v1) {
          console.error("[mp webhook] firma inválida — rechazado", {
            eventId,
            expected: digest,
            got: parts.v1,
            ts: parts.ts,
          });
          return res.status(401).json({ ok: false, error: "invalid_signature" });
        }
      } catch (e) {
        console.error("[mp webhook] error parseando firma — rechazado", { eventId, err: e?.message || e });
        return res.status(401).json({ ok: false, error: "invalid_signature" });
      }
    }
    // Nota (P2-B, decisión documentada): NO se agrega rate limiting a este
    // endpoint. Los emisores son la infraestructura de Mercado Pago
    // (reintentos de webhook), no navegadores de usuarios finales — su IP
    // no identifica a un cliente individual y puede ser compartida entre
    // muchos comercios distintos. Un límite por IP acá arriesgaría
    // descartar reintentos legítimos de MP para ESTE u OTROS comercios que
    // comparten esa infraestructura. El daño real que este endpoint puede
    // causar ya está acotado de por sí: el estado/monto del pago SIEMPRE
    // se re-verifica contra la API real de MP (nunca se confía en el body
    // del webhook), así que una ráfaga solo puede generar trabajo
    // idempotente redundante, no corrupción ni costo financiero.

    // Hint de mp_user_id/collector para probar token del vendedor
    const hintMpUserId =
      body?.user_id || body?.account_id || body?.collector_id || body?.owner_id || null;

    // ==== Traer el pago desde MP ====
    const fetched = await fetchPayment(paymentId, hintMpUserId);
    if (!fetched.ok) {
      console.warn("[mp webhook] cannot fetch payment", {
        eventId,
        status: fetched.status,
        via: fetched.via,
        body: fetched.json,
      });
      return res.status(200).json({ ok: false, error: "fetch_payment_failed" });
    }

    const mp = fetched.json;

    // ==== Log de auditoría (idempotente por event_id; no bloquea el flujo si falla) ====
    try {
      await supabase.from("webhook_events").upsert(
        {
          event_type: body?.type || body?.action || null,
          payment_id: String(paymentId),
          live_mode: typeof mp?.live_mode === "boolean" ? mp.live_mode : null,
          payload: body,
          headers: h,
          event_id: eventId,
        },
        { onConflict: "event_id", ignoreDuplicates: true }
      );
    } catch (e) {
      console.error("[mp webhook] webhook_events insert error", { eventId, err: e?.message || e });
    }

    // PRE-LAUNCH-FIX-1 (P0-2): toda la lógica de "qué significa un pago
    // approved" vive ahora en applyMpPayment() (src/lib/paymentReconcile.js)
    // — la misma función que usan admin/reconcile-payments.js y
    // checkout/confirm.js, así que los tres caminos convergen exactamente
    // al mismo resultado final, sin duplicar (y sin poder divergir en) la
    // lógica de qué ticket marcar sold. Antes, este bloque tenía su propia
    // copia que intentaba escribir `tickets.payment_ref` (columna
    // inexistente en el modelo real — solo existe en la tabla legacy
    // `rifa_tickets`) y filtraba por raffle_id+number en vez de
    // purchase_id, lo que fallaba en silencio en cada pago aprobado real.
    let applyResult;
    try {
      applyResult = await applyMpPayment({ supabase, mp, fetchedVia: fetched.via });
    } catch (e) {
      console.error("[mp webhook] applyMpPayment error", { eventId, err: e?.message || e });
      return res.status(200).json({ ok: false, error: "apply_payment_error" });
    }

    return res.status(200).json({ ok: true, eventId, ...applyResult });
  } catch (e) {
    console.error("[mp webhook] fatal error", e);
    return res.status(200).json({ ok: false, error: String(e) });
  }
}









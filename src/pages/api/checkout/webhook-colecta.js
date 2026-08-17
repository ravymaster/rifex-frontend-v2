// src/pages/api/checkout/webhook-colecta.js
// Hermano de checkout/webhook.js — mismo principio no negociable: nunca se
// confía en el body del webhook. Todo lo que decide un estado financiero
// sale de volver a consultar el pago real en la API de Mercado Pago.
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { notifyColectaApproved } from "@/lib/colectaMailer";

export const config = { api: { bodyParser: false }, runtime: "nodejs" };

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
  return `colw_${paymentId || "noid"}_${reqId || "noreqid"}_${ts}`;
}

function mask(val, keep = 6) {
  const s = String(val || "");
  if (s.length <= keep) return s;
  return `${s.slice(0, keep)}…(${s.length})`;
}

async function fetchPayment(paymentId, hintMpUserId = null) {
  const platformToken = process.env.MP_ACCESS_TOKEN || null;
  let platformFail = null;
  if (platformToken) {
    const r = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${platformToken}` },
    });
    if (r.ok) return { ok: true, json: await r.json(), via: "platform" };
    // El token de plataforma normalmente NO puede leer pagos cobrados por un
    // vendedor conectado vía OAuth (MP responde 404, no solo 401/403) — a
    // diferencia del patrón original de rifa, acá SIEMPRE se intenta el
    // fallback al token del vendedor, cualquiera sea el motivo del fallo.
    platformFail = { status: r.status, json: await r.json().catch(() => ({})) };
  }
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
  if (platformFail) return { ok: false, status: platformFail.status, json: platformFail.json, via: "platform" };
  return { ok: false, status: 401, json: { error: "no_token_available" }, via: "none" };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method_not_allowed" });

  let raw = null;
  let eventId = null;

  try {
    raw = await readRawBody(req);
  } catch (e) {
    console.error("[colecta webhook] raw body error", e);
    return res.status(200).json({ ok: false, error: "raw_body_error" });
  }

  try {
    const h = Object.fromEntries(
      Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : String(v)])
    );
    delete h.authorization;
    console.log("[colecta webhook] HEADERS:", h);
    console.log("[colecta webhook] RAW:", mask(raw.toString("utf8"), 512));

    let body = safeJsonParse(raw);
    if (!body) {
      try {
        body = parseMaybeFormUrlEncoded(raw);
      } catch (e) {
        console.error("[colecta webhook] body parse error", e);
        return res.status(200).json({ ok: false, error: "invalid_body" });
      }
    }

    const paymentId =
      body?.data?.id || body?.id || body?.resource?.id ||
      (typeof body?.data === "string" ? body.data : null);

    if (!paymentId) {
      console.log("[colecta webhook] no payment id in payload");
      return res.status(200).json({ ok: true, msg: "no_payment_id" });
    }

    eventId = buildEventId(req, paymentId);

    // ==== Validación de firma — misma fórmula corregida usada en el
    // webhook de rifa: id:{data.id};request-id:{x-request-id};ts:{ts}; ====
    try {
      const secret = process.env.MP_WEBHOOK_SECRET;
      const signature = req.headers["x-signature"];
      const reqId = req.headers["x-request-id"];

      if (secret && signature && reqId) {
        const parts = Object.fromEntries(
          String(signature).split(",").map((kv) => kv.trim().split("="))
        );
        const signed = `id:${paymentId};request-id:${reqId};ts:${parts.ts};`;
        const digest = crypto.createHmac("sha256", secret).update(signed).digest("hex");

        if (digest !== parts.v1) {
          console.error("[colecta webhook] firma inválida — rechazado", { eventId, expected: digest, got: parts.v1 });
          return res.status(401).json({ ok: false, error: "invalid_signature" });
        }
      }
    } catch (e) {
      console.warn("[colecta webhook] error validando firma (continuo):", e?.message || e);
    }

    const hintMpUserId = body?.user_id || body?.account_id || body?.collector_id || body?.owner_id || null;

    const fetched = await fetchPayment(paymentId, hintMpUserId);
    if (!fetched.ok) {
      console.warn("[colecta webhook] cannot fetch payment", { eventId, status: fetched.status, via: fetched.via, body: fetched.json });
      return res.status(200).json({ ok: false, error: "fetch_payment_failed" });
    }

    const mp = fetched.json;
    const mpStatus = String(mp?.status || "").toLowerCase();

    // ==== Auditoría (tabla genérica ya existente, sin cambio de esquema;
    // se usa igual que en rifa, solo con más filas) ====
    try {
      await supabase.from("webhook_events").upsert(
        {
          event_type: `colecta.${body?.type || body?.action || "unknown"}`,
          payment_id: String(paymentId),
          live_mode: typeof mp?.live_mode === "boolean" ? mp.live_mode : null,
          payload: body,
          headers: h,
          event_id: eventId,
        },
        { onConflict: "event_id", ignoreDuplicates: true }
      );
    } catch (e) {
      console.error("[colecta webhook] webhook_events insert error", { eventId, err: e?.message || e });
    }

    // ==== Metadata REAL del pago (nunca la del body del webhook) ====
    const md = mp?.metadata || {};
    if (md.product !== "colecta") {
      console.log("[colecta webhook] not a colecta payment, skip", { eventId, product: md.product });
      return res.status(200).json({ ok: true, skipped: true, reason: "not_colecta" });
    }
    const colectaId = md.colecta_id || null;
    const contributionId = md.contribution_id || null;
    if (!colectaId || !contributionId) {
      console.warn("[colecta webhook] metadata incompleta", { eventId, md });
      return res.status(200).json({ ok: false, error: "invalid_metadata" });
    }

    const { data: contribution, error: cErr } = await supabase
      .from("colecta_contributions")
      .select("*")
      .eq("id", contributionId)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!contribution) {
      console.warn("[colecta webhook] contribution inexistente", { eventId, contributionId });
      return res.status(200).json({ ok: false, error: "contribution_not_found" });
    }

    // La contribution debe pertenecer a la colecta que dice la metadata REAL.
    if (contribution.colecta_id !== colectaId) {
      console.error("[colecta webhook] colecta_id no coincide — posible metadata inconsistente", {
        eventId, contributionId, expected: contribution.colecta_id, got: colectaId,
      });
      return res.status(200).json({ ok: false, error: "colecta_mismatch" });
    }

    // Ya procesada (aprobada o rechazada) -> evento repetido/tardío, inocuo.
    if (contribution.status !== "pending") {
      console.log("[colecta webhook] ya procesada, no se degrada", { eventId, contributionId, status: contribution.status });
      return res.status(200).json({ ok: true, already_processed: true, status: contribution.status });
    }

    // Monto real pagado debe calzar EXACTO con lo que se esperaba cobrar.
    const paidAmountCents = Math.round(Number(mp?.transaction_amount || 0) * 100);
    if (paidAmountCents !== contribution.amount_cents) {
      console.error("[colecta webhook] monto no coincide — rechazado", {
        eventId, contributionId, expected: contribution.amount_cents, got: paidAmountCents,
      });
      await supabase
        .from("colecta_contributions")
        .update({ status: "rejected", mp_payment_id: String(paymentId) })
        .eq("id", contributionId)
        .eq("status", "pending");
      return res.status(200).json({ ok: false, error: "amount_mismatch" });
    }

    let newStatus = null;
    if (mpStatus === "approved") newStatus = "approved";
    else if (["rejected", "cancelled"].includes(mpStatus)) newStatus = "rejected";

    if (!newStatus) {
      // pending / in_process / authorized / etc — estado intermedio real de
      // MP, no se aprueba ni se rechaza todavía.
      return res.status(200).json({ ok: true, intermediate: true, mp_status: mpStatus });
    }

    const applicationFee = Array.isArray(mp?.fee_details)
      ? mp.fee_details.find((f) => f?.type === "application_fee")
      : null;
    const marketplace_fee_cents = applicationFee
      ? Math.round(Number(applicationFee.amount || 0) * 100)
      : contribution.marketplace_fee_cents ?? null;

    // Guard .eq('status','pending') de nuevo acá: si dos webhooks llegaron
    // casi al mismo tiempo, solo el primero en llegar a la DB gana.
    const { data: updated, error: uErr } = await supabase
      .from("colecta_contributions")
      .update({
        status: newStatus,
        mp_payment_id: String(paymentId),
        marketplace_fee_cents,
      })
      .eq("id", contributionId)
      .eq("colecta_id", colectaId)
      .eq("status", "pending")
      .select()
      .maybeSingle();

    if (uErr) {
      if (uErr.code === "23505") {
        // unique(mp_payment_id): este payment_id ya acreditó otra contribution.
        console.error("[colecta webhook] mp_payment_id ya usado en otra contribution", { eventId, paymentId, contributionId });
        return res.status(200).json({ ok: false, error: "payment_already_used" });
      }
      throw uErr;
    }
    if (!updated) {
      console.log("[colecta webhook] carrera perdida, ya lo procesó otro evento", { eventId, contributionId });
      return res.status(200).json({ ok: true, already_processed: true, race: true });
    }

    console.log("[colecta webhook] transición aplicada", { eventId, contributionId, colectaId, newStatus, paymentId });

    // C6: notificación no financiera. Solo llega acá el proceso que
    // efectivamente ganó la transición de arriba (updated no-null) — el
    // pago ya quedó escrito antes de esta línea, nada de lo que pase acá
    // puede tocarlo. Un fallo de Resend queda contenido y no cambia la
    // respuesta HTTP financiera de abajo.
    if (newStatus === "approved") {
      try {
        await notifyColectaApproved({
          colectaId,
          contributionId,
          amountCents: updated.amount_cents,
          contributorName: updated.contributor_name,
          contributorEmail: updated.contributor_email,
        });
      } catch (e) {
        console.error("[colecta webhook] notify error (no afecta el pago)", { eventId, contributionId, err: e?.message || e });
      }
    }

    return res.status(200).json({ ok: true, contribution_id: contributionId, status: newStatus, eventId });
  } catch (e) {
    console.error("[colecta webhook] fatal error", e);
    return res.status(200).json({ ok: false, error: String(e?.message || e) });
  }
}

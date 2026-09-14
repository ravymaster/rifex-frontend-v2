// src/pages/api/dev/test-email.js
// PRE-LAUNCH-FIX-1 (P1-1): dos fallas independientes cerradas acá.
//
// 1) Fail-closed en PROD: antes, este endpoint no distinguía DEV de PROD
//    — si algún día se promueve a main (o si alguien lo llama contra
//    rifex.pro tal como está en este repo hoy), quedaba tan expuesto como
//    en DEV. Ahora exige isDevStage() (src/lib/environmentPolicy.js, la
//    misma fuente de verdad ya usada para el resto de relajaciones
//    exclusivas de DEV) — en cualquier ambiente que no sea explícitamente
//    'development', el endpoint responde 403 sin ejecutar nada.
//
// 2) Bypass de comparación: la versión anterior hacía
//    `(process.env.DEV_TEST_EMAIL_TOKEN || "") !== String(token)`. Con la
//    env var ausente (como estaba, confirmado, tanto en DEV como en
//    PROD), el lado izquierdo era `""`. Un atacante que mandara
//    `?token=` (vacío) junto con el header `x-test-token` también vacío
//    lograba `token === ""`, y `"" !== ""` es `false` — bypass
//    confirmado empíricamente. Ahora la comparación exige explícitamente
//    tres condiciones: el secreto está configurado (no vacío), el caller
//    mandó un token (no vacío), y coinciden — nunca se compara contra un
//    string vacío en ningún lado.
import { isDevStage } from "@/lib/environmentPolicy";
import { enforceRateLimit, resolveClientIp } from "@/lib/rateLimit";
import {
  sendEmail,
  sendBuyerApprovedEmail,
  sendCreatorSaleEmail,
} from "../../../lib/mailer";

export default async function handler(req, res) {
  if (!isDevStage()) {
    return res.status(403).json({ ok: false, error: "dev_only_endpoint" });
  }

  const ip = resolveClientIp(req);
  if (await enforceRateLimit(req, res, { key: `dev-test-email:${ip}`, maxHits: 10, windowSeconds: 60 })) return;

  const secret = process.env.DEV_TEST_EMAIL_TOKEN || "";
  const token = String(req.query.token || req.headers["x-test-token"] || "");
  const authorized = secret.length > 0 && token.length > 0 && token === secret;
  if (!authorized) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  const to = String(req.query.to || "").trim();
  if (!to) return res.status(400).json({ ok: false, error: "missing 'to' param" });

  const type = String(req.query.type || "plain").toLowerCase();

  // Defaults y params opcionales
  const raffleTitle = String(req.query.raffleTitle || "Rifa de prueba");
  const numbers = String(req.query.numbers || "7,13,42")
    .split(",")
    .map((s) => parseInt(String(s).trim(), 10))
    .filter((n) => Number.isFinite(n));
  const amountCLP = parseInt(String(req.query.amount || "5000"), 10);
  const buyerName = String(req.query.buyerName || "Comprador Prueba");
  const buyerEmail = String(req.query.buyerEmail || to);
  const paymentId = String(req.query.paymentId || "TEST-12345");

  let r;
  try {
    if (type === "buyer") {
      r = await sendBuyerApprovedEmail({
        to,
        buyerName,
        raffleTitle,
        numbers,
        amountCLP,
        paymentId,
      });
    } else if (type === "creator") {
      r = await sendCreatorSaleEmail({
        to,
        raffleTitle,
        numbers,
        amountCLP,
        buyerEmail,
        paymentId,
      });
    } else {
      r = await sendEmail({
        to,
        subject: "✅ Test Rifex (dev)",
        html: `<div style="font-family:Inter,Arial,sans-serif;padding:16px">
                <h2>¡Hola!</h2>
                <p>Este es un correo de <b>prueba</b> enviado desde Rifex.</p>
                <p>Si lo recibiste, la integración de email está OK.</p>
               </div>`,
        text: "Test Rifex (dev). Si recibiste este email, la integración está OK.",
      });
    }
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e) });
  }

  return res.status(200).json(r);
}

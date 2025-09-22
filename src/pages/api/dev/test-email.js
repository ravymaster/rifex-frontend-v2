// src/pages/api/dev/test-email.js
import {
  sendEmail,
  sendBuyerApprovedEmail,
  sendCreatorSaleEmail,
} from "../../../lib/mailer";

export default async function handler(req, res) {
  const token = req.query.token || req.headers["x-test-token"];
  if ((process.env.DEV_TEST_EMAIL_TOKEN || "") !== String(token)) {
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

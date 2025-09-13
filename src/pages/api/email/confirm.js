// src/pages/api/email/confirm.js
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok:false, error:"method_not_allowed" });

  try {
    const { to, numbers = [], raffleId, paymentId } = req.body || {};
    if (!to) return res.status(400).json({ ok:false, error:"missing_to" });

    const html = `
      <div style="font-family:Inter,system-ui,sans-serif">
        <h2>¡Gracias por tu compra en Rifex!</h2>
        <p><strong>Números:</strong> ${Array.isArray(numbers) ? numbers.join(", ") : "-"}</p>
        <p><strong>ID de pago:</strong> ${paymentId || "-"}</p>
        <p><strong>Rifa:</strong> ${raffleId || "-"}</p>
        <hr/>
        <p>Este es un comprobante automático. Ante dudas, responde este correo.</p>
      </div>
    `;

    if (!resend) return res.json({ ok:true, skipped:true });

    await resend.emails.send({
      from: "Rifex <no-reply@rifex.pro>",
      to,
      subject: "Confirmación de compra – Rifex",
      html,
    });

    return res.json({ ok:true });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e?.message || "error" });
  }
}

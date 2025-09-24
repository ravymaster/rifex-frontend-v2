// src/pages/api/test-email.js
import { sendEmail } from "@/lib/mailer";

export default async function handler(req, res) {
  const r = await sendEmail({
    to: "contacto@rifex.pro",
    subject: "Test Resend (Rifex)",
    html: "<b>Hola desde producción</b>",
    text: "Hola desde producción",
  });

  res.status(r.ok ? 200 : 500).json(r);
}

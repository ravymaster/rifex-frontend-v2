// src/pages/api/contacto.js
// RIFEX V4 A4 — el formulario de /contacto no tenía backend (el botón
// "Enviar" no hacía nada). Envía por email, sin persistencia nueva.
import { sendEmail, __mailer_utils } from '@/lib/mailer';
import { enforceRateLimit, resolveClientIp } from '@/lib/rateLimit';

const CONTACT_TO = process.env.RIFEX_CONTACT_EMAIL || 'contacto@rifex.pro';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const ip = resolveClientIp(req);
  if (await enforceRateLimit(req, res, { key: `contacto:${ip}`, maxHits: 5, windowSeconds: 3600 })) return;

  const body = req.body || {};
  const name = String(body.name || '').slice(0, 200).trim();
  const email = String(body.email || '').trim();
  const subject = String(body.subject || '').slice(0, 200).trim();
  const message = String(body.message || '').slice(0, 4000).trim();

  if (!name || !subject || !message) return res.status(400).json({ ok: false, error: 'missing_fields' });
  if (!__mailer_utils.isValidEmail(email)) return res.status(400).json({ ok: false, error: 'invalid_email' });

  const esc = __mailer_utils.escapeHtml;
  const html = `
    <h2>Nuevo mensaje de contacto — Rifex</h2>
    <p><strong>Nombre:</strong> ${esc(name)}</p>
    <p><strong>Email:</strong> ${esc(email)}</p>
    <p><strong>Asunto:</strong> ${esc(subject)}</p>
    <p><strong>Mensaje:</strong><br>${esc(message).replace(/\n/g, '<br>')}</p>
  `;

  const result = await sendEmail({
    to: CONTACT_TO,
    subject: `[Contacto Rifex] ${subject}`,
    html,
    text: `Nombre: ${name}\nEmail: ${email}\nAsunto: ${subject}\nMensaje: ${message}`,
    replyTo: email,
  });

  if (!result.ok) return res.status(502).json({ ok: false, error: 'send_failed' });
  return res.status(200).json({ ok: true });
}

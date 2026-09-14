// src/pages/api/reportar.js
// RIFEX V4 A5 — canal público de reportes, sin login requerido. No crea
// ninguna tabla nueva (ninguna migración fue autorizada para esta misión):
// el reporte se envía por email a la casilla de soporte usando la misma
// infraestructura de mailer.js ya certificada, no queda persistido en DB.
import { sendEmail, __mailer_utils } from '@/lib/mailer';
import { enforceRateLimit, resolveClientIp } from '@/lib/rateLimit';

const REPORTS_TO = process.env.RIFEX_REPORTS_EMAIL || 'contacto@rifex.pro';
const MAX_LEN = 4000;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const ip = resolveClientIp(req);
  if (await enforceRateLimit(req, res, { key: `reportar:${ip}`, maxHits: 5, windowSeconds: 3600 })) return;

  const body = req.body || {};
  const url = String(body.url || '').slice(0, 500).trim();
  const reason = String(body.reason || '').slice(0, 200).trim();
  const description = String(body.description || '').slice(0, MAX_LEN).trim();
  const email = String(body.email || '').trim();

  if (!reason || !description) {
    return res.status(400).json({ ok: false, error: 'missing_fields' });
  }
  if (email && !__mailer_utils.isValidEmail(email)) {
    return res.status(400).json({ ok: false, error: 'invalid_email' });
  }

  const esc = __mailer_utils.escapeHtml;
  const html = `
    <h2>Nuevo reporte — Rifex</h2>
    <p><strong>URL/iniciativa:</strong> ${esc(url || '(no informada)')}</p>
    <p><strong>Motivo:</strong> ${esc(reason)}</p>
    <p><strong>Descripción:</strong><br>${esc(description).replace(/\n/g, '<br>')}</p>
    <p><strong>Email de contacto del denunciante:</strong> ${esc(email || '(no informado)')}</p>
  `;

  const result = await sendEmail({
    to: REPORTS_TO,
    subject: `[Reporte Rifex] ${reason}`,
    html,
    text: `Reporte Rifex\nURL: ${url}\nMotivo: ${reason}\nDescripción: ${description}\nEmail: ${email}`,
    replyTo: email && __mailer_utils.isValidEmail(email) ? email : undefined,
  });

  if (!result.ok) return res.status(502).json({ ok: false, error: 'send_failed' });
  return res.status(200).json({ ok: true });
}

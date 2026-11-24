// src/lib/warpPilotMailer.js
// Warp Conversacional — correos de la solicitud de piloto. Reutiliza el
// motor ya certificado (sendEmail de mailer.js, Resend); no lo modifica.
//
// - Cliente: confirmación con identificador, dominio, siguiente paso y el
//   aviso de que no hay cobro ni activación.
// - Administración: aviso de nueva solicitud con usuario, empresa, dominio y
//   enlace al panel admin. Destinatarios: ADMIN_EMAILS (lista existente);
//   si no está configurada, el aviso se omite.
// - Nunca incluye el texto libre completo (objetivo, información autorizada),
//   notas internas ni secretos. Nunca lanza.
import { sendEmail, __mailer_utils } from '@/lib/mailer';
import { shortRequestId, siteTypeLabel, WARP_PILOT_NEXT_STEP, WARP_PILOT_STATUS_LABEL } from '@/lib/warpPilotRequest';

const { escapeHtml, isValidEmail } = __mailer_utils;

function baseUrl(env) {
  return String(env.NEXT_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
}

export function adminRecipients(env = process.env) {
  return String(env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => isValidEmail(e));
}

function shell(title, bodyHtml) {
  return `
  <div style="font-family:Inter,Arial,Helvetica,sans-serif;background:#f8fafc;padding:24px">
    <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden">
      <div style="padding:18px 20px;border-bottom:1px solid #eef2f7;background:linear-gradient(135deg,#1e3a8a 0%,#18a957 100%);color:#fff">
        <h2 style="margin:0;font-size:18px;line-height:1.25">${escapeHtml(title)}</h2>
      </div>
      <div style="padding:18px 20px;color:#0f172a">${bodyHtml}</div>
      <div style="padding:14px 20px;background:#f8fafc;border-top:1px solid #eef2f7;color:#64748b;font-size:12px">
        Rifex · Este es un mensaje automático, no respondas a este email.
      </div>
    </div>
  </div>`;
}

export function buildCustomerEmail(request, env = process.env) {
  const shortId = shortRequestId(request.id);
  const base = baseUrl(env);
  const link = base ? `${base}/panel/warp` : '';
  const subject = `Recibimos tu solicitud de piloto de Warp Conversacional — ${shortId}`;
  const html = shell('Solicitud de piloto recibida', `
    <p style="margin:0 0 12px">Hola${request.contact_name ? ` ${escapeHtml(request.contact_name)}` : ''}, recibimos tu solicitud para probar Warp Conversacional.</p>
    <table style="border-collapse:collapse;margin:0 0 12px;font-size:14px">
      <tr><td style="padding:4px 12px 4px 0;color:#64748b">Identificador</td><td style="padding:4px 0"><b>${escapeHtml(shortId)}</b></td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#64748b">Dominio</td><td style="padding:4px 0">${escapeHtml(request.domain)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#64748b">Estado</td><td style="padding:4px 0">${escapeHtml(WARP_PILOT_STATUS_LABEL[request.status] || 'Solicitud recibida')}</td></tr>
    </table>
    <p style="margin:0 0 12px"><b>Siguiente paso:</b> ${escapeHtml(WARP_PILOT_NEXT_STEP.solicitud)}</p>
    <p style="margin:0 0 12px;padding:10px 12px;background:#f1f5f9;border-radius:10px">Todavía no existe ningún cobro ni activación. Antes de cualquier pago revisaremos la compatibilidad de tu sitio y te enviaremos la propuesta.</p>
    ${link ? `<p style="margin:0"><a href="${escapeHtml(link)}" style="color:#1e3a8a">Ver mis solicitudes de Warp</a></p>` : ''}
  `);
  const text = [
    'Recibimos tu solicitud para probar Warp Conversacional.',
    `Identificador: ${shortId}`,
    `Dominio: ${request.domain}`,
    `Siguiente paso: ${WARP_PILOT_NEXT_STEP.solicitud}`,
    'Todavía no existe ningún cobro ni activación.',
    link ? `Mis solicitudes: ${link}` : '',
  ].filter(Boolean).join('\n');
  return { subject, html, text };
}

export function buildAdminEmail(request, accountEmail, env = process.env) {
  const shortId = shortRequestId(request.id);
  const base = baseUrl(env);
  const link = base ? `${base}/admin/warp?id=${encodeURIComponent(request.id)}` : '';
  const subject = `Nueva solicitud de piloto Warp — ${request.domain} (${shortId})`;
  const html = shell('Nueva solicitud de piloto de Warp', `
    <table style="border-collapse:collapse;margin:0 0 12px;font-size:14px">
      <tr><td style="padding:4px 12px 4px 0;color:#64748b">Identificador</td><td style="padding:4px 0"><b>${escapeHtml(shortId)}</b></td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#64748b">Usuario Rifex</td><td style="padding:4px 0">${escapeHtml(accountEmail || '—')}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#64748b">Empresa</td><td style="padding:4px 0">${escapeHtml(request.company_name)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#64748b">Dominio</td><td style="padding:4px 0">${escapeHtml(request.domain)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#64748b">Tipo de sitio</td><td style="padding:4px 0">${escapeHtml(siteTypeLabel(request.site_type))}</td></tr>
    </table>
    ${link ? `<p style="margin:0"><a href="${escapeHtml(link)}" style="color:#1e3a8a">Abrir en el panel admin</a></p>` : ''}
  `);
  const text = [
    'Nueva solicitud de piloto de Warp Conversacional.',
    `Identificador: ${shortId}`,
    `Usuario Rifex: ${accountEmail || '—'}`,
    `Empresa: ${request.company_name}`,
    `Dominio: ${request.domain}`,
    link ? `Admin: ${link}` : '',
  ].filter(Boolean).join('\n');
  return { subject, html, text };
}

// Envía ambos correos. Nunca lanza; devuelve el resultado de cada uno.
export async function notifyWarpPilotRequestCreated({ request, accountEmail }, { send = sendEmail, env = process.env } = {}) {
  const result = { customer: 'skipped', admin: 'skipped' };
  try {
    if (isValidEmail(request.contact_email)) {
      const r = await send({ to: request.contact_email, ...buildCustomerEmail(request, env) });
      result.customer = r?.ok ? (r.skipped ? 'disabled' : 'sent') : 'failed';
    }
  } catch {
    result.customer = 'failed';
  }
  try {
    const admins = adminRecipients(env);
    if (admins.length) {
      const r = await send({ to: admins, ...buildAdminEmail(request, accountEmail, env) });
      result.admin = r?.ok ? (r.skipped ? 'disabled' : 'sent') : 'failed';
    } else {
      result.admin = 'no_recipient';
    }
  } catch {
    result.admin = 'failed';
  }
  return result;
}

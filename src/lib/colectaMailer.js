// src/lib/colectaMailer.js
// Notificaciones de Colecta (C6). Reutiliza el motor genérico de envío
// (sendEmail, Resend) ya certificado en mailer.js — no se crea un
// segundo motor de correo, mailer.js queda intacto (solo se importan
// funciones ya exportadas de ahí, nunca se edita ese archivo).
//
// El correo jamás es autoridad financiera: esta función se llama SOLO
// después de que webhook-colecta.js o reconcile-colecta-payments.js ya
// escribieron `status='approved'` en la base (el guard
// .eq('status','pending') de esos archivos es quien decide quién ganó
// la transición). notifyColectaApproved() no decide nada financiero,
// solo notifica un hecho ya consumado, y nunca lanza — cualquier falla
// de Resend o de resolución de datos queda contenida acá adentro.
import { createClient } from '@supabase/supabase-js';
import { sendEmail, __mailer_utils } from '@/lib/mailer';

const { escapeHtml, fmtCLP, isValidEmail } = __mailer_utils;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const BASE = (process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/+$/, '');

function emailShell(headerEmoji, headerTitle, bodyHtml) {
  return `
  <div style="font-family:Inter,Arial,Helvetica,sans-serif;background:#f8fafc;padding:24px">
    <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden">
      <div style="padding:18px 20px;border-bottom:1px solid #eef2f7;background:linear-gradient(135deg,#1e3a8a 0%,#18a957 100%);color:#fff">
        <h2 style="margin:0;font-size:18px;line-height:1.25">${headerEmoji} ${escapeHtml(headerTitle)}</h2>
      </div>
      <div style="padding:18px 20px;color:#0f172a">${bodyHtml}</div>
      <div style="padding:14px 20px;background:#f8fafc;border-top:1px solid #eef2f7;color:#64748b;font-size:12px">
        Rifex · Este es un mensaje automático, no respondas a este email.
      </div>
    </div>
  </div>`;
}

// Al aportante: confirmación de su propio aporte. Nunca incluye datos
// del creador ni la comisión de Rifex (eso es interno, no le corresponde).
export async function sendColectaContributorEmail({ to, contributorName, colectaTitle, amountCLP, colectaLink }) {
  if (!isValidEmail(to)) return { ok: false, skipped: true, reason: 'invalid_email' };
  const subject = `✅ Tu aporte fue confirmado — ${colectaTitle}`;
  const link = colectaLink || BASE || '#';
  const body = `
    ${contributorName ? `<p style="margin:0 0 10px">¡Gracias por tu aporte, ${escapeHtml(contributorName)}!</p>` : `<p style="margin:0 0 10px">¡Gracias por tu aporte!</p>`}
    <p style="margin:0 0 12px">Tu pago fue <b>aprobado</b>.</p>
    <table style="width:100%;border-collapse:collapse;margin:8px 0 14px">
      <tbody>
        <tr>
          <td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb;width:40%"><b>Campaña</b></td>
          <td style="padding:8px;border:1px solid #e5e7eb">${escapeHtml(colectaTitle)}</td>
        </tr>
        <tr>
          <td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb"><b>Monto aportado</b></td>
          <td style="padding:8px;border:1px solid #e5e7eb">${fmtCLP(amountCLP)}</td>
        </tr>
      </tbody>
    </table>
    <a href="${link}" style="display:inline-block;padding:10px 14px;border-radius:10px;background:#111827;color:#fff;text-decoration:none;font-weight:700">Ver campaña</a>
  `;
  return sendEmail({
    to,
    subject,
    html: emailShell('✅', `Tu aporte fue confirmado — ${colectaTitle}`, body),
    text: `Tu aporte de ${fmtCLP(amountCLP)} a "${colectaTitle}" fue confirmado. Ver campaña: ${link}`,
  });
}

// Al creador: aviso de que llegó un aporte nuevo. Nunca incluye
// mp_payment_id, comisión, ni ningún dato financiero interno.
export async function sendColectaCreatorEmail({ to, contributorName, contributorEmail, colectaTitle, amountCLP, dashboardLink }) {
  if (!isValidEmail(to)) return { ok: false, skipped: true, reason: 'invalid_email' };
  const subject = `💚 Nuevo aporte recibido — ${colectaTitle}`;
  const link = dashboardLink || BASE || '#';
  const body = `
    <p style="margin:0 0 12px">Recibiste un nuevo aporte en tu campaña.</p>
    <table style="width:100%;border-collapse:collapse;margin:8px 0 14px">
      <tbody>
        <tr>
          <td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb;width:40%"><b>Campaña</b></td>
          <td style="padding:8px;border:1px solid #e5e7eb">${escapeHtml(colectaTitle)}</td>
        </tr>
        <tr>
          <td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb"><b>Monto</b></td>
          <td style="padding:8px;border:1px solid #e5e7eb">${fmtCLP(amountCLP)}</td>
        </tr>
        <tr>
          <td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb"><b>Aportante</b></td>
          <td style="padding:8px;border:1px solid #e5e7eb">${escapeHtml(contributorName || '-')}${contributorEmail ? ` (${escapeHtml(contributorEmail)})` : ''}</td>
        </tr>
      </tbody>
    </table>
    <a href="${link}" style="display:inline-block;padding:10px 14px;border-radius:10px;background:#111827;color:#fff;text-decoration:none;font-weight:700">Ir a Mis campañas</a>
  `;
  return sendEmail({
    to,
    subject,
    html: emailShell('💚', `Nuevo aporte recibido — ${colectaTitle}`, body),
    text: `Nuevo aporte de ${fmtCLP(amountCLP)} en "${colectaTitle}" de ${contributorName || 'un aportante'}. Ir a Mis campañas: ${link}`,
  });
}

// Punto único de notificación. Se llama SOLO desde el código que ya
// ganó la transición pending->approved. No lanza nunca.
export async function notifyColectaApproved({ colectaId, contributionId, amountCents, contributorName, contributorEmail }) {
  try {
    const { data: col } = await supabase
      .from('colectas')
      .select('title, creator_id')
      .eq('id', colectaId)
      .maybeSingle();

    const title = col?.title || 'tu campaña';
    let creatorEmail = null;
    if (col?.creator_id) {
      const { data: u } = await supabase.auth.admin.getUserById(col.creator_id);
      creatorEmail = u?.user?.email || null;
    }

    const amountCLP = Math.round(Number(amountCents || 0) / 100);
    const contributorLink = `${BASE}/colectas/${colectaId}`;
    const dashboardLink = `${BASE}/crear-colecta`;

    const contributorResult = isValidEmail(contributorEmail)
      ? await sendColectaContributorEmail({ to: contributorEmail, contributorName, colectaTitle: title, amountCLP, colectaLink: contributorLink })
      : { ok: true, skipped: true, reason: 'no_valid_contributor_email' };

    const creatorResult = isValidEmail(creatorEmail)
      ? await sendColectaCreatorEmail({ to: creatorEmail, contributorName, contributorEmail, colectaTitle: title, amountCLP, dashboardLink })
      : { ok: true, skipped: true, reason: 'creator_email_unresolved' };

    return { ok: true, contributor: contributorResult, creator: creatorResult };
  } catch (e) {
    console.error('[colecta mailer] notifyColectaApproved fatal (contenido, no afecta el pago)', {
      colectaId, contributionId, err: e?.message || e,
    });
    return { ok: false, error: String(e?.message || e) };
  }
}

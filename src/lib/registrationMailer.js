// src/lib/registrationMailer.js
// INSCRIPCIONES V1 — hermano de eventTicketMailer.js/colectaMailer.js:
// un solo template, reutiliza sendEmail() de mailer.js. Sección 19 del
// mandato: exactamente UN email obligatorio por participante (la
// confirmación de inscripción) — NO hay recordatorio automático, NO hay
// campaña, para mantener el costo de Resend controlado durante la fase
// gratuita. Nunca adjunta el QR como imagen — un enlace a
// /i/[token], donde el participante ve y descarga su QR. El qr_token
// nunca viaja en el cuerpo del correo en texto plano.
import { sendEmail } from "@/lib/mailer";

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

export async function sendRegistrationConfirmationEmail({
  to,
  participantName,
  activityTitle,
  dateText,
  timeText,
  placeText,
  organizerName,
  instructions,
  qrLink,
}) {
  const subject = `✅ Confirmación de inscripción — ${activityTitle}`;
  const greeting = participantName ? `¡Hola, ${escapeHtml(participantName)}!` : "¡Hola!";

  const detailRows = [
    dateText ? `<tr><td style="padding:4px 10px 4px 0;color:#64748b">Fecha</td><td style="padding:4px 0;font-weight:600">${escapeHtml(dateText)}</td></tr>` : "",
    timeText ? `<tr><td style="padding:4px 10px 4px 0;color:#64748b">Hora</td><td style="padding:4px 0;font-weight:600">${escapeHtml(timeText)}</td></tr>` : "",
    placeText ? `<tr><td style="padding:4px 10px 4px 0;color:#64748b">Lugar</td><td style="padding:4px 0;font-weight:600">${escapeHtml(placeText)}</td></tr>` : "",
    organizerName ? `<tr><td style="padding:4px 10px 4px 0;color:#64748b">Organiza</td><td style="padding:4px 0;font-weight:600">${escapeHtml(organizerName)}</td></tr>` : "",
  ].join("");

  const instructionsBlock = instructions
    ? `<p style="margin:16px 0 0;font-size:13px;color:#0f172a"><b>Información importante:</b> ${escapeHtml(instructions)}</p>`
    : "";

  const html = `
  <div style="font-family:Inter,Arial,Helvetica,sans-serif;background:#f8fafc;padding:24px">
    <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden">
      <div style="padding:18px 20px;border-bottom:1px solid #eef2f7;background:linear-gradient(135deg,#1e3a8a 0%,#18a957 100%);color:#fff">
        <h2 style="margin:0;font-size:18px;line-height:1.25">✅ Inscripción confirmada — ${escapeHtml(activityTitle)}</h2>
      </div>
      <div style="padding:18px 20px;color:#0f172a">
        <p style="margin:0 0 10px">${greeting}</p>
        <p style="margin:0 0 14px">Tu inscripción a <b>${escapeHtml(activityTitle)}</b> quedó confirmada.</p>
        <table style="border-collapse:collapse;font-size:14px">${detailRows}</table>
        <a href="${qrLink}"
           style="display:inline-block;margin-top:16px;padding:10px 14px;border-radius:10px;background:#111827;color:#fff;text-decoration:none;font-weight:700">
           Ver mi código QR
        </a>
        <p style="margin:16px 0 0;font-size:13px;color:#64748b">Guarda este enlace — muéstralo en el acceso para que puedan registrar tu asistencia.</p>
        ${instructionsBlock}
      </div>
      <div style="padding:14px 20px;background:#f8fafc;border-top:1px solid #eef2f7;color:#64748b;font-size:12px">
        Rifex · Este es un mensaje automático, no respondas a este email.
      </div>
    </div>
  </div>`;

  return sendEmail({
    to,
    subject,
    html,
    text: `Tu inscripción a ${activityTitle} quedó confirmada. Ver mi código QR: ${qrLink}`,
  });
}

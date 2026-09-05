// src/lib/eventTicketMailer.js
// EVENT-3 (Fase 16) — hermano de colectaMailer.js: un solo template,
// reutiliza sendEmail() de mailer.js como infraestructura. Nunca adjunta
// imágenes de QR (15 tickets = 15 adjuntos pesados innecesarios) — un
// enlace seguro a /eventos/orden/[access_token], donde el comprador ve y
// descarga cada ticket. El qr_token de cada ticket nunca viaja en el
// cuerpo del correo en texto plano.
import { sendEmail } from "@/lib/mailer";

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

export async function sendEventTicketsEmail({ to, buyerName, eventTitle, orderLink, ticketCount }) {
  const subject = `🎟️ Tus entradas — ${eventTitle}`;
  const greeting = buyerName ? `¡Gracias por tu compra, ${escapeHtml(buyerName)}!` : "¡Gracias por tu compra!";
  const countText = ticketCount === 1 ? "1 entrada" : `${ticketCount} entradas`;

  const html = `
  <div style="font-family:Inter,Arial,Helvetica,sans-serif;background:#f8fafc;padding:24px">
    <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden">
      <div style="padding:18px 20px;border-bottom:1px solid #eef2f7;background:linear-gradient(135deg,#1e3a8a 0%,#18a957 100%);color:#fff">
        <h2 style="margin:0;font-size:18px;line-height:1.25">🎟️ Tus entradas — ${escapeHtml(eventTitle)}</h2>
      </div>
      <div style="padding:18px 20px;color:#0f172a">
        <p style="margin:0 0 10px">${greeting}</p>
        <p style="margin:0 0 16px">Tu compra de <b>${countText}</b> para <b>${escapeHtml(eventTitle)}</b> está lista.</p>
        <a href="${orderLink}"
           style="display:inline-block;padding:10px 14px;border-radius:10px;background:#111827;color:#fff;text-decoration:none;font-weight:700">
           Ver mis entradas
        </a>
        <p style="margin:16px 0 0;font-size:13px;color:#64748b">Guarda este enlace — desde ahí puedes ver y descargar cada entrada con su código QR.</p>
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
    text: `Tus entradas para ${eventTitle} están listas (${countText}). Ver mis entradas: ${orderLink}`,
  });
}

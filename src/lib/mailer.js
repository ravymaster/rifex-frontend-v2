
// src/lib/mailer.js
const ENABLE = String(process.env.ENABLE_EMAILS || "").toLowerCase() === "true";
const FROM = process.env.EMAIL_FROM || "Rifex <onboarding@resend.dev>";
const RESEND_KEY = process.env.RESEND_API_KEY;
const DEV_FORCE_TO = (process.env.DEV_FORCE_TO || "").trim();   // fuerza todos los correos a este inbox (testing)
const DEV_BCC_EMAIL = (process.env.DEV_BCC_EMAIL || "").trim(); // copia oculta para debug
const BASE = (process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/+$/, "");

/** Enviar email simple vía Resend. Soporta bcc y force_to (testing). */
export async function sendEmail({ to, subject, html, text, bcc }) {
  try {
    if (!ENABLE) return { ok: true, skipped: true, reason: "emails disabled" };
    if (!RESEND_KEY) return { ok: false, error: "RESEND_API_KEY missing" };

    // Normalizamos destinatarios
    let tos = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);

    // Fuerza todas las salidas a DEV_FORCE_TO si está configurado (útil con Resend/Onboarding)
    if (DEV_FORCE_TO) {
      tos = [DEV_FORCE_TO];
      // en modo force, ponemos el destinatario real en el texto para referencia
      text = `[FORCED to ${DEV_FORCE_TO}] Original TO: ${(Array.isArray(to) ? to : [to]).join(", ")}\n\n${text || ""}`;
    }

    const payload = {
      from: FROM,
      to: tos,
      subject,
      html,
      text,
    };

    // BCC opcional
    if (DEV_BCC_EMAIL && !DEV_FORCE_TO) {
      payload.bcc = [DEV_BCC_EMAIL];
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    console.error("[mailer] sendEmail error", e);
    return { ok: false, error: String(e) };
  }
}

export async function sendBuyerApprovedEmail({
  to,
  buyerName,
  raffleTitle,
  numbers,
  amountCLP,
  paymentId,
  raffleLink, // opcional
}) {
  const subject = `✅ Compra confirmada — ${raffleTitle}`;
  const list = Array.isArray(numbers) && numbers.length ? numbers.join(", ") : "-";
  const link = raffleLink ? raffleLink : BASE ? `${BASE}` : "#";

  const html = `
  <div style="font-family:Inter,Arial,Helvetica,sans-serif;background:#f8fafc;padding:24px">
    <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden">
      <div style="padding:18px 20px;border-bottom:1px solid #eef2f7">
        <h2 style="margin:0;font-size:18px;line-height:1.25;color:#0f172a">✅ Compra confirmada — ${escapeHtml(raffleTitle)}</h2>
      </div>
      <div style="padding:18px 20px;color:#0f172a">
        ${buyerName ? `<p style="margin:0 0 10px">¡Gracias por tu compra, ${escapeHtml(buyerName)}!</p>` : `<p style="margin:0 0 10px">¡Gracias por tu compra!</p>`}
        <p style="margin:0 0 12px">Tu pago fue <b>aprobado</b>.</p>
        <p style="margin:0 0 12px">Rifa: <b>${escapeHtml(raffleTitle)}</b></p>
        <table style="width:100%;border-collapse:collapse;margin:8px 0 14px">
          <tbody>
            <tr>
              <td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb;width:40%"><b>Números</b></td>
              <td style="padding:8px;border:1px solid #e5e7eb">${escapeHtml(list)}</td>
            </tr>
            <tr>
              <td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb"><b>Total</b></td>
              <td style="padding:8px;border:1px solid #e5e7eb">${fmtCLP(amountCLP)}</td>
            </tr>
            <tr>
              <td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb"><b>ID de pago</b></td>
              <td style="padding:8px;border:1px solid #e5e7eb">${escapeHtml(paymentId || "-")}</td>
            </tr>
          </tbody>
        </table>
        <a href="${link}"
           style="display:inline-block;padding:10px 14px;border-radius:10px;background:#111827;color:#fff;text-decoration:none;font-weight:700">
           Ver rifa
        </a>
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
    text: `Compra aprobada. Rifa: ${raffleTitle}. Números: ${list}. Total: ${fmtCLP(amountCLP)}. Pago: ${paymentId || "-"}.`,
  });
}

export async function sendCreatorSaleEmail({
  to,
  raffleTitle,
  numbers,
  amountCLP,
  buyerEmail,
  paymentId,
  raffleLink, // opcional
}) {
  const subject = `💸 Nueva venta — ${raffleTitle}`;
  const list = Array.isArray(numbers) && numbers.length ? numbers.join(", ") : "-";
  const link = raffleLink ? raffleLink : BASE ? `${BASE}` : "#";

  const html = `
  <div style="font-family:Inter,Arial,Helvetica,sans-serif;background:#f8fafc;padding:24px">
    <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden">
      <div style="padding:18px 20px;border-bottom:1px solid #eef2f7">
        <h2 style="margin:0;font-size:18px;line-height:1.25;color:#0f172a">💸 Nueva venta — ${escapeHtml(raffleTitle)}</h2>
      </div>
      <div style="padding:18px 20px;color:#0f172a">
        <table style="width:100%;border-collapse:collapse;margin:8px 0 14px">
          <tbody>
            <tr>
              <td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb;width:40%"><b>Números</b></td>
              <td style="padding:8px;border:1px solid #e5e7eb">${escapeHtml(list)}</td>
            </tr>
            <tr>
              <td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb"><b>Total</b></td>
              <td style="padding:8px;border:1px solid #e5e7eb">${fmtCLP(amountCLP)}</td>
            </tr>
            <tr>
              <td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb"><b>Comprador</b></td>
              <td style="padding:8px;border:1px solid #e5e7eb">${escapeHtml(buyerEmail || "-")}</td>
            </tr>
            <tr>
              <td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb"><b>ID de pago</b></td>
              <td style="padding:8px;border:1px solid #e5e7eb">${escapeHtml(paymentId || "-")}</td>
            </tr>
          </tbody>
        </table>
        <a href="${link}"
           style="display:inline-block;padding:10px 14px;border-radius:10px;background:#111827;color:#fff;text-decoration:none;font-weight:700">
           Ver rifa
        </a>
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
    text: `Nueva venta en ${raffleTitle}. Números: ${list}. Total: ${fmtCLP(amountCLP)}. Comprador: ${buyerEmail || "-"}. Pago: ${paymentId || "-"}.`,
  });
}

function fmtCLP(n) {
  try {
    return Number(n || 0).toLocaleString("es-CL", {
      style: "currency",
      currency: "CLP",
      maximumFractionDigits: 0,
    });
  } catch {
    return `$${n}`;
  }
}
function escapeHtml(s) {
  return String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

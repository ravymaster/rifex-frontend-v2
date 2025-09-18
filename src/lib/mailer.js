// src/lib/mailer.js
const ENABLE = String(process.env.ENABLE_EMAILS || "").toLowerCase() === "true";
const FROM = process.env.EMAIL_FROM || "Rifex <no-reply@rifex.app>";
const RESEND_KEY = process.env.RESEND_API_KEY;

/** Enviar un email simple vía Resend. Si está deshabilitado, no falla. */
export async function sendEmail({ to, subject, html, text }) {
  try {
    if (!ENABLE) return { ok: true, skipped: true, reason: "emails disabled" };
    if (!RESEND_KEY) return { ok: false, error: "RESEND_API_KEY missing" };

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        text,
      }),
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
}) {
  const subject = `✅ Compra confirmada — ${raffleTitle}`;
  const list = Array.isArray(numbers) ? numbers.join(", ") : String(numbers);
  const html = `
  <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:16px">
    <h2 style="margin:0 0 8px">¡Gracias por tu compra${buyerName ? `, ${escapeHtml(buyerName)}` : ""}!</h2>
    <p style="margin:8px 0">Tu pago fue <b>aprobado</b> para la rifa <b>${escapeHtml(raffleTitle)}</b>.</p>
    <p style="margin:8px 0"><b>Números:</b> ${list}<br/><b>Total:</b> ${fmtCLP(amountCLP)}</p>
    <p style="margin:16px 0 0;font-size:12px;color:#6b7280">ID de pago: ${paymentId || "-"}</p>
  </div>`;
  return sendEmail({
    to,
    subject,
    html,
    text: `Compra aprobada. Rifa: ${raffleTitle}. Números: ${list}. Total: ${fmtCLP(
      amountCLP
    )}. Pago: ${paymentId || "-"}`,
  });
}

export async function sendCreatorSaleEmail({
  to,
  raffleTitle,
  numbers,
  amountCLP,
  buyerEmail,
  paymentId,
}) {
  const subject = `💸 Nueva venta — ${raffleTitle}`;
  const list = Array.isArray(numbers) ? numbers.join(", ") : String(numbers);
  const html = `
  <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:16px">
    <h2 style="margin:0 0 8px">Nueva venta</h2>
    <p style="margin:8px 0">Se registró un pago <b>aprobado</b> en la rifa <b>${escapeHtml(
      raffleTitle
    )}</b>.</p>
    <p style="margin:8px 0"><b>Números:</b> ${list}<br/><b>Total:</b> ${fmtCLP(
    amountCLP
  )}<br/><b>Comprador:</b> ${escapeHtml(buyerEmail || "-")}</p>
    <p style="margin:16px 0 0;font-size:12px;color:#6b7280">ID de pago: ${paymentId || "-"}</p>
  </div>`;
  return sendEmail({
    to,
    subject,
    html,
    text: `Nueva venta en ${raffleTitle}. Números: ${list}. Total: ${fmtCLP(
      amountCLP
    )}. Comprador: ${buyerEmail || "-"}. Pago: ${paymentId || "-"}`,
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

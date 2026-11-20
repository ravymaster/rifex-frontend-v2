// src/lib/mailer.js

// ----------------------------------------------------------
// Flags y ENV
// ----------------------------------------------------------
const ENABLE = String(process.env.ENABLE_EMAILS || "").toLowerCase() === "true";
const FROM = process.env.EMAIL_FROM || ""; // REGLA 3: usar dominio verificado en Resend
const RESEND_KEY = process.env.RESEND_API_KEY || "";
const DEV_FORCE_TO = (process.env.DEV_FORCE_TO || "").trim();   // fuerza todos los envíos a una casilla (testing)
const DEV_BCC_EMAIL = (process.env.DEV_BCC_EMAIL || "").trim(); // copia oculta global (debug/auditoría)
const BASE = (process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/+$/, "");

// ----------------------------------------------------------
// Utils
// ----------------------------------------------------------
function isValidEmail(s) {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}
function uniq(arr = []) {
  return [...new Set(arr)];
}
function ensureArray(v) {
  return Array.isArray(v) ? v : [v];
}
function stripEmptyEmails(arr = []) {
  return arr
    .map((x) => (x || "").toString().trim())
    .filter((x) => x.length > 0)
    .filter((x) => isValidEmail(x));
}
function escapeHtml(s) {
  return String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
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
// CUMPLIMIENTO-3: etiquetas legibles para delivery_method — mismo mapa
// que src/pages/rifas/[id].jsx (DELIVERY_METHOD_LABELS), duplicado acá
// a propósito en vez de importado — mailer.js es una utilidad de bajo
// nivel, no debería depender de constantes de una página específica.
const DELIVERY_METHOD_LABELS = {
  retira_en_tienda: "Retiro / entrega presencial",
  envio_incluido: "Envío incluido por el creador",
  envio_pagado: "Envío a cargo del ganador",
  a_convenir: "A convenir con el creador",
};
const TRANSFER_OWNER_LABELS = { creator: "el creador de la rifa", winner: "el ganador" };

// CUMPLIMIENTO-3: filas de premio/entrega/transferencia — usadas por
// sendWinnerEmail y sendCreatorWinnerEmail para que ambos correos
// muestren exactamente las mismas condiciones ya publicadas en la
// rifa, sin inventar obligaciones nuevas. Nunca se llama si el caso no
// declaró requires_transfer_procedures.
function deliveryAndTransferHtmlRows({ prizeType, deliveryMethod, requiresTransferProcedures, transferExpensesOwner, transferConditions }) {
  const rows = [];
  if (prizeType === "physical" && deliveryMethod) {
    const label = DELIVERY_METHOD_LABELS[deliveryMethod] || deliveryMethod;
    rows.push(`<tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb;width:40%"><b>Modalidad de entrega</b></td><td style="padding:8px;border:1px solid #e5e7eb">${escapeHtml(label)}</td></tr>`);
  }
  if (requiresTransferProcedures) {
    const ownerLabel = TRANSFER_OWNER_LABELS[transferExpensesOwner] || transferExpensesOwner || "-";
    rows.push(`<tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb"><b>Gastos de transferencia/trámites</b></td><td style="padding:8px;border:1px solid #e5e7eb">A cargo de ${escapeHtml(ownerLabel)}</td></tr>`);
    if (transferConditions) {
      rows.push(`<tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb"><b>Condiciones declaradas</b></td><td style="padding:8px;border:1px solid #e5e7eb">${escapeHtml(transferConditions)}</td></tr>`);
    }
  }
  return rows.join("");
}
function deliveryAndTransferText({ prizeType, deliveryMethod, requiresTransferProcedures, transferExpensesOwner, transferConditions }) {
  const parts = [];
  if (prizeType === "physical" && deliveryMethod) {
    parts.push(`Modalidad de entrega: ${DELIVERY_METHOD_LABELS[deliveryMethod] || deliveryMethod}.`);
  }
  if (requiresTransferProcedures) {
    parts.push(`Gastos de transferencia/trámites a cargo de: ${TRANSFER_OWNER_LABELS[transferExpensesOwner] || transferExpensesOwner || "-"}.`);
    if (transferConditions) parts.push(`Condiciones declaradas: ${transferConditions}.`);
  }
  return parts.join(" ");
}

function htmlToText(html = "") {
  try {
    return String(html)
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return "";
  }
}

// ----------------------------------------------------------
// Envío genérico (Resend)
// ----------------------------------------------------------
/**
 * sendEmail
 * @param {Object} params
 * @param {string|string[]} params.to
 * @param {string} params.subject
 * @param {string} params.html
 * @param {string} [params.text]
 * @param {string|string[]} [params.bcc]
 * @param {string} [params.replyTo]
 * @returns {Promise<{ok:boolean, id?:string, skipped?:boolean, status?:number, error?:any, data?:any}>}
 */
export async function sendEmail({ to, subject, html, text, bcc, replyTo }) {
  try {
    if (!ENABLE) {
      console.log("[mailer] ENABLE_EMAILS=false → skip", { to, subject });
      return { ok: true, skipped: true, reason: "emails_disabled" };
    }
    if (!RESEND_KEY) return { ok: false, error: "RESEND_API_KEY missing" };
    if (!FROM) return { ok: false, error: "EMAIL_FROM missing (dominio debe estar verificado en Resend)" };

    // Normalizar destinatarios
    let tos = uniq(stripEmptyEmails(ensureArray(to)));
    let bccs = uniq(stripEmptyEmails(ensureArray(bcc)));

    if (tos.length === 0) {
      return { ok: false, error: "to_missing_or_invalid" };
    }

    // DEV_FORCE_TO: redirige todo a una casilla, pero preserva trazabilidad
    const headers = {};
    if (DEV_FORCE_TO && isValidEmail(DEV_FORCE_TO)) {
      headers["X-Rifex-Original-To"] = tos.join(", ");
      tos = [DEV_FORCE_TO];

      // Si forzamos, añadimos nota al texto
      const original = ensureArray(to).filter(Boolean).join(", ");
      text = `[FORCED to ${DEV_FORCE_TO}] Original TO: ${original}\n\n${text || ""}`;
      // bcc global se mantiene (útil para auditar pruebas)
      if (DEV_BCC_EMAIL && isValidEmail(DEV_BCC_EMAIL)) {
        bccs = uniq([...(bccs || []), DEV_BCC_EMAIL]);
      }
    } else {
      // Si no estamos forzando, aplicamos BCC global si existe
      if (DEV_BCC_EMAIL && isValidEmail(DEV_BCC_EMAIL)) {
        bccs = uniq([...(bccs || []), DEV_BCC_EMAIL]);
      }
    }

    const payload = {
      from: FROM,
      to: tos,
      subject: String(subject || "").slice(0, 998), // Resend limita ~1000 chars
      html: String(html || ""),
      text: text || htmlToText(html || ""),
      ...(bccs.length ? { bcc: bccs } : {}),
      ...(replyTo && isValidEmail(replyTo) ? { reply_to: replyTo } : {}),
      ...(Object.keys(headers).length ? { headers } : {}),
    };

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      // Resend suele devolver {name, message, type}
      const err = data?.message || data?.error || JSON.stringify(data);
      console.error("[mailer] Resend error:", { status: res.status, err, data });
      return { ok: false, status: res.status, error: err, data };
    }
    return { ok: true, status: res.status, id: data?.id || null, data };
  } catch (e) {
    console.error("[mailer] sendEmail fatal:", e);
    return { ok: false, error: String(e) };
  }
}

// ----------------------------------------------------------
// Templates de negocio
// ----------------------------------------------------------
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
  const list =
    Array.isArray(numbers) && numbers.length
      ? numbers.slice().sort((a, b) => a - b).join(", ")
      : "-";
  const link = raffleLink ? raffleLink : BASE ? `${BASE}` : "#";

  const html = `
  <div style="font-family:Inter,Arial,Helvetica,sans-serif;background:#f8fafc;padding:24px">
    <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden">
      <div style="padding:18px 20px;border-bottom:1px solid #eef2f7;background:linear-gradient(135deg,#1e3a8a 0%,#18a957 100%);color:#fff">
        <h2 style="margin:0;font-size:18px;line-height:1.25">✅ Compra confirmada — ${escapeHtml(
          raffleTitle
        )}</h2>
      </div>
      <div style="padding:18px 20px;color:#0f172a">
        ${
          buyerName
            ? `<p style="margin:0 0 10px">¡Gracias por tu compra, ${escapeHtml(
                buyerName
              )}!</p>`
            : `<p style="margin:0 0 10px">¡Gracias por tu compra!</p>`
        }
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
    text:
      `Compra aprobada. Rifa: ${raffleTitle}. ` +
      `Números: ${list}. ` +
      `Total: ${fmtCLP(amountCLP)}. ` +
      `Pago: ${paymentId || "-"}.`,
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
  const list =
    Array.isArray(numbers) && numbers.length
      ? numbers.slice().sort((a, b) => a - b).join(", ")
      : "-";
  const link = raffleLink ? raffleLink : BASE ? `${BASE}` : "#";

  const html = `
  <div style="font-family:Inter,Arial,Helvetica,sans-serif;background:#f8fafc;padding:24px">
    <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden">
      <div style="padding:18px 20px;border-bottom:1px solid #eef2f7;background:linear-gradient(135deg,#1e3a8a 0%,#18a957 100%);color:#fff">
        <h2 style="margin:0;font-size:18px;line-height:1.25">💸 Nueva venta — ${escapeHtml(
          raffleTitle
        )}</h2>
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
    text:
      `Nueva venta en ${raffleTitle}. ` +
      `Números: ${list}. ` +
      `Total: ${fmtCLP(amountCLP)}. ` +
      `Comprador: ${buyerEmail || "-"}. ` +
      `Pago: ${paymentId || "-"}.`,
  });
}

export async function sendWinnerEmail({
  to,
  winnerName,
  raffleTitle,
  number,
  raffleLink, // opcional
  // CUMPLIMIENTO-3: mismo correo, enriquecido -- nunca un segundo email
  // separado de "Día 0". accessLink solo se agrega cuando existe.
  accessLink,
  prizeType,
  deliveryMethod,
  requiresTransferProcedures,
  transferExpensesOwner,
  transferConditions,
}) {
  const subject = `🏆 ¡Ganaste! — ${raffleTitle}`;
  const link = raffleLink ? raffleLink : BASE ? `${BASE}` : "#";
  const extraRows = deliveryAndTransferHtmlRows({ prizeType, deliveryMethod, requiresTransferProcedures, transferExpensesOwner, transferConditions });
  const extraText = deliveryAndTransferText({ prizeType, deliveryMethod, requiresTransferProcedures, transferExpensesOwner, transferConditions });

  const html = `
  <div style="font-family:Inter,Arial,Helvetica,sans-serif;background:#f8fafc;padding:24px">
    <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden">
      <div style="padding:18px 20px;border-bottom:1px solid #eef2f7;background:linear-gradient(135deg,#1e3a8a 0%,#18a957 100%);color:#fff">
        <h2 style="margin:0;font-size:18px;line-height:1.25">🏆 ¡Felicidades, ganaste! — ${escapeHtml(
          raffleTitle
        )}</h2>
      </div>
      <div style="padding:18px 20px;color:#0f172a">
        ${
          winnerName
            ? `<p style="margin:0 0 10px">¡Felicidades, ${escapeHtml(winnerName)}!</p>`
            : `<p style="margin:0 0 10px">¡Felicidades!</p>`
        }
        <p style="margin:0 0 12px">Tu número resultó ganador en la rifa <b>${escapeHtml(raffleTitle)}</b>.</p>
        <table style="width:100%;border-collapse:collapse;margin:8px 0 14px">
          <tbody>
            <tr>
              <td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb;width:40%"><b>Número ganador</b></td>
              <td style="padding:8px;border:1px solid #e5e7eb">${escapeHtml(String(number))}</td>
            </tr>
            ${extraRows}
          </tbody>
        </table>
        <p style="margin:0 0 14px">El organizador de la rifa se va a poner en contacto para coordinar la entrega del premio${requiresTransferProcedures ? " y los trámites de transferencia" : ""}. Las condiciones de entrega son exactamente las que se publicaron en la rifa antes de participar.</p>
        ${
          accessLink
            ? `<a href="${accessLink}" style="display:inline-block;padding:10px 14px;border-radius:10px;background:#18a957;color:#fff;text-decoration:none;font-weight:700;margin-right:8px">Ver mi caso</a>`
            : ""
        }
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
    text: `¡Ganaste! Rifa: ${raffleTitle}. Número ganador: ${number}. ${extraText} El organizador se va a poner en contacto para coordinar la entrega.${accessLink ? ` Ver tu caso: ${accessLink}` : ""}`,
  });
}

export async function sendCreatorWinnerEmail({
  to,
  raffleTitle,
  number,
  winnerName,
  winnerEmail,
  raffleLink, // opcional
  // CUMPLIMIENTO-3: mismo correo, enriquecido -- recordatorio de las
  // condiciones que el propio creador ya publicó, no obligaciones nuevas.
  prizeType,
  deliveryMethod,
  requiresTransferProcedures,
  transferExpensesOwner,
  transferConditions,
}) {
  const subject = `🎉 Ya hay ganador — ${raffleTitle}`;
  const link = raffleLink ? raffleLink : BASE ? `${BASE}` : "#";
  const extraRows = deliveryAndTransferHtmlRows({ prizeType, deliveryMethod, requiresTransferProcedures, transferExpensesOwner, transferConditions });
  const extraText = deliveryAndTransferText({ prizeType, deliveryMethod, requiresTransferProcedures, transferExpensesOwner, transferConditions });

  const html = `
  <div style="font-family:Inter,Arial,Helvetica,sans-serif;background:#f8fafc;padding:24px">
    <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden">
      <div style="padding:18px 20px;border-bottom:1px solid #eef2f7;background:linear-gradient(135deg,#1e3a8a 0%,#18a957 100%);color:#fff">
        <h2 style="margin:0;font-size:18px;line-height:1.25">🎉 Ya hay ganador — ${escapeHtml(
          raffleTitle
        )}</h2>
      </div>
      <div style="padding:18px 20px;color:#0f172a">
        <p style="margin:0 0 12px">Se sorteó el ganador de tu rifa. Comienza la etapa de coordinación de entrega — recuerda las condiciones que tú mismo publicaste antes de que la rifa empezara a vender.</p>
        <table style="width:100%;border-collapse:collapse;margin:8px 0 14px">
          <tbody>
            <tr>
              <td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb;width:40%"><b>Número ganador</b></td>
              <td style="padding:8px;border:1px solid #e5e7eb">${escapeHtml(String(number))}</td>
            </tr>
            <tr>
              <td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb"><b>Ganador</b></td>
              <td style="padding:8px;border:1px solid #e5e7eb">${escapeHtml(winnerName || "-")}</td>
            </tr>
            <tr>
              <td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb"><b>Contacto</b></td>
              <td style="padding:8px;border:1px solid #e5e7eb">${escapeHtml(winnerEmail || "-")}</td>
            </tr>
            ${extraRows}
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
    text:
      `Ya hay ganador en ${raffleTitle}. ` +
      `Número: ${number}. Ganador: ${winnerName || "-"} (${winnerEmail || "-"}). ${extraText} ` +
      `Coordina la entrega del premio.`,
  });
}

// ----------------------------------------------------------
// CUMPLIMIENTO-4 — Día 10 / Día 15 / escalamiento interno / aviso de
// revisión. Estos correos describen únicamente hechos y respuestas
// registradas, nunca acusaciones ni juicios sobre ninguna de las
// partes -- ver docs/cumplimiento/CUMPLIMIENTO_4_RESPONSES_AND_TIMELINE.md.
// ----------------------------------------------------------
function shell({ headerEmoji, headerTitle, bodyHtml }) {
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
function ctaButton(href, label, color = "#18a957") {
  return href
    ? `<a href="${href}" style="display:inline-block;padding:10px 14px;border-radius:10px;background:${color};color:#fff;text-decoration:none;font-weight:700;margin-right:8px">${escapeHtml(label)}</a>`
    : "";
}

/** Día 10 -- se le pregunta al ganador si recibió su premio. */
export async function sendFulfillmentDay10WinnerEmail({ to, winnerName, raffleTitle, accessLink }) {
  const subject = `¿Recibiste tu premio? — ${raffleTitle}`;
  const greet = winnerName ? escapeHtml(winnerName) : "";
  const body = `
    <p style="margin:0 0 10px">Hola ${greet},</p>
    <p style="margin:0 0 12px">Queremos confirmar el estado de la entrega de tu premio en <b>${escapeHtml(raffleTitle)}</b>.</p>
    ${
      accessLink
        ? `<p style="margin:0 0 14px">${ctaButton(accessLink, "Responder ahora")}</p>`
        : `<p style="margin:0 0 14px">Puedes responder usando el enlace que te enviamos anteriormente por email para acceder a tu caso.</p>`
    }
  `;
  return sendEmail({
    to,
    subject,
    html: shell({ headerEmoji: "📦", headerTitle: `¿Recibiste tu premio? — ${raffleTitle}`, bodyHtml: body }),
    text: `¿Recibiste tu premio de ${raffleTitle}?${accessLink ? ` Responde acá: ${accessLink}` : " Responde usando el enlace que te enviamos anteriormente."}`,
  });
}

/** Día 10 -- se le pregunta al creador si ya entregó el premio. */
export async function sendFulfillmentDay10CreatorEmail({ to, raffleTitle, panelLink }) {
  const subject = `¿Ya entregaste el premio? — ${raffleTitle}`;
  const body = `
    <p style="margin:0 0 12px">Queremos confirmar el estado de la entrega del premio de tu rifa <b>${escapeHtml(raffleTitle)}</b>.</p>
    <p style="margin:0 0 14px">${ctaButton(panelLink, "Responder ahora")}</p>
  `;
  return sendEmail({
    to,
    subject,
    html: shell({ headerEmoji: "📦", headerTitle: `¿Ya entregaste el premio? — ${raffleTitle}`, bodyHtml: body }),
    text: `¿Ya entregaste el premio de ${raffleTitle}? Responde desde tu panel: ${panelLink}`,
  });
}

/** Día 15 -- recordatorio, solo se envía a quien no respondió. */
export async function sendFulfillmentDay15ReminderWinnerEmail({ to, winnerName, raffleTitle, accessLink }) {
  const subject = `Recordatorio — ${raffleTitle}`;
  const greet = winnerName ? escapeHtml(winnerName) : "";
  const body = `
    <p style="margin:0 0 10px">Hola ${greet},</p>
    <p style="margin:0 0 12px">Todavía no recibimos tu respuesta sobre la entrega de tu premio en <b>${escapeHtml(raffleTitle)}</b>.</p>
    ${
      accessLink
        ? `<p style="margin:0 0 14px">${ctaButton(accessLink, "Responder ahora")}</p>`
        : `<p style="margin:0 0 14px">Puedes responder usando el enlace que te enviamos anteriormente por email para acceder a tu caso.</p>`
    }
  `;
  return sendEmail({
    to,
    subject,
    html: shell({ headerEmoji: "⏰", headerTitle: `Recordatorio — ${raffleTitle}`, bodyHtml: body }),
    text: `Recordatorio: todavía no respondiste sobre tu premio de ${raffleTitle}.${accessLink ? ` Responde acá: ${accessLink}` : " Responde usando el enlace que te enviamos anteriormente."}`,
  });
}

/** Día 15 -- recordatorio al creador, solo si no respondió. */
export async function sendFulfillmentDay15ReminderCreatorEmail({ to, raffleTitle, panelLink }) {
  const subject = `Recordatorio — ${raffleTitle}`;
  const body = `
    <p style="margin:0 0 12px">Todavía no recibimos tu respuesta sobre la entrega del premio de tu rifa <b>${escapeHtml(raffleTitle)}</b>.</p>
    <p style="margin:0 0 14px">${ctaButton(panelLink, "Responder ahora")}</p>
  `;
  return sendEmail({
    to,
    subject,
    html: shell({ headerEmoji: "⏰", headerTitle: `Recordatorio — ${raffleTitle}`, bodyHtml: body }),
    text: `Recordatorio: todavía no respondiste sobre la entrega del premio de ${raffleTitle}. Responde desde tu panel: ${panelLink}`,
  });
}

/**
 * Expediente interno de revisión -- Día 20, solo a direcciones internas
 * de Rifex (nunca al creador ni al ganador). Nunca incluye tokens,
 * secretos, credenciales de Mercado Pago ni datos de otros compradores.
 * Solo describe hechos y respuestas registradas, sin acusaciones ni
 * juicios sobre ninguna de las partes.
 */
export async function sendFulfillmentInternalEscalationEmail({ to, raffleTitle, caseReference, dossierHtmlRows, dossierText }) {
  const subject = `Rifex Cumplimiento — Caso para revisión interna (${caseReference})`;
  const body = `
    <p style="margin:0 0 12px">El caso de cumplimiento de la rifa <b>${escapeHtml(raffleTitle)}</b> (${escapeHtml(caseReference)}) terminó su etapa automática sin confirmación de entrega y queda en revisión interna.</p>
    <table style="width:100%;border-collapse:collapse;margin:8px 0 14px;font-size:13px">
      <tbody>${dossierHtmlRows}</tbody>
    </table>
  `;
  return sendEmail({
    to,
    subject,
    html: shell({ headerEmoji: "🔎", headerTitle: `Caso para revisión interna — ${raffleTitle}`, bodyHtml: body }),
    text: `Rifex Cumplimiento — Caso para revisión interna (${caseReference}).\n\n${dossierText}`,
  });
}

/** Aviso de revisión al ganador -- copia neutral, sin afirmar responsabilidad de ninguna parte ni prometer compensación. */
export async function sendFulfillmentReviewNoticeWinnerEmail({ to, winnerName, raffleTitle, accessLink }) {
  const subject = `Actualización de tu caso — ${raffleTitle}`;
  const greet = winnerName ? escapeHtml(winnerName) : "";
  const body = `
    <p style="margin:0 0 10px">Hola ${greet},</p>
    <p style="margin:0 0 12px">El caso de tu premio en <b>${escapeHtml(raffleTitle)}</b> terminó su etapa automática y será revisado internamente por Rifex.</p>
    <p style="margin:0 0 14px">Revisaremos los antecedentes registrados durante el proceso.</p>
    ${accessLink ? `<p style="margin:0 0 14px">${ctaButton(accessLink, "Ver mi caso")}</p>` : ""}
  `;
  return sendEmail({
    to,
    subject,
    html: shell({ headerEmoji: "📋", headerTitle: `Actualización de tu caso — ${raffleTitle}`, bodyHtml: body }),
    text: `El caso de tu premio en ${raffleTitle} terminó su etapa automática y será revisado internamente por Rifex. Revisaremos los antecedentes registrados durante el proceso.${accessLink ? ` Ver tu caso: ${accessLink}` : ""}`,
  });
}

/** Aviso de revisión al creador -- misma copia neutral que el ganador. */
export async function sendFulfillmentReviewNoticeCreatorEmail({ to, raffleTitle, panelLink }) {
  const subject = `Actualización de caso — ${raffleTitle}`;
  const body = `
    <p style="margin:0 0 12px">El caso de cumplimiento de tu rifa <b>${escapeHtml(raffleTitle)}</b> terminó su etapa automática y será revisado internamente por Rifex.</p>
    <p style="margin:0 0 14px">Revisaremos los antecedentes registrados durante el proceso.</p>
    <p style="margin:0 0 14px">${ctaButton(panelLink, "Ver mi caso")}</p>
  `;
  return sendEmail({
    to,
    subject,
    html: shell({ headerEmoji: "📋", headerTitle: `Actualización de caso — ${raffleTitle}`, bodyHtml: body }),
    text: `El caso de cumplimiento de tu rifa ${raffleTitle} terminó su etapa automática y será revisado internamente por Rifex. Revisaremos los antecedentes registrados durante el proceso. Ver tu caso: ${panelLink}`,
  });
}

// ----------------------------------------------------------
// Export utilitarios si los usas en otros módulos
// ----------------------------------------------------------
export const __mailer_utils = { isValidEmail, escapeHtml, fmtCLP };

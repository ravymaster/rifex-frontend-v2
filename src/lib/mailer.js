// src/lib/mailer.js
// Envío de emails con Resend + auditoría en Supabase (email_logs)

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

// ----------------------------------------------------------
// Flags y ENV
// ----------------------------------------------------------
const ENABLE = String(process.env.ENABLE_EMAILS || "").toLowerCase() === "true";
const FROM = process.env.EMAIL_FROM || "";                 // debe ser dominio verificado en Resend
const RESEND_KEY = process.env.RESEND_API_KEY || "";
const DEV_FORCE_TO = (process.env.DEV_FORCE_TO || "").trim();   // fuerza todos los envíos a una casilla (testing)
const DEV_BCC_EMAIL = (process.env.DEV_BCC_EMAIL || "").trim(); // copia oculta global (auditoría)
const BASE = (process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
const DEDUP_MIN = Number(process.env.EMAIL_DEDUP_WINDOW_MIN || 0); // 0 = desactivado

// Supabase para auditoría (solo con SERVICE ROLE)
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPA_SRV =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";
const hasAudit = !!(SUPA_URL && SUPA_SRV); // <-- quitamos fallback al ANON
const supa = hasAudit
  ? createClient(SUPA_URL, SUPA_SRV, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

// ----------------------------------------------------------
// Utils
// ----------------------------------------------------------
function isValidEmail(s) {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}
function uniq(arr = []) { return [...new Set(arr)]; }
function ensureArray(v) { return Array.isArray(v) ? v : [v]; }
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
    return Number(n || 0).toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
  } catch {
    return `$${n}`;
  }
}
function htmlToText(html = "") {
  try {
    return String(html)
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  } catch { return ""; }
}
function trimForStore(s = "", max = 12000) {
  const str = String(s || "");
  return str.length > max ? str.slice(0, max) : str;
}
function computeMessageKey({ to, subject, template = "", contextHash = "" }) {
  const base = `${ensureArray(to).join(",")}|${subject}|${template}|${contextHash}`;
  return crypto.createHash("sha256").update(base).digest("hex");
}

// ----------------------------------------------------------
// Auditoría
// ----------------------------------------------------------
async function auditLog(row) {
  try {
    if (!hasAudit) return;
    await supa.from("email_logs").insert({
      provider: "resend",
      status: row.status,     // "attempt" | "sent" | "error" | "skipped"
      message_key: row.message_key || null,
      resend_id: row.resend_id || null,
      to_list: row.to_list || [],
      bcc_list: row.bcc_list || [],
      subject: row.subject || null,
      html: row.html ? trimForStore(row.html) : null,
      text: row.text ? trimForStore(row.text, 4000) : null,
      headers: row.headers || null,
      meta: row.meta || null,
      error: row.error || null,
    });
  } catch (e) {
    console.warn("[mailer:audit] insert failed:", e?.message || e);
  }
}

async function auditCheckDedup(message_key) {
  // FIX: quitar el espacio en DEDUP_MIN
  if (!hasAudit || !DEDUP_MIN || !message_key) return false;
  const since = new Date(Date.now() - DEDUP_MIN * 60000).toISOString();
  const { data } = await supa
    .from("email_logs")
    .select("id")
    .eq("message_key", message_key)
    .eq("status", "sent")
    .gte("created_at", since)
    .limit(1);
  return (data || []).length > 0;
}

// ----------------------------------------------------------
// Envío genérico (Resend) con reintentos y auditoría
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
 * @param {string} [params.messageKey]   // idempotencia opcional
 * @param {string} [params.template]     // nombre de plantilla (para auditoría)
 * @param {object} [params.meta]         // extra (paymentId, raffleId, etc.)
 * @returns {Promise<{ok:boolean, id?:string, skipped?:boolean, status?:number, error?:any, data?:any}>}
 */
export async function sendEmail({ to, subject, html, text, bcc, replyTo, messageKey, template, meta }) {
  try {
    if (!ENABLE) {
      const row = { status: "skipped", subject, to_list: ensureArray(to), html, text, meta, message_key: messageKey, headers: { reason: "emails_disabled" } };
      await auditLog(row);
      console.log("[mailer] ENABLE_EMAILS=false → skip", { to, subject });
      return { ok: true, skipped: true, reason: "emails_disabled" };
    }
    if (!RESEND_KEY) {
      await auditLog({ status: "error", subject, to_list: ensureArray(to), error: "RESEND_API_KEY missing" });
      return { ok: false, error: "RESEND_API_KEY missing" };
    }
    if (!FROM) {
      await auditLog({ status: "error", subject, to_list: ensureArray(to), error: "EMAIL_FROM missing" });
      return { ok: false, error: "EMAIL_FROM missing (dominio debe estar verificado en Resend)" };
    }

    // Normalizar destinatarios
    let tos = uniq(stripEmptyEmails(ensureArray(to)));
    let bccs = uniq(stripEmptyEmails(ensureArray(bcc)));

    if (tos.length === 0) {
      await auditLog({ status: "error", subject, error: "to_missing_or_invalid", to_list: ensureArray(to) });
      return { ok: false, error: "to_missing_or_invalid" };
    }

    // Idempotencia opcional
    const contextHash = meta?.paymentId ? String(meta.paymentId) : "";
    const subjectClean = String(subject || "").replace(/\s+/g, " ").trim().slice(0, 120); // sanitiza y acorta
    const msgKey = messageKey || computeMessageKey({ to: tos, subject: subjectClean, template, contextHash });
    if (await auditCheckDedup(msgKey)) {
      const row = { status: "skipped", subject: subjectClean, to_list: tos, message_key: msgKey, headers: { reason: "dedup_window" }, meta };
      await auditLog(row);
      return { ok: true, skipped: true, reason: "dedup_window" };
    }

    // DEV_FORCE_TO: redirige todo a una casilla, pero preserva trazabilidad via headers y auditoría
    const headers = {};
    if (DEV_FORCE_TO && isValidEmail(DEV_FORCE_TO)) {
      headers["X-Rifex-Original-To"] = tos.join(", ");
      tos = [DEV_FORCE_TO];
      if (DEV_BCC_EMAIL && isValidEmail(DEV_BCC_EMAIL)) {
        bccs = uniq([...(bccs || []), DEV_BCC_EMAIL]);
      }
      text = `[FORCED to ${DEV_FORCE_TO}] ${text || htmlToText(html || "")}`;
    } else if (DEV_BCC_EMAIL && isValidEmail(DEV_BCC_EMAIL)) {
      bccs = uniq([...(bccs || []), DEV_BCC_EMAIL]);
    }

    const payload = {
      from: FROM,
      to: tos,
      subject: subjectClean,
      html: String(html || ""),
      text: text || htmlToText(html || ""),
      ...(bccs.length ? { bcc: bccs } : {}),
      ...(replyTo && isValidEmail(replyTo) ? { reply_to: replyTo } : {}),
      ...(Object.keys(headers).length ? { headers } : {}),
    };

    // Auditoría: attempt
    await auditLog({
      status: "attempt",
      message_key: msgKey,
      subject: subjectClean,
      to_list: tos,
      bcc_list: bccs,
      html,
      text: payload.text,
      headers,
      meta,
    });

    // Reintentos con backoff simple
    const maxTries = 3;
    let lastErr = null;
    for (let i = 1; i <= maxTries; i++) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => null);
        if (res.ok) {
          await auditLog({
            status: "sent",
            message_key: msgKey,
            resend_id: data?.id || null,
            subject: subjectClean,
            to_list: tos,
            bcc_list: bccs,
            html,
            text: payload.text,
            headers,
            meta,
          });
          return { ok: true, status: res.status, id: data?.id || null, data };
        } else {
          const err = data?.message || data?.error || JSON.stringify(data);
          lastErr = `[${res.status}] ${err}`;
          console.error("[mailer] Resend error:", { try: i, status: res.status, err });
          if (i < maxTries) await new Promise(r => setTimeout(r, i * 600)); // 0.6s, 1.2s
        }
      } catch (e) {
        lastErr = e?.message || String(e);
        console.error("[mailer] sendEmail attempt failed:", { try: i, err: lastErr });
        if (i < maxTries) await new Promise(r => setTimeout(r, i * 600));
      }
    }

    await auditLog({
      status: "error",
      message_key: msgKey,
      subject: subjectClean,
      to_list: tos,
      bcc_list: bccs,
      html,
      text: payload.text,
      headers,
      meta,
      error: lastErr,
    });
    return { ok: false, error: lastErr };
  } catch (e) {
    await auditLog({ status: "error", subject, error: String(e), to_list: ensureArray(to), meta });
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
        <h2 style="margin:0;font-size:18px;line-height:1.25">✅ Compra confirmada — ${escapeHtml(raffleTitle)}</h2>
      </div>
      <div style="padding:18px 20px;color:#0f172a">
        ${buyerName
          ? `<p style="margin:0 0 10px">¡Gracias por tu compra, ${escapeHtml(buyerName)}!</p>`
          : `<p style="margin:0 0 10px">¡Gracias por tu compra!</p>`}
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
    template: "buyer_approved",
    meta: { paymentId, raffleTitle, role: "buyer" },
  });
}

export async function sendCreatorSaleEmail({
  to,
  raffleTitle,
  numbers,
  amountCLP,        // CLP (entero)
  buyerEmail,
  paymentId,
  raffleLink,       // opcional
  // === opcionales de fee para desglose ===
  rifexFeeCLP,      // entero CLP
  mpFeeCLP,         // entero CLP
  netCLP,           // entero CLP
  plan,             // "free"|"basic"|"pro"|etc.
}) {
  const subject = `💸 Nueva venta — ${raffleTitle}`;
  const list =
    Array.isArray(numbers) && numbers.length
      ? numbers.slice().sort((a, b) => a - b).join(", ")
      : "-";
  const link = raffleLink ? raffleLink : BASE ? `${BASE}` : "#";

  const feeRows = (rifexFeeCLP || mpFeeCLP || netCLP)
    ? `
      <table style="font-size:14px;margin-top:10px">
        ${typeof rifexFeeCLP === "number" ? `<tr><td>💰 Comisión Rifex${plan ? ` (${escapeHtml(plan)})` : ""}:</td><td>${fmtCLP(rifexFeeCLP)}</td></tr>` : ""}
        ${typeof mpFeeCLP === "number" ? `<tr><td>🧾 Comisión MP:</td><td>${fmtCLP(mpFeeCLP)}</td></tr>` : ""}
        ${typeof netCLP === "number" ? `<tr><td><strong>💸 Total neto:</strong></td><td><strong>${fmtCLP(netCLP)}</strong></td></tr>` : ""}
      </table>`
    : "";

  const html = `
  <div style="font-family:Inter,Arial,Helvetica,sans-serif;background:#f8fafc;padding:24px">
    <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden">
      <div style="padding:18px 20px;border-bottom:1px solid #eef2f7;background:linear-gradient(135deg,#1e3a8a 0%,#18a957 100%);color:#fff">
        <h2 style="margin:0;font-size:18px;line-height:1.25">💸 Nueva venta — ${escapeHtml(raffleTitle)}</h2>
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
        ${feeRows}
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
      `Nueva venta en ${raffleTitle}. Números: ${list}. Total: ${fmtCLP(amountCLP)}. ` +
      `Comprador: ${buyerEmail || "-"}. Pago: ${paymentId || "-"}.` +
      (typeof rifexFeeCLP === "number" ? ` Rifex: ${fmtCLP(rifexFeeCLP)}.` : "") +
      (typeof mpFeeCLP === "number" ? ` MP: ${fmtCLP(mpFeeCLP)}.` : "") +
      (typeof netCLP === "number" ? ` Neto: ${fmtCLP(netCLP)}.` : ""),
    template: "creator_sale",
    meta: { paymentId, raffleTitle, role: "creator", plan: plan || null },
  });
}

// ----------------------------------------------------------
// Export utilitarios si los usas en otros módulos
// ----------------------------------------------------------
export const __mailer_utils = { isValidEmail, escapeHtml, fmtCLP };

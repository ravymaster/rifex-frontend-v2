// src/lib/captchaGate.js
// Único punto donde login.jsx y register.jsx deciden si hCaptcha es
// obligatorio. Fail-safe hacia producción: usa isDevStage() de
// environmentPolicy.js (solo 'development' exacto bypassea), nunca lee
// process.env directo acá ni en las páginas.
import { isDevStage } from "@/lib/environmentPolicy";

// Devuelve { ok: true } si se puede continuar (bypass DEV, o token verificado
// contra /api/verify-captcha), o { ok: false, error } con el mensaje a
// mostrar. Nunca toca la verificación real de PROD.
export async function verifyCaptchaOrDevBypass() {
  if (isDevStage()) return { ok: true };

  const token = typeof window !== "undefined" ? window.hcaptcha?.getResponse() : null;
  if (!token) return { ok: false, error: "Completa el captcha." };

  const r = await fetch("/api/verify-captcha", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  const j = await r.json().catch(() => ({ ok: false }));
  if (!j.ok) return { ok: false, error: "Captcha inválido." };
  return { ok: true };
}

// src/pages/api/dev/admin-entry.js
// Único punto de canje del enlace de un solo uso de la puerta temporal
// DEV (ver src/lib/devAdminDoor.js). NO abre ni cierra la puerta -- eso
// solo lo hace scripts/dev-admin-door.js, ejecutado a mano contra
// rifex-dev, para que jamás exista una ruta HTTP desplegada capaz de
// generar accesos nuevos. Esta ruta solo puede REDIMIR un token que ya
// fue creado por ese script.
//
// isDevDoorEligible() se revisa primero y de forma completa antes de leer
// el query param: en cualquier runtime que no sea rifex-frontend-main con
// la variable privada activada, esta ruta responde 404 (no 403) -- misma
// respuesta que una ruta inexistente, sin filtrar siquiera que el
// mecanismo existe.
import { isDevDoorEligible, redeemDevDoorToken, devDoorCookieName } from "@/lib/devAdminDoor";
import { enforceRateLimit, resolveClientIp } from "@/lib/rateLimit";

const SESSION_MAX_AGE_SECONDS = 4 * 60 * 60; // 4h -- igual al expires_at por defecto de dev_admin_sessions

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(404).end();
  if (!isDevDoorEligible()) return res.status(404).end();

  const ip = resolveClientIp(req);
  if (await enforceRateLimit(req, res, { key: `dev-admin-entry:${ip}`, maxHits: 10, windowSeconds: 60 })) return;

  const rawToken = String(req.query.token || "");
  if (!rawToken) return res.status(400).json({ ok: false, error: "missing_token" });

  const result = await redeemDevDoorToken(rawToken);
  if (!result) {
    return res.status(403).json({ ok: false, error: "invalid_or_expired_token" });
  }

  res.setHeader(
    "Set-Cookie",
    `${devDoorCookieName()}=${result.sessionId}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_MAX_AGE_SECONDS}`
  );
  res.writeHead(302, { Location: "/admin" });
  res.end();
}

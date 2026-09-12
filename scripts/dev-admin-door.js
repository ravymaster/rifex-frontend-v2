#!/usr/bin/env node
// scripts/dev-admin-door.js
// Abre/cierra la puerta temporal de acceso a /admin en DEV (ver
// src/lib/devAdminDoor.js + db/migrations/2026-09-12_dev_admin_door_v1.sql).
// Deliberadamente un script LOCAL, nunca una ruta HTTP desplegada: así no
// existe ningún endpoint público en la app capaz de generar o revocar
// accesos -- solo quien tiene este script y las credenciales de rifex-dev
// en su máquina puede abrir o cerrar la puerta.
//
// Uso:
//   node scripts/dev-admin-door.js open
//   node scripts/dev-admin-door.js close
//   node scripts/dev-admin-door.js status
//
// Lee SUPABASE_DEV_URL y SUPABASE_DEV_SERVICE_ROLE_KEY desde .env.local
// (mismo archivo/convención que scripts/dev-supabase.sh). Nunca acepta un
// project-ref ni una URL por argumento -- así no hay forma de apuntarlo
// por error a otra base de datos.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Project-ref real de PROD (rifex-frontend-v2 / rifex.pro), ver
// scripts/dev-supabase.sh -- segundo guardrail independiente: si por
// cualquier motivo SUPABASE_DEV_URL llegara a contener este ref, el
// script aborta de inmediato sin tocar nada.
const PROD_PROJECT_REF = "wrdkdfuiwlujfxxijpao";

function loadEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

const SUPABASE_DEV_URL = process.env.SUPABASE_DEV_URL;
const SERVICE_KEY = process.env.SUPABASE_DEV_SERVICE_ROLE_KEY;
const ENTRY_BASE_URL = process.env.DEV_ADMIN_ENTRY_BASE_URL || "https://rifex-frontend-main.vercel.app";

if (!SUPABASE_DEV_URL || !SERVICE_KEY) {
  console.error("Faltan SUPABASE_DEV_URL / SUPABASE_DEV_SERVICE_ROLE_KEY en .env.local. Abortando.");
  process.exit(1);
}
if (SUPABASE_DEV_URL.includes(PROD_PROJECT_REF)) {
  console.error(`SUPABASE_DEV_URL contiene el project-ref de PROD (${PROD_PROJECT_REF}). Abortando por seguridad.`);
  process.exit(1);
}

async function rest(pathAndQuery, options = {}) {
  const r = await fetch(`${SUPABASE_DEV_URL}/rest/v1/${pathAndQuery}`, {
    ...options,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`Supabase REST ${r.status}: ${text}`);
  }
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

async function audit(action, detail) {
  await rest("dev_admin_access_audit", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ action, detail: detail || null }),
  });
}

async function cmdOpen() {
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  const [row] = await rest("dev_admin_access_tokens", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ token_hash: tokenHash }),
  });

  await audit("opened", { token_id: row.id, expires_at: row.expires_at });

  const link = `${ENTRY_BASE_URL}/api/dev/admin-entry?token=${rawToken}`;
  console.log("\nPuerta DEV: enlace de un solo uso generado.\n");
  console.log(`  Enlace:    ${link}`);
  console.log(`  Expira:    ${row.expires_at} (30 minutos para canjearlo)`);
  console.log(`  Sesión:    una vez abierto, dura 4 horas o hasta que ejecutes "close".\n`);
  console.log('Recuerda: la app debe tener RIFEX_DEV_ADMIN_DOOR="on" configurada SOLO en el proyecto Vercel rifex-frontend-main para que este enlace funcione.\n');
}

async function cmdClose() {
  const nowIso = new Date().toISOString();
  const revokedTokens = await rest("dev_admin_access_tokens?revoked_at=is.null&used_at=is.null", {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ revoked_at: nowIso }),
  });
  const revokedSessions = await rest("dev_admin_sessions?revoked_at=is.null", {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ revoked_at: nowIso }),
  });

  await audit("closed", {
    tokens_revoked: (revokedTokens || []).length,
    sessions_revoked: (revokedSessions || []).length,
  });

  console.log("\nPuerta DEV cerrada.\n");
  console.log(`  Tokens sin canjear revocados: ${(revokedTokens || []).length}`);
  console.log(`  Sesiones activas revocadas:   ${(revokedSessions || []).length}\n`);
  console.log("Cualquier sesión ya emitida deja de servir de inmediato; no pueden generarse accesos nuevos sin volver a ejecutar \"open\".\n");
}

async function cmdStatus() {
  const nowIso = new Date().toISOString();
  const activeTokens = await rest(
    `dev_admin_access_tokens?revoked_at=is.null&used_at=is.null&expires_at=gt.${encodeURIComponent(nowIso)}&select=id,created_at,expires_at`
  );
  const activeSessions = await rest(
    `dev_admin_sessions?revoked_at=is.null&expires_at=gt.${encodeURIComponent(nowIso)}&select=id,created_at,expires_at`
  );
  const recentAudit = await rest("dev_admin_access_audit?select=action,created_at,detail&order=created_at.desc&limit=8");

  console.log("\nEstado actual de la puerta DEV:\n");
  console.log(`  Tokens sin canjear vigentes: ${activeTokens.length}`);
  console.log(`  Sesiones activas vigentes:   ${activeSessions.length}`);
  console.log(`  Puerta: ${activeTokens.length > 0 || activeSessions.length > 0 ? "ABIERTA (hay acceso vigente)" : "CERRADA (sin accesos vigentes)"}\n`);
  console.log("  Últimos eventos de auditoría:");
  for (const a of recentAudit) console.log(`   - ${a.created_at}  ${a.action}  ${JSON.stringify(a.detail || {})}`);
  console.log("");
}

const cmd = process.argv[2];
(async () => {
  if (cmd === "open") await cmdOpen();
  else if (cmd === "close") await cmdClose();
  else if (cmd === "status") await cmdStatus();
  else {
    console.error("Uso: node scripts/dev-admin-door.js open|close|status");
    process.exit(1);
  }
})().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});

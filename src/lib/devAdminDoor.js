// src/lib/devAdminDoor.js
// Puerta temporal de acceso a /admin — EXCLUSIVA de rifex-dev (proyecto
// Vercel `rifex-frontend-main`). Ver db/migrations/2026-09-12_dev_admin_door_v1.sql
// para el esquema y el razonamiento completo. Este módulo es la ÚNICA
// autoridad sobre "¿puede existir la puerta en este runtime?" — cualquier
// código que quiera aceptar una sesión de la puerta DEBE pasar primero por
// isDevDoorEligible() y tratar `false` como si el mecanismo no existiera.
//
// Dos chequeos independientes, ambos obligatorios (AND, nunca OR):
//   1. RIFEX_DEV_ADMIN_DOOR === 'on' — variable privada de servidor
//      (NUNCA NEXT_PUBLIC_*), configurada A MANO únicamente en el proyecto
//      Vercel `rifex-frontend-main`. Jamás en `rifex-frontend-v2` (PROD).
//   2. Identidad de proyecto Vercel, inyectada automáticamente por Vercel
//      (nadie la configura a mano, así que copiar código o variables por
//      error a PROD no puede falsificarla): VERCEL_PROJECT_PRODUCTION_URL
//      debe contener 'rifex-frontend-main' y NO contener 'rifex.pro' ni
//      'rifex-frontend-v2'. Fuera de Vercel (ej. `next dev` local) esta
//      variable no existe — en ese caso exigimos en su lugar
//      NODE_ENV !== 'production' + isDevStage(), nunca la sola ausencia
//      de la variable.
// Además, como tercer refuerzo (nunca el único ni el primero, tal como
// exige el mandato), también se exige isDevStage() — el flag DEV que ya
// gobierna el resto de las relajaciones de la app. Esto solo puede
// ENDURECER el cierre, jamás abrirlo: si cualquiera de los tres falla,
// la puerta está cerrada.
import { createHash, randomBytes } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { isDevStage } from "./environmentPolicy.js";

const COOKIE_NAME = "rifex_dev_admin_session";
const TOKEN_BYTES = 32;

// Perezoso a propósito -- ver el mismo comentario en analyticsEvents.js:
// isDevDoorEligible() es la función más sensible de seguridad de todo
// este módulo y debe poder importarse y probarse sin variables de
// entorno de Supabase presentes (tests/devAdminDoor.test.mjs).
let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }
  return _supabase;
}

function projectIdentityCheck() {
  const prodUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || "";
  if (prodUrl) {
    const lower = prodUrl.toLowerCase();
    if (lower.includes("rifex.pro") || lower.includes("rifex-frontend-v2")) return false;
    return lower.includes("rifex-frontend-main");
  }
  // Sin VERCEL_PROJECT_PRODUCTION_URL: no estamos en un deployment real de
  // Vercel (ej. `next dev` local para pruebas). Nunca puede ocurrir en un
  // deployment PROD real -- ahí Vercel siempre inyecta esta variable.
  return process.env.NODE_ENV !== "production";
}

/** Autoridad única: ¿puede existir la puerta DEV en este runtime? */
export function isDevDoorEligible() {
  if (process.env.RIFEX_DEV_ADMIN_DOOR !== "on") return false;
  if (!projectIdentityCheck()) return false;
  if (!isDevStage()) return false;
  return true;
}

export function devDoorCookieName() {
  return COOKIE_NAME;
}

function hashToken(rawToken) {
  return createHash("sha256").update(rawToken).digest("hex");
}

async function audit(action, detail) {
  try {
    await getSupabase().from("dev_admin_access_audit").insert({ action, detail: detail || null });
  } catch (e) {
    console.error("[devAdminDoor] audit insert failed (non-fatal):", e.message);
  }
}

/**
 * "Abrir la puerta": crea un enlace de un solo uso. Nunca se llama desde
 * una ruta HTTP desplegada -- solo desde scripts/dev-admin-door.js,
 * ejecutado localmente contra rifex-dev. Cero superficie pública nueva.
 */
export async function openDevDoor() {
  if (!isDevDoorEligible()) {
    throw new Error("dev_door_not_eligible_refusing_to_open");
  }
  const rawToken = randomBytes(TOKEN_BYTES).toString("base64url");
  const tokenHash = hashToken(rawToken);
  const { data, error } = await getSupabase()
    .from("dev_admin_access_tokens")
    .insert({ token_hash: tokenHash })
    .select("id, expires_at")
    .single();
  if (error) throw new Error(`dev_door_open_failed: ${error.message}`);
  await audit("opened", { token_id: data.id, expires_at: data.expires_at });
  return { rawToken, tokenId: data.id, expiresAt: data.expires_at };
}

/**
 * "Cerrar la puerta": revoca de inmediato todo lo que quede vivo -- tokens
 * sin canjear Y sesiones ya emitidas. Después de esto, ni un enlace ya
 * entregado ni una sesión ya activa vuelven a servir para nada.
 */
export async function closeDevDoor() {
  const nowIso = new Date().toISOString();
  const [tokensRes, sessionsRes] = await Promise.all([
    getSupabase()
      .from("dev_admin_access_tokens")
      .update({ revoked_at: nowIso })
      .is("revoked_at", null)
      .is("used_at", null)
      .select("id"),
    getSupabase()
      .from("dev_admin_sessions")
      .update({ revoked_at: nowIso })
      .is("revoked_at", null)
      .select("id"),
  ]);
  if (tokensRes.error) throw new Error(`dev_door_close_failed_tokens: ${tokensRes.error.message}`);
  if (sessionsRes.error) throw new Error(`dev_door_close_failed_sessions: ${sessionsRes.error.message}`);
  await audit("closed", {
    tokens_revoked: (tokensRes.data || []).length,
    sessions_revoked: (sessionsRes.data || []).length,
  });
  return { tokensRevoked: (tokensRes.data || []).length, sessionsRevoked: (sessionsRes.data || []).length };
}

/**
 * Canjea un enlace de un solo uso por una sesión real. Devuelve el id de
 * sesión (valor literal de la cookie) o null si el token es inválido,
 * expirado, ya usado o revocado. Nunca lanza por un token malo -- eso es
 * tráfico esperado (enlaces viejos, reintentos), no una condición de error.
 */
export async function redeemDevDoorToken(rawToken) {
  if (!isDevDoorEligible()) return null;
  if (!rawToken || typeof rawToken !== "string") return null;

  const tokenHash = hashToken(rawToken);
  const { data: tokenRow, error: findErr } = await getSupabase()
    .from("dev_admin_access_tokens")
    .select("id, expires_at, used_at, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (findErr || !tokenRow) {
    await audit("denied", { reason: "token_not_found" });
    return null;
  }
  if (tokenRow.used_at || tokenRow.revoked_at || new Date(tokenRow.expires_at) <= new Date()) {
    await audit("denied", { reason: "token_expired_or_used", token_id: tokenRow.id });
    return null;
  }

  const { error: markErr } = await getSupabase()
    .from("dev_admin_access_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", tokenRow.id)
    .is("used_at", null);
  if (markErr) {
    await audit("denied", { reason: "token_mark_used_failed", token_id: tokenRow.id });
    return null;
  }

  const { data: session, error: sessErr } = await getSupabase()
    .from("dev_admin_sessions")
    .insert({ source_token_id: tokenRow.id })
    .select("id, expires_at")
    .single();
  if (sessErr) {
    await audit("denied", { reason: "session_create_failed", token_id: tokenRow.id });
    return null;
  }

  await audit("redeemed", { token_id: tokenRow.id, session_id: session.id });
  return { sessionId: session.id, expiresAt: session.expires_at };
}

/**
 * Valida una sesión ya emitida (el valor de la cookie). Vuelve a chequear
 * isDevDoorEligible() en cada llamada -- si la puerta deja de ser elegible
 * en este runtime (ej. alguien desactivó la variable), una cookie ya
 * emitida deja de servir de inmediato, sin esperar a que expire.
 */
export async function validateDevDoorSession(sessionId) {
  if (!isDevDoorEligible()) return false;
  if (!sessionId || typeof sessionId !== "string") return false;

  const { data, error } = await getSupabase()
    .from("dev_admin_sessions")
    .select("id, expires_at, revoked_at")
    .eq("id", sessionId)
    .maybeSingle();

  if (error || !data) return false;
  if (data.revoked_at) return false;
  if (new Date(data.expires_at) <= new Date()) return false;
  return true;
}

// src/lib/devKeepalive.js
// Keepalive de Supabase DEV (solo servidor).
//
// Objetivo: evitar que el proyecto Supabase DEV se pause por inactividad
// mediante una consulta real y mínima, disparada desde fuera de Supabase
// (repositorio privado rifex-dev-keepalive, GitHub Actions, cada ~3 días).
//
//   - Solo existe en Rifex DEV: exige isDevStage() Y que la URL de Supabase
//     sea exactamente la del proyecto DEV. En cualquier otro entorno la ruta
//     responde 404, aunque tenga el secreto.
//   - Protegida por RIFEX_DEV_KEEPALIVE_SECRET (al menos 32 caracteres), en
//     `Authorization: Bearer <secreto>`, comparado en tiempo constante. Sin
//     secreto configurado: 404. Secreto ausente o incorrecto: 401.
//   - Consulta: HEAD de solo lectura sobre `events` con el cliente anónimo
//     (sin service_role). Respeta RLS, no devuelve filas ni conteos y no
//     escribe nada.
//   - Respuesta: solo { ok, supabase, durationMs, at }. Nunca filas, ids,
//     mensajes de error de Supabase, URL ni secretos.
//   - Timeout corto: si Supabase no responde a tiempo, 503 con
//     supabase: 'timeout'.
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { isDevStage } from './environmentPolicy.js';

export const DEV_SUPABASE_HOST = 'nwxrvwbzqbhznscyirbq.supabase.co';
export const KEEPALIVE_MIN_SECRET = 32;
export const KEEPALIVE_TIMEOUT_MS = 5000;
export const KEEPALIVE_TABLE = 'events';

export function isDevKeepaliveEnvironment(env = process.env, devStage = isDevStage) {
  if (!devStage()) return false;
  try {
    return new URL(String(env.NEXT_PUBLIC_SUPABASE_URL || '')).hostname === DEV_SUPABASE_HOST;
  } catch {
    return false;
  }
}

export function readKeepaliveSecret(env = process.env) {
  const secret = String(env.RIFEX_DEV_KEEPALIVE_SECRET || '').trim();
  return secret.length >= KEEPALIVE_MIN_SECRET ? secret : null;
}

function digest(value) {
  return crypto.createHash('sha256').update(String(value)).digest();
}

// Compara en tiempo constante (sobre hashes de igual largo).
export function isAuthorized(header, secret) {
  if (!secret) return false;
  const raw = Array.isArray(header) ? header[0] : header;
  const match = /^Bearer\s+(.+)$/.exec(String(raw || '').trim());
  if (!match) return false;
  return crypto.timingSafeEqual(digest(match[1].trim()), digest(secret));
}

function defaultProbe({ signal, env = process.env }) {
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client.from(KEEPALIVE_TABLE).select('id', { head: true }).limit(1).abortSignal(signal);
}

// Ejecuta la consulta con timeout. Devuelve 'ok', 'error' o 'timeout'.
export async function runKeepaliveProbe({ probe = defaultProbe, timeoutMs = KEEPALIVE_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve('timeout');
    }, timeoutMs);
  });
  const query = Promise.resolve()
    .then(() => probe({ signal: controller.signal }))
    .then((r) => (!r?.error && (r?.status === 200 || r?.status === 206) ? 'ok' : 'error'))
    .catch(() => (controller.signal.aborted ? 'timeout' : 'error'));
  try {
    return await Promise.race([query, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function send(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  return res.status(status).json(body);
}

export function createDevKeepaliveRoute({
  env = process.env,
  devStage = isDevStage,
  probe = defaultProbe,
  timeoutMs = KEEPALIVE_TIMEOUT_MS,
  clock = Date.now,
  log = (line) => console.info(line),
} = {}) {
  return async function devKeepaliveRoute(req, res) {
    const secret = readKeepaliveSecret(env);
    if (!isDevKeepaliveEnvironment(env, devStage) || !secret) return res.status(404).end();
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return send(res, 405, { ok: false, error: 'method_not_allowed' });
    }
    if (!isAuthorized(req.headers?.authorization, secret)) return send(res, 401, { ok: false, error: 'unauthorized' });

    const started = clock();
    const supabase = await runKeepaliveProbe({ probe: (args) => probe({ ...args, env }), timeoutMs });
    const durationMs = Math.max(0, clock() - started);
    const at = new Date(clock()).toISOString();
    const ok = supabase === 'ok';
    // Una línea agregada, sin secretos, IP, encabezados ni detalles de Supabase.
    log(`dev-keepalive supabase=${supabase} durationMs=${durationMs}`);
    return send(res, ok ? 200 : 503, { ok, supabase, durationMs, at });
  };
}

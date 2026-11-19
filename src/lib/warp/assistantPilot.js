// src/lib/warp/assistantPilot.js
// Piloto LOCAL del asistente de Warp en Rifex (SOLO SERVIDOR).
//
//   - Habilitado únicamente con la variable privada RIFEX_WARP_PILOT=on.
//     Sin ella, la página piloto y sus rutas responden 404 (no existen).
//   - La Site API Key de Warp se lee solo en el servidor: desde el archivo
//     indicado por WARP_AI_API_KEY_FILE (equipo local, fuera del repositorio)
//     o, si no hay archivo, desde la variable privada WARP_AI_API_KEY (Vercel,
//     marcada como Sensitive). Nunca va en NEXT_PUBLIC_*, nunca se registra en
//     logs y nunca llega al navegador.
//   - Límite de mensajes en las rutas del chat (tabla compartida de Rifex,
//     20 por 10 minutos por scope), para acotar el uso del presupuesto de IA
//     del piloto. La clave nunca lleva la IP en claro: es una referencia HMAC
//     diaria (`warp-pilot-<scope>:h:<32 hex>`) calculada solo en el servidor
//     con el secreto privado RIFEX_RATE_LIMIT_KEY_SECRET, distinto del de
//     identidad de Warp. Sin ese secreto o sin IP confiable no se guarda nada
//     y la ruta responde 503.
//   - Los handlers de `@warp-ai/assistant` (createWarpChatRouteHandler /
//     createWarpReadActionRouteHandler) se usan sin cambios; aquí solo se
//     adaptan al Pages Router de Rifex (Request/Response web).
//   - Sin lógica de Rifex en Warp: el asistente solo lee las capacidades
//     públicas del Connector.
//   - Si falta la configuración responde 503 ASSISTANT_NOT_CONFIGURED; si Warp
//     no responde, el handler del paquete devuelve su error controlado. El
//     resto del sitio no depende del piloto.
//   - Identidad seudónima de uso (Assistant 0.7.6, `usageIdentity`): el
//     servidor calcula una referencia opaca diaria a partir de la IP que
//     escribe Vercel (`x-real-ip`) y del secreto privado
//     WARP_USAGE_IDENTITY_SECRET, y Warp la usa para el límite por persona.
//     Es una identidad de red, no de una persona: quienes comparten IP pública
//     comparten el límite. Sin secreto válido o sin IP confiable no se llama
//     a Warp (503). Nunca se reenvían IP, cookies, sesión, User-Agent, correo
//     ni ids; solo `x-real-ip` llega al handler interno del paquete.
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import { checkRateLimit } from '../rateLimit.js';

export const MAX_PILOT_BODY_BYTES = 16 * 1024;
export const PILOT_RATE_LIMIT_MAX = 20;
export const PILOT_RATE_LIMIT_WINDOW_SECONDS = 600;

export const USAGE_IDENTITY_MIN_SECRET = 32;
export const USAGE_IDENTITY_TRUSTED_PROXY = 'vercel';
export const TRUSTED_IP_HEADER = 'x-real-ip';
// Mismo formato que acepta el paquete (usageIdentity.js): IPv4 o IPv6.
const TRUSTED_IP_PATTERN = /^(?:[0-9]{1,3}(?:\.[0-9]{1,3}){3}|[0-9a-fA-F:]{2,39})$/;

export const RATE_LIMIT_KEY_MIN_SECRET = 32;
export const RATE_LIMIT_KEY_VERSION = 'rifex-rl:v1';
export const RATE_LIMIT_KEY_PURPOSE = 'warp-pilot';
export const RATE_LIMIT_REF_LENGTH = 32;

export const ASSISTANT_NOT_CONFIGURED = Object.freeze({
  code: 'ASSISTANT_NOT_CONFIGURED',
  message: 'El asistente no está disponible en este momento.',
});

export function isWarpPilotEnabled(env = process.env) {
  return env.RIFEX_WARP_PILOT === 'on';
}

function readSiteKey(env) {
  const file = String(env.WARP_AI_API_KEY_FILE || '').trim();
  if (!file) return String(env.WARP_AI_API_KEY || '').trim() || null;
  const resolved = file.startsWith('~/') ? `${os.homedir()}${file.slice(1)}` : file;
  try {
    const key = fs.readFileSync(resolved, 'utf8').trim();
    return key || null;
  } catch {
    return null;
  }
}

// Único lugar que lee WARP_USAGE_IDENTITY_SECRET. Sin URL, sin clave o sin un
// secreto de al menos 32 caracteres devuelve null: botón oculto y rutas del
// chat con 503. Nunca se usa el asistente sin identidad.
export function readPilotConfig(env = process.env) {
  const apiUrl = String(env.WARP_AI_API_URL || '').trim();
  const apiKey = readSiteKey(env);
  const secret = String(env.WARP_USAGE_IDENTITY_SECRET || '').trim();
  if (!apiUrl || !apiKey || secret.length < USAGE_IDENTITY_MIN_SECRET) return null;
  return { apiUrl, apiKey, usageIdentity: { secret, trustedProxy: USAGE_IDENTITY_TRUSTED_PROXY, required: true } };
}

// Único lugar que lee RIFEX_RATE_LIMIT_KEY_SECRET. Sin secreto, con menos de
// 32 caracteres o igual al secreto de identidad de Warp devuelve null: no se
// guarda nada en el limitador y el asistente queda apagado (503).
export function readRateLimitKeySecret(env = process.env) {
  const secret = String(env.RIFEX_RATE_LIMIT_KEY_SECRET || '').trim();
  if (secret.length < RATE_LIMIT_KEY_MIN_SECRET) return null;
  if (secret === String(env.WARP_USAGE_IDENTITY_SECRET || '').trim()) return null;
  return secret;
}

function utcDay(now) {
  return new Date(now).toISOString().slice(0, 10);
}

// Referencia opaca del limitador: primeros 32 caracteres hex de
// HMAC-SHA256(secreto, "rifex-rl:v1|<día UTC>|warp-pilot|<ip confiable>").
// Cambia cada día UTC y con cada secreto; nunca contiene la IP.
export function rateLimitRef(secret, ip, now = Date.now()) {
  return crypto
    .createHmac('sha256', secret)
    .update(`${RATE_LIMIT_KEY_VERSION}|${utcDay(now)}|${RATE_LIMIT_KEY_PURPOSE}|${ip}`)
    .digest('hex')
    .slice(0, RATE_LIMIT_REF_LENGTH);
}

export function pilotRateLimitKey(scope, ref) {
  return `warp-pilot-${scope}:h:${ref}`;
}

// IP que escribe la plataforma (Vercel sobrescribe `x-real-ip`), o null si
// falta o no tiene formato de IP. Nunca se usa x-forwarded-for.
export function trustedClientIp(req) {
  const raw = req?.headers?.[TRUSTED_IP_HEADER];
  const ip = String(Array.isArray(raw) ? raw[0] : raw || '').split(',')[0].trim();
  return TRUSTED_IP_PATTERN.test(ip) ? ip : null;
}

function sendJson(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

function readRawBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('too_large'), { code: 'TOO_LARGE' }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// Ruta POST del Pages Router sobre un handler web del Assistant.
// `factory` es createWarpChatRouteHandler o createWarpReadActionRouteHandler.
export function createPilotPostRoute(factory, options = {}, { readConfig = readPilotConfig, readRateLimitSecret = readRateLimitKeySecret, enabled = isWarpPilotEnabled, rateLimit = checkRateLimit, scope = 'chat', clock = Date.now } = {}) {
  let handler = null;
  return async function pilotRoute(req, res) {
    if (!enabled()) return res.status(404).end();
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Only POST is supported.' } });
    }
    // Sin secreto del limitador no se guarda nada ni se llama a Warp.
    const rlSecret = readRateLimitSecret();
    if (!rlSecret) return sendJson(res, 503, { error: ASSISTANT_NOT_CONFIGURED });
    if (!handler) {
      const config = readConfig();
      if (!config) return sendJson(res, 503, { error: ASSISTANT_NOT_CONFIGURED });
      try {
        handler = factory({ ...config, ...options });
      } catch {
        return sendJson(res, 503, { error: ASSISTANT_NOT_CONFIGURED });
      }
    }
    // Sin IP confiable no hay identidad: no se guarda nada ni se llama a Warp.
    const ip = trustedClientIp(req);
    if (!ip) return sendJson(res, 503, { error: ASSISTANT_NOT_CONFIGURED });

    const rl = await rateLimit(pilotRateLimitKey(scope, rateLimitRef(rlSecret, ip, clock())), PILOT_RATE_LIMIT_MAX, PILOT_RATE_LIMIT_WINDOW_SECONDS);
    if (!rl.allowed) {
      res.setHeader('Retry-After', String(rl.retryAfterSeconds));
      return sendJson(res, 429, { error: { code: 'RATE_LIMITED', message: 'Demasiados mensajes. Intenta nuevamente en unos minutos.' } });
    }

    let body;
    try {
      body = await readRawBody(req, MAX_PILOT_BODY_BYTES);
    } catch (err) {
      if (err?.code === 'TOO_LARGE') return sendJson(res, 413, { error: { code: 'PAYLOAD_TOO_LARGE', message: 'The request is too large.' } });
      return sendJson(res, 400, { error: { code: 'INVALID_REQUEST', message: 'The request could not be read.' } });
    }

    try {
      // Solo content-type y x-real-ip: ningún otro encabezado del navegador
      // (cookies, User-Agent, x-forwarded-for, x-warp-client-ref) llega al
      // handler del paquete.
      const request = new Request('http://rifex.internal/api/warp/chat', {
        method: 'POST',
        headers: { 'content-type': String(req.headers['content-type'] || 'application/json'), [TRUSTED_IP_HEADER]: ip },
        body,
      });
      const response = await handler(request);
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
      res.status(response.status);
      return res.send(await response.text());
    } catch {
      return sendJson(res, 502, { error: ASSISTANT_NOT_CONFIGURED });
    }
  };
}

// GET /api/warp/assistant — estado para el botón global del asistente
// (src/components/warp/WarpAssistantGlobal.jsx). Solo { enabled: boolean }:
// nunca la URL de Warp ni la key. Sin RIFEX_WARP_PILOT=on, el botón no
// aparece en ninguna página.
export function assistantStatus({ enabled = isWarpPilotEnabled, readConfig = readPilotConfig, readRateLimitSecret = readRateLimitKeySecret } = {}) {
  return { enabled: Boolean(enabled() && readConfig() && readRateLimitSecret()) };
}

export function createAssistantStatusRoute(options = {}) {
  return function assistantStatusRoute(req, res) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return sendJson(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Only GET is supported.' } });
    }
    return sendJson(res, 200, assistantStatus(options));
  };
}

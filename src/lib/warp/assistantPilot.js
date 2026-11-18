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
//   - Límite de mensajes por IP en las rutas del chat (tabla compartida de
//     Rifex), para acotar el uso del presupuesto de IA del piloto.
//   - Los handlers de `@warp-ai/assistant` (createWarpChatRouteHandler /
//     createWarpReadActionRouteHandler) se usan sin cambios; aquí solo se
//     adaptan al Pages Router de Rifex (Request/Response web).
//   - Sin lógica de Rifex en Warp: el asistente solo lee las capacidades
//     públicas del Connector.
//   - Si falta la configuración responde 503 ASSISTANT_NOT_CONFIGURED; si Warp
//     no responde, el handler del paquete devuelve su error controlado. El
//     resto del sitio no depende del piloto.
import fs from 'fs';
import os from 'os';
import { checkRateLimit, resolveClientIp } from '../rateLimit.js';

export const MAX_PILOT_BODY_BYTES = 16 * 1024;
export const PILOT_RATE_LIMIT_MAX = 20;
export const PILOT_RATE_LIMIT_WINDOW_SECONDS = 600;

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

export function readPilotConfig(env = process.env) {
  const apiUrl = String(env.WARP_AI_API_URL || '').trim();
  const apiKey = readSiteKey(env);
  return apiUrl && apiKey ? { apiUrl, apiKey } : null;
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
export function createPilotPostRoute(factory, options = {}, { readConfig = readPilotConfig, enabled = isWarpPilotEnabled, rateLimit = checkRateLimit, scope = 'chat' } = {}) {
  let handler = null;
  return async function pilotRoute(req, res) {
    if (!enabled()) return res.status(404).end();
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Only POST is supported.' } });
    }
    const rl = await rateLimit(`warp-pilot-${scope}:ip:${resolveClientIp(req)}`, PILOT_RATE_LIMIT_MAX, PILOT_RATE_LIMIT_WINDOW_SECONDS);
    if (!rl.allowed) {
      res.setHeader('Retry-After', String(rl.retryAfterSeconds));
      return sendJson(res, 429, { error: { code: 'RATE_LIMITED', message: 'Demasiados mensajes. Intenta nuevamente en unos minutos.' } });
    }
    if (!handler) {
      const config = readConfig();
      if (!config) return sendJson(res, 503, { error: ASSISTANT_NOT_CONFIGURED });
      handler = factory({ ...config, ...options });
    }

    let body;
    try {
      body = await readRawBody(req, MAX_PILOT_BODY_BYTES);
    } catch (err) {
      if (err?.code === 'TOO_LARGE') return sendJson(res, 413, { error: { code: 'PAYLOAD_TOO_LARGE', message: 'The request is too large.' } });
      return sendJson(res, 400, { error: { code: 'INVALID_REQUEST', message: 'The request could not be read.' } });
    }

    try {
      const request = new Request('http://rifex.internal/api/warp/chat', {
        method: 'POST',
        headers: { 'content-type': String(req.headers['content-type'] || 'application/json') },
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
export function assistantStatus({ enabled = isWarpPilotEnabled, readConfig = readPilotConfig } = {}) {
  return { enabled: Boolean(enabled() && readConfig()) };
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

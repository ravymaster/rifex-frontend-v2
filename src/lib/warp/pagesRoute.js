// src/lib/warp/pagesRoute.js
// Adaptador del Connector de Warp (handlers Web Request/Response del SDK
// `@warp-ai/connector`) al Pages Router de Rifex. No cambia el protocolo:
// solo agrega, alrededor del handler del SDK,
//   - solo GET (405 en otro método; el cuerpo nunca se lee),
//   - límite de tamaño de la URL (414),
//   - límite de intentos por IP con la tabla compartida de Rifex (429),
//   - tiempo máximo de respuesta (504),
//   - identificador de solicitud no sensible (X-Request-Id),
//   - encabezados no-store / noindex,
//   - un log por solicitud sin argumentos, IP, secretos ni datos personales.
import crypto from 'crypto';
import { checkRateLimit, resolveClientIp } from '../rateLimit.js';

export const MAX_URL_LENGTH = 2048;
export const RATE_LIMIT_MAX = 120;
export const RATE_LIMIT_WINDOW_SECONDS = 60;
export const HANDLER_TIMEOUT_MS = 10_000;

function sendError(res, status, code, message) {
  return res.status(status).json({ success: false, error: { code, message } });
}

export function createPagesRoute(getWebHandler, { scope, rateLimit = checkRateLimit, timeoutMs = HANDLER_TIMEOUT_MS } = {}) {
  return async function warpPagesRoute(req, res) {
    const started = Date.now();
    const requestId = crypto.randomBytes(8).toString('hex');
    const capability = typeof req.query?.capabilityId === 'string' ? req.query.capabilityId.slice(0, 80) : undefined;
    res.setHeader('X-Request-Id', requestId);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');

    const finish = (status) => {
      console.info(JSON.stringify({ scope, requestId, capability, status, ms: Date.now() - started }));
    };

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      finish(405);
      return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Only GET is supported.');
    }
    if (String(req.url || '').length > MAX_URL_LENGTH) {
      finish(414);
      return sendError(res, 414, 'REQUEST_TOO_LARGE', 'The request is too large.');
    }

    const rl = await rateLimit(`warp-connector:ip:${resolveClientIp(req)}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_SECONDS);
    if (!rl.allowed) {
      res.setHeader('Retry-After', String(rl.retryAfterSeconds));
      finish(429);
      return sendError(res, 429, 'RATE_LIMITED', 'Too many requests. Try again later.');
    }

    let timer;
    try {
      const request = new Request(`http://rifex.internal${req.url}`, { method: 'GET' });
      const response = await Promise.race([
        getWebHandler()(request, { params: { capabilityId: capability } }),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'TIMEOUT' })), timeoutMs);
        }),
      ]);
      res.status(response.status);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      finish(response.status);
      return res.send(await response.text());
    } catch (err) {
      if (err?.code === 'TIMEOUT') {
        finish(504);
        return sendError(res, 504, 'TIMEOUT', 'The request took too long.');
      }
      finish(500);
      return sendError(res, 500, 'INTERNAL_ERROR', 'Unexpected error.');
    } finally {
      clearTimeout(timer);
    }
  };
}

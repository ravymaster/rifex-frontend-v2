// src/lib/parseRegistrationQr.js
// INSCRIPCIONES V1 — parseo ESTRICTO de lo que la cámara del scanner
// decodifica, hermano de parseEventQr.js. qr_token de Inscripciones son
// DOS UUID sin guiones concatenados (64 hex, ver
// db/migrations/2026-09-04_inscripciones1_foundation.sql), a diferencia
// del token de 32 hex de Eventos — nunca reutilizar el regex de Eventos
// acá, un token de 32 caracteres nunca debe validar como Inscripciones.
const TOKEN_RE = /^[a-f0-9]{64}$/;
const PATH_RE = /^\/i\/([a-f0-9]{64})$/;

/**
 * @param {string} raw texto decodificado del QR por la cámara.
 * @param {string|null} expectedOrigin origin esperado del propio
 *   despliegue — una URL absoluta con otro origin siempre se rechaza.
 * @returns {string|null} el qr_token extraído, o null si es inválido.
 */
export function parseRegistrationQrPayload(raw, expectedOrigin) {
  const text = String(raw || '').trim();
  if (!text) return null;

  if (TOKEN_RE.test(text)) return text;

  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }

  if (expectedOrigin && url.origin !== expectedOrigin) return null;

  const match = url.pathname.match(PATH_RE);
  return match ? match[1] : null;
}

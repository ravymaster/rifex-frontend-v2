// src/lib/parseEventQr.js
// EVENT-4 — parseo ESTRICTO de lo que la cámara del scanner decodifica.
// Nunca navega, nunca sigue una URL, nunca ejecuta nada — solo intenta
// extraer un qr_token Rifex válido (32 hex, ver
// db/migrations/2026-08-25_event3_tickets_qr.sql) de los dos formatos que
// el propio QR de EVENT-3 puede traer: la URL completa `/t/<token>` que
// genera qr.png.js, o el token a secas. Cualquier otra cosa —incluida
// cualquier URL con host distinto al propio despliegue— es "malformado".
const TOKEN_RE = /^[a-f0-9]{32}$/;
const PATH_RE = /^\/t\/([a-f0-9]{32})$/;

/**
 * @param {string} raw texto decodificado del QR por la cámara.
 * @param {string|null} expectedOrigin origin esperado (window.location.origin
 *   del propio scanner) — si el texto es una URL absoluta con un origin
 *   distinto, se rechaza aunque el path "parezca" correcto.
 * @returns {string|null} el qr_token extraído, o null si es inválido.
 */
export function parseEventQrPayload(raw, expectedOrigin) {
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

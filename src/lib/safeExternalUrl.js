// src/lib/safeExternalUrl.js
// MEDIDOR QR V1 — extensión "destino opcional post-respuesta": valida
// una URL de destino externa server-side. Nunca un regex hecho a mano —
// usa el parser real de la plataforma (WHATWG URL) y restringe a un
// allowlist explícito de protocolos. javascript:/data:/file:/mailto:
// y cualquier otro esquema quedan rechazados por no estar en el
// allowlist, nunca por un blacklist (más fácil de eludir).
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const MAX_URL_LENGTH = 2000;

export function parseSafeExternalUrl(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return { ok: false, error: 'missing_url' };
  if (trimmed.length > MAX_URL_LENGTH) return { ok: false, error: 'url_too_long' };
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: 'invalid_url' };
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) return { ok: false, error: 'unsupported_protocol' };
  if (!url.hostname) return { ok: false, error: 'invalid_url' };
  // url.href preserva path/query/UTM/fragment completos — nunca se
  // reconstruye la URL a mano acá.
  return { ok: true, href: url.href, hostname: url.hostname };
}

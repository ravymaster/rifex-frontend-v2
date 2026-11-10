// src/lib/warp/publicOrigin.js
// Origen público del sitio para los enlaces que entrega el Connector de Warp.
// Sale solo de la configuración del servidor (NEXT_PUBLIC_BASE_URL, distinta
// en cada ambiente: DEV https://rifex-frontend-main.vercel.app, PROD
// https://rifex.pro), nunca de cabeceras de la solicitud (Host,
// X-Forwarded-Host), que el visitante puede manipular.
//
// Se acepta solo un origen https (o http en localhost para desarrollo), sin
// credenciales; ruta, query y fragmento se descartan. Si falta o es inválido
// se usa el dominio canónico de producción, igual que el resto del sitio.

export const CANONICAL_ORIGIN = 'https://rifex.pro';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function publicOrigin(value = process.env.NEXT_PUBLIC_BASE_URL) {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    return CANONICAL_ORIGIN;
  }
  if (url.username || url.password) return CANONICAL_ORIGIN;
  const local = LOCAL_HOSTS.has(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) return CANONICAL_ORIGIN;
  return url.origin;
}

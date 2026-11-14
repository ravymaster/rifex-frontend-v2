// src/lib/raffleExposure.js
// Exposición pública de Rifas (2026-11). Control del servidor por
// entorno, con tres modos exactos (en minúscula):
//   RIFEX_RAFFLES_PUBLIC=on     → acceso directo (pensado para DEV).
//   RIFEX_RAFFLES_PUBLIC=gated  → puerta neutra: cada visitante confirma
//                                 que desea continuar antes de ver una
//                                 Rifa compartida (ver raffleShareAccess.js).
//   ausente, vacía, `off` o cualquier otro valor → deshabilitada (410).
// `gated` exige además RIFEX_RAFFLES_GATE_SECRET válido (ver
// isValidGateSecret); si falta o es inválido, el modo efectivo es `off`.
// Ambas variables son privadas del servidor: sin prefijo NEXT_PUBLIC_,
// nunca llegan al bundle del navegador (solo se leen en
// getServerSideProps y en las APIs).
//
// La decisión NUNCA depende del user-agent, la IP ni los encabezados del
// visitante: una persona anónima y un crawler reciben exactamente la
// misma respuesta. En `gated` lo único que cambia la respuesta es la
// cookie de autorización que el propio visitante obtiene al confirmar.
// Con la exposición deshabilitada, las rutas públicas de Rifas responden
// 410 Gone sin título, premio, imágenes, ganador ni metadata, y sin
// redirigir. La gestión privada (panel del creador, pagos, webhooks,
// conciliación y sorteo interno) no pasa por aquí.

export const RAFFLE_EXPOSURE_MODES = Object.freeze(['on', 'gated', 'off']);

// Mínimo de caracteres del secreto: 43 es el largo de 32 bytes aleatorios
// en base64 (`openssl rand -base64 32` produce 44; `openssl rand -hex 32`
// produce 64). La variedad mínima descarta valores triviales repetidos.
const GATE_SECRET_MIN_LENGTH = 43;
const GATE_SECRET_MIN_DISTINCT_CHARS = 10;

export function isValidGateSecret(value) {
  if (typeof value !== 'string') return false;
  if (value.length < GATE_SECRET_MIN_LENGTH) return false;
  if (/\s/.test(value)) return false;
  return new Set(value).size >= GATE_SECRET_MIN_DISTINCT_CHARS;
}

// Secreto de la puerta, solo si es válido; nunca se registra ni se expone.
export function getGateSecret(env = process.env) {
  const value = env.RIFEX_RAFFLES_GATE_SECRET;
  return isValidGateSecret(value) ? value : null;
}

export function getRaffleExposureMode(env = process.env) {
  const value = String(env.RIFEX_RAFFLES_PUBLIC ?? '').trim();
  if (value === 'on') return 'on';
  if (value === 'gated') return getGateSecret(env) ? 'gated' : 'off';
  return 'off';
}

// Acceso directo (modo `on`): listados del perfil y rutas sin puerta.
export function isRafflePublicExposureEnabled(env = process.env) {
  return getRaffleExposureMode(env) === 'on';
}

export const RAFFLE_GONE_HEADERS = Object.freeze({
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Cache-Control': 'public, max-age=300',
});

// Respuestas del modo `gated`: dependen de la cookie del visitante, así
// que nunca se guardan en caché compartida.
export const RAFFLE_GATED_HEADERS = Object.freeze({
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Cache-Control': 'private, no-store',
});

function applyHeaders(res, headers) {
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
}

export function applyGatedHeaders(res) {
  applyHeaders(res, RAFFLE_GATED_HEADERS);
}

// APIs: 410 con un cuerpo neutro.
export function sendRaffleGone(res) {
  applyHeaders(res, RAFFLE_GONE_HEADERS);
  return res.status(410).json({ ok: false, error: 'gone' });
}

// Páginas (getServerSideProps): 410 y una página neutra (ver
// RaffleGonePage), sin consultar la rifa.
export function raffleGoneProps(res) {
  applyHeaders(res, RAFFLE_GONE_HEADERS);
  res.statusCode = 410;
  return { props: { raffleGone: true } };
}

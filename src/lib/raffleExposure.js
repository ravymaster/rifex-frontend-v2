// src/lib/raffleExposure.js
// Exposición pública de Rifas (2026-11). Control del servidor por
// entorno:
//   RIFEX_RAFFLES_PUBLIC=off  → exposición pública deshabilitada.
//   cualquier otro valor o sin definir → habilitada (comportamiento actual).
//
// La decisión NUNCA depende del visitante (user-agent, IP, cookies ni
// encabezados): una persona anónima y un crawler reciben exactamente la
// misma respuesta. Con la exposición deshabilitada, las rutas públicas de
// Rifas responden 410 Gone sin título, premio, imágenes, ganador ni
// metadata, y sin redirigir. La gestión privada (panel del creador,
// pagos, webhooks, conciliación y sorteo interno) no pasa por aquí.

export function isRafflePublicExposureEnabled(env = process.env) {
  return String(env.RIFEX_RAFFLES_PUBLIC ?? 'on').trim().toLowerCase() !== 'off';
}

export const RAFFLE_GONE_HEADERS = Object.freeze({
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Cache-Control': 'public, max-age=300',
});

function applyGoneHeaders(res) {
  for (const [name, value] of Object.entries(RAFFLE_GONE_HEADERS)) res.setHeader(name, value);
}

// APIs: 410 con un cuerpo neutro.
export function sendRaffleGone(res) {
  applyGoneHeaders(res);
  return res.status(410).json({ ok: false, error: 'gone' });
}

// Páginas (getServerSideProps): 410 y una página neutra (ver
// RaffleGonePage), sin consultar la rifa.
export function raffleGoneProps(res) {
  applyGoneHeaders(res);
  res.statusCode = 410;
  return { props: { raffleGone: true } };
}

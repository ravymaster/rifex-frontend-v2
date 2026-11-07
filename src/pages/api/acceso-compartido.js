// src/pages/api/acceso-compartido.js
// Botón "Continuar" de la puerta neutra (src/lib/raffleShareAccess.js).
// Formulario HTML con POST, funciona sin JavaScript:
//   - acepta solo rutas internas de Rifas como retorno (sin redirecciones
//     externas); cualquier otra cosa → 400;
//   - límite de intentos por IP;
//   - emite la cookie firmada de esa Rifa y responde 303 al mismo enlace;
//   - repetir el POST solo renueva la misma cookie: no escribe datos ni
//     tiene otros efectos.
// Nunca registra cookies, secretos ni identificadores.
import { getRaffleExposureMode, getGateSecret, sendRaffleGone, applyGatedHeaders } from '@/lib/raffleExposure';
import { parseShareReturnPath, findRaffleForShare, buildShareAccessCookie } from '@/lib/raffleShareAccess';
import { checkRateLimit, resolveClientIp } from '@/lib/rateLimit';

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_SECONDS = 600;

function sendNeutral(res, status, message) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(status).send(
    '<!doctype html><html lang="es"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="robots" content="noindex, nofollow, noarchive">' +
    `<title>Rifex</title></head><body style="font-family:system-ui,sans-serif;padding:24px"><p>${message}</p>` +
    '<p><a href="/">Volver al inicio</a></p></body></html>'
  );
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const mode = getRaffleExposureMode();
  if (mode === 'off') return sendRaffleGone(res);
  applyGatedHeaders(res);

  const target = parseShareReturnPath(String(req.body?.to ?? ''));
  if (!target) return sendNeutral(res, 400, 'El enlace no es válido.');

  if (mode === 'on') return res.redirect(303, target.path);

  const ip = resolveClientIp(req);
  const rl = await checkRateLimit(`shared-access:ip:${ip}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_SECONDS);
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfterSeconds));
    return sendNeutral(res, 429, 'Demasiados intentos. Intenta nuevamente en unos minutos.');
  }

  const raffle = await findRaffleForShare(target.identifier);
  if (!raffle) return res.redirect(303, '/404');

  res.setHeader('Set-Cookie', buildShareAccessCookie(getGateSecret(), raffle.id));
  return res.redirect(303, target.path);
}

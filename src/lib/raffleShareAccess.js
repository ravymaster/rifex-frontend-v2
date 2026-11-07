// src/lib/raffleShareAccess.js
// Puerta neutra para Rifas compartidas (modo `gated`, ver raffleExposure.js).
// SOLO SERVIDOR: se importa únicamente desde getServerSideProps y APIs.
//
// Es una confirmación humana de acceso, no autenticación de identidad:
// quien abre un enlace compartido confirma que desea continuar y recibe
// una autorización temporal para ESA Rifa, en ese navegador:
//   - cookie por Rifa, firmada con HMAC-SHA256 y RIFEX_RAFFLES_GATE_SECRET;
//   - nombre de la cookie: hash truncado (no reversible) del id interno,
//     valor: `<vencimiento>.<firma>` — sin correos, nombres ni datos de
//     la Rifa; el id interno nunca sale del servidor;
//   - HttpOnly, SameSite=Lax, Secure en producción, Path=/ (páginas y
//     APIs de la Rifa), Max-Age de exactamente 30 días;
//   - autorizar la Rifa A no autoriza la Rifa B (la firma incluye el id);
//   - rotar el secreto revoca todas las autorizaciones emitidas.
// La decisión nunca mira el user-agent: con la misma cookie, la misma
// respuesta; sin cookie, la misma puerta para personas y crawlers.
//
// Enlace compartible neutral: /c/<share_token>. El token es público
// (forma parte del enlace), aleatorio de 128 bits y no se deriva de datos
// de la Rifa (db/migrations/2026-11-08a_raffles_share_token.sql). Solo
// sirve para llegar a la puerta: nunca reemplaza la cookie de acceso.
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { isUuid } from './idOrSlug.js';
import {
  getRaffleExposureMode,
  getGateSecret,
  applyGatedHeaders,
  raffleGoneProps,
  sendRaffleGone,
} from './raffleExposure.js';

export const SHARE_ACCESS_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
export const SHARE_ACCESS_COOKIE_PREFIX = 'rfx_sa_';
export const SHARE_ACCESS_ENDPOINT = '/api/acceso-compartido';

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/;
const SHARE_TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;
const QUERY_RE = /^\?[A-Za-z0-9_.~%=&+-]{0,400}$/;
const RETURN_PATH_RE = /^\/rifas\/([^/?#]+)(\/checkout)?(\?.*)?$/;
const SHARE_LINK_RE = /^\/c\/([^/?#]+)(\?.*)?$/;

let adminClient = null;
function getAdminClient() {
  if (!adminClient) {
    adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }
  return adminClient;
}

// UUID o slug amigable; cualquier otro formato se rechaza sin consultar.
export function isValidRaffleIdentifier(value) {
  return typeof value === 'string' && (isUuid(value) || SLUG_RE.test(value));
}

export function isValidShareToken(value) {
  return typeof value === 'string' && SHARE_TOKEN_RE.test(value);
}

export function shareLinkPath(token) {
  return isValidShareToken(token) ? `/c/${token}` : null;
}

// Ruta de retorno del botón Continuar: solo el enlace neutral /c/<token>
// o rutas internas de Rifas (/rifas/<id> y /rifas/<id>/checkout, con
// query string acotada). Nunca una URL absoluta, `//`, `\` ni otra
// sección del sitio. El enlace neutral vuelve siempre sin query string.
export function parseShareReturnPath(value) {
  if (typeof value !== 'string' || value.length > 600) return null;
  const link = SHARE_LINK_RE.exec(value);
  if (link) {
    const [, token, query = ''] = link;
    if (!isValidShareToken(token) || (query && !QUERY_RE.test(query))) return null;
    return { token, path: `/c/${token}` };
  }
  const m = RETURN_PATH_RE.exec(value);
  if (!m) return null;
  const [, identifier, checkout = '', query = ''] = m;
  if (!isValidRaffleIdentifier(identifier)) return null;
  if (query && !QUERY_RE.test(query)) return null;
  return { identifier, path: `/rifas/${identifier}${checkout}${query}` };
}

function hmac(secret, message) {
  return crypto.createHmac('sha256', secret).update(message).digest('base64url');
}

export function shareAccessCookieName(secret, raffleId) {
  return SHARE_ACCESS_COOKIE_PREFIX + hmac(secret, `rifex-share-name|v1|${raffleId}`).slice(0, 22);
}

function shareAccessSignature(secret, raffleId, exp) {
  return hmac(secret, `rifex-share-grant|v1|${raffleId}|${exp}`);
}

export function buildShareAccessCookie(secret, raffleId, { nowMs = Date.now(), secure = process.env.NODE_ENV === 'production' } = {}) {
  const exp = Math.floor(nowMs / 1000) + SHARE_ACCESS_MAX_AGE_SECONDS;
  const value = `${exp}.${shareAccessSignature(secret, raffleId, exp)}`;
  return [
    `${shareAccessCookieName(secret, raffleId)}=${value}`,
    `Max-Age=${SHARE_ACCESS_MAX_AGE_SECONDS}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

function readCookies(req) {
  const out = {};
  const header = req?.headers?.cookie;
  if (typeof header !== 'string') return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const name = part.slice(0, i).trim();
    if (name.startsWith(SHARE_ACCESS_COOKIE_PREFIX)) out[name] = part.slice(i + 1).trim();
  }
  return out;
}

// Solo las cookies de esta puerta, para reenviarlas en llamadas internas
// del servidor hacia sus propias APIs (nunca otras cookies del visitante).
export function shareAccessCookieHeader(req) {
  return Object.entries(readCookies(req)).map(([n, v]) => `${n}=${v}`).join('; ');
}

export function hasShareAccess(req, secret, raffleId, nowMs = Date.now()) {
  if (!secret || !raffleId) return false;
  const value = readCookies(req)[shareAccessCookieName(secret, raffleId)];
  if (!value) return false;
  const dot = value.indexOf('.');
  if (dot <= 0) return false;
  const expText = value.slice(0, dot);
  if (!/^\d{1,12}$/.test(expText)) return false;
  const exp = Number(expText);
  const nowSec = nowMs / 1000;
  if (!(exp > nowSec) || exp > nowSec + SHARE_ACCESS_MAX_AGE_SECONDS + 60) return false;
  const expected = Buffer.from(shareAccessSignature(secret, raffleId, exp));
  const given = Buffer.from(value.slice(dot + 1));
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

// Rifa por UUID o slug, solo con lo que la puerta necesita en el servidor.
// Una Rifa eliminada no existe para nadie de afuera.
export async function findRaffleForShare(identifier) {
  if (!isValidRaffleIdentifier(identifier)) return null;
  const { data, error } = await getAdminClient()
    .from('raffles')
    .select('id, creator_id, status')
    .eq(isUuid(identifier) ? 'id' : 'slug', identifier)
    .maybeSingle();
  if (error || !data || data.status === 'deleted') return null;
  return data;
}

// Rifa por token del enlace neutral, con el mismo criterio.
export async function findRaffleByShareToken(token) {
  if (!isValidShareToken(token)) return null;
  const { data, error } = await getAdminClient()
    .from('raffles')
    .select('id, slug, creator_id, status')
    .eq('share_token', token)
    .maybeSingle();
  if (error || !data || data.status === 'deleted') return null;
  return data;
}

// Destino de un retorno ya validado (parseShareReturnPath).
export function findRaffleForReturnTarget(target) {
  return target?.token ? findRaffleByShareToken(target.token) : findRaffleForShare(target?.identifier);
}

// Nombre público del organizador para la puerta: solo `nombre` del
// perfil público, recortado, y descartado si parece un correo, un RUT o
// un teléfono (7 o más dígitos). Nunca
// nombre legal, RUT, datos de Mercado Pago, correo, teléfono ni ids.
export function toGateOrganizerName(value) {
  const name = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!name || name.includes('@') || (name.match(/\d/g) || []).length >= 7) return null;
  return name.length > 60 ? `${name.slice(0, 59)}…` : name;
}

async function findGateOrganizerName(creatorId) {
  if (!creatorId) return null;
  const { data } = await getAdminClient()
    .from('users_profile')
    .select('nombre')
    .eq('user_id', creatorId)
    .maybeSingle();
  return toGateOrganizerName(data?.nombre);
}

// Páginas de Rifas (getServerSideProps). Devuelve:
//   { response }     → la página debe retornar esto tal cual (410, 404 o puerta);
//   { mode, raffle } → continuar con el flujo normal de la página.
export async function resolveRafflePageAccess({ req, res, resolvedUrl }, identifier) {
  const mode = getRaffleExposureMode();
  if (mode === 'off') return { response: raffleGoneProps(res) };
  if (mode === 'on') return { mode, raffle: null };

  applyGatedHeaders(res);
  if (!isValidRaffleIdentifier(identifier)) return { response: { notFound: true } };
  const secret = getGateSecret();
  const raffle = await findRaffleForShare(identifier);
  if (raffle && hasShareAccess(req, secret, raffle.id)) return { mode, raffle };

  const parsed = parseShareReturnPath(String(resolvedUrl || ''));
  const returnTo = parsed && parsed.identifier === identifier ? parsed.path : `/rifas/${identifier}`;
  const organizerName = raffle ? await findGateOrganizerName(raffle.creator_id) : null;
  return { response: { props: { sharedGate: { organizerName, returnTo } } } };
}

// Enlace neutral /c/<token> (getServerSideProps). Devuelve la respuesta
// completa de la página: 410, 404, la puerta o una redirección temporal a
// la ficha cuando el acceso ya está autorizado (o en modo `on`).
// Un token con formato inválido nunca consulta la base (404). En `gated`,
// un token inexistente muestra la misma puerta que una Rifa sin nombre
// público de organizador: antes de Continuar no se revela si existe.
export async function resolveShareLinkPage({ req, res }, token) {
  const mode = getRaffleExposureMode();
  if (mode === 'off') return raffleGoneProps(res);
  if (mode === 'gated') applyGatedHeaders(res);
  if (!isValidShareToken(token)) return { notFound: true };

  const raffle = await findRaffleByShareToken(token);
  const toRaffle = raffle && { redirect: { destination: `/rifas/${raffle.slug || raffle.id}`, permanent: false } };
  if (mode === 'on') return toRaffle || { notFound: true };
  if (raffle && hasShareAccess(req, getGateSecret(), raffle.id)) return toRaffle;

  const organizerName = raffle ? await findGateOrganizerName(raffle.creator_id) : null;
  return { props: { sharedGate: { organizerName, returnTo: `/c/${token}` } } };
}

// Verifica un Bearer del dueño de la Rifa (panel del creador).
async function isRaffleOwner(req, raffle) {
  const authz = req.headers?.authorization || '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : null;
  if (!token || !raffle?.creator_id) return false;
  const { data, error } = await getAdminClient().auth.getUser(token);
  return !error && data?.user?.id === raffle.creator_id;
}

// APIs públicas de una Rifa. Devuelve null si ya respondió (410 o 403);
// si no, { mode, raffle } para continuar. En `gated`, una Rifa
// inexistente y una sin autorización reciben la misma respuesta neutra.
// `allowOwner` acepta además el Bearer del creador (descarga del QR).
export async function requireRaffleApiAccess(req, res, identifier, { allowOwner = false } = {}) {
  const mode = getRaffleExposureMode();
  if (mode === 'off') {
    sendRaffleGone(res);
    return null;
  }
  if (mode === 'on') return { mode, raffle: null };

  applyGatedHeaders(res);
  const raffle = await findRaffleForShare(String(identifier || ''));
  const authorized = raffle && (
    hasShareAccess(req, getGateSecret(), raffle.id) ||
    (allowOwner && await isRaffleOwner(req, raffle))
  );
  if (!authorized) {
    res.status(403).json({ ok: false, error: 'confirmation_required' });
    return null;
  }
  return { mode, raffle };
}

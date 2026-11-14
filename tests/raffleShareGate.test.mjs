// tests/raffleShareGate.test.mjs
// Puerta neutra para Rifas compartidas (modo `gated`):
// modos, secreto, cookie por Rifa, ruta de retorno, página y endpoint.
// Los secretos de estas pruebas se generan al azar en cada ejecución.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { getRaffleExposureMode, isValidGateSecret, getGateSecret, RAFFLE_GATED_HEADERS } from '../src/lib/raffleExposure.js';
import {
  SHARE_ACCESS_MAX_AGE_SECONDS,
  SHARE_ACCESS_COOKIE_PREFIX,
  buildShareAccessCookie,
  hasShareAccess,
  shareAccessCookieName,
  shareAccessCookieHeader,
  parseShareReturnPath,
  isValidRaffleIdentifier,
  toGateOrganizerName,
} from '../src/lib/raffleShareAccess.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const code = (p) => read(p).split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('{/*')).join('\n');

const newSecret = () => crypto.randomBytes(32).toString('base64');
const RAFFLE_A = crypto.randomUUID();
const RAFFLE_B = crypto.randomUUID();
const NOW = Date.UTC(2026, 10, 7, 12, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;

// Convierte un Set-Cookie en la petición que el navegador enviaría.
const reqWith = (setCookie) => ({ headers: { cookie: setCookie.split(';')[0] } });

test('MODOS 1: solo on, gated y off exactos; cualquier otro valor es off', () => {
  const secret = newSecret();
  assert.equal(getRaffleExposureMode({}), 'off', 'ausente');
  assert.equal(getRaffleExposureMode({ RIFEX_RAFFLES_PUBLIC: '' }), 'off', 'vacía');
  assert.equal(getRaffleExposureMode({ RIFEX_RAFFLES_PUBLIC: 'off' }), 'off');
  assert.equal(getRaffleExposureMode({ RIFEX_RAFFLES_PUBLIC: 'on' }), 'on');
  assert.equal(getRaffleExposureMode({ RIFEX_RAFFLES_PUBLIC: 'gated', RIFEX_RAFFLES_GATE_SECRET: secret }), 'gated');
  for (const v of ['ON', 'On', 'GATED', 'Gated', 'gate', 'gated,on', 'true', '1', 'yes', 'public']) {
    assert.equal(getRaffleExposureMode({ RIFEX_RAFFLES_PUBLIC: v, RIFEX_RAFFLES_GATE_SECRET: secret }), 'off', `"${v}"`);
  }
});

test('MODOS 2: gated sin secreto válido se comporta como off', () => {
  for (const s of [undefined, '', 'corto', 'a'.repeat(64), `${newSecret()} `, 'abc'.repeat(15)]) {
    assert.equal(getRaffleExposureMode({ RIFEX_RAFFLES_PUBLIC: 'gated', RIFEX_RAFFLES_GATE_SECRET: s }), 'off', `secreto ${JSON.stringify(s?.length)}`);
    assert.equal(getGateSecret({ RIFEX_RAFFLES_GATE_SECRET: s }), null);
  }
  assert.equal(isValidGateSecret(crypto.randomBytes(32).toString('base64')), true, 'openssl rand -base64 32');
  assert.equal(isValidGateSecret(crypto.randomBytes(32).toString('hex')), true, 'openssl rand -hex 32');
  assert.equal(isValidGateSecret(crypto.randomBytes(16).toString('hex')), false, '16 bytes no alcanzan');
  // El modo `on` no depende del secreto.
  assert.equal(getRaffleExposureMode({ RIFEX_RAFFLES_PUBLIC: 'on' }), 'on');
});

test('COOKIE 1: atributos HttpOnly, SameSite=Lax, Path=/, Max-Age de 30 días y Secure en producción', () => {
  const secret = newSecret();
  const prod = buildShareAccessCookie(secret, RAFFLE_A, { nowMs: NOW, secure: true });
  assert.match(prod, /; Max-Age=2592000(;|$)/);
  assert.equal(SHARE_ACCESS_MAX_AGE_SECONDS, 30 * 24 * 60 * 60);
  for (const attr of ['; Path=/', '; HttpOnly', '; SameSite=Lax', '; Secure']) assert.ok(prod.includes(attr), attr);
  assert.ok(!buildShareAccessCookie(secret, RAFFLE_A, { nowMs: NOW, secure: false }).includes('Secure'));
});

test('COOKIE 2: no contiene el id interno, correos, nombres ni datos de la Rifa', () => {
  const secret = newSecret();
  const c = buildShareAccessCookie(secret, RAFFLE_A, { nowMs: NOW, secure: true });
  const [pair] = c.split(';');
  assert.ok(!pair.includes(RAFFLE_A) && !pair.includes(RAFFLE_A.replace(/-/g, '')));
  assert.ok(!pair.includes(secret));
  assert.match(pair, new RegExp(`^${SHARE_ACCESS_COOKIE_PREFIX}[A-Za-z0-9_-]{22}=\\d+\\.[A-Za-z0-9_-]{43}$`));
});

test('COOKIE 3: autorizar la Rifa A no autoriza la Rifa B', () => {
  const secret = newSecret();
  const req = reqWith(buildShareAccessCookie(secret, RAFFLE_A, { nowMs: NOW }));
  assert.equal(hasShareAccess(req, secret, RAFFLE_A, NOW + 1000), true);
  assert.equal(hasShareAccess(req, secret, RAFFLE_B, NOW + 1000), false);
  assert.notEqual(shareAccessCookieName(secret, RAFFLE_A), shareAccessCookieName(secret, RAFFLE_B));
  // Copiar el valor de A bajo el nombre de B tampoco sirve.
  const value = req.headers.cookie.split('=')[1];
  assert.equal(hasShareAccess({ headers: { cookie: `${shareAccessCookieName(secret, RAFFLE_B)}=${value}` } }, secret, RAFFLE_B, NOW), false);
});

test('COOKIE 4: una cookie alterada se rechaza', () => {
  const secret = newSecret();
  const [name, value] = buildShareAccessCookie(secret, RAFFLE_A, { nowMs: NOW }).split(';')[0].split('=');
  const [exp, sig] = value.split('.');
  const flip = (s) => (s[0] === 'A' ? 'B' : 'A') + s.slice(1);
  for (const bad of [`${Number(exp) + DAY_MS / 1000}.${sig}`, `${exp}.${flip(sig)}`, `${exp}.`, `.${sig}`, exp, `${exp}.${sig}x`, `abc.${sig}`, '']) {
    assert.equal(hasShareAccess({ headers: { cookie: `${name}=${bad}` } }, secret, RAFFLE_A, NOW), false, bad);
  }
  assert.equal(hasShareAccess({ headers: {} }, secret, RAFFLE_A, NOW), false, 'sin cookie');
});

test('COOKIE 5: vale exactamente 30 días', () => {
  const secret = newSecret();
  const req = reqWith(buildShareAccessCookie(secret, RAFFLE_A, { nowMs: NOW }));
  assert.equal(hasShareAccess(req, secret, RAFFLE_A, NOW + 30 * DAY_MS - 1000), true, '30 días menos 1 s');
  assert.equal(hasShareAccess(req, secret, RAFFLE_A, NOW + 30 * DAY_MS), false, 'a los 30 días exactos');
  assert.equal(hasShareAccess(req, secret, RAFFLE_A, NOW + 31 * DAY_MS), false, '31 días');
});

test('COOKIE 6: rotar el secreto revoca las autorizaciones emitidas', () => {
  const oldSecret = newSecret();
  const req = reqWith(buildShareAccessCookie(oldSecret, RAFFLE_A, { nowMs: NOW }));
  assert.equal(hasShareAccess(req, oldSecret, RAFFLE_A, NOW), true);
  assert.equal(hasShareAccess(req, newSecret(), RAFFLE_A, NOW), false);
  assert.equal(hasShareAccess(req, null, RAFFLE_A, NOW), false, 'sin secreto nunca autoriza');
});

test('COOKIE 7: solo se reenvían las cookies de la puerta', () => {
  const header = shareAccessCookieHeader({ headers: { cookie: `sb-access=abc; ${SHARE_ACCESS_COOKIE_PREFIX}x=1.y; _ga=z` } });
  assert.equal(header, `${SHARE_ACCESS_COOKIE_PREFIX}x=1.y`);
});

test('RETORNO 1: solo rutas internas de Rifas', () => {
  const id = crypto.randomUUID();
  assert.deepEqual(parseShareReturnPath('/rifas/mi-premio'), { identifier: 'mi-premio', path: '/rifas/mi-premio' });
  assert.deepEqual(parseShareReturnPath(`/rifas/${id}/checkout?qty=2`), { identifier: id, path: `/rifas/${id}/checkout?qty=2` });
  for (const bad of [
    'https://example.com/rifas/a', '//example.com/rifas/a', '/\\example.com', '/rifas//example.com', '/rifas/a/../../panel',
    '/panel', '/rifas', '/rifas/', '/rifas/a/b', '/rifas/a/checkout/x', '/rifas/A-MAYUS', '/rifas/a%2F..', '/rifas/a?next=https://x.y/z',
    '/rifas/<script>', ' /rifas/a', 'javascript:alert(1)', '', null, undefined, 42, `/rifas/${'a'.repeat(120)}`,
  ]) {
    assert.equal(parseShareReturnPath(bad), null, String(bad));
  }
});

test('RETORNO 2: identificadores manipulados se rechazan', () => {
  for (const bad of ['', '-a', 'a-', 'a_b', 'a.b', 'a b', 'Ñandú', "x' or 1=1", 'a'.repeat(101)]) {
    assert.equal(isValidRaffleIdentifier(bad), false, bad);
  }
  assert.equal(isValidRaffleIdentifier('lambo-k7m'), true);
  assert.equal(isValidRaffleIdentifier(crypto.randomUUID()), true);
});

test('ORGANIZADOR: solo un nombre público razonable; nunca correos ni números largos', () => {
  assert.equal(toGateOrganizerName('  Club   Deportivo  '), 'Club Deportivo');
  assert.equal(toGateOrganizerName('persona@correo.test'), null);
  assert.equal(toGateOrganizerName('12.345.678-9'), null, 'RUT');
  assert.equal(toGateOrganizerName('+56 9 1234 5678'), null, 'teléfono');
  assert.equal(toGateOrganizerName('Club 2026'), 'Club 2026');
  assert.equal(toGateOrganizerName('Contacto 912345678'), null);
  assert.equal(toGateOrganizerName(''), null);
  assert.equal(toGateOrganizerName(null), null);
  assert.ok(toGateOrganizerName('x'.repeat(200)).length <= 60);
});

test('PUERTA 1: texto aprobado, sin datos del contenido ni la palabra rifa', () => {
  const src = code('src/components/SharedAccessGate.jsx');
  assert.match(src, /te ha compartido un contenido mediante Rifex/);
  assert.match(src, /Un organizador te ha compartido un contenido mediante Rifex/);
  assert.match(src, /Para ver los detalles, confirma que deseas continuar\./);
  assert.match(src, />\s*Continuar\s*</);
  assert.match(src, /name="robots" content="noindex, nofollow, noarchive"/);
  assert.doesNotMatch(src, /rifa|sorteo|premio|canonical|og:url|og:image|ld\+json|Layout|<img|avatar_url|raffle\./i);
  // Props: solo el nombre público y la ruta de retorno.
  assert.match(src, /export default function SharedAccessGate\(\{ organizerName, returnTo \}\)/);
});

test('PUERTA 2: formulario HTML real con POST hacia el endpoint de la puerta', () => {
  const src = code('src/components/SharedAccessGate.jsx');
  assert.match(src, /<form method="post" action=\{SHARE_ACCESS_ENDPOINT\}>/);
  assert.match(src, /const SHARE_ACCESS_ENDPOINT = '\/api\/acceso-compartido';/);
  assert.match(src, /<button type="submit"/);
  assert.doesNotMatch(src, /onClick|onSubmit|useEffect|fetch\(/);
});

test('PUERTA 3: las páginas sin autorización solo reciben el nombre público y la ruta', () => {
  const lib = code('src/lib/raffleShareAccess.js');
  assert.match(lib, /return \{ response: \{ props: \{ sharedGate: \{ organizerName, returnTo \} \} \} \};/);
  assert.match(lib, /\.select\('nombre'\)/);
  assert.match(lib, /\.select\('id, creator_id, status'\)/);
  for (const p of ['src/pages/rifas/[id].jsx', 'src/pages/rifas/[id]/checkout.jsx']) {
    assert.match(code(p), /if \(props\.sharedGate\) return <SharedAccessGate \{\.\.\.props\.sharedGate\} \/>;/, p);
  }
});

test('ENDPOINT 1: solo POST, ruta validada, límite de intentos y 303 al mismo enlace', () => {
  const src = code('src/pages/api/acceso-compartido.js');
  assert.match(src, /req\.method !== 'POST'/);
  assert.match(src, /parseShareReturnPath\(/);
  assert.match(src, /checkRateLimit\(`shared-access:ip:\$\{ip\}`/);
  assert.match(src, /res\.redirect\(303, target\.path\)/);
  assert.ok(src.indexOf("mode === 'off'") < src.indexOf('parseShareReturnPath('), 'off responde 410 antes de todo');
  assert.ok(src.indexOf('checkRateLimit(') < src.indexOf('findRaffleForReturnTarget('), 'límite antes de consultar');
  assert.ok(src.indexOf('findRaffleForReturnTarget(') < src.indexOf('Set-Cookie'), 'cookie solo para Rifas existentes');
  assert.doesNotMatch(src, /console\.|\.insert\(|\.update\(|\.upsert\(|\.delete\(/, 'sin registros ni escrituras');
});

test('ENDPOINT 2: nada de la puerta se registra en logs', () => {
  for (const p of ['src/lib/raffleShareAccess.js', 'src/pages/api/acceso-compartido.js', 'src/components/SharedAccessGate.jsx']) {
    assert.doesNotMatch(code(p), /console\./, p);
  }
});

test('APIS: en gated, inexistente y sin autorización responden igual; el listado no enumera', () => {
  const lib = code('src/lib/raffleShareAccess.js');
  const api = lib.slice(lib.indexOf('export async function requireRaffleApiAccess'));
  assert.match(api, /if \(!authorized\) \{\s*res\.status\(403\)\.json\(\{ ok: false, error: 'confirmation_required' \}\);/);
  assert.match(code('src/pages/api/rifas/index.js'), /if \(!isRafflePublicExposureEnabled\(\)\) return sendRaffleGone\(res\);/);
  assert.match(code('src/pages/api/perfil/[id].js'), /if \(isRafflePublicExposureEnabled\(\)\) \{/);
  assert.match(code('src/pages/rifas.js'), /if \(!isRafflePublicExposureEnabled\(\)\) return raffleGoneProps\(res\);/);
  // Chat y números: la misma verificación, guardando la Rifa resuelta.
  for (const [p, arg] of [['src/pages/api/chat/[raffleId].js', 'raffleId'], ['src/pages/api/rifas/[id]/tickets.js', "String\\(id \\|\\| ''\\)"]]) {
    assert.match(code(p), new RegExp(`const access = await requireRaffleApiAccess\\(req, res, ${arg}\\);\\s*\\n\\s*if \\(!access\\) return;`), p);
  }
  for (const p of ['src/pages/api/rifas/[id]/index.js', 'src/pages/api/raffles/winner.js']) {
    assert.match(code(p), /if \(!\(await requireRaffleApiAccess\(req, res, .+?\)\)\) return;/, p);
  }
  assert.match(code('src/pages/api/rifas/[id]/qr.png.js'), /requireRaffleApiAccess\(req, res, id, \{ allowOwner: true \}\)/);
});

test('ENCABEZADOS: las respuestas de gated no se guardan en caché compartida', () => {
  assert.equal(RAFFLE_GATED_HEADERS['Cache-Control'], 'private, no-store');
  assert.equal(RAFFLE_GATED_HEADERS['X-Robots-Tag'], 'noindex, nofollow, noarchive');
});

test('SECRETO: solo servidor, nunca NEXT_PUBLIC_ ni valores en el repositorio', () => {
  let hits = '';
  try {
    hits = execFileSync('git', ['grep', '-nE', 'NEXT_PUBLIC_RIFEX_RAFFLES|RIFEX_RAFFLES_GATE_SECRET *[:=] *["\'][^"\']', '--', '.', ':!tests'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch (e) {
    if (e.status !== 1) throw e;
  }
  assert.equal(hits, '');
  // Solo raffleExposure.js lee la variable del secreto.
  const readers = execFileSync('git', ['grep', '-lE', 'env(\\.|\\[.)RIFEX_RAFFLES_GATE_SECRET', '--', 'src'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n');
  assert.deepEqual(readers, ['src/lib/raffleExposure.js']);
  // El cliente nunca importa el módulo de la puerta fuera de getServerSideProps.
  for (const p of ['src/pages/rifas/[id].jsx', 'src/pages/rifas/[id]/checkout.jsx']) {
    const src = code(p);
    const body = src.slice(src.indexOf('export default function'));
    assert.doesNotMatch(body, /resolveRafflePageAccess|shareAccessCookieHeader|hasShareAccess/, p);
  }
});

test('PAGOS: la puerta no toca checkout del servidor, webhooks, conciliación ni sorteo', () => {
  for (const p of [
    'src/pages/api/checkout/mp.js', 'src/pages/api/checkout/webhook.js', 'src/pages/api/checkout/confirm.js',
    'src/lib/paymentReconcile.js', 'src/pages/api/cron/draw-scheduler.js', 'src/lib/drawWinner.js',
    'src/pages/api/rifas/[id]/draw.js',
  ]) {
    assert.doesNotMatch(read(p), /raffleShareAccess|acceso-compartido|RIFEX_RAFFLES/, p);
  }
});

// tests/neutralShareLinks.test.mjs
// Enlace compartible neutral (/c/<token>), generadores de enlaces, cierre
// del acceso directo a la base y chat sin identificadores internos.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { isValidShareToken, shareLinkPath, parseShareReturnPath } from '../src/lib/raffleShareAccess.js';
import {
  PUBLIC_CHAT_MESSAGE_FIELDS,
  publicMessageId,
  cleanMessageBody,
  cleanGuestName,
  toPublicMessage,
} from '../src/lib/publicChat.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const code = (p) => read(p).split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('--') && !l.trim().startsWith('{/*')).join('\n');
const block = (src, from, to) => src.slice(src.indexOf(from), to ? src.indexOf(to, src.indexOf(from)) : undefined);

// Mismo formato que produce la base: 16 bytes en base64url sin relleno.
const newToken = () => crypto.randomBytes(16).toString('base64url');

// ---------------------------------------------------------------------
// Token y enlace
// ---------------------------------------------------------------------
test('TOKEN 1: formato de 22 caracteres base64url (128 bits)', () => {
  for (let i = 0; i < 200; i++) assert.equal(isValidShareToken(newToken()), true);
  for (const bad of ['', 'corto', `${newToken()}x`, newToken().slice(1), 'a'.repeat(21), `${'a'.repeat(21)}=`, `${'a'.repeat(21)}/`, `${'a'.repeat(21)}.`, null, undefined, 42]) {
    assert.equal(isValidShareToken(bad), false, String(bad));
  }
  assert.equal(isValidShareToken(crypto.randomUUID()), false, 'un UUID no es un token');
});

test('TOKEN 2: el enlace es /c/<token>, sin /rifas/, título, slug ni UUID', () => {
  const t = newToken();
  assert.equal(shareLinkPath(t), `/c/${t}`);
  assert.equal(shareLinkPath('mi-premio'), null);
  assert.equal(shareLinkPath(crypto.randomUUID()), null);
  assert.equal(shareLinkPath(null), null);
});

test('TOKEN 3: migración A — aleatorio, único, obligatorio, inmutable y fuera de la API directa', () => {
  const sql = code('db/migrations/2026-11-08a_raffles_share_token.sql');
  assert.match(sql, /extensions\.gen_random_bytes\(16\)/, '128 bits de pgcrypto');
  assert.doesNotMatch(block(sql, 'create or replace function public.new_raffle_share_token', '$$;'), /title|slug|creator|\bid\b|md5\(|\bsha\d|digest\(|\bhash|now\(/i, 'no derivado de datos de la Rifa');
  assert.match(sql, /add column if not exists share_token text/);
  assert.match(sql, /set share_token = public\.new_raffle_share_token\(\)\s*\n\s*where share_token is null/, 'backfill de Rifas existentes');
  assert.match(sql, /alter column share_token set default public\.new_raffle_share_token\(\)/, 'Rifas nuevas');
  assert.match(sql, /alter column share_token set not null/);
  assert.match(sql, /create unique index if not exists raffles_share_token_key on public\.raffles \(share_token\)/);
  assert.match(sql, /before update of share_token on public\.raffles/);
  assert.match(sql, /raise exception 'share_token is immutable'/);
  assert.match(sql, /revoke select \(share_token\) on table public\.raffles from anon, authenticated/);
  assert.doesNotMatch(sql, /grant [^;]*share_token[^;]* to (anon|authenticated)/i);
  assert.ok(fs.existsSync(path.join(ROOT, 'db/rollback/2026-11-08a_raffles_share_token_rollback.sql')));
  assert.ok(fs.existsSync(path.join(ROOT, 'db/checks/2026-11-08a_raffles_share_token_check.sql')));
  assert.doesNotMatch(code('db/checks/2026-11-08a_raffles_share_token_check.sql'), /^\s*(insert|update|delete|alter|grant|revoke|drop|create|truncate)\b/im, 'check de solo lectura');
});

test('TOKEN 4: el token crudo nunca sale del servidor; solo como /c/<token>', () => {
  const files = execFileSync('git', ['grep', '-l', 'share_token', '--', 'src'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').sort();
  assert.deepEqual(files, [
    'src/lib/raffleShareAccess.js',
    'src/pages/api/panel/raffles.js',
    'src/pages/api/rifas/[id]/index.js',
    'src/pages/api/rifas/[id]/qr.png.js',
  ]);
  assert.match(code('src/pages/api/panel/raffles.js'), /map\(\(\{ share_token, \.\.\.r \}\) => \(\{\s*\n\s*\.\.\.r,\s*\n\s*share_path: shareLinkPath\(share_token\),/);
  // El listado público no incluye el enlace.
  assert.doesNotMatch(code('src/pages/api/rifas/index.js'), /share_/);
});

test('RETORNO: /c/<token> válido vuelve sin query; manipulaciones se rechazan', () => {
  const t = newToken();
  assert.deepEqual(parseShareReturnPath(`/c/${t}`), { token: t, path: `/c/${t}` });
  assert.deepEqual(parseShareReturnPath(`/c/${t}?fbclid=AbC-123_x`), { token: t, path: `/c/${t}` });
  for (const bad of [`/c/${t}/x`, `/c//${t}`, `//c/${t}`, `https://example.com/c/${t}`, `/c/${t}x`, '/c/', '/c/../panel', `/c/${t}?next=https://x.y/z`, `/C/${t}`]) {
    assert.equal(parseShareReturnPath(bad), null, bad);
  }
});

// ---------------------------------------------------------------------
// Página /c/<token>
// ---------------------------------------------------------------------
test('ENLACE 1: la página solo delega en el servidor y muestra 410 o la puerta', () => {
  const page = code('src/pages/c/[token].jsx');
  assert.match(page, /return resolveShareLinkPage\(\{ req, res \}, String\(params\?\.token \|\| ''\)\);/);
  assert.match(page, /if \(props\.raffleGone\) return <RaffleGonePage \/>;\s*\n\s*return <SharedAccessGate \{\.\.\.props\.sharedGate\} \/>;/);
  assert.doesNotMatch(page, /Layout|Head|fetch\(|supabase|og:|canonical/);
});

test('ENLACE 2: off → 410; formato inválido → 404 sin consultar; gated sin acceso → puerta', () => {
  const lib = code('src/lib/raffleShareAccess.js');
  const fn = block(lib, 'export async function resolveShareLinkPage', '\n}\n');
  assert.ok(fn.indexOf("if (mode === 'off') return raffleGoneProps(res);") >= 0);
  assert.ok(fn.indexOf('if (!isValidShareToken(token)) return { notFound: true };') < fn.indexOf('findRaffleByShareToken('), 'formato antes de la base');
  assert.match(fn, /destination: `\/rifas\/\$\{raffle\.slug \|\| raffle\.id\}`, permanent: false/);
  assert.match(fn, /if \(raffle && hasShareAccess\(req, getGateSecret\(\), raffle\.id\)\) return toRaffle;/);
  assert.match(fn, /return \{ props: \{ sharedGate: \{ organizerName, returnTo: `\/c\/\$\{token\}` \} \} \};/);
  // Inexistente: misma puerta, sin nombre (no revela si existió).
  assert.match(fn, /const organizerName = raffle \? await findGateOrganizerName\(raffle\.creator_id\) : null;/);
  assert.doesNotMatch(fn, /user-agent|userAgent|headers\[/i);
});

test('ENLACE 3: el token no reemplaza la cookie en ninguna API', () => {
  for (const p of ['src/pages/api/rifas/[id]/index.js', 'src/pages/api/rifas/[id]/tickets.js', 'src/pages/api/raffles/winner.js', 'src/pages/api/chat/[raffleId].js', 'src/pages/api/rifas/[id]/qr.png.js']) {
    assert.doesNotMatch(code(p), /findRaffleByShareToken|isValidShareToken|req\.query\.token/, p);
  }
  const api = block(code('src/lib/raffleShareAccess.js'), 'export async function requireRaffleApiAccess');
  assert.doesNotMatch(api, /share_token|ShareToken/);
});

// ---------------------------------------------------------------------
// Generadores de enlaces
// ---------------------------------------------------------------------
test('GENERADORES 1: el QR lleva el enlace neutral', () => {
  const qr = code('src/pages/api/rifas/[id]/qr.png.js');
  assert.match(qr, /const sharePath = shareLinkPath\(raffle\.share_token\);/);
  assert.match(qr, /const url = `\$\{base\}\$\{sharePath\}`;/);
  assert.doesNotMatch(qr, /`\$\{base\}\/rifas\//);
});

test('GENERADORES 2: el panel copia el enlace neutral', () => {
  const panel = code('src/pages/panel/index.js');
  assert.match(panel, /<CopyShareLinkButton sharePath=\{row\.share_path\} \/>/);
  assert.match(panel, /const url = `\$\{window\.location\.origin\}\$\{sharePath\}`;/);
});

test('GENERADORES 3: canonical y og:url de la ficha usan el enlace neutral', () => {
  const ficha = code('src/pages/rifas/[id].jsx');
  assert.match(ficha, /metaSharePath: raffle\?\.share_path \|\| null,/);
  assert.match(ficha, /rel="canonical" href=\{canonicalUrl\(canonicalPath\)\}/);
  assert.match(ficha, /property="og:url" content=\{canonicalUrl\(canonicalPath\)\}/);
});

// ---------------------------------------------------------------------
// Cero lecturas directas de la base desde el navegador
// ---------------------------------------------------------------------
test('BASE 1: ningún código del navegador consulta tablas de Rifas ni se suscribe a ellas', () => {
  const TABLES = /\.from\(\s*["'](raffles|tickets|raffle_messages|raffle_results|rifas|rifa_tickets|raffles_compat|tickets_compat)["']|table:\s*["'](tickets|raffle_messages|raffles)["']/;
  const files = execFileSync('git', ['ls-files', 'src/pages', 'src/components'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n')
    .filter((f) => /\.(jsx?|tsx?)$/.test(f) && !f.startsWith('src/pages/api/'));
  for (const f of files) {
    const src = code(f);
    // Solo cuenta el código que llega al navegador (fuera de getServerSideProps).
    const gssp = src.indexOf('export async function getServerSideProps');
    const client = gssp < 0 ? src : src.slice(0, gssp) + src.slice(src.indexOf('\n}\n', gssp));
    assert.doesNotMatch(client, TABLES, f);
  }
  assert.doesNotMatch(code('src/components/rifex/RaffleChat.jsx'), /supabase|postgres_changes/);
});

test('BASE 2: migración B — sin privilegios directos para anon y authenticated', () => {
  const sql = code('db/migrations/2026-11-08b_raffles_close_direct_access.sql');
  const m = /revoke all on table([\s\S]*?)from anon, authenticated;/.exec(sql);
  assert.ok(m);
  const tables = m[1].split(',').map((s) => s.trim()).sort();
  assert.deepEqual(tables, ['public.raffle_messages', 'public.raffle_results', 'public.raffles', 'public.raffles_compat', 'public.rifa_tickets', 'public.rifas', 'public.tickets', 'public.tickets_compat']);
  assert.doesNotMatch(sql, /\bgrant\b|service_role|drop policy|alter policy/i, 'solo revoca; service_role y políticas sin cambios');
  const rb = code('db/rollback/2026-11-08b_raffles_close_direct_access_rollback.sql');
  assert.match(rb, /grant all on table[\s\S]*public\.tickets[\s\S]*to anon, authenticated;/);
  assert.match(rb, /grant select \([\s\S]*prize_photos[\s\S]*\) on table public\.raffles to anon, authenticated;/);
  const check = code('db/checks/2026-11-08b_raffles_close_direct_access_check.sql');
  assert.doesNotMatch(check, /^\s*(insert|update|delete|alter|grant|revoke|drop|create|truncate)\b/im, 'check de solo lectura');
});

test('BASE 3: los procesos del servidor no dependen de la migración B', () => {
  for (const p of [
    'src/pages/api/checkout/mp.js', 'src/pages/api/checkout/webhook.js', 'src/pages/api/checkout/confirm.js',
    'src/pages/api/cron/draw-scheduler.js', 'src/pages/api/tickets/release-expired.js',
  ]) {
    assert.match(read(p), /SUPABASE_SERVICE_ROLE_KEY/, p);
  }
});

// ---------------------------------------------------------------------
// Chat sin identificadores internos
// ---------------------------------------------------------------------
test('CHAT 1: lista cerrada de campos públicos, sin ids internos', () => {
  const userId = crypto.randomUUID();
  const creatorId = crypto.randomUUID();
  const row = { id: crypto.randomUUID(), user_id: userId, guest_name: null, body: 'hola', created_at: '2026-11-08T00:00:00Z', raffle_id: crypto.randomUUID() };
  const out = toPublicMessage(row, { nombre: 'Ana', creatorId, viewerId: userId });
  assert.deepEqual(Object.keys(out).sort(), [...PUBLIC_CHAT_MESSAGE_FIELDS].sort());
  const json = JSON.stringify(out);
  for (const v of [row.id, userId, creatorId, row.raffle_id]) assert.ok(!json.includes(v));
  assert.doesNotMatch(json, /[0-9a-f]{8}-[0-9a-f]{4}-/);
  assert.equal(out.is_mine, true);
  assert.equal(out.is_organizer, false);
  assert.equal(toPublicMessage({ ...row, user_id: creatorId }, { nombre: 'Org', creatorId }).is_organizer, true);
  assert.equal(toPublicMessage({ ...row, user_id: null }, { nombre: 'Invitado' }).is_guest, true);
  assert.equal(publicMessageId(row.id), publicMessageId(row.id), 'estable');
  assert.notEqual(publicMessageId(row.id), publicMessageId(crypto.randomUUID()));
});

test('CHAT 2: validación de texto y alias', () => {
  assert.equal(cleanMessageBody('  hola  '), 'hola');
  assert.equal(cleanMessageBody('a\u0000b‮c'), 'abc', 'sin caracteres de control');
  assert.equal(cleanMessageBody('x'.repeat(500)).length, 500);
  for (const bad of ['x'.repeat(501), '', '   ', null, 42, ['hola'], { body: 'x' }]) assert.equal(cleanMessageBody(bad), null, JSON.stringify(bad));
  assert.equal(cleanGuestName('  Ana   María '), 'Ana María');
  for (const bad of ['', 'x'.repeat(41), 'ana@correo.test', '+56 9 1234 5678', null, 7]) assert.equal(cleanGuestName(bad), null, String(bad));
});

test('CHAT 3: la API usa la misma autorización para leer y escribir, y limita intentos', () => {
  const api = code('src/pages/api/chat/[raffleId].js');
  assert.ok(api.indexOf('requireRaffleApiAccess(req, res, raffleId)') < api.indexOf("if (req.method === 'GET')"), 'antes de leer y de escribir');
  assert.match(api, /checkRateLimit\(rlKey, POST_LIMIT, POST_WINDOW_SECONDS\)/);
  assert.ok(api.indexOf('checkRateLimit(') < api.indexOf(".from('raffle_messages')\n      .insert"), 'límite antes de escribir');
  assert.match(api, /\.select\('user_id, nombre'\)/);
  assert.doesNotMatch(api, /avatar_url|\.\.\.inserted|\.\.\.m\b|user_id: m\.|console\.error\([^)]*, e\)/);
  assert.match(api, /toPublicMessage\(/);
  // Mensajes de Rifa A no se leen ni escriben con la Rifa B.
  assert.match(api, /\.eq\('raffle_id', raffle\.id\)/);
  assert.match(api, /insert\(\{ raffle_id: raffle\.id,/);
});

test('CHAT 4: el componente usa marcas públicas, no ids', () => {
  const ui = code('src/components/rifex/RaffleChat.jsx');
  assert.match(ui, /m\.is_mine \? styles\.me : ""/);
  assert.doesNotMatch(ui, /user_id|viewerId/);
});

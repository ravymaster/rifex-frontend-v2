// tests/publicRaffleFields.test.mjs
// Campos públicos de rifas y del ganador (2026-11-06). Certifica:
// - la lista blanca de columnas públicas de `raffles` y su uso en el
//   listado, el detalle (slug o UUID), la ficha y el checkout;
// - que una columna nueva de la tabla no se publica sola;
// - que la lectura pública del ganador solo entrega número, fecha y nombre
//   enmascarado, y que ya no puede disparar el sorteo;
// - que la migración de permisos por columna coincide con la lista blanca
//   y tiene reversión.
// Mismo criterio de aserción sobre el código fuente que
// humanUrlStandard2026.test.mjs para handlers/páginas que no corren fuera
// de Next.js; el funcionamiento real se certifica en vivo contra DEV.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PUBLIC_RAFFLE_COLUMNS, PUBLIC_RAFFLE_SELECT, LEGACY_RIFAS_SELECT, toPublicRaffle } from '../src/lib/publicRaffleFields.js';
import { PUBLIC_WINNER_SELECT, maskBuyerName, toPublicWinner } from '../src/lib/publicWinner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
// Solo código, sin comentarios.
const code = (p) => read(p).split('\n').filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('--')).join('\n');
const block = (src, from, to) => src.slice(src.indexOf(from), to ? src.indexOf(to) : undefined);

const SENSITIVE_KEY = /email|creator_id|creador_id|user_id|payout|phone|telefono|rut|token|secret|password|mp_|buyer/i;

const fullRow = () => ({
  id: '6f997398-a5d3-4330-9aeb-1228a1ff1c3f',
  slug: 'rifa-de-prueba',
  title: 'Rifa de prueba',
  description: 'Línea 1\nLínea 2',
  status: 'active',
  theme: 'Mixto',
  price_cents: 100000,
  total_numbers: 100,
  prize_type: 'physical',
  prize_amount_cents: 0,
  prize_photos: ['https://example.com/portada.jpg', 'https://example.com/galeria-1.jpg'],
  delivery_method: 'retira_en_tienda',
  requires_transfer_procedures: false,
  transfer_expenses_owner: null,
  transfer_conditions: null,
  features: [{ label: 'Marca', value: 'X' }],
  timezone: 'America/Santiago',
  start_date: '2026-11-01',
  end_date: '2026-12-01',
  sales_end_at: '2026-12-01T12:00:00Z',
  draw_at: '2026-12-01T12:05:00Z',
  extension_limit: 3,
  extensions_used: 0,
  created_at: '2026-11-01T00:00:00Z',
  creator_email: 'creador@example.com',
  creator_id: '00000000-0000-0000-0000-0000000000aa',
  plan: 'free',
  payout_method: 'transferencia',
});

// ---------------------------------------------------------------------
// Lista blanca
// ---------------------------------------------------------------------
test('LISTA 1: ninguna columna pública es sensible y no hay comodín', () => {
  for (const key of PUBLIC_RAFFLE_COLUMNS) assert.doesNotMatch(key, SENSITIVE_KEY, key);
  for (const key of LEGACY_RIFAS_SELECT.split(',')) assert.doesNotMatch(key, SENSITIVE_KEY, key);
  assert.ok(!PUBLIC_RAFFLE_SELECT.includes('*'));
  assert.equal(PUBLIC_RAFFLE_SELECT, PUBLIC_RAFFLE_COLUMNS.join(','));
});

test('LISTA 2: toPublicRaffle descarta correo, id del creador, plan y payout', () => {
  const out = toPublicRaffle(fullRow());
  for (const key of ['creator_email', 'creator_id', 'plan', 'payout_method']) assert.equal(key in out, false, key);
  assert.ok(!JSON.stringify(out).includes('@'));
});

test('LISTA 3: una columna privada nueva NO se publica automáticamente', () => {
  const out = toPublicRaffle({ ...fullRow(), creator_phone: '+56900000000', internal_notes: 'x', bank_account: '1' });
  assert.deepEqual(Object.keys(out).sort(), [...PUBLIC_RAFFLE_COLUMNS].sort());
});

test('LISTA 4: conserva intactos slug, portada, galería, fechas y estado', () => {
  const row = fullRow();
  const out = toPublicRaffle(row);
  for (const key of PUBLIC_RAFFLE_COLUMNS) assert.deepEqual(out[key], row[key], key);
  assert.equal(toPublicRaffle(null), null);
});

// ---------------------------------------------------------------------
// Endpoints de rifas
// ---------------------------------------------------------------------
test('API 1: GET /api/rifas pide solo columnas públicas y mapea con toPublicRaffle', () => {
  const get = block(code('src/pages/api/rifas/index.js'), "req.method === 'GET'", "req.method === 'POST'");
  assert.doesNotMatch(get, /select\(\s*['"`]\*['"`]\s*\)/);
  assert.match(get, /\.select\(PUBLIC_RAFFLE_SELECT\)/);
  assert.match(get, /items: \(data \|\| \[\]\)\.map\(toPublicRaffle\)/);
});

test('API 2: GET /api/rifas/[id] resuelve slug o UUID y responde sin identificadores internos', () => {
  const get = block(code('src/pages/api/rifas/[id]/index.js'), "req.method === 'GET'", "req.method === 'PATCH'");
  assert.doesNotMatch(get, /select\(\s*['"`]\*['"`]\s*\)/);
  assert.match(get, /\.select\(`\$\{PUBLIC_RAFFLE_SELECT\},creator_id,share_token`\)/, 'creator_id y share_token solo para el servidor');
  assert.match(get, /\.eq\(idOrSlugColumn\(id\), id\)/);
  assert.match(get, /data: \{ \.\.\.toPublicRaffle\(data\), creator_trust_level: creatorTrustLevel, organizer, counts, share_path: shareLinkPath\(data\.share_token\) \}/);
  assert.doesNotMatch(get, /share_token: |creator_id: /, 'nunca el token crudo ni el creador');
  assert.doesNotMatch(get, /\.\.\.data[,}\s]/, 'nunca se esparce la fila completa');
});

test('API 3: la tarjeta del organizador solo lleva nombre, bio y avatar', () => {
  const get = block(code('src/pages/api/rifas/[id]/index.js'), "req.method === 'GET'", "req.method === 'PATCH'");
  assert.match(get, /\.select\('nombre, bio, avatar_url'\)/);
  assert.match(get, /organizer = \{ nombre: profile\.nombre \?\? null, bio: profile\.bio \?\? null, avatar_url: profile\.avatar_url \?\? null \}/);
});

// ---------------------------------------------------------------------
// Ficha pública y checkout
// ---------------------------------------------------------------------
test('PÁGINAS 1: la ficha y el checkout leen solo columnas públicas desde el navegador', () => {
  const ficha = code('src/pages/rifas/[id].jsx');
  const checkout = code('src/pages/rifas/[id]/checkout.jsx');
  for (const src of [ficha, checkout]) {
    assert.doesNotMatch(src, /select\(\s*["'`]\*["'`]\s*\)/);
    assert.doesNotMatch(src, /creator_email|creator_id|creador_id/);
  }
  // El checkout sí envía buyer_email/buyer_name: son los datos que el
  // propio comprador escribe para su compra (POST /api/checkout/mp).
  assert.doesNotMatch(ficha, /buyer_email|buyer_name/);
  // Sin lecturas directas de la base desde el navegador: todo pasa por
  // GET /api/rifas/[id] (lista cerrada de campos, exposición y puerta).
  for (const src of [ficha, checkout]) {
    assert.doesNotMatch(src, /supabaseClient|supabase\.|\.from\(["']|postgres_changes/);
  }
  assert.doesNotMatch(ficha, /raffles_compat|tickets_compat/);
  assert.match(ficha, /fetch\(`\/api\/rifas\/\$\{encodeURIComponent\(rid\)\}`\)/);
  assert.match(checkout, /fetch\(`\/api\/rifas\/\$\{encodeURIComponent\(id\)\}`\)/);
});

test('PÁGINAS 2: la ficha no arma enlaces con el id interno del creador', () => {
  const ficha = code('src/pages/rifas/[id].jsx');
  assert.doesNotMatch(ficha, /\/perfil\/\$\{/);
  assert.match(ficha, /fetch\(`\/api\/rifas\/\$\{encodeURIComponent\(rid\)\}`\)/, 'organizador desde el API de la rifa');
  assert.match(ficha, /setOrganizer\(raffleData\.organizer \|\| null\)/);
});

test('PÁGINAS 3: la lista blanca cubre todos los campos que leen la ficha y el checkout', () => {
  // Campos que agrega el servidor en GET /api/rifas/[id], fuera de la lista de columnas.
  const NOT_FROM_LIST = new Set(['creator_trust_level', 'titulo', 'user_id', 'organizer', 'counts', 'share_path']);
  for (const file of ['src/pages/rifas/[id].jsx', 'src/pages/rifas/[id]/checkout.jsx']) {
    const used = new Set([...code(file).matchAll(/\braffle(?:Data)?\??\.([a-z_]+)/g)].map((m) => m[1]));
    for (const field of used) {
      if (NOT_FROM_LIST.has(field)) continue;
      assert.ok(PUBLIC_RAFFLE_COLUMNS.includes(field), `${file} usa raffle.${field}`);
    }
  }
});

test('PÁGINAS 4: la ficha muestra el ganador enmascarado y nunca pide sortear', () => {
  const ficha = code('src/pages/rifas/[id].jsx');
  assert.match(ficha, /winner\.display_name \|\| "Comprador"/);
  assert.doesNotMatch(ficha, /ensure=1|ensureWinner/);
});

// ---------------------------------------------------------------------
// Ganador
// ---------------------------------------------------------------------
test('GANADOR 1: maskBuyerName — primer nombre + inicial, nunca correo ni nombre completo', () => {
  assert.equal(maskBuyerName('Juana Pérez Soto'), 'Juana S.');
  assert.equal(maskBuyerName('  María   González '), 'María G.');
  assert.equal(maskBuyerName('Pedro'), 'Pedro');
  assert.equal(maskBuyerName('comprador@example.com'), null);
  assert.equal(maskBuyerName(''), null);
  assert.equal(maskBuyerName(null), null);
  assert.equal(maskBuyerName(42), null);
});

test('GANADOR 2: toPublicWinner solo entrega número, fecha y nombre enmascarado', () => {
  const out = toPublicWinner({
    raffle_id: '6f997398-a5d3-4330-9aeb-1228a1ff1c3f', number: 17, created_at: '2026-12-01T12:05:00Z',
    buyer_email: 'comprador@example.com', buyer_name: 'Juana Pérez', purchase_id: 'x', trigger_source: 'manual_draw', triggered_by: 'y',
  });
  assert.deepEqual(out, { number: 17, created_at: '2026-12-01T12:05:00Z', display_name: 'Juana P.' });
  assert.equal(toPublicWinner(null), null);
  assert.doesNotMatch(PUBLIC_WINNER_SELECT, /email|\*/);
});

test('GANADOR 3 (adversarial): el endpoint público ya no puede disparar el sorteo', () => {
  const src = code('src/pages/api/raffles/winner.js');
  assert.doesNotMatch(src, /drawWinner|notifyWinnerDrawn|ensure/, 'ningún camino de sorteo desde el navegador');
  assert.doesNotMatch(src, /\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/, 'el endpoint es solo lectura');
});

test('GANADOR 4 (adversarial): solo GET, rid validado como UUID, consulta y respuesta cerradas', () => {
  const src = code('src/pages/api/raffles/winner.js');
  assert.match(src, /if \(req\.method !== "GET"\)/, 'POST/PUT/DELETE → 405');
  assert.match(src, /if \(!isUuid\(rid\)\) return res\.status\(400\)/, 'parámetros manipulados → 400 antes de consultar');
  assert.match(src, /\.select\(PUBLIC_WINNER_SELECT\)/);
  assert.doesNotMatch(src, /select\(\s*["'`]\*["'`]\s*\)/);
  assert.match(src, /winner: toPublicWinner\(existing\)/);
  assert.doesNotMatch(src, /error\.message|err\?\.message \|\|/, 'no reenvía mensajes internos de la base');
});

test('GANADOR 5: el sorteo sigue disponible para las autoridades internas existentes', () => {
  const cron = read('src/pages/api/cron/draw-scheduler.js');
  const manual = read('src/pages/api/rifas/[id]/draw.js');
  const reconcile = read('src/lib/paymentReconcile.js');
  assert.match(cron, /CRON_SECRET/);
  assert.match(manual, /drawWinner|getUser/);
  assert.match(reconcile, /drawWinner\(raffleId, \{ triggerSource: "sold_out_auto" \}\)/);
});

// ---------------------------------------------------------------------
// Migración de permisos por columna
// ---------------------------------------------------------------------
const MIGRATION = 'db/migrations/2026-11-06_raffles_public_column_grants.sql';
const ROLLBACK = 'db/rollback/2026-11-06_raffles_public_column_grants_rollback.sql';
const grantedCols = (sql, table) => {
  const m = sql.match(new RegExp(`grant select \\(([^)]+)\\) on table public\\.${table} to anon, authenticated;`));
  return m ? m[1].split(',').map((s) => s.trim()).filter(Boolean) : null;
};

test('MIG 1: revoca el SELECT de tabla ANTES de otorgar por columna (raffles y rifas)', () => {
  const sql = code(MIGRATION);
  for (const table of ['raffles', 'rifas']) {
    const revokeAt = sql.indexOf(`revoke select on table public.${table} from anon, authenticated;`);
    const grantAt = sql.indexOf(`) on table public.${table} to anon, authenticated;`);
    assert.ok(revokeAt >= 0 && grantAt > revokeAt, table);
  }
  assert.match(sql, /revoke select on table public\.raffle_results from anon, authenticated;/);
});

test('MIG 2: las columnas otorgadas coinciden exactamente con las listas públicas del código', () => {
  const sql = code(MIGRATION);
  assert.deepEqual(grantedCols(sql, 'raffles').sort(), [...PUBLIC_RAFFLE_COLUMNS].sort());
  assert.deepEqual(grantedCols(sql, 'rifas').sort(), LEGACY_RIFAS_SELECT.split(',').sort());
});

test('MIG 3: idempotente y acotada — sin DDL de tablas, funciones, datos ni service_role', () => {
  const sql = code(MIGRATION).toLowerCase();
  assert.doesNotMatch(sql, /\b(create|alter|drop|insert|update|delete|truncate)\b/);
  assert.doesNotMatch(sql, /security definer|service_role/);
  assert.match(sql, /^\s*begin;/m);
  assert.match(sql, /commit;\s*$/);
});

test('MIG 4: existe la reversión y restaura exactamente los permisos de tabla', () => {
  const sql = code(ROLLBACK);
  assert.match(sql, /grant select on table public\.raffles to anon, authenticated;/);
  assert.match(sql, /grant select on table public\.rifas to anon, authenticated;/);
  assert.match(sql, /grant select on table public\.raffle_results to anon, authenticated;/);
});

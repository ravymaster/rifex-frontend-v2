// tests/publicSurfaceReadiness.test.mjs
// Superficie pública (2026-11): campos públicos de Eventos, Inscripciones,
// Campañas y Medidor QR, y control de exposición pública de Rifas.
// Mismo criterio de aserción sobre el código fuente que
// publicRaffleFields.test.mjs; el funcionamiento real se certifica en vivo
// contra DEV.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import * as F from '../src/lib/publicInitiativeFields.js';
import { isRafflePublicExposureEnabled, RAFFLE_GONE_HEADERS, sendRaffleGone, raffleGoneProps } from '../src/lib/raffleExposure.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const code = (p) => read(p).split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('--') && !l.trim().startsWith('{/*')).join('\n');
const block = (src, from, to) => src.slice(src.indexOf(from), to ? src.indexOf(to) : undefined);

const SENSITIVE = /email|phone|telefono|rut|organizer_id|creator_id|user_id|plan|payout|token|secret|password|mp_|buyer|scan_count|^name$|event_id|updated_at/i;
const LISTS = {
  events: F.PUBLIC_EVENT_COLUMNS,
  event_ticket_types: F.PUBLIC_TICKET_TYPE_COLUMNS,
  registration_activities: F.PUBLIC_ACTIVITY_COLUMNS,
  colectas: F.PUBLIC_COLECTA_COLUMNS,
  medidores_qr: F.PUBLIC_MEDIDOR_COLUMNS,
};

// ---------------------------------------------------------------------
// Listas de campos públicos
// ---------------------------------------------------------------------
test('CAMPOS 1: ninguna lista pública contiene columnas sensibles ni comodín', () => {
  for (const [table, cols] of Object.entries(LISTS)) {
    for (const c of cols) {
      // `name` es público en tipos de entrada (nombre del tipo), no en el Medidor QR.
      if (table === 'event_ticket_types' && c === 'name') continue;
      assert.doesNotMatch(c, SENSITIVE, `${table}.${c}`);
    }
    assert.ok(!F.toSelect(cols).includes('*'));
  }
});

test('CAMPOS 2: pickPublic descarta columnas privadas y futuras', () => {
  const row = { id: 'x', title: 'T', organizer_id: 'o', creator_id: 'c', plan: 'gold', internal_flag: true, future_col: 1 };
  for (const cols of [F.PUBLIC_EVENT_COLUMNS, F.PUBLIC_ACTIVITY_COLUMNS, F.PUBLIC_COLECTA_COLUMNS]) {
    const out = F.pickPublic(row, cols);
    for (const k of ['organizer_id', 'creator_id', 'plan', 'internal_flag', 'future_col']) assert.equal(k in out, false, k);
  }
  assert.equal(F.pickPublic(null, F.PUBLIC_EVENT_COLUMNS), null);
});

// ---------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------
test('EVENTOS 1: el detalle público pide solo columnas públicas y responde con pickPublic', () => {
  const src = code('src/pages/api/events/[id]/index.js');
  assert.match(src, /\.select\(req\.method === 'GET' \? `\$\{toSelect\(PUBLIC_EVENT_COLUMNS\)\},organizer_id` : '\*'\)/);
  const get = block(src, "if (req.method === 'GET')", "if (req.method === 'PATCH')");
  assert.match(get, /event: \{ \.\.\.pickPublic\(event, PUBLIC_EVENT_COLUMNS\), mp_connected \}/);
  assert.match(get, /if \(isOwner\)/, 'el dueño autenticado conserva la fila completa');
  assert.doesNotMatch(get, /event: \{ \.\.\.event,/);
});

test('EVENTOS 2: los tipos de entrada públicos usan la lista cerrada', () => {
  const get = block(code('src/pages/api/events/[id]/ticket-types/index.js'), "if (req.method === 'GET')", "if (req.method === 'POST')");
  assert.match(get, /\.select\(isOwner \? '\*' : toSelect\(PUBLIC_TICKET_TYPE_COLUMNS\)\)/);
  assert.match(get, /pickPublic\(t, PUBLIC_TICKET_TYPE_COLUMNS\)/);
});

test('EVENTOS 3: la página pública solo usa campos públicos del evento', () => {
  const used = new Set([...code('src/pages/eventos/[id].jsx').matchAll(/\bevent\??\.([a-z_]+)/g)].map((m) => m[1]));
  for (const f of used) if (f !== 'mp_connected') assert.ok(F.PUBLIC_EVENT_COLUMNS.includes(f), `event.${f}`);
});

// ---------------------------------------------------------------------
// Inscripciones
// ---------------------------------------------------------------------
test('INSCRIPCIONES 1: el detalle público pide solo columnas públicas y responde con pickPublic', () => {
  const src = code('src/pages/api/inscripciones/[id]/index.js');
  assert.match(src, /\.select\(req\.method === 'GET' \? `\$\{toSelect\(PUBLIC_ACTIVITY_COLUMNS\)\},organizer_id` : '\*'\)/);
  const get = block(src, "if (req.method === 'GET')", "if (req.method === 'PATCH')");
  assert.match(get, /activity: \{ \.\.\.pickPublic\(activity, PUBLIC_ACTIVITY_COLUMNS\), registered_count/);
  assert.doesNotMatch(get, /activity: \{ \.\.\.activity,/);
});

test('INSCRIPCIONES 2: la página pública solo usa campos públicos de la actividad', () => {
  const used = new Set([...code('src/pages/inscripcion/[id].jsx').matchAll(/\bactivity\??\.([a-z_]+)/g)].map((m) => m[1]));
  for (const f of used) if (!['available_slots', 'registered_count'].includes(f)) assert.ok(F.PUBLIC_ACTIVITY_COLUMNS.includes(f), `activity.${f}`);
});

// ---------------------------------------------------------------------
// Campañas
// ---------------------------------------------------------------------
test('CAMPAÑAS 1: el detalle pide columnas públicas y la tarjeta del organizador no lleva id', () => {
  const src = code('src/pages/api/colectas/[id].js');
  assert.match(src, /\.select\(`\$\{toSelect\(PUBLIC_COLECTA_COLUMNS\)\},creator_id`\)/);
  const creator = block(src, 'creator: {', '},');
  assert.doesNotMatch(creator, /\bid\b/);
});

test('CAMPAÑAS 2: la página no arma enlaces con el id interno del organizador', () => {
  const src = code('src/pages/colectas/[id].jsx');
  assert.doesNotMatch(src, /\/perfil\/\$\{/);
  assert.doesNotMatch(src, /creator\.id/);
});

// ---------------------------------------------------------------------
// Medidor QR
// ---------------------------------------------------------------------
test('MEDIDOR 1: la página pública usa la lista compartida y no publica datos internos', () => {
  const src = code('src/pages/m/[slug].jsx');
  assert.match(src, /\.select\(toSelect\(PUBLIC_MEDIDOR_COLUMNS\)\)/);
  assert.match(src, /medidor: pickPublic\(medidor, PUBLIC_MEDIDOR_COLUMNS\)/);
  for (const c of ['organizer_id', 'name', 'scan_count', 'organizer_name_snapshot']) assert.ok(!F.PUBLIC_MEDIDOR_COLUMNS.includes(c), c);
});

// ---------------------------------------------------------------------
// Exposición pública de Rifas
// ---------------------------------------------------------------------
test('EXPOSICIÓN 1: apagada por defecto; solo el valor exacto "on" la habilita', () => {
  assert.equal(isRafflePublicExposureEnabled({}), false, 'variable ausente');
  assert.equal(isRafflePublicExposureEnabled({ RIFEX_RAFFLES_PUBLIC: undefined }), false, 'undefined');
  assert.equal(isRafflePublicExposureEnabled({ RIFEX_RAFFLES_PUBLIC: '' }), false, 'vacía');
  assert.equal(isRafflePublicExposureEnabled({ RIFEX_RAFFLES_PUBLIC: '   ' }), false, 'solo espacios');
  assert.equal(isRafflePublicExposureEnabled({ RIFEX_RAFFLES_PUBLIC: 'off' }), false, 'off');
  for (const v of ['On', 'ON', 'yes', 'true', '1', 'enabled', 'onn', 'o n', 'off,on']) {
    assert.equal(isRafflePublicExposureEnabled({ RIFEX_RAFFLES_PUBLIC: v }), false, `valor desconocido "${v}"`);
  }
  assert.equal(isRafflePublicExposureEnabled({ RIFEX_RAFFLES_PUBLIC: 'on' }), true, 'on');
  assert.equal(isRafflePublicExposureEnabled({ RIFEX_RAFFLES_PUBLIC: ' on ' }), true, 'on con espacios');
  assert.match(RAFFLE_GONE_HEADERS['X-Robots-Tag'], /noindex/);
});

test('EXPOSICIÓN 1b: variable privada del servidor, nunca NEXT_PUBLIC_', () => {
  const lib = read('src/lib/raffleExposure.js');
  assert.match(lib, /env\.RIFEX_RAFFLES_PUBLIC/);
  let all = '';
  try {
    all = execFileSync('git', ['grep', '-l', 'NEXT_PUBLIC_RIFEX_RAFFLES', '--', 'src'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch (e) {
    if (e.status !== 1) throw e; // 1 = sin coincidencias, que es lo esperado
  }
  assert.equal(all, '', 'ninguna variable pública del navegador controla Rifas');
});

test('EXPOSICIÓN 1c: ninguna ruta pública de Rifas escapa al control', () => {
  const GATED = new Set([
    'src/pages/rifas.js', 'src/pages/rifas/[id].jsx', 'src/pages/rifas/[id]/checkout.jsx',
    'src/pages/api/rifas/index.js', 'src/pages/api/rifas/[id]/index.js', 'src/pages/api/rifas/[id]/qr.png.js',
    'src/pages/api/rifas/[id]/tickets.js',
  ]);
  // Rutas de Rifas que no publican datos de una rifa concreta.
  const PRIVATE_OR_GENERIC = {
    'src/pages/rifas/crear.jsx': 'alias que redirige a la creación autenticada',
    'src/pages/api/rifas/delete.js': 'requiere autenticación del dueño',
    'src/pages/api/rifas/upload-photo.js': 'requiere autenticación del dueño',
    'src/pages/api/rifas/[id]/draw.js': 'sorteo manual del dueño autenticado',
    'src/pages/api/rifas/[id]/extend.js': 'extensión del dueño autenticado',
  };
  const files = execFileSync('git', ['ls-files', 'src/pages/rifas.js', 'src/pages/rifas', 'src/pages/api/rifas'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n');
  for (const f of files) {
    if (GATED.has(f)) {
      assert.match(code(f), /isRafflePublicExposureEnabled\(\)/, `${f} debe pasar por el control`);
    } else {
      assert.ok(f in PRIVATE_OR_GENERIC, `${f}: ruta de Rifas no clasificada`);
      if (f.startsWith('src/pages/api/')) assert.match(code(f), /missing_auth|getUser\(/, `${f} debe exigir autenticación`);
    }
  }
  // Páginas institucionales relacionadas: sin datos de ninguna rifa.
  for (const f of ['src/pages/terminos-rifas.js', 'src/pages/soluciones/rifas.jsx', 'src/pages/reglas-iniciativas-premio.js']) {
    assert.doesNotMatch(code(f), /\/api\/rifas|from\(["']raffles["']\)|raffle_results/, f);
  }
  // Otras lecturas públicas que muestran rifas.
  for (const f of ['src/pages/api/raffles/winner.js', 'src/pages/api/chat/[raffleId].js', 'src/pages/api/perfil/[id].js']) {
    assert.match(code(f), /isRafflePublicExposureEnabled\(\)/, f);
  }
});

test('EXPOSICIÓN 2 (sin cloaking): la decisión nunca depende del visitante', () => {
  const lib = code('src/lib/raffleExposure.js');
  assert.doesNotMatch(lib, /user-agent|userAgent|headers\[|req\.|cookie|\bip\b|\bbots?\b|isBot|crawler/i);
  const gated = [
    'src/pages/rifas.js', 'src/pages/rifas/[id].jsx', 'src/pages/rifas/[id]/checkout.jsx',
    'src/pages/api/rifas/index.js', 'src/pages/api/rifas/[id]/index.js', 'src/pages/api/rifas/[id]/qr.png.js',
    'src/pages/api/rifas/[id]/tickets.js', 'src/pages/api/raffles/winner.js', 'src/pages/api/chat/[raffleId].js',
    'src/pages/api/perfil/[id].js',
  ];
  for (const p of gated) {
    const src = code(p);
    assert.match(src, /isRafflePublicExposureEnabled\(\)/, p);
    assert.doesNotMatch(src, /user-agent|userAgent|facebookexternalhit|facebot|googlebot|isBot/i, p);
  }
});

test('EXPOSICIÓN 3: las páginas devuelven 410 antes de consultar la rifa o redirigir', () => {
  const ficha = code('src/pages/rifas/[id].jsx');
  const gssp = block(ficha, 'export async function getServerSideProps', 'export default function');
  assert.ok(gssp.indexOf('raffleGoneProps(res)') < gssp.indexOf('fetch('), 'el 410 va antes de cualquier lectura');
  assert.ok(gssp.indexOf('raffleGoneProps(res)') < gssp.indexOf('redirect'), 'sin redirección UUID→slug cuando está deshabilitada');
  assert.match(code('src/pages/rifas/[id]/checkout.jsx'), /if \(!isRafflePublicExposureEnabled\(\)\) return raffleGoneProps\(res\);/);
  assert.match(code('src/pages/rifas.js'), /if \(!isRafflePublicExposureEnabled\(\)\) return raffleGoneProps\(res\);/);
});

test('EXPOSICIÓN 4: la página neutra no contiene metadata ni datos de la rifa', () => {
  const src = code('src/components/RaffleGonePage.jsx');
  assert.match(src, /<Layout disableAutoMeta>/);
  assert.match(src, /name="robots" content="noindex, nofollow, noarchive"/);
  assert.doesNotMatch(src, /og:|canonical|ld\+json|props\.|raffle\./i);
});

test('EXPOSICIÓN 5: creación, edición del dueño y pagos no pasan por el control', () => {
  const list = code('src/pages/api/rifas/index.js');
  assert.ok(block(list, "req.method === 'POST'").indexOf('isRafflePublicExposureEnabled') === -1, 'POST de creación sin cambios');
  const detail = code('src/pages/api/rifas/[id]/index.js');
  assert.ok(block(detail, "req.method === 'PATCH'").indexOf('isRafflePublicExposureEnabled') === -1, 'PATCH del dueño sin cambios');
  // Panel privado, scheduler, webhooks, conciliación, pagos y sorteo
  // interno: nunca dependen del control de exposición pública.
  for (const p of [
    'src/pages/api/checkout/mp.js', 'src/pages/api/checkout/webhook.js', 'src/pages/api/checkout/webhook-events.js',
    'src/pages/api/checkout/webhook-colecta.js', 'src/pages/api/checkout/confirm.js', 'src/lib/paymentReconcile.js',
    'src/pages/api/admin/reconcile-payments.js', 'src/pages/api/cron/draw-scheduler.js', 'src/lib/drawWinner.js',
    'src/pages/api/panel/raffles.js', 'src/pages/panel/index.js', 'src/pages/api/rifas/[id]/draw.js',
  ]) {
    assert.doesNotMatch(read(p), /raffleExposure|RIFEX_RAFFLES_PUBLIC/, p);
  }
});

test('EXPOSICIÓN 6 (sin cloaking): la respuesta 410 es idéntica para cualquier visitante', () => {
  const visitors = ['Mozilla/5.0 Chrome/130', 'facebookexternalhit/1.1', 'Facebot', 'Mozilla/5.0 (compatible; Googlebot/2.1)', 'curl/8'];
  const fakeRes = () => {
    const r = { headers: {}, statusCode: 200, body: null };
    r.setHeader = (k, v) => { r.headers[k] = v; };
    r.status = (s) => { r.statusCode = s; return r; };
    r.json = (b) => { r.body = b; return r; };
    return r;
  };
  const apiOut = visitors.map(() => { const r = fakeRes(); sendRaffleGone(r); return JSON.stringify([r.statusCode, r.headers, r.body]); });
  const pageOut = visitors.map(() => { const r = fakeRes(); const p = raffleGoneProps(r); return JSON.stringify([r.statusCode, r.headers, p]); });
  assert.equal(new Set(apiOut).size, 1);
  assert.equal(new Set(pageOut).size, 1);
  assert.match(apiOut[0], /^\[410,/);
  // La decisión solo recibe el entorno, nunca la petición.
  assert.equal(isRafflePublicExposureEnabled.length, 0);
  assert.doesNotMatch(isRafflePublicExposureEnabled.toString(), /req|header|agent|cookie/i);
});

// ---------------------------------------------------------------------
// Migración de permisos
// ---------------------------------------------------------------------
const MIG = 'db/migrations/2026-11-06b_initiatives_public_column_grants.sql';
const RB = 'db/rollback/2026-11-06b_initiatives_public_column_grants_rollback.sql';
const granted = (sql, t) => {
  const m = sql.match(new RegExp(`grant select \\(([^)]+)\\) on table public\\.${t} to anon, authenticated;`));
  return m ? m[1].split(',').map((s) => s.trim()).filter(Boolean) : null;
};

test('MIG 1: por tabla, revoca el permiso de tabla antes de otorgar por columna', () => {
  const sql = code(MIG);
  for (const t of Object.keys(LISTS)) {
    const r = sql.indexOf(`revoke select on table public.${t} from anon, authenticated;`);
    const g = sql.indexOf(`) on table public.${t} to anon, authenticated;`);
    assert.ok(r >= 0 && g > r, t);
  }
});

test('MIG 2: las columnas otorgadas coinciden exactamente con las listas del código', () => {
  const sql = code(MIG);
  for (const [t, cols] of Object.entries(LISTS)) assert.deepEqual(granted(sql, t).sort(), [...cols].sort(), t);
});

test('MIG 3: idempotente y acotada; existe la reversión', () => {
  const sql = code(MIG).toLowerCase();
  assert.doesNotMatch(sql, /\b(create|alter|drop|insert|update|delete|truncate)\b|security definer|service_role/);
  const rb = code(RB);
  for (const t of Object.keys(LISTS)) assert.match(rb, new RegExp(`grant select on table public\\.${t} to anon, authenticated;`));
});

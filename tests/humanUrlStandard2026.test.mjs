// tests/humanUrlStandard2026.test.mjs
// RIFEX HUMAN URL STANDARD 2026 — extiende el patrón de slug humano ya
// certificado en Rifas (humanSlugV2.test.mjs) y Medidor QR
// (medidorQr.test.mjs) a Eventos, Campañas (Colectas) e Inscripciones,
// más la consolidación canonical (único cambio autorizado en Rifas esta
// misión). Cubre: generación deterministica, reintento en colisión real
// (23505), resolución dual UUID-o-slug en el único endpoint de lectura
// por módulo, reuso del UUID ya resuelto en cada página pública
// (nunca el id/slug crudo de la URL de nuevo), y protección explícita
// de los archivos que NUNCA debieron tocarse esta misión (Payment
// Engine, Medidor QR, RPCs de creación de Rifas/checkout/webhook).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function developBlob(p) {
  try {
    return execSync(`git show origin/develop:${p}`, { cwd: ROOT, encoding: 'utf8' });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------
// GENERACIÓN — slugify reutilizado tal cual, sin tercer sistema
// ---------------------------------------------------------------------
test('GEN 1: /api/events crea con slugify(title) + MAX_SLUG_ATTEMPTS + reintento solo en 23505', () => {
  const src = read('src/pages/api/events/index.js');
  assert.match(src, /import \{ slugify \} from '@\/lib\/slugify'/);
  assert.match(src, /const MAX_SLUG_ATTEMPTS = 5/);
  assert.match(src, /slugify\(title\) \|\| 'evento'/);
  assert.match(src, /result\.error\.code !== '23505'/);
});

test('GEN 2: /api/colectas crea con slugify(title) + MAX_SLUG_ATTEMPTS + reintento solo en 23505', () => {
  const src = read('src/pages/api/colectas/index.js');
  assert.match(src, /import \{ slugify \} from '@\/lib\/slugify'/);
  assert.match(src, /const MAX_SLUG_ATTEMPTS = 5/);
  assert.match(src, /slugify\(title\) \|\| 'colecta'/);
  assert.match(src, /result\.error\.code !== '23505'/);
});

test('GEN 3: /api/inscripciones crea con slugify(title), pasa p_slug a la RPC, y reintenta solo en 23505 (nunca en P0001/free_quota)', () => {
  const src = read('src/pages/api/inscripciones/index.js');
  assert.match(src, /import \{ slugify \} from '@\/lib\/slugify'/);
  assert.match(src, /const MAX_SLUG_ATTEMPTS = 5/);
  assert.match(src, /slugify\(title\) \|\| 'actividad'/);
  assert.match(src, /p_slug: slug/);
  assert.match(src, /result\.error\.code !== '23505'/);
  // el chequeo de cuota ya usado sigue intacto, DESPUÉS del loop
  assert.match(src, /free_quota_already_used/);
});

test('GEN 4: los tres generadores usan sufijo aleatorio base36 en colisión, nunca derivado del UUID (mismo criterio que Rifas)', () => {
  for (const p of ['src/pages/api/events/index.js', 'src/pages/api/colectas/index.js', 'src/pages/api/inscripciones/index.js']) {
    const src = read(p);
    assert.match(src, /Math\.random\(\)\.toString\(36\)\.slice\(2, 5\)/);
  }
});

// ---------------------------------------------------------------------
// RESOLUCIÓN — idOrSlugColumn en el único endpoint de lectura por módulo
// ---------------------------------------------------------------------
test('RES 1: GET /api/events/[id] resuelve UUID-o-slug con idOrSlugColumn', () => {
  const src = read('src/pages/api/events/[id]/index.js');
  assert.match(src, /import \{ idOrSlugColumn \} from '@\/lib\/idOrSlug'/);
  assert.match(src, /\.eq\(idOrSlugColumn\(id\), id\)/);
});

test('RES 2: PATCH /api/events/[id] actualiza por event.id (UUID ya resuelto), nunca por el id/slug crudo de la URL', () => {
  const src = read('src/pages/api/events/[id]/index.js');
  assert.match(src, /\.update\(patch\)\s*\n\s*\.eq\('id', event\.id\)/);
});

test('RES 3: GET /api/colectas/[id] resuelve UUID-o-slug con idOrSlugColumn', () => {
  const src = read('src/pages/api/colectas/[id].js');
  assert.match(src, /import \{ idOrSlugColumn \} from '@\/lib\/idOrSlug'/);
  assert.match(src, /\.eq\(idOrSlugColumn\(id\), id\)/);
});

test('RES 4: GET /api/colectas/[id] cuenta colecta_contributions por colecta.id (UUID ya resuelto), nunca por el id crudo de la URL', () => {
  const src = read('src/pages/api/colectas/[id].js');
  assert.match(src, /\.eq\('colecta_id', colecta\.id\)/);
  assert.doesNotMatch(src, /\.eq\('colecta_id', id\)/);
});

test('RES 5: GET /api/inscripciones/[id] resuelve UUID-o-slug con idOrSlugColumn', () => {
  const src = read('src/pages/api/inscripciones/[id]/index.js');
  assert.match(src, /import \{ idOrSlugColumn \} from '@\/lib\/idOrSlug'/);
  assert.match(src, /\.eq\(idOrSlugColumn\(id\), id\)/);
});

test('RES 6: PATCH /api/inscripciones/[id] actualiza por activity.id (UUID ya resuelto), nunca por el id/slug crudo de la URL', () => {
  const src = read('src/pages/api/inscripciones/[id]/index.js');
  assert.match(src, /\.update\(patch\)\s*\n\s*\.eq\('id', activity\.id\)/);
});

// ---------------------------------------------------------------------
// PÁGINAS PÚBLICAS — reuso del UUID ya resuelto, nunca el id/slug crudo
// ---------------------------------------------------------------------
test('PAGE 1: eventos/[id].jsx pide ticket-types con evData.event.id (resuelto), no con el id crudo', () => {
  const src = read('src/pages/eventos/[id].jsx');
  assert.match(src, /fetch\(`\/api\/events\/\$\{evData\.event\.id\}\/ticket-types`\)/);
});

test('PAGE 2: eventos/[id].jsx libera reservas con event.id (resuelto), no con el id crudo', () => {
  const src = read('src/pages/eventos/[id].jsx');
  assert.match(src, /const eventId = event\?\.id/);
  assert.match(src, /fetch\(`\/api\/events\/\$\{eventId\}\/expire-orders`\)/);
});

test('PAGE 3: eventos/[id].jsx hace checkout con event.id (resuelto), no con el id crudo', () => {
  const src = read('src/pages/eventos/[id].jsx');
  assert.match(src, /fetch\(`\/api\/events\/\$\{event\.id\}\/checkout`/);
});

test('PAGE 4: inscripcion/[id].jsx registra con activity.id (resuelto), no con el id crudo', () => {
  const src = read('src/pages/inscripcion/[id].jsx');
  assert.match(src, /fetch\(`\/api\/inscripciones\/\$\{activity\.id\}\/register`/);
});

test('PAGE 5: colectas/[id].jsx no requirió cambios — ya usaba colecta.id en checkout/publicUrl/qrUrl antes de esta misión', () => {
  const current = read('src/pages/colectas/[id].jsx');
  const before = developBlob('src/pages/colectas/[id].jsx');
  assert.ok(before, 'no se pudo leer la versión previa de origin/develop');
  assert.equal(current, before, 'colectas/[id].jsx debe permanecer byte-a-byte idéntico — protegido, no tocado esta misión');
});

// ---------------------------------------------------------------------
// RIFAS — único cambio autorizado: consolidación canonical
// ---------------------------------------------------------------------
test('RIFAS 1: getServerSideProps expone metaSlug desde raffle.slug', () => {
  const src = read('src/pages/rifas/[id].jsx');
  assert.match(src, /metaSlug: raffle\?\.slug \|\| null/);
});

test('RIFAS 2: canonicalId prioriza raffle.slug, luego metaSlug, luego el id crudo', () => {
  const src = read('src/pages/rifas/[id].jsx');
  assert.match(src, /const canonicalId = raffle\?\.slug \|\| metaSlug \|\| id \|\| ""/);
});

test('RIFAS 3: canonical y og:url usan canonicalId, nunca el id crudo directamente', () => {
  const src = read('src/pages/rifas/[id].jsx');
  assert.match(src, /rel="canonical" href=\{canonicalUrl\(`\/rifas\/\$\{canonicalId\}`\)\}/);
  assert.match(src, /property="og:url" content=\{canonicalUrl\(`\/rifas\/\$\{canonicalId\}`\)\}/);
  assert.doesNotMatch(src, /canonicalUrl\(`\/rifas\/\$\{id \|\| ""\}`\)/);
});

test('RIFAS 4: ningún otro archivo de Rifas fue tocado esta misión (creación/checkout/RPC/QR intactos)', () => {
  for (const p of [
    'src/pages/api/rifas/index.js',
    'src/pages/api/rifas/[id]/index.js',
    'src/pages/api/rifas/[id]/qr.png.js',
    'src/lib/idOrSlug.js',
    'src/lib/slugify.js',
  ]) {
    const current = read(p);
    const before = developBlob(p);
    assert.ok(before, `no se pudo leer ${p} de origin/develop`);
    assert.equal(current, before, `${p} debe permanecer byte-a-byte idéntico`);
  }
});

// ---------------------------------------------------------------------
// PROTECCIÓN EXPLÍCITA — Medidor QR, Payment Engine, QR ya vivos
// ---------------------------------------------------------------------
test('PROTEGIDO 1: Medidor QR permanece completamente intacto (baseline protegido)', () => {
  for (const p of [
    'src/pages/api/medidor-qr/index.js',
    'src/pages/api/medidor-qr/[id]/index.js',
    'src/pages/m/[slug].jsx',
  ]) {
    const current = read(p);
    const before = developBlob(p);
    assert.ok(before, `no se pudo leer ${p} de origin/develop`);
    assert.equal(current, before, `${p} debe permanecer byte-a-byte idéntico — Medidor QR es baseline protegido`);
  }
});

test('PROTEGIDO 2: Payment Engine / checkout / webhook permanecen completamente intactos', () => {
  for (const p of [
    'src/pages/api/checkout/mp.js',
    'src/pages/api/checkout/colecta.js',
    'src/pages/api/checkout/webhook.js',
    'src/pages/api/events/[id]/checkout.js',
    'src/pages/api/inscripciones/[id]/register.js',
  ]) {
    const current = read(p);
    const before = developBlob(p);
    assert.ok(before, `no se pudo leer ${p} de origin/develop`);
    assert.equal(current, before, `${p} debe permanecer byte-a-byte idéntico — fuera de alcance de esta misión`);
  }
});

test('PROTEGIDO 3: los QR ya vivos que codifican UUID (Rifas/Colectas) siguen sin tocarse — decisión deliberada, no un olvido', () => {
  for (const p of ['src/pages/api/rifas/[id]/qr.png.js', 'src/pages/api/colectas/[id]/qr.png.js']) {
    const current = read(p);
    const before = developBlob(p);
    assert.ok(before, `no se pudo leer ${p} de origin/develop`);
    assert.equal(current, before);
  }
});

test('PROTEGIDO 4: los QR de token opaco (tickets de Eventos, participantes de Inscripciones) siguen sin tocarse', () => {
  for (const p of [
    'src/pages/api/events/tickets/[token]/qr.png.js',
    'src/pages/api/inscripciones/i/[token]/qr.png.js',
  ]) {
    const current = read(p);
    const before = developBlob(p);
    assert.ok(before, `no se pudo leer ${p} de origin/develop`);
    assert.equal(current, before);
  }
});

// ---------------------------------------------------------------------
// MIGRACIÓN — columnas/índices/RPC aditivos, forward-only
// ---------------------------------------------------------------------
test('MIG 1: la migración agrega slug nullable + índice único parcial a los 3 módulos', () => {
  const sql = read('db/migrations/2026-09-10_human_url_standard.sql');
  for (const table of ['events', 'colectas', 'registration_activities']) {
    assert.match(sql, new RegExp(`alter table public\\.${table}\\s+add column if not exists slug text`));
    assert.match(sql, new RegExp(`create unique index if not exists ${table}_slug_unique_idx\\s+on public\\.${table} \\(slug\\)\\s+where slug is not null`));
  }
});

test('MIG 2: la migración nunca usa drop/truncate/delete — forward-only, cero destructivo', () => {
  const sql = read('db/migrations/2026-09-10_human_url_standard.sql').toLowerCase();
  assert.doesNotMatch(sql, /\bdrop\s+(table|column|function|index)\b/);
  assert.doesNotMatch(sql, /\btruncate\b/);
  assert.doesNotMatch(sql, /\bdelete\s+from\b/);
});

test('MIG 3: create_free_registration_activity se extiende con un NUEVO overload (p_slug default null), el original de 13 params no se toca', () => {
  const sql = read('db/migrations/2026-09-10_human_url_standard.sql');
  assert.match(sql, /p_slug text default null/);
  assert.match(sql, /create or replace function public\.create_free_registration_activity/);
  // el REVOKE/GRANT del nuevo overload lista explícitamente 14 tipos (13 + el nuevo text)
  const grantMatch = sql.match(/grant execute on function public\.create_free_registration_activity\(([^)]+)\)/);
  assert.ok(grantMatch, 'debe existir el grant del nuevo overload');
  const argTypes = grantMatch[1].split(',').map((s) => s.trim());
  assert.equal(argTypes.length, 14);
});

// ---------------------------------------------------------------------
// RESPUESTA — slug expuesto donde el frontend lo necesita
// ---------------------------------------------------------------------
test('RESP 1: GET /api/colectas/[id] expone slug en la respuesta pública', () => {
  const src = read('src/pages/api/colectas/[id].js');
  assert.match(src, /slug: colecta\.slug \|\| null/);
});

test('RESP 2: GET /api/events/[id] expone slug implícitamente vía select(\'*\')', () => {
  const src = read('src/pages/api/events/[id]/index.js');
  assert.match(src, /\.select\('\*'\)/);
});

test('RESP 3: GET /api/inscripciones/[id] expone slug implícitamente vía select(\'*\')', () => {
  const src = read('src/pages/api/inscripciones/[id]/index.js');
  assert.match(src, /\.select\('\*'\)/);
});

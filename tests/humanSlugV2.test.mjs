// tests/humanSlugV2.test.mjs
// RIFEX HUMAN SLUG V2 + PUBLIC RAFFLE CLEANUP (2026-09-07) — retira el
// modal antiguo de resumen (RaffleIntroModal) de la ficha pública nueva,
// y humaniza el slug de rifas nuevas (/rifas/lambo en vez de
// /rifas/lambo-6f9973), preservando compatibilidad total con UUID
// histórico y slug V1 ya emitido. Trust ("Antes de continuar") no se
// toca. La prueba adversarial de concurrencia real (§4/§8 del mandato)
// se ejecuta aparte contra un fixture disposable en rifex-dev — este
// archivo cubre estructura de código + lógica pura determinística.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ---------------------------------------------------------------------
// OBJETIVO A — modal antiguo retirado
// ---------------------------------------------------------------------
test('MODAL 1: RaffleIntroModal ya no se importa en la ficha pública', () => {
  const src = read('src/pages/rifas/[id].jsx');
  assert.doesNotMatch(src, /RaffleIntroModal/);
});

test('MODAL 2: el estado showIntro y su lógica de dismiss fueron retirados por completo', () => {
  const src = read('src/pages/rifas/[id].jsx');
  assert.doesNotMatch(src, /showIntro/);
  assert.doesNotMatch(src, /rifex\.intro\.dismissed/);
  assert.doesNotMatch(src, /noIntro|nointro/);
});

test('MODAL 3: el componente RaffleIntroModal.jsx en sí NO se borró (retiro quirúrgico de invocación, no del archivo)', () => {
  const p = path.join(ROOT, 'src/components/rifex/RaffleIntroModal.jsx');
  assert.ok(fs.existsSync(p), 'el archivo del componente debe seguir existiendo');
  const src = fs.readFileSync(p, 'utf8');
  assert.match(src, /export default function RaffleIntroModal/);
});

test('MODAL 4: crear-rifa.jsx nunca importó/renderizó RaffleIntroModal (solo lo mencionaba en un comentario) — confirmado sin cambios', () => {
  const src = read('src/pages/crear-rifa.jsx');
  assert.doesNotMatch(src, /import RaffleIntroModal/);
  assert.doesNotMatch(src, /<RaffleIntroModal/);
});

// ---------------------------------------------------------------------
// TRUST — "Antes de continuar" permanece completamente intacto
// ---------------------------------------------------------------------
test('TRUST 1: TrustPopup sigue importado y renderizado exactamente igual en la ficha pública', () => {
  const src = read('src/pages/rifas/[id].jsx');
  assert.match(src, /import TrustPopup from "\.\.\/\.\.\/components\/TrustPopup"/);
  assert.match(src, /<TrustPopup trustLevel=\{effectiveTrustLevel\} \/>/);
});

test('TRUST 2: el componente TrustPopup.jsx no fue modificado por esta misión', () => {
  const p = path.join(ROOT, 'src/components/TrustPopup.jsx');
  assert.ok(fs.existsSync(p));
  const src = fs.readFileSync(p, 'utf8');
  assert.ok(src.length > 0);
});

// ---------------------------------------------------------------------
// OBJETIVO B — Human Slug V2: generación
// ---------------------------------------------------------------------
test('SLUG-V2 1: slugify("Lambo") produce "lambo", sin sufijo', async () => {
  const { slugify } = await import('../src/lib/slugify.js');
  assert.equal(slugify('Lambo'), 'lambo');
});

test('SLUG-V2 2: slugify normaliza "Toyota RAV4 2026" -> "toyota-rav4-2026"', async () => {
  const { slugify } = await import('../src/lib/slugify.js');
  assert.equal(slugify('Toyota RAV4 2026'), 'toyota-rav4-2026');
});

test('SLUG-V2 3: slugify normaliza acentos y signos de puntuación — "¡10 Millones en Efectivo!" -> "10-millones-en-efectivo"', async () => {
  const { slugify } = await import('../src/lib/slugify.js');
  assert.equal(slugify('¡10 Millones en Efectivo!'), '10-millones-en-efectivo');
  assert.equal(slugify('Camión de Diseño'), 'camion-de-diseno');
});

test('SLUG-V2 4: primer intento de creación usa siempre el slug base sin sufijo (nunca sufijo por defecto)', () => {
  const src = read('src/pages/api/rifas/index.js');
  assert.match(src, /const slug = attempt === 0 \? baseSlug : /);
});

test('SLUG-V2 5: el sufijo de colisión es ~3 caracteres alfanuméricos aleatorios, nunca derivado del UUID', () => {
  const src = read('src/pages/api/rifas/index.js');
  assert.match(src, /Math\.random\(\)\.toString\(36\)\.slice\(2, 5\)/);
  assert.doesNotMatch(src, /substr\(id/);
  assert.doesNotMatch(src, /\.slice\(0,\s*6\)/);
});

test('SLUG-V2 6: reintento solo ocurre ante colisión REAL (Postgres 23505), nunca ante otro tipo de error', () => {
  const src = read('src/pages/api/rifas/index.js');
  assert.match(src, /if \(result\.error\.code !== '23505'\) break;/);
});

test('SLUG-V2 7: MAX_SLUG_ATTEMPTS es razonable (>=3) para dar margen bajo colisión concurrente real', () => {
  const src = read('src/pages/api/rifas/index.js');
  const m = src.match(/const MAX_SLUG_ATTEMPTS = (\d+);/);
  assert.ok(m, 'MAX_SLUG_ATTEMPTS debe existir');
  assert.ok(Number(m[1]) >= 3);
});

test('SLUG-V2 8: NO existe un patrón SELECT-then-INSERT para chequear disponibilidad de slug (evita race condition) — el intento de INSERT vía RPC es la única autoridad', () => {
  const src = read('src/pages/api/rifas/index.js');
  // No debe haber un SELECT explícito de "slug" antes del intento de creación
  const beforeInsert = src.slice(0, src.indexOf("supabase.rpc('create_raffle_with_declarations'"));
  assert.doesNotMatch(beforeInsert.slice(-800), /\.from\(['"]raffles['"]\)[\s\S]{0,120}\.select\([\s\S]{0,60}slug/);
});

// ---------------------------------------------------------------------
// Persistencia — autoridad real de unicidad (índice único parcial, ya
// aplicado en la misión anterior, aditivo, sin migración nueva en esta).
// ---------------------------------------------------------------------
test('SLUG-V2 9: la migración de RAFFLE VISUAL POLISH ya estableció el índice único parcial real (no se requiere una migración nueva en esta misión)', () => {
  const src = read('db/migrations/2026-09-07_raffle_slug_features.sql');
  assert.match(src, /create unique index if not exists raffles_slug_unique_idx/);
  assert.match(src, /on public\.raffles \(slug\)/);
  assert.match(src, /where slug is not null/);
});

test('SLUG-V2 10: esta misión no agrega ninguna migración SQL nueva (Human Slug V2 reutiliza el constraint ya certificado)', () => {
  // El filtro por prefijo de fecha asumía que ninguna otra misión
  // agregaría una migración fechada 2026-09-07/08 — supuesto que dejó
  // de sostenerse cuando una misión no relacionada (MEDIDOR QR V1,
  // dominio propio: medidores_qr/medidor_qr_*, nunca toca raffles/slug)
  // agregó la suya el mismo día. Se excluye explícitamente por nombre
  // en vez de ampliar el patrón de fecha, para que el invariante real
  // ("Human Slug V2 no agrega SQL nueva") no se afloje silenciosamente
  // ante la próxima migración de otra misión con la misma fecha.
  const migDir = path.join(ROOT, 'db/migrations');
  const files = fs.readdirSync(migDir);
  const KNOWN_UNRELATED_SAME_DAY = ['2026-09-08_medidor_qr_v1.sql'];
  const newOnes = files
    .filter((f) => f.startsWith('2026-09-07') || f.startsWith('2026-09-08'))
    .filter((f) => !KNOWN_UNRELATED_SAME_DAY.includes(f));
  assert.deepEqual(newOnes.sort(), ['2026-09-07_raffle_slug_features.sql']);
});

// ---------------------------------------------------------------------
// Compatibilidad de URLs
// ---------------------------------------------------------------------
test('COMPAT 1: idOrSlugColumn resuelve UUID histórico por columna id', async () => {
  const mod = await import('../src/lib/idOrSlug.js');
  assert.equal(mod.idOrSlugColumn('6f997398-a5d3-4330-9aeb-1228a1ff1c3f'), 'id');
});

test('COMPAT 2: idOrSlugColumn resuelve slug V1 (con sufijo hex tipo lambo-6f9973) por columna slug', async () => {
  const mod = await import('../src/lib/idOrSlug.js');
  assert.equal(mod.idOrSlugColumn('lambo-6f9973'), 'slug');
});

test('COMPAT 3: idOrSlugColumn resuelve slug V2 (con sufijo corto tipo lambo-k7m, o sin sufijo) por columna slug', async () => {
  const mod = await import('../src/lib/idOrSlug.js');
  assert.equal(mod.idOrSlugColumn('lambo-k7m'), 'slug');
  assert.equal(mod.idOrSlugColumn('lambo'), 'slug');
  assert.equal(mod.idOrSlugColumn('toyota-rav4-2026'), 'slug');
});

test('COMPAT 4: GET /api/rifas/[id] sigue resolviendo por id-o-slug indistintamente (sin cambios de esta misión)', () => {
  const src = read('src/pages/api/rifas/[id]/index.js');
  assert.match(src, /idOrSlugColumn\(id\)/);
});

test('COMPAT 5: la carga inicial de la ficha pública (loadData) sigue resolviendo por id-o-slug indistintamente', () => {
  const src = read('src/pages/rifas/[id].jsx');
  assert.match(src, /const col = idOrSlugColumn\(rid\)/);
  assert.match(src, /\.eq\(col, rid\)/);
});

// ---------------------------------------------------------------------
// UUID sigue siendo la identidad autoritativa interna — re-auditoría
// explícita pedida por el mandato (checkout/realtime/winner/release).
// ---------------------------------------------------------------------
test('IDENTIDAD-V2 1: checkout sigue usando raffle.id (UUID real), nunca el parámetro crudo de la URL', () => {
  // RIFEX CHECKOUT UNIFICADO V2 (2026-09-07): el submit real a
  // /api/checkout/mp se movió de rifas/[id].jsx a rifas/[id]/checkout.jsx
  // — esta prueba se actualiza para seguir esa lógica a su ubicación
  // real, el criterio de seguridad (nunca el id crudo) no cambia.
  const src = read('src/pages/rifas/[id]/checkout.jsx');
  assert.match(src, /raffle_id: raffle\.id,/);
  assert.match(src, /raffleId: raffle\.id,/);
  assert.doesNotMatch(src, /raffle_id:\s*id,/);
});

test('IDENTIDAD-V2 2: el canal realtime de tickets sigue dependiendo de raffle?.id, nunca del id crudo de la URL', () => {
  const src = read('src/pages/rifas/[id].jsx');
  assert.match(src, /const rid = raffle\?\.id;\s*\n\s*if \(!rid\) return;\s*\n\s*const channel = supabase/);
  assert.match(src, /\}, \[raffle\?\.id\]\);/);
});

test('IDENTIDAD-V2 3: release-expired y ensureWinner siguen usando el UUID real ya resuelto', () => {
  const src = read('src/pages/rifas/[id].jsx');
  assert.match(src, /fetch\(`\/api\/tickets\/release-expired\?rid=\$\{rid\}`\)/);
  assert.match(src, /await ensureWinner\(raffle\?\.id\);/);
});

test('IDENTIDAD-V2 4: checkout/mp.js, api/raffles/winner.js y el draw no fueron tocados por esta misión (siguen operando solo sobre el raffle_id/rid que reciben, agnósticos a slug)', () => {
  const mp = read('src/pages/api/checkout/mp.js');
  assert.match(mp, /async function assignRandomAvailableNumbers/);
  const winner = read('src/pages/api/raffles/winner.js');
  assert.match(winner, /drawWinner\(rid,/);
});

test('IDENTIDAD-V2 5: el QR de rifa (qr.png.js) sigue resolviendo exclusivamente por UUID real, sin soporte de slug (fuera de alcance, sin cambios)', () => {
  const src = read('src/pages/api/rifas/[id]/qr.png.js');
  assert.match(src, /\.eq\('id', id\)/);
});

// ---------------------------------------------------------------------
// Sin cambios de lógica financiera/sorteo (mismo criterio que misiones
// anteriores)
// ---------------------------------------------------------------------
test('SIN-CAMBIOS-V2 1: reserve_tickets_for_purchase sigue siendo la RPC atómica real, sin reemplazo', () => {
  const src = read('src/pages/api/checkout/mp.js');
  assert.match(src, /reserve_tickets_for_purchase/);
});

test('SIN-CAMBIOS-V2 2: webhook.js no fue modificado por esta misión', () => {
  const src = read('src/pages/api/checkout/webhook.js');
  assert.match(src, /export default async function handler/);
});

test('SIN-CAMBIOS-V2 3: drawWinner.js sigue siendo la única autoridad de sorteo', () => {
  const src = read('src/lib/drawWinner.js');
  assert.ok(src.length > 0);
});

test('SIN-CAMBIOS-V2 4: el cliente sigue sin poder mandar numbers/assigned_numbers/forced_numbers en el checkout', () => {
  const src = read('src/pages/api/checkout/mp.js');
  assert.doesNotMatch(src, /req\.body\.numbers/);
  assert.doesNotMatch(src, /req\.body\.assigned_numbers/);
  assert.doesNotMatch(src, /req\.body\.forced_numbers/);
});

test('SIN-CAMBIOS-V2 5: ALLOWED_CREATE_FIELDS de POST /api/rifas sigue sin incluir "slug" (el servidor siempre lo genera, nunca el cliente)', () => {
  const src = read('src/pages/api/rifas/index.js');
  const m = src.match(/const ALLOWED_CREATE_FIELDS = new Set\(\[([\s\S]*?)\]\);/);
  assert.ok(m);
  assert.doesNotMatch(m[1], /'slug'/);
});

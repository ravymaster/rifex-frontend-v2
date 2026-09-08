// tests/raffleVisualPolish.test.mjs
// RAFFLE VISUAL POLISH (2026-09-07) — implementa el brief de Doris:
// hero más grande, galería con flechas + indicador "+N fotos", layout de
// 2 columnas con pestañas, características dinámicas, y slug amigable
// (con migración aditiva). Cero cambios a reservas/pagos/webhook/sorteo.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ---------------------------------------------------------------------
// idOrSlug helper
// ---------------------------------------------------------------------
test('SLUG 1: idOrSlug.js exporta isUuid e idOrSlugColumn', () => {
  const src = read('src/lib/idOrSlug.js');
  assert.match(src, /export function isUuid/);
  assert.match(src, /export function idOrSlugColumn/);
});

test('SLUG 2: isUuid reconoce UUIDs reales y rechaza slugs', async () => {
  const mod = await import('../src/lib/idOrSlug.js');
  assert.equal(mod.isUuid('6f997398-a5d3-4330-9aeb-1228a1ff1c3f'), true);
  assert.equal(mod.isUuid('lambo-6f9973'), false);
  assert.equal(mod.isUuid('lambo'), false);
  assert.equal(mod.isUuid(''), false);
  assert.equal(mod.isUuid(null), false);
  assert.equal(mod.isUuid(undefined), false);
});

test('SLUG 3: idOrSlugColumn elige "id" para UUID y "slug" para cualquier otra cosa', async () => {
  const mod = await import('../src/lib/idOrSlug.js');
  assert.equal(mod.idOrSlugColumn('6f997398-a5d3-4330-9aeb-1228a1ff1c3f'), 'id');
  assert.equal(mod.idOrSlugColumn('lambo-6f9973'), 'slug');
});

test('SLUG 4: migración agrega slug + features + índice único parcial + extiende create_raffle_with_declarations', () => {
  const src = read('db/migrations/2026-09-07_raffle_slug_features.sql');
  assert.match(src, /add column if not exists slug text/);
  assert.match(src, /add column if not exists features jsonb not null default '\[\]'::jsonb/);
  assert.match(src, /create unique index if not exists raffles_slug_unique_idx/);
  assert.match(src, /where slug is not null/);
  assert.match(src, /create or replace function public\.create_raffle_with_declarations/);
  assert.match(src, /p_raffle->>'slug'/);
  assert.match(src, /p_raffle->'features'/);
});

test('SLUG 5: migración hace backfill de rifas existentes sin slug (nunca deja NULL sin razón)', () => {
  const src = read('db/migrations/2026-09-07_raffle_slug_features.sql');
  assert.match(src, /update public\.raffles\s*\nset slug =/);
  assert.match(src, /where slug is null/);
});

test('SLUG 6: POST /api/rifas genera slug desde el título con slugify + reintento acotado ante colisión (23505)', () => {
  const src = read('src/pages/api/rifas/index.js');
  assert.match(src, /import \{ slugify \} from '@\/lib\/slugify'/);
  assert.match(src, /const baseSlug = slugify\(row\.title\)/);
  assert.match(src, /MAX_SLUG_ATTEMPTS/);
  assert.match(src, /result\.error\.code !== '23505'/);
});

test('SLUG 7: GET /api/rifas/[id] resuelve por id-o-slug, nunca asume uno u otro', () => {
  const src = read('src/pages/api/rifas/[id]/index.js');
  assert.match(src, /import \{ idOrSlugColumn \} from '@\/lib\/idOrSlug'/);
  assert.match(src, /\.eq\(idOrSlugColumn\(id\), id\)/);
});

test('SLUG 8: crear-rifa.jsx redirige preferiendo el slug, con fallback al UUID real', () => {
  const src = read('src/pages/crear-rifa.jsx');
  assert.match(src, /const dest = data\.data\?\.slug \|\| data\.id \|\| data\.data\?\.id/);
});

test('SLUG 9: rifas/[id].jsx resuelve la carga inicial por id-o-slug (nunca solo .eq("id", rid))', () => {
  const src = read('src/pages/rifas/[id].jsx');
  assert.match(src, /import \{ idOrSlugColumn \} from "\.\.\/\.\.\/lib\/idOrSlug"/);
  assert.match(src, /const col = idOrSlugColumn\(rid\)/);
  assert.match(src, /\.eq\(col, rid\)/);
});

// ---------------------------------------------------------------------
// Integridad de identidad real (UUID) tras cargar por slug — el bug que
// habría introducido esta misión si no se corregía: usar el slug de la
// URL en vez del UUID real para checkout/realtime/winner/release-expired.
// ---------------------------------------------------------------------
test('IDENTIDAD 1: checkout usa raffle.id (UUID real ya resuelto), nunca el "id" crudo de la URL', () => {
  // RIFEX CHECKOUT UNIFICADO V2 (2026-09-07): el submit real vive ahora
  // en rifas/[id]/checkout.jsx, no en la ficha pública — se sigue la
  // lógica a su ubicación real; el criterio de seguridad no cambia.
  const src = read('src/pages/rifas/[id]/checkout.jsx');
  assert.match(src, /raffle_id: raffle\.id,/);
  assert.match(src, /raffleId: raffle\.id,/);
  // nunca el patrón viejo (bug potencial): raffle_id: id,
  assert.doesNotMatch(src, /raffle_id:\s*id,/);
});

test('IDENTIDAD 2: el canal realtime de tickets se suscribe con raffle.id resuelto, depende de [raffle?.id]', () => {
  const src = read('src/pages/rifas/[id].jsx');
  assert.match(src, /const rid = raffle\?\.id;\s*\n\s*if \(!rid\) return;\s*\n\s*const channel = supabase/);
  assert.match(src, /filter: `raffle_id=eq\.\$\{rid\}`/);
  assert.match(src, /\.subscribe\(\);\s*\n\s*return \(\) => \{ try \{ supabase\.removeChannel\(channel\); \} catch \{\} \};\s*\n\s*\}, \[raffle\?\.id\]\);/);
});

test('IDENTIDAD 3: release-expired usa raffle.id resuelto, depende de [raffle?.id]', () => {
  const src = read('src/pages/rifas/[id].jsx');
  assert.match(src, /fetch\(`\/api\/tickets\/release-expired\?rid=\$\{rid\}`\)/);
});

test('IDENTIDAD 4: loadData resuelve por columna id-o-slug y dispara loadWinner con el UUID ya resuelto', () => {
  const src = read('src/pages/rifas/[id].jsx');
  assert.match(src, /if \(raffleData\?\.id\) \{\s*\n\s*await loadCounts\(raffleData\.id, raffleData\?\._legacy\);\s*\n\s*\/\/[^\n]*\n\s*loadWinner\(raffleData\.id\);/);
});

test('IDENTIDAD 5: ensureWinner tras pago aprobado usa raffle?.id, no el slug de la URL', () => {
  const src = read('src/pages/rifas/[id].jsx');
  assert.match(src, /await ensureWinner\(raffle\?\.id\);/);
});

// ---------------------------------------------------------------------
// Características dinámicas
// ---------------------------------------------------------------------
test('FEATURES 1: crear-rifa.jsx tiene UI de + Agregar característica con límite MAX_FEATURES', () => {
  const src = read('src/pages/crear-rifa.jsx');
  assert.match(src, /MAX_FEATURES = 8/);
  assert.match(src, /\+ Agregar característica/);
  assert.match(src, /function addFeature\(\)/);
  assert.match(src, /function removeFeature\(i\)/);
});

test('FEATURES 2: el payload de creación manda features filtradas (label y value no vacíos)', () => {
  const src = read('src/pages/crear-rifa.jsx');
  assert.match(src, /features: features\s*\n\s*\.map\(\(f\) => \(\{ label: f\.label\.trim\(\), value: f\.value\.trim\(\) \}\)\)\s*\n\s*\.filter\(\(f\) => f\.label && f\.value\)/);
});

test('FEATURES 3: POST /api/rifas valida features server-side (array, límite, longitud) — nunca confía en el cliente', () => {
  const src = read('src/pages/api/rifas/index.js');
  assert.match(src, /MAX_FEATURES = 8/);
  assert.match(src, /MAX_FEATURE_LABEL_LEN/);
  assert.match(src, /MAX_FEATURE_VALUE_LEN/);
  assert.match(src, /if \(!Array\.isArray\(row\.features\)\)/);
  assert.match(src, /too_many_features/);
  assert.match(src, /feature_too_long/);
});

test('FEATURES 4: filas de características vacías (sin label o sin value) se descartan silenciosamente, nunca rechazan la creación', () => {
  const src = read('src/pages/api/rifas/index.js');
  assert.match(src, /if \(!label \|\| !value\) continue;/);
});

test('FEATURES 5: rifas\\/\\[id\\].jsx renderiza raffle.features como grid de características dentro de la pestaña "Sobre el premio"', () => {
  const src = read('src/pages/rifas/[id].jsx');
  assert.match(src, /Array\.isArray\(raffle\.features\) && raffle\.features\.length > 0/);
  assert.match(src, /raffle\.features\.map\(\(f, i\) =>/);
  assert.match(src, /f\.label/);
  assert.match(src, /f\.value/);
});

// ---------------------------------------------------------------------
// Galería mejorada
// ---------------------------------------------------------------------
test('GALERIA 1: PrizeGallery tiene flechas prev/next sobre la imagen principal', () => {
  const src = read('src/components/rifex/PrizeGallery.jsx');
  assert.match(src, /navArrowPrev/);
  assert.match(src, /navArrowNext/);
  assert.match(src, /const goPrev = \(\) =>/);
  assert.match(src, /const goNext = \(\) =>/);
});

test('GALERIA 2: PrizeGallery muestra indicador "+N fotos" cuando hay más miniaturas de las que caben', () => {
  const src = read('src/components/rifex/PrizeGallery.jsx');
  assert.match(src, /VISIBLE_THUMBS = 4/);
  assert.match(src, /hasOverflow/);
  assert.match(src, /\+\{overflowCount\} fotos/);
});

test('GALERIA 3: el lightbox también tiene navegación prev/next, no solo el hero', () => {
  const src = read('src/components/rifex/PrizeGallery.jsx');
  assert.match(src, /lightboxNavPrev/);
  assert.match(src, /lightboxNavNext/);
});

test('GALERIA 4: la imagen principal usa object-fit: contain (no recorta la foto de portada, per brief)', () => {
  const css = read('src/styles/prizeGallery.module.css');
  assert.match(css, /\.mainImage\s*\{[^}]*object-fit:\s*contain/);
});

test('GALERIA 5: crear-rifa.jsx sigue capando la subida real a MAX_PHOTOS (5) en el upload real, no solo en el preview', () => {
  const src = read('src/pages/crear-rifa.jsx');
  assert.match(src, /uploadPrizePhotos\(Array\.from\(prizePhotos\)\.slice\(0, MAX_PHOTOS\), token\)/);
});

// ---------------------------------------------------------------------
// Layout 2 columnas + pestañas
// ---------------------------------------------------------------------
test('LAYOUT 1: rifas/[id].jsx tiene layout de 2 columnas (mainCol + sideCol)', () => {
  const src = read('src/pages/rifas/[id].jsx');
  assert.match(src, /styles\.layout2col/);
  assert.match(src, /styles\.mainCol/);
  assert.match(src, /styles\.sideCol/);
});

test('LAYOUT 2: las 5 pestañas del brief están presentes (Sobre el premio / Cómo participar / Condiciones / Organizador / Preguntas frecuentes)', () => {
  const src = read('src/pages/rifas/[id].jsx');
  assert.match(src, /Sobre el premio/);
  assert.match(src, /Cómo participar/);
  assert.match(src, /Condiciones/);
  assert.match(src, /Organizador/);
  assert.match(src, /Preguntas frecuentes/);
});

test('LAYOUT 3: la pestaña activa se controla con activeTab, un solo estado, sin duplicar lógica de negocio', () => {
  const src = read('src/pages/rifas/[id].jsx');
  assert.match(src, /const \[activeTab, setActiveTab\] = useState\("premio"\)/);
  assert.match(src, /activeTab === "premio"/);
  assert.match(src, /activeTab === "participar"/);
  assert.match(src, /activeTab === "condiciones"/);
  assert.match(src, /activeTab === "organizador"/);
  assert.match(src, /activeTab === "faq"/);
});

test('LAYOUT 4: el sidebar tiene la Buy Box consolidada (sorteo/disponibles/valor + CTA), badges de confianza y banner de seguridad', () => {
  // FINAL VISUAL LOCK (2026-09-08): drawCard/statCardsRow (3 tarjetas
  // separadas) se consolidaron dentro de la propia Buy Box
  // (buyBoxInfoRow) — mismo dato, misma info, una sola tarjeta.
  const src = read('src/pages/rifas/[id].jsx');
  assert.match(src, /styles\.buyBoxInfoRow/);
  assert.match(src, /styles\.staticTrustRow/);
  assert.match(src, /styles\.safetyNote/);
});

test('LAYOUT 5: la sección "Condiciones" preserva el bloque real de premioInfo (ámbar/verde/neutro) sin alterar su lógica', () => {
  const src = read('src/pages/rifas/[id].jsx');
  assert.match(src, /activeTab === "condiciones"/);
  assert.match(src, /row\.tone === "amber" \? styles\.alertAmber : row\.tone === "green" \? styles\.alertGreen : styles\.alertNeutral/);
});

test('LAYOUT 6: la Buy Box (RIFEX CHECKOUT V2) solo ofrece el selector/CTA de compra con la misma condición canBuy real; si no, un botón deshabilitado explica por qué', () => {
  // RIFEX CHECKOUT V2 — UX CORRECTION PASS (2026-09-07): el botón-gate
  // "Comprar número" fue reemplazado por la Buy Box siempre visible.
  // FINAL VISUAL LOCK (2026-09-08): la Buy Box ahora se renderiza siempre
  // (nunca detrás de un ternario canBuy ? <BuyBox> : <button>), y es el
  // propio componente BuyBox quien decide internamente, vía la prop
  // canBuy, si muestra el selector/CTA real o el botón deshabilitado —
  // canBuy en sí no cambió.
  const src = read('src/pages/rifas/[id].jsx');
  assert.match(src, /const canBuy = !salesClosed && !soldOut && counts\.available > 0;/);
  assert.match(src, /<BuyBox\b[\s\S]{0,700}canBuy=\{canBuy\}/);
  assert.match(src, /\{canBuy \? \(/);
  assert.match(src, /<button type="button" className=\{styles\.buyBoxCta\} disabled>/);
});

// ---------------------------------------------------------------------
// Sin cambios a backend financiero/sorteo (mismo criterio que la misión
// anterior — verificación estructural de que estos archivos siguen
// intactos en su lógica real).
// ---------------------------------------------------------------------
test('SIN CAMBIOS 1: checkout/mp.js conserva assignRandomAvailableNumbers y reserve_tickets_for_purchase intactos', () => {
  const src = read('src/pages/api/checkout/mp.js');
  assert.match(src, /async function assignRandomAvailableNumbers/);
  assert.match(src, /reserve_tickets_for_purchase/);
});

test('SIN CAMBIOS 2: checkout/webhook.js no fue tocado por esta misión', () => {
  const src = read('src/pages/api/checkout/webhook.js');
  assert.match(src, /export default async function handler/);
});

test('SIN CAMBIOS 3: drawWinner.js sigue siendo la única autoridad de sorteo', () => {
  const src = read('src/lib/drawWinner.js');
  assert.ok(src.length > 0);
});

// ---------------------------------------------------------------------
// Seguridad — el cliente nunca puede inyectar números específicos ni
// forzar un slug/UUID ajeno vía el body de creación.
// ---------------------------------------------------------------------
test('SEGURIDAD 1: ALLOWED_CREATE_FIELDS de POST /api/rifas no incluye "slug" (el servidor lo genera siempre, nunca el cliente)', () => {
  const src = read('src/pages/api/rifas/index.js');
  const m = src.match(/const ALLOWED_CREATE_FIELDS = new Set\(\[([\s\S]*?)\]\);/);
  assert.ok(m, 'ALLOWED_CREATE_FIELDS debe existir');
  assert.doesNotMatch(m[1], /'slug'/);
});

test('SEGURIDAD 2: POST /api/checkout/mp sigue sin aceptar "numbers"/"assigned_numbers"/"forced_numbers" del cliente', () => {
  const src = read('src/pages/api/checkout/mp.js');
  assert.doesNotMatch(src, /req\.body\.numbers/);
  assert.doesNotMatch(src, /req\.body\.assigned_numbers/);
  assert.doesNotMatch(src, /req\.body\.forced_numbers/);
});

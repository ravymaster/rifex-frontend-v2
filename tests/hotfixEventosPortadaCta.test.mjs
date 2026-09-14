// tests/hotfixEventosPortadaCta.test.mjs
// HOTFIX URGENTE PROD — EVENTOS: PORTADA + CTA DE COMPRA (2026-09-14).
// Certifica las dos causas raíz encontradas y sus correcciones mínimas,
// más la protección explícita de todo lo que este hotfix NUNCA debió
// tocar (Payment Engine/checkout/webhook/OAuth/reconciliación/7%/
// marketplace_fee/Medidor QR/Admin Analytics/puerta DEV/Campañas-Rifas-
// Inscripciones). La mayoría de las aserciones son sobre el código
// fuente (regex/AST-lite), no ejecución real de canvas/Image del
// navegador -- mismo criterio ya usado en humanUrlStandard2026.test.mjs
// para lógica de páginas que no corre fuera de un navegador real.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function mainBlob(p) {
  try {
    return execSync(`git show origin/main:${p}`, { cwd: ROOT, encoding: 'utf8' });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------
// CAUSA 1 — bucket event-photos ausente en PROD
// ---------------------------------------------------------------------
test('MIGRACIÓN 1: crea el bucket event-photos, público, idempotente (on conflict do nothing)', () => {
  const sql = read('db/migrations/2026-09-14_hotfix_event_photos_bucket.sql');
  assert.match(sql, /insert into storage\.buckets \(id, name, public\)/);
  assert.match(sql, /values \('event-photos', 'event-photos', true\)/);
  assert.match(sql, /on conflict \(id\) do nothing/);
});

test('MIGRACIÓN 2: nunca agrega policies de storage.objects (mismo modelo que colecta-photos/raffle-prizes/avatars: solo service_role escribe)', () => {
  const sql = read('db/migrations/2026-09-14_hotfix_event_photos_bucket.sql');
  assert.doesNotMatch(sql, /create policy/i);
  assert.doesNotMatch(sql, /alter table storage\.objects/i);
});

test('MIGRACIÓN 3: nunca usa drop/truncate/delete — forward-only', () => {
  const sql = read('db/migrations/2026-09-14_hotfix_event_photos_bucket.sql');
  assert.doesNotMatch(sql, /\bdrop\b|\btruncate\b|\bdelete\b/i);
});

test('SERVIDOR 1: upload-photo.js nunca reenvía el mensaje crudo del driver de Storage al cliente', () => {
  const src = read('src/pages/api/events/upload-photo.js');
  assert.doesNotMatch(src, /error: String\(e\?\.message \|\| e\)/);
  assert.match(src, /error: 'unexpected_error'/);
  assert.match(src, /bucket_not_found/);
  assert.match(src, /storage_error/);
});

test('SERVIDOR 2: upload-photo.js sigue re-decodificando con sharp (rotate + resize + jpeg), nunca guarda el buffer crudo', () => {
  const src = read('src/pages/api/events/upload-photo.js');
  assert.match(src, /sharp\(rawBuffer, \{ failOn: 'error' \}\)/);
  assert.match(src, /\.rotate\(\)/);
  assert.match(src, /\.jpeg\(/);
  assert.doesNotMatch(src, /\.upload\(path, rawBuffer/);
});

test('SERVIDOR 3: upload-photo.js sigue exigiendo Bearer auth antes de cualquier escritura (nunca abierto a anónimos)', () => {
  const src = read('src/pages/api/events/upload-photo.js');
  assert.match(src, /missing_auth/);
  assert.match(src, /invalid_auth/);
  assert.match(src, /auth\.getUser\(token\)/);
});

test('SERVIDOR 4: la ruta de objeto sigue siendo no predecible (userId + timestamp + randomUUID), upsert:false', () => {
  const src = read('src/pages/api/events/upload-photo.js');
  assert.match(src, /\$\{ures\.user\.id\}\/\$\{Date\.now\(\)\}-\$\{randomUUID\(\)\}/);
  assert.match(src, /upsert: false/);
});

test('CLIENTE 1: crear-evento.jsx rechaza dimensiones absurdas ANTES de dibujar en canvas (defensa contra bombas de descompresión)', () => {
  const src = read('src/pages/crear-evento.jsx');
  assert.match(src, /MAX_SOURCE_DIMENSION/);
  assert.match(src, /img\.width > MAX_SOURCE_DIMENSION \|\| img\.height > MAX_SOURCE_DIMENSION/);
});

test('CLIENTE 2: crear-evento.jsx nunca envía el archivo crudo — siempre pasa por resizeToBlob antes del fetch', () => {
  const src = read('src/pages/crear-evento.jsx');
  const uploadCallIdx = src.indexOf("fetch('/api/events/upload-photo'");
  const resizeCallIdx = src.indexOf('await resizeToBlob(file, COVER_TARGET)');
  assert.ok(resizeCallIdx > -1 && uploadCallIdx > -1 && resizeCallIdx < uploadCallIdx,
    'resizeToBlob debe llamarse antes del fetch de subida');
});

test('CLIENTE 3: si la subida de portada falla, se limpia coverFile/coverUrl — nunca queda una previsualización de algo que no se guardó', () => {
  const src = read('src/pages/crear-evento.jsx');
  const fnStart = src.indexOf('async function onCoverChange(e)');
  const fnEnd = src.indexOf('\n  }', src.indexOf('finally {', fnStart));
  const fnBody = src.slice(fnStart, fnEnd);
  const catchIdx = fnBody.indexOf('} catch (e) {');
  assert.ok(catchIdx > -1, 'debe existir el catch del onCoverChange');
  const catchBlock = fnBody.slice(catchIdx);
  assert.match(catchBlock, /setCoverFile\(null\)/);
  assert.match(catchBlock, /setCoverUrl\(null\)/);
  assert.match(catchBlock, /setErr\(e\.message \|\| 'No se pudo subir la portada'\)/);
});

test('CLIENTE 4: errores del servidor se mapean a texto legible (COVER_ERROR_LABEL), nunca se muestra el código crudo sin traducir cuando existe mapeo', () => {
  const src = read('src/pages/crear-evento.jsx');
  assert.match(src, /COVER_ERROR_LABEL/);
  assert.match(src, /bucket_not_found:/);
  assert.match(src, /COVER_ERROR_LABEL\[data\.error\] \|\| data\.error/);
});

test('CLIENTE 5: la creación del evento sigue permitiendo cover_image_url null (crear sin portada sigue soportado)', () => {
  const src = read('src/pages/crear-evento.jsx');
  assert.match(src, /cover_image_url: coverUrl/);
});

// ---------------------------------------------------------------------
// CAUSA 2 — botón "Comprar entradas" visualmente gris/no comunica que es pulsable
// ---------------------------------------------------------------------
test('CSS 1: .ctaBtn ya NO es gris/not-allowed de forma incondicional — usa el degradé de marca certificado (mismo que .submitBtn de Colectas)', () => {
  const css = read('src/styles/evento.module.css');
  const ctaBtnBlock = css.match(/\.ctaBtn\s*\{[^}]*\}/)[0];
  assert.doesNotMatch(ctaBtnBlock, /#e2e8f0/);
  assert.doesNotMatch(ctaBtnBlock, /cursor:\s*not-allowed/);
  assert.match(ctaBtnBlock, /linear-gradient/);
  assert.match(ctaBtnBlock, /cursor:\s*pointer/);
});

test('CSS 2: .ctaBtn:disabled tiene un tratamiento visual distinto y real (opacity reducida + not-allowed) — mismo patrón que .submitBtn:disabled de Colectas', () => {
  const css = read('src/styles/evento.module.css');
  assert.match(css, /\.ctaBtn:disabled\s*\{\s*opacity:\s*\.65;\s*cursor:\s*not-allowed;\s*\}/);
});

test('CSS 3: el degradé usa las variables de marca reales (--ultramar/--trebol), no colores inventados', () => {
  const css = read('src/styles/evento.module.css');
  assert.match(css, /var\(--ultramar/);
  assert.match(css, /var\(--trebol/);
});

test('LÓGICA 1: handleBuy sigue rechazando selección vacía y email inválido ANTES de llamar al checkout (nunca crea preferencia con datos inválidos)', () => {
  const src = read('src/pages/eventos/[id].jsx');
  const handleBuyBody = src.slice(src.indexOf('async function handleBuy()'), src.indexOf('window.location.href'));
  assert.match(handleBuyBody, /selectedItems\.length === 0/);
  assert.match(handleBuyBody, /isValidEmail\(buyerEmail\)/);
  const checkoutCallIdx = handleBuyBody.indexOf('/checkout`');
  const emailCheckIdx = handleBuyBody.indexOf('isValidEmail(buyerEmail)');
  assert.ok(emailCheckIdx > -1 && checkoutCallIdx > -1 && emailCheckIdx < checkoutCallIdx,
    'la validación de email debe ocurrir antes de la llamada al checkout');
});

test('LÓGICA 2: guardia síncrona de doble-toque — handleBuy corta de inmediato si ya está comprando', () => {
  const src = read('src/pages/eventos/[id].jsx');
  const fnStart = src.indexOf('async function handleBuy()');
  const fnFirstLines = src.slice(fnStart, fnStart + 700);
  assert.match(fnFirstLines, /if \(buying\) return;/);
});

test('LÓGICA 3: el nombre se recorta (trim) antes de decidir si va vacío/undefined — "solo espacios" ya no se envía como nombre válido', () => {
  const src = read('src/pages/eventos/[id].jsx');
  assert.match(src, /const trimmedName = buyerName\.trim\(\);/);
  assert.match(src, /buyer_name: trimmedName \|\| undefined/);
  assert.doesNotMatch(src, /buyer_name: buyerName \|\| undefined/);
});

test('LÓGICA 4: el nombre sigue siendo opcional — nunca se agrega una validación que lo vuelva obligatorio', () => {
  const src = read('src/pages/eventos/[id].jsx');
  const handleBuyBody = src.slice(src.indexOf('async function handleBuy()'), src.indexOf('window.location.href'));
  assert.doesNotMatch(handleBuyBody, /buyerName\.trim\(\)\s*===\s*''.*return/s);
});

test('ACCESIBILIDAD 1: el botón expone aria-busy durante la compra, y sigue usando el atributo disabled real (no solo estilo)', () => {
  const src = read('src/pages/eventos/[id].jsx');
  const btnMatch = src.match(/<button type="button" onClick=\{handleBuy\}[^>]*>/);
  assert.ok(btnMatch, 'debe existir el botón de comprar entradas');
  assert.match(btnMatch[0], /disabled=\{buying\}/);
  assert.match(btnMatch[0], /aria-busy=\{buying\}/);
});

test('NO REGRESIÓN: creación de preferencia de pago (checkout.js) permanece completamente intacta — el bloqueo estaba en el cliente, no ahí', () => {
  const current = read('src/pages/api/events/[id]/checkout.js');
  const before = mainBlob('src/pages/api/events/[id]/checkout.js');
  assert.ok(before, 'no se pudo leer la versión previa de origin/main');
  assert.equal(current, before, 'checkout.js debe permanecer byte-a-byte idéntico — el ajuste fue client-side');
});

// ---------------------------------------------------------------------
// PROTECCIÓN EXPLÍCITA — nada de esto debía tocarse esta misión
// ---------------------------------------------------------------------
test('PROTEGIDO 1: Payment Engine / checkout / webhook / reconciliación / OAuth MP permanecen completamente intactos', () => {
  for (const p of [
    'src/pages/api/checkout/mp.js',
    'src/pages/api/checkout/colecta.js',
    'src/pages/api/checkout/webhook.js',
    'src/pages/api/checkout/webhook-colecta.js',
    'src/pages/api/checkout/webhook-events.js',
    'src/pages/api/mp/oauth/start.js',
    'src/pages/api/mp/oauth/callback.js',
    'src/pages/api/mp/preference.js',
    'src/pages/api/mp/revalidate.js',
    'src/pages/api/mp/disconnect.js',
    'src/pages/api/mp/status.js',
    'src/pages/api/admin/reconcile.js',
    'src/pages/api/admin/reconcile-payments.js',
    'src/pages/api/admin/reconcile-colecta-payments.js',
  ]) {
    const current = read(p);
    const before = mainBlob(p);
    assert.ok(before, `no se pudo leer ${p} de origin/main`);
    assert.equal(current, before, `${p} debe permanecer byte-a-byte idéntico — fuera de alcance de este hotfix`);
  }
});

test('PROTEGIDO 2: Medidor QR permanece completamente intacto', () => {
  for (const p of [
    'src/pages/api/medidor-qr/index.js',
    'src/pages/api/medidor-qr/[id]/index.js',
    'src/pages/m/[slug].jsx',
  ]) {
    const current = read(p);
    const before = mainBlob(p);
    assert.ok(before, `no se pudo leer ${p} de origin/main`);
    assert.equal(current, before, `${p} debe permanecer byte-a-byte idéntico — Medidor QR es baseline protegido`);
  }
});

test('PROTEGIDO 3: Campañas, Rifas e Inscripciones (creación y páginas públicas) permanecen completamente intactos', () => {
  for (const p of [
    'src/pages/crear-colecta.jsx',
    'src/pages/colectas/[id].jsx',
    'src/pages/crear-rifa.jsx',
    'src/pages/rifas/[id].jsx',
    'src/pages/crear-inscripcion.jsx',
    'src/pages/inscripcion/[id].jsx',
  ]) {
    const current = read(p);
    const before = mainBlob(p);
    assert.ok(before, `no se pudo leer ${p} de origin/main`);
    assert.equal(current, before, `${p} debe permanecer byte-a-byte idéntico — fuera de alcance de este hotfix`);
  }
});

test('PROTEGIDO 4: Admin Analytics y la puerta temporal DEV nunca se mezclan en este hotfix (no existen en main, y no deben aparecer acá)', () => {
  for (const p of [
    'src/lib/devAdminDoor.js',
    'src/lib/analyticsEvents.js',
    'src/lib/analyticsClient.js',
    'src/pages/api/dev/admin-entry.js',
    'src/pages/api/analytics/track.js',
    'src/pages/api/admin/analytics-overview.js',
  ]) {
    assert.equal(fs.existsSync(path.join(ROOT, p)), false, `${p} no debe existir en este hotfix — es de otra misión (ADMIN ANALYTICS)`);
  }
});

test('PROTEGIDO 5: ningún archivo tocado esta misión menciona marketplace_fee, application_fee, ni el 7% de comisión', () => {
  for (const p of [
    'src/pages/api/events/upload-photo.js',
    'src/pages/crear-evento.jsx',
    'src/pages/eventos/[id].jsx',
    'src/styles/evento.module.css',
    'db/migrations/2026-09-14_hotfix_event_photos_bucket.sql',
  ]) {
    const src = read(p);
    assert.doesNotMatch(src, /marketplace_fee|application_fee|RIFEX_FEE_RATE/i);
  }
});

test('PROTEGIDO 6: nunca se usa service_role en código que corre en el navegador (crear-evento.jsx / eventos/[id].jsx)', () => {
  for (const p of ['src/pages/crear-evento.jsx', 'src/pages/eventos/[id].jsx']) {
    const src = read(p);
    assert.doesNotMatch(src, /service_role/i);
    assert.doesNotMatch(src, /SUPABASE_SERVICE_ROLE_KEY/);
  }
});

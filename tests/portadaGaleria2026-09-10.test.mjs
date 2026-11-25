// tests/portadaGaleria2026-09-10.test.mjs
// HOTFIX PORTADA Y GALERÍA (2026-09-10) — elimina la necesidad de
// renombrar fotos "0,1,2..." para controlar cuál queda de portada.
// Reemplaza el único selector multi-archivo por dos controles
// explícitos (Portada / Galería), armando el arreglo final en orden
// explícito al momento de subir. Cero cambios de backend/DB.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('PORTADA 1: control de portada es un input de archivo único (sin multiple)', () => {
  const src = read('src/pages/crear-rifa.jsx');
  assert.match(src, /<input type="file" accept="image\/\*" onChange=\{onCoverSelect\} \/>/);
});

test('PORTADA 2: onCoverSelect reemplaza coverPhoto y limpia el input (permite reelegir/reemplazar)', () => {
  const src = read('src/pages/crear-rifa.jsx');
  assert.match(src, /function onCoverSelect\(e\) \{/);
  assert.match(src, /setCoverPhoto\(file\)/);
  assert.match(src, /e\.target\.value = "";/);
});

test('PORTADA 3: existe vista previa clara de portada con badge identificatorio', () => {
  const src = read('src/pages/crear-rifa.jsx');
  assert.match(src, /coverPreview/);
  assert.match(src, /styles\.coverBadge/);
  assert.match(src, />Portada</);
});

test('PORTADA 4: removeCoverPhoto permite quitar/reemplazar la portada elegida', () => {
  const src = read('src/pages/crear-rifa.jsx');
  assert.match(src, /function removeCoverPhoto\(\) \{\s*setCoverPhoto\(null\);/);
});

test('GALERIA 1: control de galería acepta múltiples archivos y permite agregar en varias tandas (acumula, no reemplaza)', () => {
  const src = read('src/pages/crear-rifa.jsx');
  assert.match(src, /function onGalleryAdd\(e\) \{/);
  const block = src.match(/function onGalleryAdd\(e\) \{[\s\S]*?\n  \}/)[0];
  assert.match(block, /setGalleryPhotos\(\(prev\) => \{/);
  assert.match(block, /\.\.\.prev, \.\.\.picked/);
});

test('GALERIA 2: la galería nunca permite superar GALLERY_MAX = MAX_PHOTOS - 1, sin importar cuántas veces se agregue', () => {
  const src = read('src/pages/crear-rifa.jsx');
  assert.match(src, /const GALLERY_MAX = MAX_PHOTOS - 1;/);
  assert.match(src, /const room = Math\.max\(0, GALLERY_MAX - prev\.length\);/);
});

test('GALERIA 3: permite eliminar una foto individual de la galería antes de crear', () => {
  const src = read('src/pages/crear-rifa.jsx');
  assert.match(src, /function removeGalleryPhoto\(idx\) \{\s*setGalleryPhotos\(\(prev\) => prev\.filter\(\(_, i\) => i !== idx\)\);/);
});

test('GALERIA 4: cada miniatura de galería tiene su propio botón de eliminar en el render', () => {
  const src = read('src/pages/crear-rifa.jsx');
  assert.match(src, /onClick=\{\(\) => removeGalleryPhoto\(i\)\}/);
});

test('ORDEN 1: el arreglo final subido pone la portada primero y la galería después — nunca depende del nombre de archivo', () => {
  const src = read('src/pages/crear-rifa.jsx');
  const block = src.match(/const orderedFiles = \[[\s\S]*?\]\.slice\(0, MAX_PHOTOS\);/)[0];
  assert.match(block, /\.\.\.\(coverPhoto \? \[coverPhoto\] : \[\]\)/);
  assert.match(block, /\.\.\.galleryPhotos,/);
  // portada aparece antes que galería en el literal del arreglo
  const coverIdx = block.indexOf('coverPhoto ?');
  const galleryIdx = block.indexOf('...galleryPhotos');
  assert.ok(coverIdx > 0 && galleryIdx > coverIdx);
});

test('ORDEN 2: el orden nunca depende de file.name ni de sort alfabético — no hay ningún .sort() sobre los archivos', () => {
  const src = read('src/pages/crear-rifa.jsx');
  const uploadSection = src.match(/let photos = \[\];[\s\S]*?uploadPrizePhotos\(orderedFiles, token\);/)[0];
  assert.doesNotMatch(uploadSection, /\.sort\(/);
  assert.doesNotMatch(uploadSection, /\.name\.localeCompare/);
});

test('ORDEN 3: uploadPrizePhotos (reutilizado, sin cambios) sube en el orden exacto del arreglo recibido', () => {
  const src = read('src/pages/crear-rifa.jsx');
  const fn = src.match(/async function uploadPrizePhotos\(files, token\) \{[\s\S]*?\n\}/)[0];
  assert.match(fn, /for \(const file of files\) \{/);
  assert.match(fn, /urls\.push\(data\.url\);/);
  assert.doesNotMatch(fn, /\.sort\(/);
});

test('SIN REQUISITO NUEVO: la portada sigue siendo opcional — crear con solo galería, o sin fotos, sigue funcionando (sin nuevo alert/validación)', () => {
  const src = read('src/pages/crear-rifa.jsx');
  const validationBlock = src.match(/async function onSubmit\(e\) \{[\s\S]*?if \(submittingRef\.current\) return;/)[0];
  assert.doesNotMatch(validationBlock, /coverPhoto/);
  assert.doesNotMatch(validationBlock, /alert\("(Sube|Indica|Selecciona).*portada/i);
});

test('DOBLE-ENVÍO 1: guardia sincrónica submittingRef bloquea reentradas antes del fetch', () => {
  const src = read('src/pages/crear-rifa.jsx');
  assert.match(src, /const submittingRef = useRef\(false\);/);
  assert.match(src, /if \(submittingRef\.current\) return;\s*\n\s*submittingRef\.current = true;\s*\n\s*setSubmitting\(true\);/);
});

test('DOBLE-ENVÍO 2: submittingRef y setSubmitting siempre se liberan en el finally', () => {
  const src = read('src/pages/crear-rifa.jsx');
  const finallyBlock = src.match(/\} finally \{[\s\S]*?\n    \}\s*\n  \}/)[0];
  assert.match(finallyBlock, /submittingRef\.current = false;/);
  assert.match(finallyBlock, /setSubmitting\(false\);/);
});

test('DOBLE-ENVÍO 3: la guardia no bloquea reintentos tras un error de validación (se activa después de las validaciones)', () => {
  const src = read('src/pages/crear-rifa.jsx');
  const validationIdx = src.indexOf('Completa Título, Precio y Cupos.');
  const guardIdx = src.indexOf('if (submittingRef.current) return;');
  assert.ok(validationIdx > 0 && guardIdx > 0 && validationIdx < guardIdx);
});

test('DOBLE-ENVÍO 4: el botón se deshabilita mientras se crea y cambia de texto', () => {
  const src = read('src/pages/crear-rifa.jsx');
  assert.match(src, /disabled=\{submitting\}/);
  assert.match(src, /\{submitting \? "Creando…" : "Crear rifa"\}/);
});

test('RECUPERACIÓN: en el catch de un error recuperable no se limpian coverPhoto ni galleryPhotos', () => {
  const src = read('src/pages/crear-rifa.jsx');
  const catchBlock = src.match(/\} catch \(err\) \{[\s\S]*?\n    \} finally/)[0];
  assert.doesNotMatch(catchBlock, /setCoverPhoto/);
  assert.doesNotMatch(catchBlock, /setGalleryPhotos/);
});

test('PROTEGIDO 1: no se toca upload-photo.js, el endpoint sigue siendo de un solo archivo por llamada', () => {
  const src = read('src/pages/api/rifas/upload-photo.js');
  assert.match(src, /filename, contentType, dataBase64/);
});

test('PROTEGIDO 2: ALLOWED_CREATE_FIELDS de POST /api/rifas sigue copiando prize_photos tal cual, sin reordenar server-side', () => {
  const src = read('src/pages/api/rifas/index.js');
  assert.match(src, /'prize_photos'/);
  assert.match(src, /if \(ALLOWED_CREATE_FIELDS\.has\(k\)\) row\[k\] = body\[k\];/);
});

test('PROTEGIDO 3: prize_photos[0] sigue siendo la autoridad de portada en la página pública y en el checkout (sin cambios ahí)', () => {
  const pub = read('src/pages/rifas/[id].jsx');
  const chk = read('src/pages/rifas/[id]/checkout.jsx');
  assert.match(pub, /raffle\.prize_photos\[0\]/);
  assert.match(chk, /raffle\.prize_photos\[0\]/);
});

test('PROTEGIDO 4: compatibilidad con rifas antiguas — PrizeGallery sigue aceptando cualquier arreglo prize_photos tal cual llega', () => {
  const src = read('src/components/rifex/PrizeGallery.jsx');
  assert.match(src, /const list = Array\.isArray\(photos\) \? photos\.filter\(Boolean\) : \[\];/);
});

test('SIN MIGRACIÓN: no hay cambios en db/migrations relacionados a esta corrección', () => {
  const migDir = path.join(ROOT, 'db', 'migrations');
  const files = fs.readdirSync(migDir);
  const hasPortadaMigration = files.some((f) => /portada|galeria|cover|gallery/i.test(f));
  assert.equal(hasPortadaMigration, false);
});

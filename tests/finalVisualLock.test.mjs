// tests/finalVisualLock.test.mjs
// RIFEX RAFFLE EXPERIENCE 2026 — FINAL VISUAL LOCK (2026-09-08). Última
// pasada visual/responsive antes de QA humana y promoción a PROD: fondo
// off-white, contenedores mucho más anchos (ficha ~95vw/1700px, checkout
// ~95vw/1450px), foto principal dominante, Buy Box y checkout con
// miniatura real (nunca la foto hero duplicada), fix real del lightbox
// (portal a document.body + bloqueo de scroll + Escape). Cero cambios de
// lógica de pagos/reservas/sorteo — ver SIN-CAMBIOS-VL abajo.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const rifaPage = read('src/pages/rifas/[id].jsx');
const rifaCss = read('src/styles/rifaDetalle.module.css');
const gallery = read('src/components/rifex/PrizeGallery.jsx');
const galleryCss = read('src/styles/prizeGallery.module.css');
const checkoutPage = read('src/pages/rifas/[id]/checkout.jsx');
const checkoutCss = read('src/styles/checkoutV2.module.css');
const layout = read('src/components/Layout.jsx');
const mpApi = read('src/pages/api/checkout/mp.js');

// Comentarios propios de esta misión documentan honestamente qué se
// retiró (mencionan el texto retirado como prosa) — se filtran para que
// los doesNotMatch de abajo no den falsos positivos contra esa prosa.
function stripLineComments(src) {
  return src
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
}
const rifaPageCode = stripLineComments(rifaPage);
const rifaCssCode = stripLineComments(rifaCss);
const checkoutCssCode = stripLineComments(checkoutCss);
const checkoutPageCode = stripLineComments(checkoutPage);

// ---------------------------------------------------------------------
// VL-1/VL-2: contenedor desktop y mobile ampliado (~95vw, tope alto)
// ---------------------------------------------------------------------

test('VL-1: ficha pública — .card usa ~95vw con tope alto de max-width (~1700px), reemplaza el max-width fijo de 1100px', () => {
  assert.match(rifaCssCode, /\.card\s*\{[^}]*width:\s*95vw;[^}]*max-width:\s*1700px;/s);
  assert.doesNotMatch(rifaCssCode, /\.card\s*\{[^}]*max-width:\s*1100px;/s);
});

test('VL-2: ficha pública — .page ya no tiene padding horizontal fijo (así .card controla el 95vw real, sin doble angostamiento)', () => {
  assert.match(rifaCssCode, /\.page\s*\{[^}]*padding:\s*24px 0;/s);
});

test('VL-3: ficha pública — fondo off-white extremadamente suave, nunca gris visible (#f6f8fb retirado)', () => {
  assert.match(rifaCssCode, /\.page\s*\{[^}]*background:\s*#FAFAFA;/is);
  assert.doesNotMatch(rifaCssCode, /#f6f8fb/i);
});

test('VL-4: checkout — .shell usa ~95vw con tope ~1450px, reemplaza el max-width fijo de 1080px', () => {
  assert.match(checkoutCssCode, /\.shell\s*\{[^}]*width:\s*95vw;[^}]*max-width:\s*1450px;/s);
  assert.doesNotMatch(checkoutCssCode, /\.shell\s*\{[^}]*max-width:\s*1080px;/s);
});

// ---------------------------------------------------------------------
// VL-5/VL-6: columna de foto dominante (~65-70/30-35) y hero ampliado
// ---------------------------------------------------------------------

test('VL-5: layout2col pasa de 1.35fr/1fr a 2fr/1fr — columna de foto/galería claramente dominante (~66%/33%)', () => {
  assert.match(rifaCssCode, /\.layout2col\s*\{[^}]*grid-template-columns:\s*2fr 1fr;/s);
});

test('VL-6: PrizeGallery sigue intacta — portada real, flechas prev/next, sin recorte (object-fit: contain)', () => {
  assert.match(gallery, /mainImageBtn/);
  assert.match(gallery, /goPrev/);
  assert.match(gallery, /goNext/);
  assert.match(galleryCss, /\.mainImage\s*\{[^}]*object-fit:\s*contain;/s);
});

test('VL-7: thumbnails de la galería intactos (miniaturas + indicador "+N fotos")', () => {
  assert.match(gallery, /thumbRow/);
  assert.match(gallery, /thumbOverflowBadge/);
  assert.match(galleryCss, /\.thumbBtn\s*\{/);
});

test('VL-8: tabs de la ficha pública siguen con overflow-x:auto (no generan overflow global)', () => {
  assert.match(rifaCssCode, /\.tabsNav\s*\{[^}]*overflow-x:\s*auto;/s);
});

// ---------------------------------------------------------------------
// VL-9..VL-12: Buy Box usa miniatura real, nunca la foto hero duplicada
// ---------------------------------------------------------------------

test('VL-9: la Buy Box usa una miniatura real de la portada (buyBoxThumb, 56x56), no la foto hero grande de antes', () => {
  assert.match(rifaPageCode, /buyBoxThumb/);
  assert.match(rifaCssCode, /\.buyBoxThumb\s*\{[^}]*width:\s*56px;\s*height:\s*56px;/s);
});

test('VL-10: la clase antigua buyBoxPhoto (foto hero de 4:3 a todo el ancho) fue retirada por completo', () => {
  assert.doesNotMatch(rifaPageCode, /buyBoxPhoto/);
  assert.doesNotMatch(rifaCssCode, /\.buyBoxPhoto\b/);
});

test('VL-11: la Buy Box consolida sorteo/disponibles/valor por número en una sola tarjeta, siempre visible (se pueda comprar o no)', () => {
  assert.match(rifaPageCode, /buyBoxInfoRow/);
  assert.match(rifaPageCode, /<BuyBox\b[\s\S]{0,700}canBuy=\{canBuy\}/);
  assert.doesNotMatch(rifaPageCode, /\bstatCardsRow\b/);
  assert.doesNotMatch(rifaPageCode, /\bdrawCard\b/);
});

test('VL-12: sin chips 1/5/10/20, sin botón Cancelar en la Buy Box (mandato previo, sigue vigente)', () => {
  assert.doesNotMatch(rifaPageCode, /QUICK_AMOUNTS/);
  assert.doesNotMatch(rifaPageCode, /Cancelar/);
});

// ---------------------------------------------------------------------
// VL-13..VL-16: checkout usa miniatura real, nunca la foto hero
// ---------------------------------------------------------------------

test('VL-13: el checkout usa una miniatura real de la portada (summaryThumb, 56x56) dentro del resumen', () => {
  assert.match(checkoutPage, /summaryThumb/);
  assert.match(checkoutCssCode, /\.summaryThumb\s*\{[^}]*width:\s*56px;\s*height:\s*56px;/s);
});

test('VL-14: la clase antigua prizePhoto (foto hero de 4:3 "protagonista, nunca una miniatura") y el área gridPhoto fueron retiradas por completo', () => {
  assert.doesNotMatch(checkoutPage, /prizePhoto\b/);
  assert.doesNotMatch(checkoutPage, /gridPhoto/);
  assert.doesNotMatch(checkoutCssCode, /\.prizePhoto\b/);
  assert.doesNotMatch(checkoutCssCode, /"head\s+photo"/);
});

test('VL-15: el checkout ahora muestra la fecha de sorteo en el resumen (dato que antes solo vivía en la ficha pública)', () => {
  assert.match(checkoutPage, /formatDrawAt/);
  assert.match(checkoutPage, /drawInfo\.date/);
});

test('VL-16: el grid del checkout usa 5 áreas (head/summary/form/terms/cta) — "photo" ya no es un área propia', () => {
  assert.match(checkoutCssCode, /grid-template-areas:\s*\n\s*"head"\s*\n\s*"summary"\s*\n\s*"form"\s*\n\s*"terms"\s*\n\s*"cta";/);
});

// ---------------------------------------------------------------------
// VL-17..VL-19: lightbox — bug real de mobile (X detrás del header)
// ---------------------------------------------------------------------

test('VL-17: el lightbox se renderiza vía portal a document.body — escapa de cualquier stacking context ajeno (causa raíz del bug real)', () => {
  assert.match(gallery, /import \{ createPortal \} from ["']react-dom["']/);
  assert.match(gallery, /createPortal\(/);
  assert.match(gallery, /document\.body/);
});

test('VL-18: el lightbox bloquea el scroll del body mientras está abierto y lo restaura al cerrar', () => {
  assert.match(gallery, /document\.body\.style\.overflow\s*=\s*["']hidden["']/);
  assert.match(gallery, /document\.body\.style\.overflow\s*=\s*prevOverflow/);
});

test('VL-19: el lightbox se cierra con Escape, y la X respeta safe-area-inset-top (nunca detrás del notch/status bar)', () => {
  assert.match(gallery, /e\.key === ["']Escape["']/);
  assert.match(galleryCss, /\.lightboxClose\s*\{[^}]*top:\s*max\(16px,\s*env\(safe-area-inset-top\)\);/s);
});

// ---------------------------------------------------------------------
// VL-20: header real que causaba el bug — confirmamos su z-index real
// ---------------------------------------------------------------------

test('VL-20: el header sticky de Layout sigue con z-index: 40 (el fix es el portal, no bajarle el z-index al header)', () => {
  assert.match(layout, /\.rf-header\s*\{[^}]*z-index:\s*40;/s);
});

// ---------------------------------------------------------------------
// SIN-CAMBIOS-VL: invariantes funcionales — cero cambios de lógica
// ---------------------------------------------------------------------

test('SIN-CAMBIOS-VL 1: checkout/mp.js no fue modificado por esta misión (misma RPC atómica, mismo HOLD_MINUTES)', () => {
  assert.match(mpApi, /reserve_tickets_for_purchase|assignRandomAvailableNumbers/);
  assert.match(mpApi, /HOLD_MINUTES/);
  assert.doesNotMatch(mpApi, /buyer_phone/);
});

test('SIN-CAMBIOS-VL 2: el payload real de checkout.jsx sigue exactamente igual (mismos 7 campos, sin teléfono, sin numbers/assigned)', () => {
  assert.match(checkoutPage, /raffle_id:\s*raffle\.id/);
  assert.match(checkoutPage, /raffleId:\s*raffle\.id/);
  assert.match(checkoutPage, /quantity,/);
  assert.match(checkoutPage, /buyer_email:\s*email\.trim\(\)/);
  assert.match(checkoutPage, /buyer_name:\s*name\.trim\(\)/);
  assert.match(checkoutPage, /accepted_terms:\s*accepted/);
  assert.match(checkoutPage, /terms_version:\s*TERMS_VERSION/);
  assert.doesNotMatch(checkoutPage, /buyer_phone/);
  assert.doesNotMatch(checkoutPage, /\bnumbers\s*:/);
});

test('SIN-CAMBIOS-VL 3: la fórmula de cantidad/total de la Buy Box no cambió (mismo clamp, mismo total = unitario × cantidad)', () => {
  assert.match(rifaPageCode, /const clampedMax = Math\.max\(1, availableCount \|\| 1\);/);
  assert.match(rifaPageCode, /const qty = Math\.min\(Math\.max\(1, quantity \|\| 1\), clampedMax\);/);
  assert.match(rifaPageCode, /unitPriceCLPNumber \* qty/);
});

test('SIN-CAMBIOS-VL 4: idOrSlugColumn sigue resolviendo UUID/slug igual en ambas páginas — nunca se asume uno u otro', () => {
  assert.match(rifaPageCode, /idOrSlugColumn\(rid\)/);
  assert.match(checkoutPage, /idOrSlugColumn\(id\)/);
});

test('SIN-CAMBIOS-VL 5: la pantalla ficticia "Método de pago" y el stepper 1-2-3 siguen ausentes de la UI del checkout', () => {
  assert.doesNotMatch(checkoutPage, /PAYMENT_METHODS/);
  assert.doesNotMatch(checkoutPage, /stepsFooter/);
  assert.doesNotMatch(checkoutPageCode, /Método de pago/);
});

test('SIN-CAMBIOS-VL 6: el teléfono sigue completamente ausente del checkout (no se muestra, no se recolecta, no se envía)', () => {
  assert.doesNotMatch(checkoutPage, /phone/i);
});

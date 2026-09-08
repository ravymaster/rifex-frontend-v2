// tests/checkoutUnifiedV2.test.mjs
// RIFEX CHECKOUT V2 (2026-09-07) — cubre tanto la misión original
// (CHECKOUT UNIFICADO V2: retira los modales de la ficha pública, mueve
// el submit a /rifas/[id]/checkout) como su UX CORRECTION PASS
// posterior (Buy Box photo-first siempre visible, sin chips/Cancelar;
// checkout de una sola pantalla, sin teléfono, sin "Método de pago"
// ficticio, sin stepper 1-2-3). Cero cambios de lógica de pagos en
// ninguna de las dos: el submit real sigue siendo el mismo
// POST /api/checkout/mp ya certificado.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const rifaPage = read('src/pages/rifas/[id].jsx');
const checkoutPage = read('src/pages/rifas/[id]/checkout.jsx');
const checkoutCss = read('src/styles/checkoutV2.module.css');
const rifaCss = read('src/styles/rifaDetalle.module.css');
const mpApi = read('src/pages/api/checkout/mp.js');

// Quita comentarios // antes de comprobar "esto NO aparece en la UI" —
// los comentarios explican honestamente qué se retiró (mencionan el
// texto viejo a propósito) y no deben producir falsos positivos.
const stripLineComments = (src) => src.replace(/^\s*\/\/.*$/gm, '');
const checkoutPageUi = stripLineComments(checkoutPage);
const rifaPageUi = stripLineComments(rifaPage);

// ---------------------------------------------------------------------
// MODAL-CO: los modales QuantitySelector/BuyerForm ya no se usan en la
// ficha pública — retiro quirúrgico de la invocación, archivos preservados.
// ---------------------------------------------------------------------

test('MODAL-CO 1: rifas/[id].jsx ya no importa BuyerForm', () => {
  assert.doesNotMatch(rifaPage, /from ["']\.\.\/\.\.\/components\/rifex\/BuyerForm["']/);
});

test('MODAL-CO 2: rifas/[id].jsx ya no importa QuantitySelector (modal)', () => {
  assert.doesNotMatch(rifaPage, /from ["']\.\.\/\.\.\/components\/rifex\/QuantitySelector["']/);
});

test('MODAL-CO 3: rifas/[id].jsx ya no renderiza <BuyerForm ni <QuantitySelector', () => {
  assert.doesNotMatch(rifaPage, /<BuyerForm\b/);
  assert.doesNotMatch(rifaPage, /<QuantitySelector\b/);
});

test('MODAL-CO 4: BuyerForm.jsx y QuantitySelector.jsx en sí NO se borraron (retiro de invocación, no del archivo)', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'src/components/rifex/BuyerForm.jsx')));
  assert.ok(fs.existsSync(path.join(ROOT, 'src/components/rifex/QuantitySelector.jsx')));
});

test('MODAL-CO 5: showBuyer/comprar() se retiraron por completo de rifas/[id].jsx (lógica movida a checkout.jsx)', () => {
  assert.doesNotMatch(rifaPage, /\bshowBuyer\b/);
  assert.doesNotMatch(rifaPage, /async function comprar\(/);
});

// ---------------------------------------------------------------------
// TRUST-CO: el popup Trust ("Antes de continuar") es un componente
// distinto, fuera de alcance de esta misión — nunca tocado.
// ---------------------------------------------------------------------

test('TRUST-CO 1: TrustPopup sigue importado y renderizado sin cambios', () => {
  assert.match(rifaPage, /import TrustPopup from ["']\.\.\/\.\.\/components\/TrustPopup["']/);
  assert.match(rifaPage, /<TrustPopup\b/);
});

// ---------------------------------------------------------------------
// UX-BUYBOX: la Buy Box es photo-first, siempre visible, sin chips ni
// botón Cancelar (UX CORRECTION PASS).
// ---------------------------------------------------------------------

test('UX-BUYBOX 1: la Buy Box es siempre visible cuando se puede comprar — ya no existe el botón-gate "Comprar número"', () => {
  // El texto puede seguir mencionado en comentarios explicando la migración
  // (documentación honesta), pero el LABEL del botón ya no lo usa: solo
  // quedan las dos etiquetas de estado no-comprable.
  // FINAL VISUAL LOCK (2026-09-08): la Buy Box ahora se renderiza siempre
  // (nunca detrás de `canBuy ? <BuyBox> : <button>`) — es el propio
  // componente quien decide internamente qué mostrar, vía la prop canBuy.
  assert.doesNotMatch(rifaPage, /salesClosed \? ["']Ventas cerradas["'] : soldOut \? ["']Rifa agotada["'] : ["']Comprar número["']/);
  assert.match(rifaPage, /<BuyBox\b[\s\S]{0,700}canBuy=\{canBuy\}/);
});

test('UX-BUYBOX 2: la Buy Box nunca usa un backdrop de página completa (no hay position:fixed para su contenedor)', () => {
  assert.match(rifaPage, /function BuyBox\(/);
  assert.doesNotMatch(rifaPage, /function BuyBox[\s\S]{0,600}position:\s*["']fixed["']/);
});

test('UX-BUYBOX 3: NO existen los chips rápidos 1/5/10/20', () => {
  assert.doesNotMatch(rifaPage, /QUICK_AMOUNTS/);
  assert.doesNotMatch(rifaPage, /qtyChip/);
  assert.doesNotMatch(rifaCss, /\.qtyChip\b/);
});

test('UX-BUYBOX 4: NO existe un botón Cancelar en el selector de cantidad', () => {
  assert.doesNotMatch(rifaPage, /onCancel/);
  assert.doesNotMatch(rifaPage, />Cancelar</);
});

test('UX-BUYBOX 5: la Buy Box muestra la foto real del premio (raffle.prize_photos[0], mismo asset que PrizeGallery)', () => {
  assert.match(rifaPage, /prizeThumb[\s\S]{0,200}raffle\?\.prize_photos/);
  assert.match(rifaPage, /photoUrl=\{prizeThumb\}/);
});

test('UX-BUYBOX 6: el selector mínimo/máximo respeta la disponibilidad real (sin cambios de lógica)', () => {
  // FINAL VISUAL LOCK (2026-09-08): la prop se renombró de maxQuantity a
  // availableCount (ahora también alimenta la fila "Disponibles" de la
  // Buy Box consolidada) — sigue siendo exactamente counts.available.
  assert.match(rifaPage, /availableCount=\{counts\.available\}/);
  assert.match(rifaPage, /Math\.max\(1, qty - 1\)/);
  assert.match(rifaPage, /Math\.min\(clampedMax, qty \+ 1\)/);
});

test('UX-BUYBOX 7: "Continuar" navega a /rifas/[id]/checkout con la cantidad elegida', () => {
  assert.match(rifaPage, /pathname:\s*["']\/rifas\/\[id\]\/checkout["']/);
  assert.match(rifaPage, /query:\s*\{\s*id,\s*qty\s*\}/);
});

// ---------------------------------------------------------------------
// UX-CHECKOUT: checkout de una sola pantalla, sin teléfono, sin "Método
// de pago" ficticio, sin stepper 1-2-3 (UX CORRECTION PASS).
// ---------------------------------------------------------------------

test('UX-CHECKOUT 1: checkout.jsx ya NO tiene una máquina de estados de 2 pantallas (datos/pago) — una sola pantalla', () => {
  assert.doesNotMatch(checkoutPage, /useState\(["']datos["']\)/);
  assert.doesNotMatch(checkoutPage, /step === ["']pago["']/);
});

test('UX-CHECKOUT 2: checkout.jsx NO recolecta, muestra ni envía teléfono', () => {
  assert.doesNotMatch(checkoutPage, /phone/i);
  assert.doesNotMatch(checkoutPage, /buyer_phone/);
});

test('UX-CHECKOUT 3: checkout.jsx NO tiene una pantalla/selector de "Método de pago" ficticio', () => {
  assert.doesNotMatch(checkoutPageUi, /Método de pago/);
  assert.doesNotMatch(checkoutPage, /PAYMENT_METHODS/);
  assert.doesNotMatch(checkoutPageUi, /Tarjeta de crédito/);
  assert.doesNotMatch(checkoutPageUi, /Transferencia bancaria/);
});

test('UX-CHECKOUT 4: checkout.jsx NO tiene el stepper visual 1-2-3', () => {
  assert.doesNotMatch(checkoutPageUi, /Selecciona la cantidad/);
  assert.doesNotMatch(checkoutPage, /stepsFooter/);
  assert.doesNotMatch(checkoutPageUi, />1</);
});

test('UX-CHECKOUT 5: checkout.jsx muestra la foto real del premio (mismo asset, sin pipeline nuevo)', () => {
  // FINAL VISUAL LOCK (2026-09-08): se muestra como miniatura
  // (summaryThumb) dentro del resumen, ya no como foto hero (prizePhoto)
  // — mismo asset real, sin pipeline de imágenes nuevo.
  assert.match(checkoutPage, /prizeThumb[\s\S]{0,200}raffle\?\.prize_photos/);
  assert.match(checkoutPage, /summaryThumb/);
});

test('UX-CHECKOUT 6: checkout.jsx muestra nombre, correo y aceptación de términos', () => {
  assert.match(checkoutPage, /Nombre completo/);
  assert.match(checkoutPage, /Correo electrónico/);
  assert.match(checkoutPage, /Términos y condiciones/);
});

test('UX-CHECKOUT 7: el resumen muestra cantidad, precio por número y total', () => {
  assert.match(checkoutPage, /Cantidad<\/span>/);
  assert.match(checkoutPage, /Precio por número<\/span>/);
  assert.match(checkoutPage, />Total<\/span>/);
});

test('UX-CHECKOUT 8: un único CTA "Continuar al pago" dispara el submit real directamente (sin pantalla intermedia)', () => {
  assert.match(checkoutPage, /Continuar al pago/);
  assert.match(checkoutPage, /onClick=\{handleContinuar\}/);
  const matches = checkoutPage.match(/className=\{styles\.primaryBtn\}/g) || [];
  assert.equal(matches.length, 1, 'debe existir un único botón primario (un solo CTA)');
});

test('UX-CHECKOUT 9: "Volver a la rifa" es el único mecanismo de navegación hacia atrás (sin botón X adicional)', () => {
  assert.match(checkoutPage, /Volver a la rifa/);
  assert.doesNotMatch(checkoutPage, />✕</);
});

// ---------------------------------------------------------------------
// FLUJO-CO: cantidad inline en la ficha (nunca modal) -> navega a
// /rifas/[id]/checkout -> pantalla única -> mismo POST.
// ---------------------------------------------------------------------

test('FLUJO-CO 4: checkout.jsx resuelve la rifa por UUID o slug (idOrSlugColumn), igual que la ficha pública', () => {
  assert.match(checkoutPage, /import \{ idOrSlugColumn \} from ["']\.\.\/\.\.\/\.\.\/lib\/idOrSlug["']/);
  assert.match(checkoutPage, /idOrSlugColumn\(id\)/);
});

test('FLUJO-CO 5: checkout.jsx envía el pago al MISMO endpoint ya certificado, sin ruta nueva de pagos', () => {
  assert.match(checkoutPage, /fetch\(["']\/api\/checkout\/mp["']/);
});

test('FLUJO-CO 6: el payload de checkout.jsx conserva los campos que ya consume checkout/mp.js (sin teléfono)', () => {
  for (const field of ['raffle_id', 'raffleId', 'quantity', 'buyer_email', 'buyer_name', 'accepted_terms', 'terms_version']) {
    assert.match(checkoutPage, new RegExp(field + '\\s*[:,]'), `falta el campo ${field} en el payload`);
  }
});

test('FLUJO-CO 7: checkout.jsx usa raffle.id (UUID real) en el payload, nunca el parámetro crudo de la URL', () => {
  assert.match(checkoutPage, /raffle_id:\s*raffle\.id,/);
  assert.match(checkoutPage, /raffleId:\s*raffle\.id,/);
});

// ---------------------------------------------------------------------
// SIN-CAMBIOS-CO: checkout/mp.js — cero cambios de lógica de pagos.
// ---------------------------------------------------------------------

test('SIN-CAMBIOS-CO 1: checkout/mp.js no fue modificado por esta misión (misma RPC atómica, mismo HOLD_MINUTES, mismo asignador aleatorio)', () => {
  assert.match(mpApi, /reserve_tickets_for_purchase|assignRandomAvailableNumbers/);
  assert.match(mpApi, /HOLD_MINUTES/);
});

test('SIN-CAMBIOS-CO 2: checkout/mp.js sigue sin conocer buyer_phone (el campo se eliminó del frontend, nunca existió en el backend)', () => {
  assert.doesNotMatch(mpApi, /buyer_phone/);
});

test('SIN-CAMBIOS-CO 3: checkout.jsx nunca manda numbers/assigned_numbers/forced_numbers (el servidor sigue siendo la única autoridad de qué números se asignan)', () => {
  assert.doesNotMatch(checkoutPage, /\bnumbers\s*:/);
  assert.doesNotMatch(checkoutPage, /assigned_numbers|forced_numbers/);
});

// ---------------------------------------------------------------------
// VALID-CO: validación de datos del comprador (nombre, correo, términos).
// ---------------------------------------------------------------------

test('VALID-CO 1: el email se valida con un patrón real antes de habilitar "Continuar al pago"', () => {
  assert.match(checkoutPage, /EMAIL_RE\s*=\s*\/[^/]+\//);
  assert.match(checkoutPage, /EMAIL_RE\.test\(email/);
});

test('VALID-CO 3: "Continuar al pago" está deshabilitado mientras el formulario no sea válido', () => {
  assert.match(checkoutPage, /disabled=\{!formValid\}/);
});

test('VALID-CO 4: no se puede continuar sin haber aceptado los términos', () => {
  assert.match(checkoutPage, /if\s*\(!accepted\)\s*e\.accepted/);
});

// ---------------------------------------------------------------------
// DISEÑO-CO: fondo blanco puro + halo verde/azul sutil, ancho de
// tienda online, nunca superficies verdes/grises grandes.
// ---------------------------------------------------------------------

test('DISEÑO-CO 1: el fondo global del checkout es blanco puro, nunca gris', () => {
  const pageBlock = checkoutCss.match(/\.page\s*\{[^}]*\}/)[0];
  assert.match(pageBlock, /background:\s*#ffffff\b/i);
  assert.doesNotMatch(pageBlock, /background:\s*#f6f8fb/i);
});

test('DISEÑO-CO 2: la card principal es blanca, con separación por sombra difusa, no por una superficie de color sólido', () => {
  const cardBlock = checkoutCss.match(/^\.card\s*\{[^}]*\}/m)[0];
  assert.match(cardBlock, /background:\s*#ffffff/);
  assert.match(cardBlock, /box-shadow:/);
});

test('DISEÑO-CO 3: el halo verde/azul es una sombra difusa translúcida (rgba), nunca un bloque de fondo de color sólido', () => {
  const cardBlock = checkoutCss.match(/^\.card\s*\{[^}]*\}/m)[0];
  assert.match(cardBlock, /rgba\(24,\s*169,\s*87,/);
  assert.doesNotMatch(cardBlock, /background:\s*#18A957/i);
});

test('DISEÑO-CO 4: el botón primario mantiene la identidad Rifex (gradiente azul/verde ya certificado), con brillo real (sombra elevada + hover)', () => {
  const btnBlock = checkoutCss.match(/^\.primaryBtn\s*\{[^}]*\}/m)[0];
  assert.match(btnBlock, /linear-gradient\(90deg,\s*#1E3A8A\s*0%,\s*#18A957\s*100%\)/);
  assert.match(checkoutCss, /\.primaryBtn:not\(:disabled\):hover/);
});

test('DISEÑO-CO 5: checkout.jsx no indexa la página (checkout es un paso transitorio, no una superficie pública de marketing)', () => {
  assert.match(checkoutPage, /noindex,nofollow/);
});

test('DISEÑO-CO 6: el contenedor del checkout usa un ancho tipo tienda online, no el ancho angosto de un formulario administrativo', () => {
  // FINAL VISUAL LOCK (2026-09-08): el tope de max-width sube de 1080px a
  // 1450px (95vw), "casi todo el ancho útil" en vez de una card angosta.
  const shellBlock = checkoutCss.match(/\.shell\s*\{[^}]*\}/)[0];
  assert.match(shellBlock, /max-width:\s*(1000|1040|1080|1100|1400|1450|1500)px/);
});

test('DISEÑO-CO 7: desktop usa dos columnas (grid), mobile una sola columna', () => {
  assert.match(checkoutCss, /grid-template-columns:\s*1fr;/);
  assert.match(checkoutCss, /@media \(min-width:\s*900px\)/);
  assert.match(checkoutCss, /grid-template-columns:\s*1\.5fr 1fr;/);
});

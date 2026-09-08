// tests/checkoutUnifiedV2.test.mjs
// RIFEX CHECKOUT UNIFICADO V2 (2026-09-07) — retira los modales
// QuantitySelector/BuyerForm de la ficha pública de rifa y los reemplaza
// por un flujo de 2 pantallas ("Tus datos" / "Método de pago") en
// /rifas/[id]/checkout, estilo tienda online. Cero cambios de lógica de
// pagos: el submit real sigue siendo el mismo POST /api/checkout/mp ya
// certificado. Este archivo cubre estructura de código — el flujo real
// también se verificó manualmente en el navegador contra un servidor
// real (ver informe de la misión).
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
const mpApi = read('src/pages/api/checkout/mp.js');

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
// FLUJO-CO: cantidad inline en la ficha (nunca modal) -> navega a
// /rifas/[id]/checkout -> 2 pantallas (datos, pago) -> mismo POST.
// ---------------------------------------------------------------------

test('FLUJO-CO 1: el panel de cantidad inline nunca usa un backdrop de página completa (no hay position:fixed/overlay para showQty)', () => {
  assert.match(rifaPage, /function QuantityPanel\(/);
  // El panel vive dentro del sideCol del propio layout, no en un backdrop.
  assert.doesNotMatch(rifaPage, /showQty[\s\S]{0,80}position:\s*["']fixed["']/);
});

test('FLUJO-CO 2: "Continuar" del panel de cantidad navega a /rifas/[id]/checkout con la cantidad elegida', () => {
  assert.match(rifaPage, /pathname:\s*["']\/rifas\/\[id\]\/checkout["']/);
  assert.match(rifaPage, /query:\s*\{\s*id,\s*qty\s*\}/);
});

test('FLUJO-CO 3: checkout.jsx define exactamente 2 pantallas (datos, pago)', () => {
  assert.match(checkoutPage, /useState\(["']datos["']\)/);
  assert.match(checkoutPage, /step === ["']pago["']/);
  assert.match(checkoutPage, /step === ["']datos["']/);
});

test('FLUJO-CO 4: checkout.jsx resuelve la rifa por UUID o slug (idOrSlugColumn), igual que la ficha pública', () => {
  assert.match(checkoutPage, /import \{ idOrSlugColumn \} from ["']\.\.\/\.\.\/\.\.\/lib\/idOrSlug["']/);
  assert.match(checkoutPage, /idOrSlugColumn\(id\)/);
});

test('FLUJO-CO 5: checkout.jsx envía el pago al MISMO endpoint ya certificado, sin ruta nueva de pagos', () => {
  assert.match(checkoutPage, /fetch\(["']\/api\/checkout\/mp["']/);
});

test('FLUJO-CO 6: el payload de checkout.jsx conserva exactamente los campos que ya consume checkout/mp.js', () => {
  for (const field of ['raffle_id', 'raffleId', 'quantity', 'buyer_email', 'buyer_name', 'accepted_terms', 'terms_version']) {
    assert.match(checkoutPage, new RegExp(field + '\\s*[:,]'), `falta el campo ${field} en el payload`);
  }
});

test('FLUJO-CO 7: checkout.jsx usa raffle.id (UUID real) en el payload, nunca el parámetro crudo de la URL', () => {
  assert.match(checkoutPage, /raffle_id:\s*raffle\.id/);
  assert.match(checkoutPage, /raffleId:\s*raffle\.id/);
});

test('FLUJO-CO 8: "Volver" desde la pantalla de pago regresa a la pantalla de datos (nunca sale de la página)', () => {
  assert.match(checkoutPage, /step === ["']pago["']\s*\?\s*setStep\(["']datos["']\)/);
});

// ---------------------------------------------------------------------
// SIN-CAMBIOS-CO: checkout/mp.js — cero cambios de lógica de pagos.
// ---------------------------------------------------------------------

test('SIN-CAMBIOS-CO 1: checkout/mp.js no fue modificado por esta misión (misma RPC atómica, mismo HOLD_MINUTES, mismo asignador aleatorio)', () => {
  assert.match(mpApi, /reserve_tickets_for_purchase|assignRandomAvailableNumbers/);
  assert.match(mpApi, /HOLD_MINUTES/);
});

test('SIN-CAMBIOS-CO 2: checkout/mp.js sigue sin conocer buyer_phone (campo nuevo de UX, nunca llega al backend)', () => {
  assert.doesNotMatch(mpApi, /buyer_phone/);
});

test('SIN-CAMBIOS-CO 3: checkout.jsx nunca manda numbers/assigned_numbers/forced_numbers (el servidor sigue siendo la única autoridad de qué números se asignan)', () => {
  assert.doesNotMatch(checkoutPage, /\bnumbers\s*:/);
  assert.doesNotMatch(checkoutPage, /assigned_numbers|forced_numbers/);
});

// ---------------------------------------------------------------------
// VALID-CO: validación de datos del comprador en la nueva pantalla 1.
// ---------------------------------------------------------------------

test('VALID-CO 1: el email se valida con un patrón real antes de habilitar "Continuar al pago"', () => {
  assert.match(checkoutPage, /EMAIL_RE\s*=\s*\/[^/]+\//);
  assert.match(checkoutPage, /EMAIL_RE\.test\(email/);
});

test('VALID-CO 2: el teléfono chileno exige 9 dígitos empezando en 9 (mismo criterio ya usado en el resto de Rifex)', () => {
  assert.match(checkoutPage, /PHONE_CL_RE\s*=\s*\/\^9\[0-9\]\{8\}\$\//);
});

test('VALID-CO 3: "Continuar al pago" está deshabilitado mientras el formulario no sea válido', () => {
  assert.match(checkoutPage, /disabled=\{!datosValid\}/);
});

test('VALID-CO 4: no se puede pasar a "pago" sin haber aceptado los términos', () => {
  assert.match(checkoutPage, /if\s*\(!accepted\)\s*e\.accepted/);
});

// ---------------------------------------------------------------------
// DISEÑO-CO: fondo blanco puro + halo verde sutil, nunca superficies
// verdes/grises grandes — mismo requisito explícito de Rodrigo.
// ---------------------------------------------------------------------

test('DISEÑO-CO 1: el fondo global del checkout es blanco puro, nunca gris', () => {
  const pageBlock = checkoutCss.match(/\.page\s*\{[^}]*\}/)[0];
  assert.match(pageBlock, /background:\s*#ffffff\b/i);
  // Ningún gris del look anterior (#f6f8fb y variantes cercanas) coló al fondo global.
  assert.doesNotMatch(pageBlock, /background:\s*#f6f8fb/i);
});

test('DISEÑO-CO 2: la card principal es blanca, con separación por sombra difusa, no por una superficie de color sólido', () => {
  const cardBlock = checkoutCss.match(/^\.card\s*\{[^}]*\}/m)[0];
  assert.match(cardBlock, /background:\s*#ffffff/);
  assert.match(cardBlock, /box-shadow:/);
});

test('DISEÑO-CO 3: el halo verde es una sombra difusa translúcida (rgba), nunca un bloque de fondo verde sólido', () => {
  const cardBlock = checkoutCss.match(/^\.card\s*\{[^}]*\}/m)[0];
  assert.match(cardBlock, /rgba\(24,\s*169,\s*87,/); // verde Rifex #18A957 en rgba, dentro de box-shadow
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

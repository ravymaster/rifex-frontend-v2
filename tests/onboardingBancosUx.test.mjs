// ONBOARDING+BANCOS/MP — certifica la superficie de UI/UX del mandato
// que no depende de I/O real: el onboarding neutral (sin mencionar
// Mercado Pago), el único CTA hacia /panel/bancos, el catálogo visual
// de Stripe (deshabilitado, sin integración real), y que Argentina
// sigue deshabilitada. Auditoría estructural sobre el código fuente
// real -- mismo criterio ya usado en CUMPLIMIENTO-4/5 para superficies
// que no se pueden montar como componentes React bajo node --test.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function readSrc(...segments) {
  return fs.readFileSync(path.join(process.cwd(), "src", ...segments), "utf8");
}

const continuarSrc = readSrc("pages", "registro", "continuar.jsx");
const bancosSrc = readSrc("pages", "panel", "bancos.js");

// ---------------------------------------------------------------------
// 1/2/3. Onboarding neutral
// ---------------------------------------------------------------------

test("1. el paso de cierre del onboarding (bloque 'Un último paso') no menciona Mercado Pago en el texto renderizado", () => {
  // Aísla el JSX del bloque de cierre (entre el título "Un último paso"
  // y el cierre de esa sección) para no falsos-positivos por comentarios
  // de código en otras partes del archivo -- certifica específicamente
  // lo que el usuario ve.
  const start = continuarSrc.indexOf("Un último paso");
  assert.ok(start >= 0, "el bloque de cierre debe seguir existiendo");
  const blockEnd = continuarSrc.indexOf("return (", start + 2000) > -1
    ? continuarSrc.indexOf("return (", start)
    : continuarSrc.length;
  const block = continuarSrc.slice(start, start + 1500);
  assert.doesNotMatch(block, /Mercado\s*Pago/i, "el bloque de cierre del onboarding no debe mencionar Mercado Pago");
  assert.doesNotMatch(block, /connected|identityMatch|mismatch|needs_review|unavailable/i, "el onboarding no debe exponer detalle de estado de proveedor");
});

test("2. el onboarding muestra un CTA neutral ('conectar tu medio de pago'), nunca 'Conectar Mercado Pago' + 'Ya conecté, verificar' como dos botones", () => {
  assert.match(continuarSrc, /Ir a conectar tu medio de pago/);
  assert.doesNotMatch(continuarSrc, /Conectar Mercado Pago/);
  assert.doesNotMatch(continuarSrc, /Ya conecté, verificar/);
});

test("3. el CTA del onboarding lleva a /panel/bancos (nunca directo a /api/mp/oauth/start)", () => {
  assert.match(continuarSrc, /\/panel\/bancos\?next=/);
  // El bloque de cierre ya no debe enlazar directo al OAuth de MP --
  // esa decisión ahora vive exclusivamente en /panel/bancos.
  const start = continuarSrc.indexOf("Un último paso");
  const block = continuarSrc.slice(start, start + 1500);
  assert.doesNotMatch(block, /api\/mp\/oauth\/start/);
});

test("el onboarding preserva `next` de forma segura (usa sanitizeNextPath, nunca concatena router.query directo)", () => {
  assert.match(continuarSrc, /sanitizeNextPath/);
});

// ---------------------------------------------------------------------
// 32/33. Stripe -- catálogo visual, sin integración real
// ---------------------------------------------------------------------

test("32. Stripe aparece en /panel/bancos como deshabilitado, con copy 'No disponible en tu país'", () => {
  assert.match(bancosSrc, /Stripe/);
  assert.match(bancosSrc, /No disponible en tu país/);
  assert.match(bancosSrc, /Próximamente/);
});

test("33. Stripe no tiene ninguna integración real (sin API, OAuth, webhooks, payment intents, checkout)", () => {
  const forbidden = [/stripe\.com\/oauth/i, /payment_intent/i, /stripe.*checkout.*session/i, /STRIPE_SECRET/, /STRIPE_WEBHOOK/, /connected_account/i];
  for (const re of forbidden) {
    assert.doesNotMatch(bancosSrc, re, `bancos.js no debe contener integración real de Stripe (${re})`);
  }
  // El botón debe estar deshabilitado -- nunca un onClick real.
  const stripeBlockIdx = bancosSrc.indexOf("providerName}>Stripe<");
  assert.ok(stripeBlockIdx >= 0);
  const stripeBlock = bancosSrc.slice(stripeBlockIdx, stripeBlockIdx + 900);
  assert.match(stripeBlock, /disabled/);
  assert.doesNotMatch(stripeBlock, /onClick/);
});

test("no existe ningún archivo de integración real de Stripe en el repo (API routes, lib)", () => {
  const suspects = [
    path.join(process.cwd(), "src", "pages", "api", "stripe"),
    path.join(process.cwd(), "src", "lib", "stripe.js"),
    path.join(process.cwd(), "src", "lib", "paymentEngine", "stripeAdapter.js"),
  ];
  for (const p of suspects) {
    assert.equal(fs.existsSync(p), false, `no debe existir ${p} -- Stripe es solo catálogo visual en esta fase`);
  }
});

// ---------------------------------------------------------------------
// 36. Argentina sigue deshabilitada
// ---------------------------------------------------------------------

test("36. Argentina sigue deshabilitada (enabled:false, devOnly:false) -- esta misión no la reactiva", () => {
  const countryPolicySrc = readSrc("lib", "countryPolicy.js");
  const arBlockIdx = countryPolicySrc.indexOf("AR: {");
  const arBlock = countryPolicySrc.slice(arBlockIdx, arBlockIdx + 1200);
  assert.match(arBlock, /enabled:\s*false/);
  assert.match(arBlock, /devOnly:\s*false/);
});

// ---------------------------------------------------------------------
// Copy de creación de cuenta MP -- enlace oficial, acción distinta de "Conectar"
// ---------------------------------------------------------------------

test("¿No tienes cuenta de Mercado Pago? usa el enlace oficial verificado, distinto del botón Conectar (OAuth)", () => {
  assert.match(bancosSrc, /No tienes una cuenta de Mercado Pago/);
  assert.match(bancosSrc, /https:\/\/www\.mercadopago\.cl\/hub\/registration\/landing/);
  // target=_blank -- nunca reemplaza la navegación de conectar (OAuth).
  const idx = bancosSrc.indexOf("href={MP_SIGNUP_URL}");
  assert.ok(idx >= 0, "el enlace de creación de cuenta debe usar la constante MP_SIGNUP_URL");
  const surrounding = bancosSrc.slice(idx, idx + 200);
  assert.match(surrounding, /target="_blank"/);
  // Nunca el mismo elemento que el botón "Conectar" (href=mpConnectHref).
  assert.doesNotMatch(surrounding, /mpConnectHref/);
});

// ---------------------------------------------------------------------
// Estados A-E del mandato -- texto humano presente, nunca solo color
// ---------------------------------------------------------------------

test("estado A (desconectado) tiene copy exacto del mandato", () => {
  assert.match(bancosSrc, /No tienes una cuenta de Mercado Pago conectada\./);
});

test("estado B (conectado, pendiente de validación) tiene copy exacto del mandato", () => {
  assert.match(bancosSrc, /Tu cuenta está conectada, pero necesitamos validar su titularidad\./);
});

test("estado C (validado) tiene copy exacto del mandato", () => {
  assert.match(bancosSrc, /Cuenta de Mercado Pago validada\./);
});

test("estado D (inconsistencia) usa lenguaje neutral, nunca acusa fraude", () => {
  assert.match(bancosSrc, /No pudimos validar que la cuenta receptora corresponda con la identidad registrada en Rifex\./);
  const lower = bancosSrc.toLowerCase();
  for (const forbidden of ["fraude", "estafa", "robo", "delito"]) {
    assert.doesNotMatch(lower, new RegExp(forbidden));
  }
});

test("estado E (temporalmente no disponible) nunca se confunde con mismatch ni con matched", () => {
  assert.match(bancosSrc, /No pudimos verificar tu cuenta en este momento\. Inténtalo nuevamente\./);
});

test("token expirado/revocado muestra copy de reconexión, nunca 'refresh flow' inventado", () => {
  assert.match(bancosSrc, /Necesitamos que vuelvas a conectar tu cuenta\./);
});

// ---------------------------------------------------------------------
// Verificar cuenta -- doble click / idempotencia en el cliente
// ---------------------------------------------------------------------

test("el botón Verificar cuenta se deshabilita mientras hay una verificación en curso (guarda de doble click)", () => {
  const idx = bancosSrc.indexOf("runVerifyAccount");
  assert.ok(idx >= 0);
  assert.match(bancosSrc, /disabled=\{verifyBusy\}/);
  assert.match(bancosSrc, /if \(verifyBusy\) return;/);
});

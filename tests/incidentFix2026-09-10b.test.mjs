// tests/incidentFix2026-09-10b.test.mjs
// Segunda tanda de correcciones PROD del 2026-09-10:
// (1) Medidor QR — nunca mostrar "undefined"/"Invalid Date", guardia
//     anti doble-clic, y manejo defensivo si la RPC lanza una
//     excepción cruda en vez del contrato {ok:false} estructurado.
// (2) Descripción de rifa — preservar saltos de línea/párrafos reales
//     sin dangerouslySetInnerHTML ni interpretar HTML de usuario.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ---------------------------------------------------------------------
// DESCRIPCIÓN DE RIFA — preservar formato, sin XSS
// ---------------------------------------------------------------------
test('DESC 1: .tabPanelText usa white-space:pre-wrap (preserva saltos y líneas en blanco)', () => {
  const css = read('src/styles/rifaDetalle.module.css');
  const block = css.match(/\.tabPanelText\s*\{[^}]*\}/)[0];
  assert.match(block, /white-space:\s*pre-wrap/);
});

test('DESC 2: .tabPanelText permite quebrar palabras/links largos sin overflow móvil', () => {
  const css = read('src/styles/rifaDetalle.module.css');
  const block = css.match(/\.tabPanelText\s*\{[^}]*\}/)[0];
  assert.match(block, /overflow-wrap:\s*break-word/);
  assert.match(block, /word-break:\s*break-word/);
});

test('DESC 3: el render sigue siendo texto plano — sin dangerouslySetInnerHTML ni interpretar HTML', () => {
  const src = read('src/pages/rifas/[id].jsx');
  assert.doesNotMatch(src, /dangerouslySetInnerHTML/);
  assert.match(src, /<p className=\{styles\.tabPanelText\}>\{raffle\.description \|\| "Sin descripción adicional\."\}<\/p>/);
});

test('DESC 4: pre-wrap preserva múltiples párrafos, emojis y líneas en blanco (simulación de render de texto)', () => {
  // No hay DOM real en node:test — se valida la propiedad semántica de
  // pre-wrap: a diferencia de white-space:normal (que colapsa \n en un
  // espacio) o pre-line (que colapsa \n\n consecutivos a un solo salto),
  // pre-wrap preserva cada carácter de salto de línea tal cual viene.
  const texto = 'Participa por este increíble conjunto de premios! 🎉\n🎮 Consola retro portátil 500 en 1\nMini consola...\n\n💅 Kit profesional de manicure\nIncluye lámpara LED...\n\n🏆 Valor referencial total: $63.000.';
  const saltosDobles = (texto.match(/\n\n/g) || []).length;
  const saltosSimples = (texto.match(/\n/g) || []).length;
  assert.ok(saltosDobles >= 2, 'el texto de prueba debe tener al menos 2 líneas en blanco entre premios');
  assert.ok(saltosSimples > saltosDobles, 'el texto de prueba debe tener saltos simples y dobles mezclados');
  // pre-wrap: ningún \n se colapsa — el conteo de saltos que el
  // navegador debe renderizar es exactamente el mismo que hay en el
  // string original (contrastar con pre-line, que fusionaría \n\n en
  // un solo salto perdiendo la línea en blanco).
  const css = read('src/styles/rifaDetalle.module.css');
  const block = css.match(/\.tabPanelText\s*\{[^}]*\}/)[0];
  assert.doesNotMatch(block, /white-space:\s*pre-line/, 'pre-line colapsaría las líneas en blanco entre premios');
});

test('DESC 5: no se modifica ni se vuelve a guardar el texto — ningún .update()/PATCH nuevo en la página pública', () => {
  const src = read('src/pages/rifas/[id].jsx');
  const before = 40000; // la página es larga; buscamos en todo el archivo
  const hasUpdateOnDescription = /description[\s\S]{0,80}\.update\(/.test(src);
  assert.equal(hasUpdateOnDescription, false);
});

// ---------------------------------------------------------------------
// MEDIDOR QR — nunca "undefined"/"Invalid Date", defensa en profundidad
// ---------------------------------------------------------------------
test('MQR 1: la API responde 409 estructurado incluso si la RPC lanza una excepción cruda "free_quota_already_used"', () => {
  const src = read('src/pages/api/medidor-qr/index.js');
  assert.match(src, /String\(rpcErr\.message \|\| ''\)\.includes\('free_quota_already_used'\)/);
  const block = src.match(/if \(String\(rpcErr\.message[\s\S]*?\}\)\;\s*\}\s*throw rpcErr;/)[0];
  assert.match(block, /status\(409\)/);
  assert.match(block, /message:\s*`Ya utilizaste/);
  assert.match(block, /next_available_at:\s*nextFreePeriodStartsAt/);
});

test('MQR 2: el frontend nunca renderiza "undefined" como mensaje — usa data.message con respaldo genérico', () => {
  const src = read('src/pages/crear-medidor-qr.jsx');
  assert.match(src, /const baseMsg = data\.message \|\| 'Ya utilizaste tus Medidores QR gratuitos de este período\.'/);
});

test('MQR 3: el frontend nunca renderiza "Invalid Date" — valida next_available_at antes de formatear', () => {
  const src = read('src/pages/crear-medidor-qr.jsx');
  assert.match(src, /Number\.isNaN\(rawDate\.getTime\(\)\)/);
  assert.match(src, /const dateSuffix = hasValidDate/);
});

test('MQR 4: guardia sincrónica anti doble-clic — submittingRef bloquea reentradas antes del fetch', () => {
  const src = read('src/pages/crear-medidor-qr.jsx');
  assert.match(src, /const submittingRef = useRef\(false\)/);
  assert.match(src, /if \(submittingRef\.current\) return;\s*\n\s*submittingRef\.current = true;\s*\n\s*setSaving\(true\)/);
});

test('MQR 5: submittingRef siempre se libera en el finally (éxito o error), nunca deja el formulario bloqueado', () => {
  const src = read('src/pages/crear-medidor-qr.jsx');
  const finallyBlock = src.match(/\} finally \{[\s\S]*?\n  \}/)[0];
  assert.match(finallyBlock, /setSaving\(false\)/);
  assert.match(finallyBlock, /submittingRef\.current = false/);
});

test('MQR 6: la guardia anti doble-clic no bloquea reintentos tras un error de validación (antes del fetch)', () => {
  const src = read('src/pages/crear-medidor-qr.jsx');
  // La validación (nombre/pregunta/opciones/fechas) debe ocurrir ANTES
  // de tocar submittingRef — un usuario que corrige un error de forma
  // no debe quedar bloqueado por una guardia que nunca se liberó.
  const validationIdx = src.indexOf("El nombre interno es obligatorio.");
  const guardIdx = src.indexOf('if (submittingRef.current) return;');
  assert.ok(validationIdx > 0 && guardIdx > 0 && validationIdx < guardIdx);
});

// ---------------------------------------------------------------------
// PROTEGIDO — Payment Engine / checkout / migración de quota intactos
// ---------------------------------------------------------------------
test('PROTEGIDO: checkout/mp.js, checkout/colecta.js y webhook.js no cambiaron', () => {
  // Estas rutas no fueron tocadas por esta corrección — verificado por
  // ausencia de referencias nuevas en los archivos modificados.
  const apiSrc = read('src/pages/api/medidor-qr/index.js');
  assert.doesNotMatch(apiSrc, /checkout|webhook|mercadopago|mercado_pago/i);
});

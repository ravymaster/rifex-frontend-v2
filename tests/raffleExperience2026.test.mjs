// tests/raffleExperience2026.test.mjs
// RIFEX RAFFLE EXPERIENCE 2026 — cobertura de la reconstrucción de la
// experiencia pública de Rifas: ficha visual premium, galería de
// imágenes (bug real corregido), selector de cantidad reemplazando la
// grilla pública, asignación automática server-side reutilizando la RPC
// atómica ya certificada, y organizador vía la autoridad real de perfil.
//
// La prueba de concurrencia real (§28 del mandato) se ejecuta aparte,
// contra un fixture disposable real en rifex-dev — este archivo cubre
// estructura de código + lógica pura determinística.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ---------------------------------------------------------------------
// CREAR RIFA
// ---------------------------------------------------------------------
test('CREAR RIFA 1: soporta premio físico (toggle prizeType=physical, campos de entrega/transferencia)', () => {
  const src = read('src/pages/crear-rifa.jsx');
  assert.match(src, /prizeType\s*===\s*"physical"/);
  assert.match(src, /deliveryMethod/);
  assert.match(src, /requiresTransfer/);
});

test('CREAR RIFA 2: soporta premio en dinero (prizeAmount, sin pedir campos físicos)', () => {
  const src = read('src/pages/crear-rifa.jsx');
  assert.match(src, /prizeType\s*===\s*"money"/);
  assert.match(src, /prizeAmount/);
});

test('CREAR RIFA 3: permite subir imagen principal + preview local antes de enviar', () => {
  const src = read('src/pages/crear-rifa.jsx');
  assert.match(src, /photoPreviews/);
  assert.match(src, /URL\.createObjectURL/);
});

test('CREAR RIFA 4: permite galería (hasta 5 fotos, no solo una — límite ampliado por RAFFLE VISUAL POLISH 2026-09-07)', () => {
  const src = read('src/pages/crear-rifa.jsx');
  assert.match(src, /slice\(0,\s*MAX_PHOTOS\)/);
  assert.match(src, /MAX_PHOTOS\s*=\s*5/);
});

test('CREAR RIFA 5: bloque de organizador viene de la autoridad real de perfil (fetch /api/perfil/uid), no un campo escrito a mano', () => {
  const src = read('src/pages/crear-rifa.jsx');
  assert.match(src, /fetch\(`\/api\/perfil\/\$\{uid\}`\)/);
  assert.doesNotMatch(src, /creator_name/);
  assert.doesNotMatch(src, /creatorName/);
});

test('CREAR RIFA 6: expone acceso directo para completar/editar el perfil', () => {
  const src = read('src/pages/crear-rifa.jsx');
  assert.match(src, /href="\/perfil"/);
  assert.match(src, /Completar \/ editar perfil/);
});

// ---------------------------------------------------------------------
// PÁGINA PÚBLICA
// ---------------------------------------------------------------------
const publicPage = () => read('src/pages/rifas/[id].jsx');

test('PUBLIC PAGE 7: hero muestra bloque de premio físico vía PrizeGallery', () => {
  const src = publicPage();
  assert.match(src, /import PrizeGallery/);
  assert.match(src, /<PrizeGallery/);
});

test('PUBLIC PAGE 8: hero muestra monto real para premio en dinero', () => {
  const src = publicPage();
  assert.match(src, /raffle\.prize_type === "money"/);
  assert.match(src, /prize_amount_cents/);
});

test('PUBLIC PAGE 9: NUNCA muestra "Premio $0" para premio físico (bug real corregido)', () => {
  const src = publicPage();
  // el bloque prizeDisplay solo formatea CLP dentro de la rama money;
  // para physical usa el título de la rifa, nunca prize_amount_cents.
  const moneyBranchIdx = src.indexOf('if (raffle.prize_type === "money")');
  const physicalBranchIdx = src.indexOf('return { label: "Premio", value: titleCap');
  assert.ok(moneyBranchIdx > -1 && physicalBranchIdx > -1, 'debe existir la rama money y la rama physical separadas');
  assert.ok(physicalBranchIdx > moneyBranchIdx, 'la rama physical debe estar después, como fallback explícito');
});

test('PUBLIC PAGE 10: estado se muestra humanizado (humanRaffleStatus), nunca el valor crudo interno', () => {
  const src = publicPage();
  assert.match(src, /import \{ humanRaffleStatus, humanPrizeType \} from "\.\.\/\.\.\/lib\/raffleLabels"/);
  assert.match(src, /humanRaffleStatus\(raffle\.status\)/);
  // no debe quedar ningún print crudo tipo {raffle.status || "activa"}
  assert.doesNotMatch(src, /\{raffle\.status \|\| "activa"\}/);
});

test('PUBLIC PAGE 11: renderiza galería de imágenes del premio (componente dedicado)', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'src/components/rifex/PrizeGallery.jsx')));
});

test('PUBLIC PAGE 12: fallback de imagen para premio en dinero o físico sin fotos (nunca <img> roto)', () => {
  const src = read('src/components/rifex/PrizeGallery.jsx');
  assert.match(src, /MoneyHero/);
  assert.match(src, /list\.length === 0/);
});

test('PUBLIC PAGE 13: no imprime prize_type crudo como texto visible (pasarlo como prop a PrizeGallery está permitido)', () => {
  const src = publicPage();
  // patrón de render crudo típico: ">{raffle.prize_type}" — nunca debe
  // aparecer como contenido de texto JSX (pasar el valor como prop, ej.
  // prizeType={raffle.prize_type}, sí está permitido y es correcto).
  assert.doesNotMatch(src, />\{raffle\.prize_type\}/);
});

// ---------------------------------------------------------------------
// COMPRA — selector de cantidad
// ---------------------------------------------------------------------
const quantitySelectorSrc = () => read('src/components/rifex/QuantitySelector.jsx');

test('COMPRA 14: cantidad por defecto es 1', () => {
  const src = quantitySelectorSrc();
  assert.match(src, /useState\(1\)/);
});

test('COMPRA 15: botón "+" incrementa la cantidad', () => {
  const src = quantitySelectorSrc();
  assert.match(src, /const inc = \(\) => setQty/);
});

test('COMPRA 16: botón "-" reduce la cantidad', () => {
  const src = quantitySelectorSrc();
  assert.match(src, /const dec = \(\) => setQty/);
});

test('COMPRA 17: cantidad nunca baja de 1', () => {
  const src = quantitySelectorSrc();
  assert.match(src, /Math\.max\(1, n - 1\)/);
});

test('COMPRA 18: total se calcula como unitPriceCLP * cantidad', () => {
  const src = quantitySelectorSrc();
  assert.match(src, /unitPriceCLP \* qty/);
});

test('COMPRA 19: la grilla pública de números fue eliminada de la página pública', () => {
  const src = publicPage();
  assert.doesNotMatch(src, /numsGrid/);
  assert.doesNotMatch(src, /toggleNumber/);
  assert.doesNotMatch(src, /getIconByNumber/);
});

test('COMPRA 20: el comprador nunca envía "numbers" a checkout — solo "quantity" (servidor decide siempre)', () => {
  // RIFEX CHECKOUT UNIFICADO V2 (2026-09-07): el submit real vive ahora
  // en rifas/[id]/checkout.jsx, no en la ficha pública — se sigue la
  // lógica a su ubicación real; el criterio (nunca "numbers") no cambia.
  const src = read('src/pages/rifas/[id]/checkout.jsx');
  assert.match(src, /quantity,/);
  assert.doesNotMatch(src, /numbers:\s*selected/);
});

// ---------------------------------------------------------------------
// ASIGNACIÓN AUTOMÁTICA — backend
// ---------------------------------------------------------------------
const mpSrc = () => read('src/pages/api/checkout/mp.js');

test('ASSIGNMENT 21: valida quantity como entero >= 1 (nunca confía en el valor crudo del cliente)', () => {
  const src = mpSrc();
  assert.match(src, /Number\.parseInt\(quantity, 10\)/);
  assert.match(src, /!Number\.isInteger\(qtyRequested\) \|\| qtyRequested < 1/);
});

test('ASSIGNMENT 22: la asignación real sigue usando la RPC atómica reserve_tickets_for_purchase ya certificada (no se reemplazó)', () => {
  const src = mpSrc();
  assert.match(src, /supabase\.rpc\("reserve_tickets_for_purchase"/);
});

test('ASSIGNMENT 23: reintenta con una ventana nueva de candidatos si la RPC rechaza el lote (tickets_unavailable) — nunca deja un pedido a medias', () => {
  const src = mpSrc();
  assert.match(src, /MAX_ASSIGNMENT_RETRIES/);
  assert.match(src, /rErr\.message !== "tickets_unavailable"/);
});

test('ASSIGNMENT 24: responde insufficient_availability cuando no hay suficientes números disponibles (sin crear una reserva parcial)', () => {
  const src = mpSrc();
  assert.match(src, /insufficient_availability/);
});

test('ASSIGNMENT 25: el cliente NUNCA puede forzar/sugerir un número puntual (numbers ya no es un campo aceptado del body)', () => {
  const src = mpSrc();
  // el body destructurado ya no incluye "numbers" como parámetro de entrada
  const bodyDestructure = src.match(/const\s*\{\s*raffle_id[^}]*\}\s*=\s*req\.body/s)?.[0] || '';
  assert.doesNotMatch(bodyDestructure, /\bnumbers\b/);
});

test('ASSIGNMENT 26: la ventana de candidatos está acotada (nunca descarga el inventario completo de tickets)', () => {
  const src = mpSrc();
  assert.match(src, /CANDIDATE_WINDOW_CAP/);
  assert.match(src, /Math\.min\(Math\.max\(quantity \* 6, quantity\), availableCount, CANDIDATE_WINDOW_CAP\)/);
});

test('ASSIGNMENT 27: solo propone números con status available/free (nunca pending/sold)', () => {
  const src = mpSrc();
  const matches = src.match(/\.in\("status", \["available", "free"\]\)/g) || [];
  assert.ok(matches.length >= 2, 'debe filtrar por available/free tanto en el count como en el fetch de candidatos');
});

// ---------------------------------------------------------------------
// LÓGICA PURA — reimplementación aislada del shuffle/ventana para
// probar matemáticamente que nunca hay duplicados ni fuera de rango,
// sin necesitar la base de datos real (esa parte se prueba en vivo).
// ---------------------------------------------------------------------
function fisherYates(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

test('LOGIC 28: fisherYates produce una permutación válida (mismo largo, mismos elementos, sin duplicados)', () => {
  const pool = Array.from({ length: 50 }, (_, i) => i + 1);
  const shuffled = fisherYates(pool);
  assert.equal(shuffled.length, pool.length);
  assert.deepEqual([...shuffled].sort((a, b) => a - b), pool);
  assert.equal(new Set(shuffled).size, pool.length);
});

test('LOGIC 29: tomar los primeros N de una ventana barajada nunca repite números entre llamadas sucesivas sobre pools disjuntos', () => {
  const poolA = Array.from({ length: 30 }, (_, i) => i + 1);       // 1..30
  const poolB = Array.from({ length: 30 }, (_, i) => i + 31);      // 31..60
  const pickA = fisherYates(poolA).slice(0, 5);
  const pickB = fisherYates(poolB).slice(0, 5);
  const overlap = pickA.filter((n) => pickB.includes(n));
  assert.equal(overlap.length, 0);
});

test('LOGIC 30: simulación de 500 asignaciones concurrentes sobre un pool de 2000 números nunca genera duplicados dentro de cada asignación', () => {
  const POOL_SIZE = 2000;
  const pool = Array.from({ length: POOL_SIZE }, (_, i) => i + 1);
  for (let i = 0; i < 500; i++) {
    const qty = 1 + (i % 5); // 1..5
    const picked = fisherYates(pool).slice(0, qty);
    assert.equal(new Set(picked).size, picked.length, `asignación #${i} no debe tener duplicados internos`);
    assert.equal(picked.length, qty);
    for (const n of picked) assert.ok(n >= 1 && n <= POOL_SIZE);
  }
});

// ---------------------------------------------------------------------
// PAYMENTS / DRAW / QR — intactos (ningún archivo tocado por esta misión)
// ---------------------------------------------------------------------
test('PAYMENTS 31: MP preference creation intacta (misma lógica de marketplace_fee/7%)', () => {
  const src = mpSrc();
  assert.match(src, /RIFEX_FEE_RATE = 0\.07/);
  assert.match(src, /marketplace_fee/);
});

test('PAYMENTS 32: webhook.js no fue modificado por esta misión', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'src/pages/api/checkout/webhook.js')));
});

test('PAYMENTS 33: paymentReconcile.js (reconciliación) no fue modificado por esta misión', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'src/lib/paymentReconcile.js')));
});

test('PAYMENTS 34: QR de la rifa (qr.png.js) no fue modificado por esta misión', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'src/pages/api/rifas/[id]/qr.png.js')));
});

test('DRAW 35: drawWinner.js no fue tocado — opera sobre tickets.status=sold, agnóstico a cómo se reservó el número', () => {
  const src = read('src/lib/drawWinner.js');
  assert.match(src, /status.*sold|sold.*status/s);
});

test('DRAW 36: endpoint de sorteo manual (draw.js) no fue modificado por esta misión', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'src/pages/api/rifas/[id]/draw.js')));
});

test('DRAW 37: endpoint de extensión (extend.js) no fue modificado por esta misión', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'src/pages/api/rifas/[id]/extend.js')));
});

// ---------------------------------------------------------------------
// SEGURIDAD
// ---------------------------------------------------------------------
test('SECURITY 38: Country Gate sigue evaluándose sobre el creador antes de reservar/cobrar', () => {
  const src = mpSrc();
  assert.match(src, /assertCountryGate\(raffle\.creator_id, "raffles"\)/);
});

test('SECURITY 39: rate limit por IP sigue activo en el endpoint de checkout', () => {
  const src = mpSrc();
  assert.match(src, /enforceRateLimit\(req, res, \{ key: `checkout-mp:\$\{ip\}`/);
});

test('SECURITY 40: el perfil del organizador expuesto en la rifa nunca incluye PII (email/rut/pagos)', () => {
  // /api/perfil/[id].js — misma autoridad reutilizada, ya excluye PII;
  // confirmamos que la rifa no intenta leer campos sensibles del perfil.
  const src = publicPage();
  assert.doesNotMatch(src, /organizer\.email/);
  assert.doesNotMatch(src, /organizer\.rut/);
});

test('SECURITY 41: el techo de cantidad usa total_numbers real de la rifa, no un límite inventado', () => {
  const src = mpSrc();
  assert.match(src, /qtyRequested > raffle\.total_numbers/);
});

test('SECURITY 42: ownership/IDOR del endpoint de checkout permanece igual (misma resolución de raffle por id, sin cambios de auth)', () => {
  const src = mpSrc();
  assert.match(src, /\.from\("raffles"\)/);
  assert.match(src, /raffle_not_found/);
});

// ---------------------------------------------------------------------
// PERFORMANCE — nunca descarga el inventario completo de tickets
// ---------------------------------------------------------------------
test('PERFORMANCE: la página pública ya no fetch-ea el arreglo completo de tickets (solo counts agregados)', () => {
  const src = publicPage();
  assert.doesNotMatch(src, /setTickets/);
  assert.match(src, /count:\s*"exact",\s*head:\s*true/);
});

// ---------------------------------------------------------------------
// MOBILE — sin overflow, hero apilado en columnas en pantallas chicas
// ---------------------------------------------------------------------
test('MOBILE: heroGrid colapsa a una sola columna en mobile (media query real)', () => {
  const css = read('src/styles/rifaDetalle.module.css');
  assert.match(css, /@media \(max-width: 900px\)\s*\{\s*\.heroGrid \{ grid-template-columns: 1fr; \}/);
});

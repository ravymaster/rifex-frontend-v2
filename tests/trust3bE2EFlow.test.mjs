// tests/trust3bE2EFlow.test.mjs
// TRUST-3B certify (2026-08-30) — certifica el flujo COMPUESTO real:
// onboarding (RUT declarado) -> merchant_gateways conectado (oauth
// callback, upsert) -> ventana de carrera -> resolveMpIdentityMatch ->
// mp_identity_match persistido -> assertCreatorEligible.
//
// A diferencia de tests/trustIdentityGate.test.mjs y
// tests/mpIdentityMatchGate.test.mjs (que mockean cada función por
// separado, con fixtures fijos), este archivo usa un almacén en
// memoria compartido entre AMBOS módulos reales (nunca reimplementa su
// lógica) y reproduce la secuencia EXACTA de
// src/pages/api/mp/oauth/callback.js: primero el upsert de
// merchant_gateways con status='connected' (sin tocar
// mp_identity_match, igual que el callback real), y SOLO DESPUÉS, en
// una llamada separada, resolveMpIdentityMatch. Esto reproduce de
// verdad la ventana de carrera, no solo un fixture que ya viene con
// mp_identity_match=NULL puesto a mano.
//
// Nunca toca rifex-dev real, nunca llama a la API de Mercado Pago —
// usersMeResponse siempre viene inyectado, igual que el caller real.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-role-key-for-tests';

const { createClient } = await import('@supabase/supabase-js');

// ---- fake DB genérico: soporta las formas de query real que usan
// trustIdentityGate.js y mpIdentityMatchGate.js (select/eq/neq/is/
// maybeSingle, update/eq, upsert) contra arrays en memoria por tabla.
const DB = {
  trust_onboarding: [],
  users_profile: [],
  merchant_gateways: [],
};

function reset() {
  DB.trust_onboarding = [];
  DB.users_profile = [];
  DB.merchant_gateways = [];
}

function selectBuilder(rows) {
  const filters = [];
  const b = {
    eq(col, val) { filters.push((r) => r[col] === val); return b; },
    neq(col, val) { filters.push((r) => r[col] !== val); return b; },
    is(col, val) { filters.push((r) => (val === null ? r[col] == null : r[col] === val)); return b; },
    maybeSingle() {
      const found = rows.filter((r) => filters.every((f) => f(r)));
      return Promise.resolve({ data: found[0] || null, error: null });
    },
  };
  return b;
}

function updateBuilder(rows, payload) {
  const filters = [];
  const b = {
    eq(col, val) { filters.push((r) => r[col] === val); return b; },
    is(col, val) { filters.push((r) => (val === null ? r[col] == null : r[col] === val)); return b; },
    not(col, _op, val) { filters.push((r) => (val === null ? r[col] != null : true)); return b; },
    then(resolve, reject) {
      rows.forEach((r) => { if (filters.every((f) => f(r))) Object.assign(r, payload); });
      return Promise.resolve({ error: null }).then(resolve, reject);
    },
  };
  return b;
}

function makeTable(rows) {
  return () => ({
    select: () => selectBuilder(rows),
    update: (payload) => updateBuilder(rows, payload),
    upsert: (payload, opts) => {
      const key = opts?.onConflict || 'user_id';
      const existing = rows.find((r) => r[key] === payload[key]);
      if (existing) Object.assign(existing, payload);
      else rows.push({ ...payload });
      return Promise.resolve({ error: null });
    },
  });
}

const probeClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ClientProto = Object.getPrototypeOf(probeClient);
const originalFromImpl = ClientProto.from;
ClientProto.from = function mockedFrom(table) {
  if (DB[table]) return makeTable(DB[table])();
  return originalFromImpl.call(this, table);
};

const { assertCreatorEligible } = await import('../src/lib/trustIdentityGate.js');
const { resolveMpIdentityMatch } = await import('../src/lib/mpIdentityMatchGate.js');

const CURRENT_ADULT_DECLARATION_VERSION = 'adult-declaration-v1.0';
const RIFEX_RUT = '141823094'; // 14.182.309-4, real, dígito verificador correcto — usado ya en el resto de la suite Trust como fixture
// RUT sintético de prueba, distinto del anterior — NUNCA el RUT de una
// persona real. "11.111.111-1" es el RUT de prueba estándar usado en
// integraciones chilenas, mismo valor ya usado como fixture de mismatch
// en tests/mpIdentityMatchGate.test.mjs.
const OTHER_TEST_RUT_NORMALIZED = '111111111';

function seedOnboardingUser(userId) {
  DB.trust_onboarding.push({
    user_id: userId,
    person_name: 'Usuario QA Trust3B',
    organization_name: null,
    account_type: 'person',
    phone: '+56959904311',
    adult_declared: true,
    adult_declaration_version: CURRENT_ADULT_DECLARATION_VERSION,
    terms_version: 'terms-v1.1',
    terms_accepted_at: '2026-08-30T00:00:00.000Z',
    privacy_version: 'privacy-v1.1',
    privacy_accepted_at: '2026-08-30T00:00:00.000Z',
    onboarding_completed_at: '2026-08-30T00:00:00.000Z',
    rut_normalized: RIFEX_RUT,
    rut_declared_at: '2026-08-30T00:00:00.000Z',
  });
  DB.users_profile.push({ user_id: userId, country_code: 'CL' });
}

// Reproduce el upsert EXACTO de oauth/callback.js paso 5: status
// 'connected', revoked_at null, SIN tocar mp_identity_match — igual
// que el código real, que deja esa columna intacta (NULL en una fila
// nueva) hasta que resolveMpIdentityMatch corra por separado.
function simulateOauthCallbackConnect(userId, mpUserId) {
  DB.merchant_gateways.push({
    user_id: userId,
    provider: 'mp',
    country: 'CL',
    mp_user_id: mpUserId,
    status: 'connected',
    revoked_at: null,
    // mp_identity_match: NUNCA seteado acá — así queda undefined/NULL,
    // exactamente como en el upsertRow real de callback.js.
  });
}

// ---- CASO 1: MATCH ----

test('E2E TRUST-3B — CASO 1 MATCH: onboarding -> RUT declarado -> MP conectado -> ventana de carrera BLOQUEA -> resolveMpIdentityMatch -> matched -> assertCreatorEligible permite', async () => {
  reset();
  const userId = 'e2e-match-1';
  seedOnboardingUser(userId);

  // Antes de conectar MP: bloqueado por mp_not_connected (ni siquiera hay fila).
  const beforeConnect = await assertCreatorEligible(userId);
  assert.equal(beforeConnect.ok, false);
  assert.equal(beforeConnect.reason, 'mp_not_connected');

  // Paso 5 real del callback: upsert de conexión, SIN resolver todavía el match.
  simulateOauthCallbackConnect(userId, 'mp-match-1');

  // VENTANA DE CARRERA: status=connected pero mp_identity_match aún no
  // resuelto -> debe seguir bloqueando (fail-closed), nunca autorizar
  // por el solo hecho de estar "connected".
  const duringRace = await assertCreatorEligible(userId);
  assert.equal(duringRace.ok, false, 'durante la ventana de carrera NUNCA debe autorizar');
  assert.equal(duringRace.reason, 'mp_check_pending');

  // Paso 5b real: resolveMpIdentityMatch corre después, con la
  // respuesta real de /users/me ya obtenida (RUT declarado == RUT MP).
  const matchResult = await resolveMpIdentityMatch({
    userId,
    mpUserId: 'mp-match-1',
    usersMeResponse: { identification: { type: 'RUT', number: '14.182.309-4' } },
  });
  assert.equal(matchResult.status, 'matched');

  // No se persiste una segunda copia del RUT de MP — solo el resultado.
  const gwRow = DB.merchant_gateways.find((r) => r.user_id === userId);
  assert.equal('mp_rut' in gwRow, false, 'nunca debe existir una columna con el RUT de MP persistido');
  assert.equal(JSON.stringify(gwRow).includes('14182309'), false, 'el número de RUT de MP nunca debe quedar persistido en merchant_gateways');

  // Ahora sí, assertCreatorEligible permite.
  const afterMatch = await assertCreatorEligible(userId);
  assert.deepEqual(afterMatch, { ok: true });
});

// ---- CASO 2: MISMATCH ----

test('E2E TRUST-3B — CASO 2 MISMATCH: RUT declarado != RUT de Mercado Pago -> mismatch -> assertCreatorEligible bloquea', async () => {
  reset();
  const userId = 'e2e-mismatch-1';
  seedOnboardingUser(userId); // declara RIFEX_RUT = 141823094

  simulateOauthCallbackConnect(userId, 'mp-mismatch-1');
  const duringRace = await assertCreatorEligible(userId);
  assert.equal(duringRace.ok, false);
  assert.equal(duringRace.reason, 'mp_check_pending');

  // RUT de prueba sintético, DISTINTO del declarado — nunca el RUT de
  // una persona real de un tercero.
  const mismatchResult = await resolveMpIdentityMatch({
    userId,
    mpUserId: 'mp-mismatch-1',
    usersMeResponse: { identification: { type: 'RUT', number: '11.111.111-1' } },
  });
  assert.equal(mismatchResult.status, 'mismatch');

  const gwRow = DB.merchant_gateways.find((r) => r.user_id === userId);
  assert.equal(gwRow.mp_identity_match, 'mismatch');
  assert.equal(JSON.stringify(gwRow).includes(OTHER_TEST_RUT_NORMALIZED), false, 'tampoco debe persistirse el RUT (sintético) de MP en el mismatch');

  const afterMismatch = await assertCreatorEligible(userId);
  assert.equal(afterMismatch.ok, false);
  assert.equal(afterMismatch.reason, 'mp_identity_mismatch');
});

// ---- CASO 3: UNAVAILABLE / error / type != RUT ----

test('E2E TRUST-3B — CASO 3a: Mercado Pago no entrega identification (timeout/error ya manejado por el callback como usersMeResponse=null) -> unavailable -> bloquea', async () => {
  reset();
  const userId = 'e2e-unavailable-1';
  seedOnboardingUser(userId);
  simulateOauthCallbackConnect(userId, 'mp-unavailable-1');

  const result = await resolveMpIdentityMatch({ userId, mpUserId: 'mp-unavailable-1', usersMeResponse: null });
  assert.equal(result.status, 'unavailable');

  const final = await assertCreatorEligible(userId);
  assert.equal(final.ok, false);
  assert.equal(final.reason, 'mp_check_pending');
});

test('E2E TRUST-3B — CASO 3b: identification.type != "RUT" -> nunca matched aunque el número coincida -> bloquea', async () => {
  reset();
  const userId = 'e2e-wrongtype-1';
  seedOnboardingUser(userId);
  simulateOauthCallbackConnect(userId, 'mp-wrongtype-1');

  // Number idéntico al RUT declarado, pero con type distinto de "RUT".
  const result = await resolveMpIdentityMatch({
    userId,
    mpUserId: 'mp-wrongtype-1',
    usersMeResponse: { identification: { type: 'CPF', number: '14.182.309-4' } },
  });
  assert.equal(result.status, 'unavailable', 'un type distinto de RUT nunca debe traducirse en matched, aunque el número coincida byte a byte');

  const final = await assertCreatorEligible(userId);
  assert.equal(final.ok, false);
  assert.equal(final.reason, 'mp_check_pending');
});

test('E2E TRUST-3B — CASO 3c: Mercado Pago responde 500/formato inválido (identification no es un objeto) -> unavailable -> bloquea', async () => {
  reset();
  const userId = 'e2e-malformed-1';
  seedOnboardingUser(userId);
  simulateOauthCallbackConnect(userId, 'mp-malformed-1');

  const result = await resolveMpIdentityMatch({
    userId,
    mpUserId: 'mp-malformed-1',
    usersMeResponse: { identification: 'esto-no-deberia-ser-un-string' },
  });
  assert.equal(result.status, 'unavailable');

  const final = await assertCreatorEligible(userId);
  assert.equal(final.ok, false);
});

// ---- OAuth race, explícito: dos requests concurrentes ----

test('E2E TRUST-3B — OAUTH RACE: una consulta de elegibilidad que llega EXACTAMENTE entre el upsert de conexión y resolveMpIdentityMatch debe bloquear, sin excepción', async () => {
  reset();
  const userId = 'e2e-race-explicit-1';
  seedOnboardingUser(userId);

  // Simula dos requests concurrentes: la primera es el callback OAuth
  // real (upsert, luego intenta resolver el match); la segunda es una
  // request de otro tab/otra pestaña del mismo usuario intentando crear
  // una rifa justo en medio.
  simulateOauthCallbackConnect(userId, 'mp-race-explicit-1');

  // "Otra request" que llega ANTES de que termine resolveMpIdentityMatch.
  const concurrentAttempt = await assertCreatorEligible(userId);
  assert.equal(concurrentAttempt.ok, false, 'CREAR DEBE FALLAR durante la ventana de carrera, sin excepción');
  assert.equal(concurrentAttempt.reason, 'mp_check_pending');

  // El callback real ahora termina de resolver (éxito).
  await resolveMpIdentityMatch({
    userId,
    mpUserId: 'mp-race-explicit-1',
    usersMeResponse: { identification: { type: 'RUT', number: '14.182.309-4' } },
  });

  // Una request posterior (después de que el callback terminó) sí debe permitir.
  const afterResolution = await assertCreatorEligible(userId);
  assert.deepEqual(afterResolution, { ok: true });
});

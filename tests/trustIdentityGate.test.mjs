// tests/trustIdentityGate.test.mjs
// TRUST-2 — assertCreatorEligible/upsertIdentityRut/getIdentityStatus con
// un cliente Supabase mockeado (mismo patrón que
// tests/trustOnboardingGate.test.mjs). Nunca toca rifex-dev de verdad.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-role-key-for-tests';

const { createClient } = await import('@supabase/supabase-js');

let currentMock = null;

const probeClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ClientProto = Object.getPrototypeOf(probeClient);
const originalFromImpl = ClientProto.from;

ClientProto.from = function mockedFrom(table) {
  if (currentMock && currentMock[table]) {
    return currentMock[table]();
  }
  return originalFromImpl.call(this, table);
};

const { assertCreatorEligible, upsertIdentityRut, getIdentityStatus } = await import('../src/lib/trustIdentityGate.js');

function mockSelectMaybeSingle(data, error = null) {
  return () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data, error }),
      }),
    }),
  });
}

const ADULT_CL_RUT_OK = {
  legal_name: 'Juan Pérez',
  birth_date: '1990-05-15',
  phone: '+56912345678',
  account_type: 'person',
  terms_version: 'terms-v1.0',
  terms_accepted_at: '2026-08-26T00:00:00.000Z',
  privacy_version: 'privacy-v1.0',
  privacy_accepted_at: '2026-08-26T00:00:00.000Z',
  onboarding_completed_at: '2026-08-26T00:00:00.000Z',
  rut_normalized: '141823094', // 14.182.309-4, real, verificado por dígito verificador
  rut_declared_at: '2026-08-27T00:00:00.000Z',
};

function mockTables({ onboarding, countryCode, onboardingError = null }) {
  return {
    trust_onboarding: mockSelectMaybeSingle(onboarding, onboardingError),
    users_profile: mockSelectMaybeSingle(countryCode !== undefined ? { country_code: countryCode } : null),
  };
}

// ---- assertCreatorEligible ----

test('assertCreatorEligible: onboarding completo + 18+ + RUT válido (CL) -> ok', async () => {
  currentMock = mockTables({ onboarding: ADULT_CL_RUT_OK, countryCode: 'CL' });
  const result = await assertCreatorEligible('user-1');
  assert.deepEqual(result, { ok: true });
});

test('assertCreatorEligible: onboarding TRUST-1 incompleto -> rechazado, nunca llega a evaluar edad/RUT', async () => {
  const incomplete = { ...ADULT_CL_RUT_OK, phone: null, onboarding_completed_at: null };
  currentMock = mockTables({ onboarding: incomplete, countryCode: 'CL' });
  const result = await assertCreatorEligible('user-1');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'onboarding_incomplete');
});

test('assertCreatorEligible: sin fila (usuario nuevo o antiguo, nunca empezó) -> onboarding_incomplete', async () => {
  currentMock = mockTables({ onboarding: null, countryCode: 'CL' });
  const result = await assertCreatorEligible('user-nunca-registrado');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'onboarding_incomplete');
});

test('assertCreatorEligible: onboarding completo pero menor de edad declarado -> age_requirement_not_met', async () => {
  const now = new Date();
  const minor = { ...ADULT_CL_RUT_OK, birth_date: `${now.getUTCFullYear() - 10}-06-15` };
  currentMock = mockTables({ onboarding: minor, countryCode: 'CL' });
  const result = await assertCreatorEligible('user-menor');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'age_requirement_not_met');
});

test('assertCreatorEligible: adulto, país Chile, sin RUT declarado -> identity_incomplete', async () => {
  const noRut = { ...ADULT_CL_RUT_OK, rut_normalized: null, rut_declared_at: null };
  currentMock = mockTables({ onboarding: noRut, countryCode: 'CL' });
  const result = await assertCreatorEligible('user-sin-rut');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'identity_incomplete');
});

test('assertCreatorEligible: país distinto de Chile -> el RUT nunca se exige', async () => {
  const noRutArgentina = { ...ADULT_CL_RUT_OK, rut_normalized: null, rut_declared_at: null };
  currentMock = mockTables({ onboarding: noRutArgentina, countryCode: 'AR' });
  const result = await assertCreatorEligible('user-ar');
  assert.deepEqual(result, { ok: true });
});

test('assertCreatorEligible: sin país guardado todavía -> el RUT tampoco se exige (lo bloquea el Country Gate, no este)', async () => {
  const noCountry = { ...ADULT_CL_RUT_OK, rut_normalized: null, rut_declared_at: null };
  currentMock = mockTables({ onboarding: noCountry, countryCode: null });
  const result = await assertCreatorEligible('user-sin-pais');
  assert.deepEqual(result, { ok: true });
});

test('assertCreatorEligible: userId ausente -> rechazado sin consultar la base', async () => {
  let queried = false;
  currentMock = {
    trust_onboarding: () => { queried = true; return mockSelectMaybeSingle(ADULT_CL_RUT_OK)(); },
    users_profile: mockSelectMaybeSingle({ country_code: 'CL' }),
  };
  const result = await assertCreatorEligible(null);
  assert.equal(result.ok, false);
  assert.equal(queried, false, 'un userId ausente debe rechazarse sin tocar la base');
});

test('assertCreatorEligible: error de infraestructura al leer onboarding -> falla cerrado', async () => {
  currentMock = mockTables({ onboarding: null, countryCode: 'CL', onboardingError: { message: 'boom' } });
  const result = await assertCreatorEligible('user-1');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'onboarding_check_failed');
});

test('ADVERSARIAL: assertCreatorEligible nunca confía en un rut_normalized con formato corrupto que haya quedado en la fila', async () => {
  // Defensa en profundidad: aunque el CHECK de la migración debería
  // impedir esto a nivel de base, el gate igual revalida isValidRut acá
  // — nunca confía ciegamente en que "existe una fila" sea suficiente.
  const corrupted = { ...ADULT_CL_RUT_OK, rut_normalized: '141823095' }; // el real es ...4, no ...5
  currentMock = mockTables({ onboarding: corrupted, countryCode: 'CL' });
  const result = await assertCreatorEligible('user-1');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'identity_incomplete');
});

// ---- upsertIdentityRut ----

test('upsertIdentityRut: RUT válido -> guarda normalizado, devuelve enmascarado', async () => {
  let capturedPayload = null;
  currentMock = {
    trust_onboarding: () => ({
      upsert: (payload) => {
        capturedPayload = payload;
        return Promise.resolve({ error: null });
      },
    }),
  };
  const result = await upsertIdentityRut('user-1', '14.182.309-4');
  assert.equal(result.ok, true);
  assert.equal(result.rut_masked, '*****3094');
  assert.equal(capturedPayload.rut_normalized, '141823094');
  assert.ok(capturedPayload.rut_declared_at);
});

test('upsertIdentityRut: usa upsert (no update) — funciona aunque el usuario todavía no tenga fila en trust_onboarding', async () => {
  // Regresión de un bug real encontrado adversarialmente en DEV: con
  // `.update()`, un usuario sin fila previa (nunca llamó
  // /api/onboarding/trust/complete) recibía 200 OK sin que se guardara
  // nada — 0 filas afectadas, sin error. `.upsert()` crea la fila si no
  // existe, igual que upsertOnboardingFields ya hace para TRUST-1.
  let upsertCalled = false;
  let capturedOptions = null;
  currentMock = {
    trust_onboarding: () => ({
      upsert: (payload, options) => {
        upsertCalled = true;
        capturedOptions = options;
        return Promise.resolve({ error: null });
      },
    }),
  };
  const result = await upsertIdentityRut('user-sin-fila-previa', '14.182.309-4');
  assert.equal(result.ok, true);
  assert.equal(upsertCalled, true);
  assert.equal(capturedOptions?.onConflict, 'user_id');
});

test('upsertIdentityRut: RUT con dígito verificador incorrecto -> rechazado sin tocar la base', async () => {
  let touched = false;
  currentMock = { trust_onboarding: () => { touched = true; return { upsert: () => Promise.resolve({ error: null }) }; } };
  const result = await upsertIdentityRut('user-1', '14.182.309-5');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid_rut');
  assert.equal(touched, false, 'un RUT inválido nunca debe llegar a tocar la base');
});

test('upsertIdentityRut: conflicto de unicidad (23505) -> rut_conflict, sin revelar de quién es', async () => {
  currentMock = {
    trust_onboarding: () => ({
      upsert: () => Promise.resolve({ error: { code: '23505', message: 'duplicate key' } }),
    }),
  };
  const result = await upsertIdentityRut('user-2', '14.182.309-4');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'rut_conflict');
  assert.equal('message' in result, false, 'el error de duplicidad no debe traer el mensaje crudo de Postgres');
});

test('upsertIdentityRut: otro error de base -> lanza (nunca se traga silenciosamente)', async () => {
  currentMock = {
    trust_onboarding: () => ({
      upsert: () => Promise.resolve({ error: { code: '500', message: 'boom' } }),
    }),
  };
  await assert.rejects(() => upsertIdentityRut('user-1', '14.182.309-4'));
});

test('ADVERSARIAL: upsertIdentityRut ignora cualquier intento de mandar user_id/rut_normalized ya "verificado" — solo acepta el RUT crudo como string', async () => {
  let capturedPayload = null;
  currentMock = {
    trust_onboarding: () => ({
      upsert: (payload) => { capturedPayload = payload; return Promise.resolve({ error: null }); },
    }),
  };
  // La firma de la función solo acepta (userId, rawRut) — no hay forma de
  // colar un objeto con campos extra, pero igual se prueba que el
  // payload real solo contiene lo esperado (incluido que user_id es
  // siempre el resuelto server-side, nunca uno falsificado).
  await upsertIdentityRut('user-real', '14.182.309-4');
  const keys = Object.keys(capturedPayload).sort();
  assert.deepEqual(keys, ['rut_declared_at', 'rut_normalized', 'updated_at', 'user_id'].sort());
  assert.equal(capturedPayload.user_id, 'user-real');
});

// ---- getIdentityStatus ----

test('getIdentityStatus: usuario elegible completo -> creator_eligible true, age_verified/identity_verified/phone_verified siempre false', async () => {
  currentMock = mockTables({ onboarding: ADULT_CL_RUT_OK, countryCode: 'CL' });
  const status = await getIdentityStatus('user-1');
  assert.equal(status.creator_eligible, true);
  assert.equal(status.rut_required, true);
  assert.equal(status.rut_declared, true);
  assert.equal(status.rut_masked, '*****3094');
  assert.equal(status.age_requirement_met_from_declared_data, true);
  assert.equal(status.age_verified, false);
  assert.equal(status.identity_verified, false);
  assert.equal(status.phone_verified, false);
});

test('getIdentityStatus: sin RUT declarado en Chile -> creator_eligible false, rut_masked null', async () => {
  const noRut = { ...ADULT_CL_RUT_OK, rut_normalized: null, rut_declared_at: null };
  currentMock = mockTables({ onboarding: noRut, countryCode: 'CL' });
  const status = await getIdentityStatus('user-1');
  assert.equal(status.creator_eligible, false);
  assert.equal(status.rut_masked, null);
});

test('getIdentityStatus: userId ausente -> estado vacío seguro, sin consultar la base', async () => {
  let queried = false;
  currentMock = { trust_onboarding: () => { queried = true; return mockSelectMaybeSingle(ADULT_CL_RUT_OK)(); } };
  const status = await getIdentityStatus(null);
  assert.equal(status.creator_eligible, false);
  assert.equal(queried, false);
});

test('getIdentityStatus: fila inexistente -> nunca lanza, todo en false/null', async () => {
  currentMock = mockTables({ onboarding: null, countryCode: 'CL' });
  const status = await getIdentityStatus('user-nuevo');
  assert.equal(status.creator_eligible, false);
  assert.equal(status.rut_declared, false);
  assert.equal(status.rut_masked, null);
});

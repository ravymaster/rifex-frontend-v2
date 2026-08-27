// tests/trustOnboardingGate.test.mjs
// TRUST-1 — assertOnboardingComplete/getOnboardingRecord/
// upsertOnboardingFields con un cliente Supabase mockeado (mismo patrón
// que tests/eventAnalyticsAuth.test.mjs). Requiere variables de entorno
// dummy para que createClient no falle al construirse — nunca toca
// rifex-dev de verdad.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-role-key-for-tests';

const { createClient } = await import('@supabase/supabase-js');

// trustOnboardingGate.js construye su propio cliente a nivel de módulo
// (mismo patrón que el resto del proyecto) — no acepta un cliente por
// parámetro. Para inyectar respuestas controladas sin tocar rifex-dev,
// parcheamos `.from` en el prototipo real del cliente (descubierto desde
// una instancia pública vía createClient, estable entre versiones del
// SDK) ANTES de importar el módulo bajo prueba — así cualquier instancia,
// incluida la que el módulo crea internamente al importarse, devuelve
// nuestras respuestas mockeadas.
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

const {
  assertOnboardingComplete,
  getOnboardingRecord,
  upsertOnboardingFields,
} = await import('../src/lib/trustOnboardingGate.js');

function mockSelectMaybeSingle(data, error = null) {
  return () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data, error }),
      }),
    }),
  });
}

const COMPLETE_RECORD = {
  legal_name: 'Juan Pérez',
  birth_date: '1990-05-15',
  phone: '+56912345678',
  account_type: 'person',
  terms_version: 'terms-v1.0',
  terms_accepted_at: '2026-08-26T00:00:00.000Z',
  privacy_version: 'privacy-v1.0',
  privacy_accepted_at: '2026-08-26T00:00:00.000Z',
  onboarding_completed_at: '2026-08-26T00:00:00.000Z',
};

test('assertOnboardingComplete: registro completo -> ok', async () => {
  currentMock = { trust_onboarding: mockSelectMaybeSingle(COMPLETE_RECORD) };
  const result = await assertOnboardingComplete('user-1');
  assert.deepEqual(result, { ok: true });
});

test('assertOnboardingComplete: sin fila (usuario nunca empezó el onboarding, nuevo o antiguo) -> rechazado', async () => {
  currentMock = { trust_onboarding: mockSelectMaybeSingle(null) };
  const result = await assertOnboardingComplete('user-nunca-registrado');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'onboarding_incomplete');
});

test('assertOnboardingComplete: registro parcial (le falta un campo) -> rechazado', async () => {
  const partial = { ...COMPLETE_RECORD, phone: null, onboarding_completed_at: null };
  currentMock = { trust_onboarding: mockSelectMaybeSingle(partial) };
  const result = await assertOnboardingComplete('user-parcial');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'onboarding_incomplete');
});

test('assertOnboardingComplete: userId ausente -> rechazado sin consultar la base', async () => {
  let queried = false;
  currentMock = { trust_onboarding: () => { queried = true; return mockSelectMaybeSingle(COMPLETE_RECORD)(); } };
  const result = await assertOnboardingComplete(null);
  assert.equal(result.ok, false);
  assert.equal(queried, false, 'un userId ausente debe rechazarse sin tocar la base');
});

test('assertOnboardingComplete: error de infraestructura -> falla cerrado (rechaza, nunca autoriza por defecto)', async () => {
  currentMock = { trust_onboarding: mockSelectMaybeSingle(null, { message: 'boom' }) };
  const result = await assertOnboardingComplete('user-1');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'onboarding_check_failed');
});

test('assertOnboardingComplete: versión de términos desactualizada respecto de la vigente -> rechazado', async () => {
  const stale = { ...COMPLETE_RECORD, terms_version: 'terms-v0.1', onboarding_completed_at: null };
  currentMock = { trust_onboarding: mockSelectMaybeSingle(stale) };
  const result = await assertOnboardingComplete('user-1');
  assert.equal(result.ok, false);
});

test('getOnboardingRecord: retorna null en error, nunca lanza', async () => {
  currentMock = { trust_onboarding: mockSelectMaybeSingle(null, { message: 'boom' }) };
  const record = await getOnboardingRecord('user-1');
  assert.equal(record, null);
});

test('getOnboardingRecord: userId ausente -> null sin consultar', async () => {
  const record = await getOnboardingRecord(null);
  assert.equal(record, null);
});

// ---- Prueba adversarial estructural: el cliente NUNCA puede fijar
// onboarding_completed_at directamente, sin importar qué envíe. ----
test('ADVERSARIAL: upsertOnboardingFields ignora cualquier onboarding_completed_at/user_id que el llamador intente colar en fields', async () => {
  let capturedUpsertPayload = null;
  let capturedUpdatePayload = null;
  currentMock = {
    trust_onboarding: () => ({
      upsert: (payload) => {
        capturedUpsertPayload = payload;
        return {
          select: () => ({
            single: () => Promise.resolve({
              data: { ...payload, onboarding_completed_at: null }, // simula que la fila real nunca trae completed_at del upsert
              error: null,
            }),
          }),
        };
      },
      update: (payload) => {
        capturedUpdatePayload = payload;
        return {
          eq: () => ({
            select: () => ({
              single: () => Promise.resolve({ data: { ...COMPLETE_RECORD, ...payload }, error: null }),
            }),
          }),
        };
      },
    }),
  };

  // El "atacante" intenta colar onboarding_completed_at y user_id
  // falsificado directamente en el objeto fields.
  const maliciousFields = {
    legal_name: 'Juan Pérez',
    birth_date: '1990-05-15',
    phone: '+56912345678',
    account_type: 'person',
    terms_version: 'terms-v1.0',
    terms_accepted_at: '2026-08-26T00:00:00.000Z',
    privacy_version: 'privacy-v1.0',
    privacy_accepted_at: '2026-08-26T00:00:00.000Z',
    onboarding_completed_at: '2020-01-01T00:00:00.000Z', // intento de forjar la fecha
    user_id: 'victima-suplantada', // intento de escribir en la fila de otro usuario
  };

  await upsertOnboardingFields('user-real', maliciousFields);

  assert.equal(capturedUpsertPayload.user_id, 'user-real', 'user_id siempre es el resuelto server-side, nunca el del body');
  assert.equal(
    'onboarding_completed_at' in capturedUpsertPayload,
    false,
    'onboarding_completed_at nunca debe copiarse desde fields al upsert — se calcula aparte'
  );
  // El completed_at real, si se fija, sale de un segundo UPDATE explícito
  // calculado por el propio módulo — nunca del valor que mandó el cliente.
  if (capturedUpdatePayload) {
    assert.notEqual(capturedUpdatePayload.onboarding_completed_at, '2020-01-01T00:00:00.000Z');
  }
});

test('upsertOnboardingFields: primera vez que se completa -> fija onboarding_completed_at', async () => {
  let updateCalled = false;
  currentMock = {
    trust_onboarding: () => ({
      upsert: (payload) => ({
        select: () => ({
          single: () => Promise.resolve({ data: { ...COMPLETE_RECORD, onboarding_completed_at: null }, error: null }),
        }),
      }),
      update: (payload) => {
        updateCalled = true;
        assert.ok(payload.onboarding_completed_at, 'debe fijar una fecha real');
        return {
          eq: () => ({
            select: () => ({ single: () => Promise.resolve({ data: { ...COMPLETE_RECORD, ...payload }, error: null }) }),
          }),
        };
      },
    }),
  };
  const result = await upsertOnboardingFields('user-1', {
    legal_name: 'Juan Pérez', birth_date: '1990-05-15', phone: '+56912345678', account_type: 'person',
    terms_version: 'terms-v1.0', terms_accepted_at: '2026-08-26T00:00:00.000Z',
    privacy_version: 'privacy-v1.0', privacy_accepted_at: '2026-08-26T00:00:00.000Z',
  });
  assert.equal(updateCalled, true);
  assert.ok(result.onboarding_completed_at);
});

test('upsertOnboardingFields: ya estaba completo -> NO vuelve a llamar update (idempotente, conserva la fecha original)', async () => {
  let updateCalled = false;
  currentMock = {
    trust_onboarding: () => ({
      upsert: () => ({
        select: () => ({
          single: () => Promise.resolve({ data: COMPLETE_RECORD, error: null }), // ya viene con onboarding_completed_at
        }),
      }),
      update: () => { updateCalled = true; return { eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: COMPLETE_RECORD, error: null }) }) }) }; },
    }),
  };
  const result = await upsertOnboardingFields('user-1', { legal_name: 'Juan Pérez Editado' });
  assert.equal(updateCalled, false, 'no debe re-disparar el UPDATE de completed_at si ya estaba completo');
  assert.equal(result.onboarding_completed_at, COMPLETE_RECORD.onboarding_completed_at);
});

// tests/mpIdentityMatchGate.test.mjs
// Corrección canónica (2026-08-27) — resolución real de
// mp_identity_match con Supabase mockeado (mismo patrón que
// tests/trustIdentityGate.test.mjs). Nunca toca rifex-dev de verdad, y
// nunca llama a la API real de Mercado Pago (usersMeResponse siempre
// viene ya resuelto, inyectado por el caller real —
// src/pages/api/mp/oauth/callback.js).
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
  if (currentMock && currentMock[table]) return currentMock[table]();
  return originalFromImpl.call(this, table);
};

const { extractMpRutFromUsersMe, resolveMpIdentityMatch } = await import('../src/lib/mpIdentityMatchGate.js');

// ---- extractMpRutFromUsersMe: nunca inventa un valor ----

test('extractMpRutFromUsersMe: identification.number con RUT real válido -> lo extrae normalizado', () => {
  assert.equal(extractMpRutFromUsersMe({ identification: { number: '14.182.309-4' } }), '141823094');
});

test('extractMpRutFromUsersMe: identification.id como alternativa -> también lo extrae', () => {
  assert.equal(extractMpRutFromUsersMe({ identification: { id: '14182309-4' } }), '141823094');
});

test('extractMpRutFromUsersMe: sin campo identification -> null, nunca inventa', () => {
  assert.equal(extractMpRutFromUsersMe({ email: 'x@example.com' }), null);
  assert.equal(extractMpRutFromUsersMe({}), null);
  assert.equal(extractMpRutFromUsersMe(null), null);
  assert.equal(extractMpRutFromUsersMe(undefined), null);
});

test('extractMpRutFromUsersMe: identification.number con formato inválido (no es un RUT real) -> null', () => {
  assert.equal(extractMpRutFromUsersMe({ identification: { number: '123' } }), null);
  assert.equal(extractMpRutFromUsersMe({ identification: { number: 'not-a-rut' } }), null);
});

// ---- resolveMpIdentityMatch: I/O real, mockeado ----

function mockOnboarding(rut) {
  return () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { rut_normalized: rut }, error: null }) }) }) });
}

test('resolveMpIdentityMatch: RUT de Rifex coincide con el de Mercado Pago -> matched, se persiste', async () => {
  let capturedUpdate = null;
  currentMock = {
    trust_onboarding: mockOnboarding('141823094'),
    merchant_gateways: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ is: () => ({ neq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }) }) }),
      update: (payload) => { capturedUpdate = payload; return { eq: function () { return this; } }; },
    }),
  };
  const result = await resolveMpIdentityMatch({ userId: 'user-1', mpUserId: 'mp-999', usersMeResponse: { identification: { number: '14.182.309-4' } } });
  assert.equal(result.status, 'matched');
  assert.equal(capturedUpdate.mp_identity_match, 'matched');
  assert.ok(capturedUpdate.mp_identity_matched_at);
});

test('resolveMpIdentityMatch: Mercado Pago no entrega identificación -> unavailable, nunca matched por defecto', async () => {
  let capturedUpdate = null;
  currentMock = {
    trust_onboarding: mockOnboarding('141823094'),
    merchant_gateways: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ is: () => ({ neq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }) }) }),
      update: (payload) => { capturedUpdate = payload; return { eq: function () { return this; } }; },
    }),
  };
  const result = await resolveMpIdentityMatch({ userId: 'user-1', mpUserId: 'mp-999', usersMeResponse: { email: 'x@example.com' } });
  assert.equal(result.status, 'unavailable');
  assert.equal(capturedUpdate.mp_identity_match, 'unavailable');
});

test('resolveMpIdentityMatch: RUT distinto -> mismatch', async () => {
  let capturedUpdate = null;
  currentMock = {
    trust_onboarding: mockOnboarding('141823094'),
    merchant_gateways: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ is: () => ({ neq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }) }) }),
      update: (payload) => { capturedUpdate = payload; return { eq: function () { return this; } }; },
    }),
  };
  const result = await resolveMpIdentityMatch({ userId: 'user-1', mpUserId: 'mp-999', usersMeResponse: { identification: { number: '11.111.111-1' } } });
  assert.equal(result.status, 'mismatch');
});

test('ADVERSARIAL: resolveMpIdentityMatch — el mismo mp_user_id ya activo en otra cuenta -> needs_review, nunca revela de quién es', async () => {
  let capturedUpdate = null;
  currentMock = {
    trust_onboarding: mockOnboarding('141823094'),
    merchant_gateways: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ is: () => ({ neq: () => ({ maybeSingle: () => Promise.resolve({ data: { user_id: 'otra-cuenta-secreta' }, error: null }) }) }) }) }) }),
      update: (payload) => { capturedUpdate = payload; return { eq: function () { return this; } }; },
    }),
  };
  const result = await resolveMpIdentityMatch({ userId: 'user-1', mpUserId: 'mp-ya-usado', usersMeResponse: { identification: { number: '14.182.309-4' } } });
  assert.equal(result.status, 'needs_review');
  assert.equal(JSON.stringify(result).includes('otra-cuenta-secreta'), false, 'nunca debe filtrar el id de la otra cuenta');
  assert.equal(capturedUpdate.mp_identity_match, 'needs_review');
});

test('resolveMpIdentityMatch: sin RUT declarado en Rifex todavía -> needs_review', async () => {
  let capturedUpdate = null;
  currentMock = {
    trust_onboarding: mockOnboarding(null),
    merchant_gateways: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ is: () => ({ neq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }) }) }),
      update: (payload) => { capturedUpdate = payload; return { eq: function () { return this; } }; },
    }),
  };
  const result = await resolveMpIdentityMatch({ userId: 'user-1', mpUserId: 'mp-999', usersMeResponse: { identification: { number: '14.182.309-4' } } });
  assert.equal(result.status, 'needs_review');
});

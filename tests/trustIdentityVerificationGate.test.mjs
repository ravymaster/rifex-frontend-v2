// tests/trustIdentityVerificationGate.test.mjs
// TRUST-3A — trustIdentityVerificationGate.js con Supabase (DB + Storage)
// mockeado, mismo patrón que tests/trustIdentityGate.test.mjs. Nunca toca
// rifex-dev de verdad.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-role-key-for-tests';

const { createClient } = await import('@supabase/supabase-js');

let currentTableMock = null;
let currentStorageMock = null;

const probeClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ClientProto = Object.getPrototypeOf(probeClient);
const originalFromImpl = ClientProto.from;
ClientProto.from = function mockedFrom(table) {
  if (currentTableMock && currentTableMock[table]) return currentTableMock[table]();
  return originalFromImpl.call(this, table);
};

const StorageProto = Object.getPrototypeOf(probeClient.storage);
const originalStorageFromImpl = StorageProto.from;
StorageProto.from = function mockedStorageFrom(bucket) {
  if (currentStorageMock) return currentStorageMock(bucket);
  return originalStorageFromImpl.call(this, bucket);
};

const {
  startVerification,
  uploadDocumentSide,
  submitVerification,
  openCaseForReview,
  recordDecision,
  revokeVerification,
} = await import('../src/lib/trustIdentityVerificationGate.js');

function selectMaybeSingle(data, error = null) {
  return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data, error }) }) }) };
}

async function realJpeg() {
  return sharp({ create: { width: 100, height: 60, channels: 3, background: { r: 1, g: 2, b: 3 } } }).jpeg().toBuffer();
}

test('startVerification: cuenta de organización -> rechazada, nunca crea un caso', async () => {
  let touched = false;
  currentTableMock = { trust_identity_verifications: () => { touched = true; return selectMaybeSingle(null); } };
  const result = await startVerification('user-org', { accountType: 'organization', countryCode: 'CL' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'organization_not_supported_yet');
  assert.equal(touched, false);
});

test('startVerification: persona natural, caso nuevo -> lo crea en draft', async () => {
  let insertedPayload = null;
  currentTableMock = {
    trust_identity_verifications: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
      insert: (payload) => { insertedPayload = payload; return { select: () => ({ single: () => Promise.resolve({ data: { ...payload }, error: null }) }) }; },
    }),
    trust_identity_audit_log: () => ({ insert: () => Promise.resolve({ error: null }) }),
  };
  const result = await startVerification('user-1', { accountType: 'person', countryCode: 'CL' });
  assert.equal(result.ok, true);
  assert.equal(insertedPayload.status, 'draft');
  assert.equal(insertedPayload.user_id, 'user-1');
});

test('uploadDocumentSide: rechazado si el caso no está en draft/correction_required', async () => {
  currentTableMock = {
    trust_identity_verifications: () => selectMaybeSingle({ user_id: 'user-1', status: 'submitted' }),
  };
  const result = await uploadDocumentSide('user-1', 'front', await realJpeg());
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'upload_not_allowed_in_current_status');
});

test('uploadDocumentSide: lado inválido -> rechazado', async () => {
  const result = await uploadDocumentSide('user-1', 'top', Buffer.from([]));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid_side');
});

test('uploadDocumentSide: imagen inválida -> rechazado con el reason del procesamiento, nunca toca storage', async () => {
  let storageTouched = false;
  currentTableMock = { trust_identity_verifications: () => selectMaybeSingle({ user_id: 'user-1', status: 'draft' }) };
  currentStorageMock = () => { storageTouched = true; return {}; };
  const result = await uploadDocumentSide('user-1', 'front', Buffer.from('no es una imagen'));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid_image_format');
  assert.equal(storageTouched, false);
  currentStorageMock = null;
});

test('uploadDocumentSide: éxito -> sube a storage, inserta fila, marca el lado anterior como superseded', async () => {
  const jpeg = await realJpeg();
  let uploadedPath = null;
  let insertedRow = null;
  let supersededCall = null;
  currentTableMock = {
    trust_identity_verifications: () => selectMaybeSingle({ user_id: 'user-1', status: 'draft' }),
    trust_identity_documents: () => ({
      select: () => ({
        eq: function () { return this; },
        maybeSingle: () => Promise.resolve({ data: null, error: null }), // sin duplicado previo
      }),
      insert: (payload) => {
        insertedRow = payload;
        return { select: () => ({ single: () => Promise.resolve({ data: { id: 'doc-1', side: payload.side, status: 'uploaded', created_at: '2026-08-27T00:00:00Z' }, error: null }) }) };
      },
      update: (payload) => {
        supersededCall = payload;
        return {
          eq: function () { return this; },
          neq: function () { return Promise.resolve({ error: null }); },
        };
      },
    }),
    trust_identity_audit_log: () => ({ insert: () => Promise.resolve({ error: null }) }),
  };
  currentStorageMock = () => ({
    upload: (path) => { uploadedPath = path; return Promise.resolve({ error: null }); },
    remove: () => Promise.resolve({ error: null }),
  });

  const result = await uploadDocumentSide('user-1', 'front', jpeg);
  assert.equal(result.ok, true);
  assert.ok(uploadedPath.startsWith('user-1/'));
  assert.equal(insertedRow.side, 'front');
  assert.equal(insertedRow.mime_type, 'image/jpeg');
  assert.equal(supersededCall.status, 'superseded');
  currentStorageMock = null;
});

test('ADVERSARIAL: uploadDocumentSide limpia el objeto de storage si el insert en la base falla', async () => {
  const jpeg = await realJpeg();
  let removed = null;
  currentTableMock = {
    trust_identity_verifications: () => selectMaybeSingle({ user_id: 'user-1', status: 'draft' }),
    trust_identity_documents: () => ({
      select: () => ({ eq: function () { return this; }, maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
      insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: { message: 'db down' } }) }) }),
    }),
  };
  currentStorageMock = () => ({
    upload: () => Promise.resolve({ error: null }),
    remove: (paths) => { removed = paths; return Promise.resolve({ error: null }); },
  });
  await assert.rejects(() => uploadDocumentSide('user-1', 'front', jpeg));
  assert.equal(removed.length, 1);
  currentStorageMock = null;
});

test('submitVerification: falta un lado -> rechazado, informa cuál falta', async () => {
  currentTableMock = {
    trust_identity_verifications: () => selectMaybeSingle({ user_id: 'user-1', status: 'draft' }),
    trust_identity_documents: () => ({
      select: () => ({ eq: function () { return this; }, order: () => Promise.resolve({ data: [{ side: 'front', status: 'uploaded', created_at: '2026-08-27' }], error: null }) }),
    }),
  };
  const result = await submitVerification('user-1');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing_documents');
  assert.deepEqual(result.missing, ['back']);
});

test('submitVerification: ambos lados presentes -> transiciona a submitted', async () => {
  currentTableMock = {
    trust_identity_verifications: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { user_id: 'user-1', status: 'draft' }, error: null }) }) }),
      update: () => ({
        eq: function () { return this; },
        in: function () { return this; },
        select: () => ({ maybeSingle: () => Promise.resolve({ data: { user_id: 'user-1', status: 'submitted', submitted_at: '2026-08-27T00:00:00Z' }, error: null }) }),
      }),
    }),
    trust_identity_documents: () => ({
      select: () => ({ eq: function () { return this; }, order: () => Promise.resolve({ data: [{ side: 'front' }, { side: 'back' }], error: null }) }),
    }),
    trust_identity_audit_log: () => ({ insert: () => Promise.resolve({ error: null }) }),
  };
  const result = await submitVerification('user-1');
  assert.equal(result.ok, true);
  assert.equal(result.case.status, 'submitted');
});

test('recordDecision: un admin no puede decidir su propio caso', async () => {
  const result = await recordDecision('same-id', 'same-id', { action: 'approve', confirmedDataMatches: true, confirmedAgeAdult: true });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'cannot_review_own_case');
});

test('recordDecision: approve sin las confirmaciones explícitas -> rechazado, nunca aprueba a ciegas', async () => {
  const result = await recordDecision('user-1', 'admin-1', { action: 'approve' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'confirmation_required');
});

test('recordDecision: acción inválida -> rechazada', async () => {
  const result = await recordDecision('user-1', 'admin-1', { action: 'delete_everything' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid_action');
});

test('ADVERSARIAL: recordDecision — si el caso ya no está under_review (decisión concurrente ganada por otro), la UPDATE atómica devuelve 0 filas y se rechaza', async () => {
  currentTableMock = {
    trust_identity_verifications: () => ({
      update: () => ({ eq: function () { return this; }, select: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
    }),
  };
  const result = await recordDecision('user-1', 'admin-1', { action: 'reject', reasonCode: 'unable_to_verify' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'case_not_under_review');
});

test('recordDecision: approve exitoso -> escribe identity_verified/age_verified=true en trust_onboarding, con method manual_document_review', async () => {
  let onboardingPatch = null;
  currentTableMock = {
    trust_identity_verifications: () => ({
      update: (patch) => ({
        eq: function () { return this; },
        select: () => ({ maybeSingle: () => Promise.resolve({ data: { user_id: 'user-1', status: patch.status }, error: null }) }),
      }),
    }),
    trust_onboarding: () => ({
      update: (patch) => { onboardingPatch = patch; return { eq: () => Promise.resolve({ error: null }) }; },
    }),
    trust_identity_audit_log: () => ({ insert: () => Promise.resolve({ error: null }) }),
  };
  const result = await recordDecision('user-1', 'admin-1', {
    action: 'approve', confirmedDataMatches: true, confirmedAgeAdult: true,
  });
  assert.equal(result.ok, true);
  assert.equal(onboardingPatch.identity_verified, true);
  assert.equal(onboardingPatch.age_verified, true);
  assert.equal(onboardingPatch.identity_verified_method, 'manual_document_review');
  assert.equal(onboardingPatch.identity_verified_by, 'admin-1');
});

test('revokeVerification: un admin no puede revocarse a sí mismo', async () => {
  const result = await revokeVerification('same-id', 'same-id', {});
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'cannot_review_own_case');
});

test('revokeVerification: éxito -> limpia identity_verified/age_verified en trust_onboarding', async () => {
  let onboardingPatch = null;
  currentTableMock = {
    trust_identity_verifications: () => ({
      update: () => ({ eq: function () { return this; }, select: () => ({ maybeSingle: () => Promise.resolve({ data: { user_id: 'user-1', status: 'revoked' }, error: null }) }) }),
    }),
    trust_onboarding: () => ({ update: (patch) => { onboardingPatch = patch; return { eq: () => Promise.resolve({ error: null }) }; } }),
    trust_identity_audit_log: () => ({ insert: () => Promise.resolve({ error: null }) }),
  };
  const result = await revokeVerification('user-1', 'admin-1', { reasonCode: 'other' });
  assert.equal(result.ok, true);
  assert.equal(onboardingPatch.identity_verified, false);
  assert.equal(onboardingPatch.age_verified, false);
});

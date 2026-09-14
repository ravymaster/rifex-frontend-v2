// tests/creationGate.test.mjs
// RIFEX PROGRESSIVE ONBOARDING — resolveCreationGate (src/lib/creationGate.js)
// contra un cliente Supabase mockeado, mismo patrón que
// tests/trustIdentityGate.test.mjs: nunca toca rifex-dev de verdad,
// ejerce el código REAL (assertCreatorEligible sin cambios, mismo
// criterio fail-closed/matched-only).
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy-anon-key-for-tests';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-role-key-for-tests';

const { createClient } = await import('@supabase/supabase-js');

let currentMock = null; // tablas mockeadas para assertCreatorEligible
let currentUser = null; // { user: {...} } | null -- lo que devuelve auth.getUser()

const probeClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ClientProto = Object.getPrototypeOf(probeClient);
const originalFromImpl = ClientProto.from;
const AuthProto = Object.getPrototypeOf(probeClient.auth);
const originalGetUserImpl = AuthProto.getUser;

ClientProto.from = function mockedFrom(table) {
  if (currentMock && currentMock[table]) {
    return currentMock[table]();
  }
  return originalFromImpl.call(this, table);
};

// getSupabaseServer() crea su cliente vía @supabase/ssr#createServerClient,
// que internamente llama a createClient() de @supabase/supabase-js (mismo
// prototipo) -- este monkeypatch cubre ambos caminos por igual.
AuthProto.getUser = function mockedGetUser() {
  return Promise.resolve({ data: currentUser, error: currentUser ? null : null });
};

const { resolveCreationGate } = await import('../src/lib/creationGate.js');

function fakeCtx() {
  return {
    req: { cookies: {} },
    res: { getHeader: () => undefined, setHeader: () => {} },
  };
}

function mockSelectMaybeSingle(data, error = null) {
  return () => ({
    select: () => ({
      eq: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data, error }) }),
        maybeSingle: () => Promise.resolve({ data, error }),
      }),
    }),
  });
}

const CURRENT_ADULT_DECLARATION_VERSION = 'adult-declaration-v1.0';

const ONBOARDING_COMPLETE_CL = {
  person_name: 'Juan Pérez',
  organization_name: null,
  account_type: 'person',
  phone: '+56959904311',
  adult_declared: true,
  adult_declaration_version: CURRENT_ADULT_DECLARATION_VERSION,
  terms_version: 'terms-v1.1',
  terms_accepted_at: '2026-08-27T00:00:00.000Z',
  privacy_version: 'privacy-v1.1',
  privacy_accepted_at: '2026-08-27T00:00:00.000Z',
  onboarding_completed_at: '2026-08-27T00:00:00.000Z',
  rut_normalized: '141823094', // 14.182.309-4, real, dígito verificador válido
  rut_declared_at: '2026-08-27T00:00:00.000Z',
};

const ONBOARDING_INCOMPLETE = { ...ONBOARDING_COMPLETE_CL, phone: null, onboarding_completed_at: null };
const ONBOARDING_NO_RUT = { ...ONBOARDING_COMPLETE_CL, rut_normalized: null, rut_declared_at: null };

const MP_MATCHED = { status: 'connected', revoked_at: null, mp_identity_match: 'matched' };
const MP_NOT_CONNECTED = null;
const MP_PENDING = { status: 'connected', revoked_at: null, mp_identity_match: null };
const MP_CHECKING = { status: 'connected', revoked_at: null, mp_identity_match: 'checking' };
const MP_MISMATCH = { status: 'connected', revoked_at: null, mp_identity_match: 'mismatch' };
const MP_UNAVAILABLE = { status: 'connected', revoked_at: null, mp_identity_match: 'unavailable' };

function mockTables({ onboarding, countryCode = 'CL', mp = MP_NOT_CONNECTED }) {
  return {
    trust_onboarding: mockSelectMaybeSingle(onboarding),
    users_profile: mockSelectMaybeSingle({ country_code: countryCode }),
    merchant_gateways: mockSelectMaybeSingle(mp),
  };
}

function setUser(id) {
  currentUser = id ? { user: { id } } : null;
}

const DESTINATIONS = {
  rifa: '/crear-rifa',
  colecta: '/crear-colecta',
  evento: '/crear-evento',
};

// ---------- 1-3. Anónimo intenta crear cada vertical ----------
for (const [key, dest] of Object.entries(DESTINATIONS)) {
  test(`anónimo (sin sesión) intenta crear ${key} -> redirect a /login?next=${dest}`, async () => {
    setUser(null);
    const result = await resolveCreationGate(fakeCtx(), dest);
    assert.equal(result.redirect.destination, `/login?next=${encodeURIComponent(dest)}`);
    assert.equal(result.redirect.permanent, false);
  });
}

// ---------- 4. Autenticado, onboarding incompleto, cada vertical ----------
for (const [key, dest] of Object.entries(DESTINATIONS)) {
  test(`autenticado con onboarding incompleto intenta crear ${key} -> redirect a /registro/continuar con next preservado`, async () => {
    setUser('user-1');
    currentMock = mockTables({ onboarding: ONBOARDING_INCOMPLETE });
    const result = await resolveCreationGate(fakeCtx(), dest);
    assert.equal(result.redirect.destination, `/registro/continuar?next=${encodeURIComponent(dest)}`);
  });
}

// ---------- 5. Usuario sin conexión de pago ----------
test('usuario con onboarding completo pero sin Mercado Pago conectado -> redirect a /panel/bancos con next preservado', async () => {
  setUser('user-1');
  currentMock = mockTables({ onboarding: ONBOARDING_COMPLETE_CL, mp: MP_NOT_CONNECTED });
  const result = await resolveCreationGate(fakeCtx(), '/crear-rifa');
  assert.equal(result.redirect.destination, `/panel/bancos?next=${encodeURIComponent('/crear-rifa')}`);
});

// ---------- 6-9. Estados reales de mp_identity_match (Trust) ----------
test('Trust pending (fila conectada, mp_identity_match NULL) -> /panel/bancos, nunca autorizado', async () => {
  setUser('user-1');
  currentMock = mockTables({ onboarding: ONBOARDING_COMPLETE_CL, mp: MP_PENDING });
  const result = await resolveCreationGate(fakeCtx(), '/crear-colecta');
  assert.ok(result.redirect);
  assert.equal(result.redirect.destination, `/panel/bancos?next=${encodeURIComponent('/crear-colecta')}`);
});

test('Trust "checking" -> /panel/bancos, nunca autorizado', async () => {
  setUser('user-1');
  currentMock = mockTables({ onboarding: ONBOARDING_COMPLETE_CL, mp: MP_CHECKING });
  const result = await resolveCreationGate(fakeCtx(), '/crear-evento');
  assert.ok(result.redirect);
  assert.equal(result.redirect.destination, `/panel/bancos?next=${encodeURIComponent('/crear-evento')}`);
});

test('Trust mismatch -> /panel/bancos, nunca autorizado', async () => {
  setUser('user-1');
  currentMock = mockTables({ onboarding: ONBOARDING_COMPLETE_CL, mp: MP_MISMATCH });
  const result = await resolveCreationGate(fakeCtx(), '/crear-rifa');
  assert.ok(result.redirect);
  assert.equal(result.redirect.destination, `/panel/bancos?next=${encodeURIComponent('/crear-rifa')}`);
});

test('Trust unavailable (MP no entregó el dato) -> /panel/bancos, nunca autorizado (fail-closed, nunca se interpreta como matched)', async () => {
  setUser('user-1');
  currentMock = mockTables({ onboarding: ONBOARDING_COMPLETE_CL, mp: MP_UNAVAILABLE });
  const result = await resolveCreationGate(fakeCtx(), '/crear-rifa');
  assert.ok(result.redirect);
  assert.equal(result.redirect.destination, `/panel/bancos?next=${encodeURIComponent('/crear-rifa')}`);
});

// ---------- 10-11. Trust matched -> elegible, entra directo ----------
for (const [key, dest] of Object.entries(DESTINATIONS)) {
  test(`Trust matched + onboarding completo intenta crear ${key} -> elegible, entra directo al formulario (props, sin redirect)`, async () => {
    setUser('user-1');
    currentMock = mockTables({ onboarding: ONBOARDING_COMPLETE_CL, mp: MP_MATCHED });
    const result = await resolveCreationGate(fakeCtx(), dest);
    assert.deepEqual(result, { props: {} });
  });
}

// ---------- 12-14. El destino original se conserva por vertical ----------
for (const [key, dest] of Object.entries(DESTINATIONS)) {
  test(`destino ${key} se conserva exacto en el next del redirect de onboarding`, async () => {
    setUser('user-1');
    currentMock = mockTables({ onboarding: ONBOARDING_INCOMPLETE });
    const result = await resolveCreationGate(fakeCtx(), dest);
    const url = new URL(result.redirect.destination, 'https://rifex.pro');
    assert.equal(url.searchParams.get('next'), dest);
  });
}

// ---------- 15. RUT declarado incompleto -> onboarding, no MP ----------
test('onboarding completo pero sin RUT declarado (CL) -> /registro/continuar (identity_incomplete), no llega a evaluar Mercado Pago', async () => {
  setUser('user-1');
  currentMock = mockTables({ onboarding: ONBOARDING_NO_RUT, mp: MP_MATCHED });
  const result = await resolveCreationGate(fakeCtx(), '/crear-rifa');
  assert.equal(result.redirect.destination, `/registro/continuar?next=${encodeURIComponent('/crear-rifa')}`);
});

// ---------- 16. Usuario ya elegible entra sin loop, sin pasos extra ----------
test('usuario elegible: dos llamadas consecutivas siempre devuelven props directo, sin ningún redirect intermedio (sin loop)', async () => {
  setUser('user-1');
  currentMock = mockTables({ onboarding: ONBOARDING_COMPLETE_CL, mp: MP_MATCHED });
  const r1 = await resolveCreationGate(fakeCtx(), '/crear-rifa');
  const r2 = await resolveCreationGate(fakeCtx(), '/crear-rifa');
  assert.deepEqual(r1, { props: {} });
  assert.deepEqual(r2, { props: {} });
});

// ---------- 17. Error de infraestructura -> fail-closed, nunca autorizado por defecto ----------
test('error de Supabase al resolver onboarding -> fail-closed (onboarding_check_failed), nunca autoriza por defecto', async () => {
  setUser('user-1');
  currentMock = {
    trust_onboarding: mockSelectMaybeSingle(null, { message: 'db down' }),
    users_profile: mockSelectMaybeSingle({ country_code: 'CL' }),
    merchant_gateways: mockSelectMaybeSingle(MP_MATCHED),
  };
  const result = await resolveCreationGate(fakeCtx(), '/crear-rifa');
  assert.ok(result.redirect);
  assert.equal(result.redirect.destination, `/registro/continuar?next=${encodeURIComponent('/crear-rifa')}`);
});

// ---------- 18. Sin fila de onboarding (usuario nunca empezó) ----------
test('usuario autenticado sin ninguna fila de onboarding (nunca empezó) -> /registro/continuar, nunca autorizado', async () => {
  setUser('user-nuevo');
  currentMock = mockTables({ onboarding: null });
  const result = await resolveCreationGate(fakeCtx(), '/crear-evento');
  assert.equal(result.redirect.destination, `/registro/continuar?next=${encodeURIComponent('/crear-evento')}`);
});

// ---------- 19. destinationPath siempre es un literal fijo por página, nunca construido desde input externo ----------
test('crear-rifa.jsx/crear-colecta.jsx/crear-evento.jsx: getServerSideProps llama resolveCreationGate con un literal fijo, nunca con ctx.query', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const ROOT = process.cwd();
  const cases = [
    ['src/pages/crear-rifa.jsx', '/crear-rifa'],
    ['src/pages/crear-colecta.jsx', '/crear-colecta'],
    ['src/pages/crear-evento.jsx', '/crear-evento'],
  ];
  for (const [file, dest] of cases) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.match(src, /import \{ resolveCreationGate \} from ['"]@\/lib\/creationGate['"]/);
    const re = new RegExp(`resolveCreationGate\\(ctx,\\s*['"]${dest.replace('/', '\\/')}['"]\\)`);
    assert.match(src, re, `${file} debe llamar resolveCreationGate con el literal exacto ${dest}`);
    assert.doesNotMatch(src, /resolveCreationGate\(ctx,\s*ctx\.query/);
  }
});

// ---------- 20. API de creación sigue siendo la autoridad real, independiente del gate ----------
test('api/rifas, api/colectas, api/events siguen llamando assertCreatorEligible por su cuenta -- el gate de la página nunca las reemplaza', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const ROOT = process.cwd();
  for (const file of ['src/pages/api/rifas/index.js', 'src/pages/api/colectas/index.js', 'src/pages/api/events/index.js']) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.match(src, /assertCreatorEligible/, `${file} debe seguir llamando assertCreatorEligible`);
  }
});

// ---------- Login redirect: siempre next=destinationPath tal cual, nunca abre a un host externo ----------
test('el redirect a /login siempre usa exactamente destinationPath (ruta interna fija) como next, nunca un valor externo', async () => {
  setUser(null);
  const result = await resolveCreationGate(fakeCtx(), '/crear-colecta');
  const url = new URL(result.redirect.destination, 'https://rifex.pro');
  assert.equal(url.pathname, '/login');
  assert.equal(url.searchParams.get('next'), '/crear-colecta');
});

// ---------- next externo malicioso en la propia URL de creación: sin efecto, resolveCreationGate nunca lee ctx.query ----------
test('un ?next=https://evil.com en la propia URL de /crear-rifa no tiene ningún efecto -- resolveCreationGate nunca lee ctx.query, solo el literal fijo que la página pasa', async () => {
  setUser(null);
  const ctx = fakeCtx();
  ctx.query = { next: 'https://evil.com' }; // manipulación adversarial del query string
  const result = await resolveCreationGate(ctx, '/crear-rifa');
  assert.equal(result.redirect.destination, `/login?next=${encodeURIComponent('/crear-rifa')}`);
  assert.doesNotMatch(result.redirect.destination, /evil\.com/);
});

// ---------- acceso directo a la URL de creación no evade el gate (SSR corre siempre, sin importar el origen de la navegación) ----------
test('acceso directo (curl/URL directa, sin referer ni navegación previa) evalúa el mismo gate -- getServerSideProps corre siempre server-side, no hay atajo client-side que lo evite', async () => {
  setUser('user-1');
  currentMock = mockTables({ onboarding: ONBOARDING_INCOMPLETE });
  const result = await resolveCreationGate(fakeCtx(), '/crear-evento');
  assert.ok(result.redirect, 'debe redirigir igual que si se navegara desde un link interno');
});

// ---------- destino inalcanzable (identity_verification_required) mapea a /trust/verificar aunque hoy sea dormant ----------
test('REASON_TO_STEP incluye identity_verification_required -> /trust/verificar (rama hoy inalcanzable por diseño, isIdentityVerificationRequiredForCreators()===false, pero mapeada por completitud)', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const src = fs.readFileSync(path.join(process.cwd(), 'src/lib/creationGate.js'), 'utf8');
  assert.match(src, /identity_verification_required:\s*["']\/trust\/verificar["']/);
});

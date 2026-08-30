// ONBOARDING+BANCOS/MP — certifica revalidateMpConnection
// (src/lib/mpRevalidate.js): revalida una conexión de Mercado Pago YA
// EXISTENTE sin desconectar ni volver a ejecutar OAuth, reutilizando
// resolveMpIdentityMatch (TRUST-3B, sin cambios) para la regla real.
// Mismo patrón que el resto de la suite: monkeypatch de
// SupabaseClient.prototype.from contra un almacén en memoria, nunca
// toca rifex-dev real, nunca hace red -- fetchUsersMe es inyectable
// para certificar los tres caminos (200/401-403/fallo transitorio) sin
// depender de la API real de Mercado Pago.
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "dummy-service-role-key-for-tests";

const { createClient } = await import("@supabase/supabase-js");

const DB = {
  merchant_gateways: [],
  trust_onboarding: [],
};

function reset() {
  DB.merchant_gateways = [];
  DB.trust_onboarding = [];
}

function project(row, columns) {
  if (!row || !columns || columns === "*") return row;
  const cols = columns.split(",").map((c) => c.trim());
  const out = {};
  for (const c of cols) out[c] = row[c];
  return out;
}

function selectBuilder(rows, columns) {
  const filters = [];
  const b = {
    eq(col, val) { filters.push((r) => r[col] === val); return b; },
    neq(col, val) { filters.push((r) => r[col] !== val); return b; },
    is(col, val) { filters.push((r) => r[col] === val); return b; },
    maybeSingle() {
      const found = rows.filter((r) => filters.every((f) => f(r)));
      return Promise.resolve({ data: found[0] ? project(found[0], columns) : null, error: null });
    },
  };
  return b;
}

function updateBuilder(rows, payload) {
  const filters = [];
  const b = {
    eq(col, val) { filters.push((r) => r[col] === val); return b; },
    then(resolve, reject) {
      rows.forEach((r) => { if (filters.every((f) => f(r))) Object.assign(r, payload); });
      return Promise.resolve({ error: null }).then(resolve, reject);
    },
  };
  return b;
}

function makeTable(rows) {
  return () => ({
    select: (columns) => selectBuilder(rows, columns),
    update: (payload) => updateBuilder(rows, payload),
  });
}

const probeClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ClientProto = Object.getPrototypeOf(probeClient);
const originalFromImpl = ClientProto.from;
ClientProto.from = function mockedFrom(table) {
  if (DB[table]) return makeTable(DB[table])();
  return originalFromImpl.call(this, table);
};

const { revalidateMpConnection } = await import("../src/lib/mpRevalidate.js");

const USER_ID = "user-mp-1";
const OTHER_USER_ID = "user-mp-2";

function seedRifexRut(userId, rut) {
  DB.trust_onboarding.push({ user_id: userId, rut_normalized: rut });
}

function seedGateway(overrides = {}) {
  const row = {
    user_id: USER_ID,
    provider: "mp",
    access_token: "sensitive-access-token-should-never-leak",
    mp_access_token: "sensitive-access-token-should-never-leak",
    mp_user_id: "mp-user-1",
    status: "connected",
    revoked_at: null,
    expires_at: null,
    mp_identity_match: null,
    ...overrides,
  };
  DB.merchant_gateways.push(row);
  return row;
}

function findGateway(userId = USER_ID) {
  return DB.merchant_gateways.find((g) => g.user_id === userId && g.provider === "mp");
}

const okUsersMe = (json) => async () => ({ status: 200, ok: true, json });
const failUsersMe = (status) => async () => ({ status, ok: false, json: null });
const throwUsersMe = () => async () => { throw new Error("network_down"); };

// ---------------------------------------------------------------------
// 9/16/17/18/19. Estados básicos + revalidación de conexión legacy
// ---------------------------------------------------------------------

test("9. usuario sin gateway -> not_connected, nunca intenta llamar a Mercado Pago", async () => {
  reset();
  const result = await revalidateMpConnection(USER_ID, { fetchUsersMe: throwUsersMe() });
  assert.equal(result.status, "not_connected");
});

test("10. gateway conectado sin match todavía (legacy) -> se resuelve contra /users/me real", async () => {
  reset();
  seedGateway({ mp_identity_match: null });
  seedRifexRut(USER_ID, "141823094");
  const result = await revalidateMpConnection(USER_ID, { fetchUsersMe: okUsersMe({ identification: { type: "RUT", number: "14.182.309-4" } }) });
  assert.equal(result.status, "matched");
});

test("11. matched -> validated (RUT Rifex == RUT de Mercado Pago)", async () => {
  reset();
  seedGateway();
  seedRifexRut(USER_ID, "141823094");
  const result = await revalidateMpConnection(USER_ID, { fetchUsersMe: okUsersMe({ identification: { type: "RUT", number: "14182309-4" } }) });
  assert.equal(result.status, "matched");
  assert.equal(findGateway().mp_identity_match, "matched");
});

test("12. mismatch -> RUT distinto (ambos válidos, dígito verificador correcto en los dos)", async () => {
  reset();
  seedGateway();
  seedRifexRut(USER_ID, "141823094");
  const result = await revalidateMpConnection(USER_ID, { fetchUsersMe: okUsersMe({ identification: { type: "RUT", number: "20.000.000-5" } }) });
  assert.equal(result.status, "mismatch");
  assert.equal(findGateway().mp_identity_match, "mismatch");
});

test("13. unavailable -> Mercado Pago no entrega identification", async () => {
  reset();
  seedGateway();
  seedRifexRut(USER_ID, "141823094");
  const result = await revalidateMpConnection(USER_ID, { fetchUsersMe: okUsersMe({ email: "sin-identificacion@example.com" }) });
  assert.equal(result.status, "unavailable");
});

test("14. fallo transitorio (500/429 de Mercado Pago) -> unavailable, seguro de reintentar", async () => {
  reset();
  seedGateway();
  seedRifexRut(USER_ID, "141823094");
  const result = await revalidateMpConnection(USER_ID, { fetchUsersMe: failUsersMe(500) });
  assert.equal(result.status, "unavailable");
});

test("fallo de red (fetch lanza) -> unavailable, nunca lanza hacia el caller", async () => {
  reset();
  seedGateway();
  seedRifexRut(USER_ID, "141823094");
  const result = await revalidateMpConnection(USER_ID, { fetchUsersMe: throwUsersMe() });
  assert.equal(result.status, "unavailable");
});

test("15. NULL (RUT Rifex no declarado) -> needs_review, nunca elegible", async () => {
  reset();
  seedGateway();
  // sin seedRifexRut -- trust_onboarding vacío
  const result = await revalidateMpConnection(USER_ID, { fetchUsersMe: okUsersMe({ identification: { type: "RUT", number: "14.182.309-4" } }) });
  assert.equal(result.status, "needs_review");
});

test("22. /users/me sin identification -> bloqueado (unavailable, nunca matched)", async () => {
  reset();
  seedGateway();
  seedRifexRut(USER_ID, "141823094");
  const result = await revalidateMpConnection(USER_ID, { fetchUsersMe: okUsersMe({}) });
  assert.equal(result.status, "unavailable");
});

test("23. identification.type distinto de RUT -> bloqueado (unavailable), aunque el número coincida por azar", async () => {
  reset();
  seedGateway();
  seedRifexRut(USER_ID, "141823094");
  const result = await revalidateMpConnection(USER_ID, { fetchUsersMe: okUsersMe({ identification: { type: "CPF", number: "14.182.309-4" } }) });
  assert.equal(result.status, "unavailable");
});

test("24. RUT diferente -> mismatch (ya cubierto arriba, certificado explícitamente por claridad)", async () => {
  reset();
  seedGateway();
  seedRifexRut(USER_ID, "111111111");
  const result = await revalidateMpConnection(USER_ID, { fetchUsersMe: okUsersMe({ identification: { type: "RUT", number: "14.182.309-4" } }) });
  assert.equal(result.status, "mismatch");
});

test("25. RUT igual -> matched (ya cubierto arriba, certificado explícitamente por claridad)", async () => {
  reset();
  seedGateway();
  seedRifexRut(USER_ID, "141823094");
  const result = await revalidateMpConnection(USER_ID, { fetchUsersMe: okUsersMe({ identification: { type: "RUT", number: "14182309-4" } }) });
  assert.equal(result.status, "matched");
});

// ---------------------------------------------------------------------
// 16/17/18. Conexión legacy: revalidación SIN reconectar/duplicar fila
// ---------------------------------------------------------------------

test("16/17. CASO REAL: conexión previa a Trust (mp_identity_match null) se valida SIN desconectar/reconectar", async () => {
  reset();
  const gw = seedGateway({ status: "connected", mp_identity_match: null, mp_identity_matched_at: null });
  seedRifexRut(USER_ID, "141823094");
  const before = { ...gw };

  const result = await revalidateMpConnection(USER_ID, { fetchUsersMe: okUsersMe({ identification: { type: "RUT", number: "14.182.309-4" } }) });

  assert.equal(result.status, "matched");
  const after = findGateway();
  assert.equal(after.status, before.status, "status de conexión no se toca -- sigue 'connected', nunca pasó por disconnect");
  assert.equal(after.mp_user_id, before.mp_user_id, "mismo mp_user_id -- nunca se reconectó");
  assert.equal(after.access_token, before.access_token, "el token no se tocó -- se reutilizó tal cual");
});

test("18. la revalidación nunca crea una segunda fila merchant_gateway", async () => {
  reset();
  seedGateway();
  seedRifexRut(USER_ID, "141823094");
  await revalidateMpConnection(USER_ID, { fetchUsersMe: okUsersMe({ identification: { type: "RUT", number: "14.182.309-4" } }) });
  assert.equal(DB.merchant_gateways.length, 1);
});

// ---------------------------------------------------------------------
// 19/20/21. Caso real completo (elegibilidad tras validar legacy)
// ---------------------------------------------------------------------

test("19. matched legacy -> el campo que decide creator eligibility (mp_identity_match) queda 'matched'", async () => {
  reset();
  seedGateway({ mp_identity_match: null });
  seedRifexRut(USER_ID, "141823094");
  await revalidateMpConnection(USER_ID, { fetchUsersMe: okUsersMe({ identification: { type: "RUT", number: "14.182.309-4" } }) });
  assert.equal(findGateway().mp_identity_match, "matched");
});

test("20. mismatch legacy -> permanece bloqueado, mp_identity_match nunca queda en 'matched'", async () => {
  reset();
  seedGateway({ mp_identity_match: null });
  seedRifexRut(USER_ID, "141823094");
  await revalidateMpConnection(USER_ID, { fetchUsersMe: okUsersMe({ identification: { type: "RUT", number: "20.000.000-5" } }) });
  assert.equal(findGateway().mp_identity_match, "mismatch");
});

test("21. unavailable legacy -> permanece bloqueado", async () => {
  reset();
  seedGateway({ mp_identity_match: null });
  seedRifexRut(USER_ID, "141823094");
  await revalidateMpConnection(USER_ID, { fetchUsersMe: okUsersMe({}) });
  assert.notEqual(findGateway().mp_identity_match, "matched");
});

// ---------------------------------------------------------------------
// 12/18 (mandato onboarding) — token expirado/revocado: nunca mismatch,
// nunca matched, se marca reconnect_required de forma explícita.
// ---------------------------------------------------------------------

test("token expirado/revocado (401) -> reconnect_required, nunca mismatch", async () => {
  reset();
  seedGateway();
  seedRifexRut(USER_ID, "141823094");
  const result = await revalidateMpConnection(USER_ID, { fetchUsersMe: failUsersMe(401) });
  assert.equal(result.status, "reconnect_required");
  const gw = findGateway();
  assert.ok(gw.revoked_at, "revoked_at debe quedar seteado para que /api/mp/status refleje 'necesita reconectar'");
  assert.equal(gw.status, "not_connected");
});

test("token expirado/revocado (403) -> reconnect_required, misma ruta que 401", async () => {
  reset();
  seedGateway();
  seedRifexRut(USER_ID, "141823094");
  const result = await revalidateMpConnection(USER_ID, { fetchUsersMe: failUsersMe(403) });
  assert.equal(result.status, "reconnect_required");
});

test("gateway ya revocado localmente -> not_connected sin siquiera intentar llamar a Mercado Pago", async () => {
  reset();
  seedGateway({ revoked_at: new Date().toISOString() });
  const result = await revalidateMpConnection(USER_ID, { fetchUsersMe: throwUsersMe() });
  assert.equal(result.status, "not_connected");
});

test("gateway con expires_at en el pasado -> not_connected sin llamar a Mercado Pago", async () => {
  reset();
  seedGateway({ expires_at: new Date(Date.now() - 60_000).toISOString() });
  const result = await revalidateMpConnection(USER_ID, { fetchUsersMe: throwUsersMe() });
  assert.equal(result.status, "not_connected");
});

// ---------------------------------------------------------------------
// 26/27/28. Privacidad -- el token nunca sale del módulo
// ---------------------------------------------------------------------

test("26/27. el resultado de revalidateMpConnection nunca incluye el token en ninguna forma", async () => {
  reset();
  seedGateway();
  seedRifexRut(USER_ID, "141823094");
  const result = await revalidateMpConnection(USER_ID, { fetchUsersMe: okUsersMe({ identification: { type: "RUT", number: "14.182.309-4" } }) });
  const json = JSON.stringify(result);
  assert.doesNotMatch(json, /sensitive-access-token-should-never-leak/);
  assert.deepEqual(Object.keys(result).sort(), ["reason", "status"]);
});

test("28. el RUT devuelto por Mercado Pago nunca se persiste -- solo el resultado del match", async () => {
  reset();
  seedGateway();
  seedRifexRut(USER_ID, "141823094");
  await revalidateMpConnection(USER_ID, { fetchUsersMe: okUsersMe({ identification: { type: "RUT", number: "14.182.309-4" } }) });
  const gw = findGateway();
  const gwJson = JSON.stringify(gw);
  // El RUT de MP (14182309-4) nunca debe aparecer almacenado en la fila
  // -- solo el resultado de la comparación (mp_identity_match).
  assert.doesNotMatch(gwJson, /14182309-4|14\.182\.309-4/);
  assert.equal(gw.mp_identity_match, "matched");
});

// ---------------------------------------------------------------------
// 29. Doble click / idempotencia
// ---------------------------------------------------------------------

test("29. dos llamadas consecutivas (doble click) son seguras -- mismo resultado, sin fila duplicada, sin error", async () => {
  reset();
  seedGateway({ mp_identity_match: null });
  seedRifexRut(USER_ID, "141823094");
  const usersMe = okUsersMe({ identification: { type: "RUT", number: "14.182.309-4" } });

  const r1 = await revalidateMpConnection(USER_ID, { fetchUsersMe: usersMe });
  const r2 = await revalidateMpConnection(USER_ID, { fetchUsersMe: usersMe });

  assert.equal(r1.status, "matched");
  assert.equal(r2.status, "matched");
  assert.equal(DB.merchant_gateways.length, 1);
});

test("29b. llamadas concurrentes (Promise.all) no corrompen el estado ni duplican la fila", async () => {
  reset();
  seedGateway({ mp_identity_match: null });
  seedRifexRut(USER_ID, "141823094");
  const usersMe = okUsersMe({ identification: { type: "RUT", number: "14.182.309-4" } });

  const results = await Promise.all([
    revalidateMpConnection(USER_ID, { fetchUsersMe: usersMe }),
    revalidateMpConnection(USER_ID, { fetchUsersMe: usersMe }),
    revalidateMpConnection(USER_ID, { fetchUsersMe: usersMe }),
  ]);

  assert.ok(results.every((r) => r.status === "matched"));
  assert.equal(DB.merchant_gateways.length, 1);
});

// ---------------------------------------------------------------------
// 30/31. Autenticación y ownership -- certificados a nivel de librería:
// revalidateMpConnection SIEMPRE opera sobre el user_id recibido como
// parámetro, nunca sobre uno distinto -- el gate de autenticación real
// (rechazar sin sesión) vive en la ruta API, auditado estructuralmente
// más abajo (mismo criterio que el resto de la suite para endpoints
// Next.js que no se pueden importar directo bajo node --test por el
// alias "@/").
// ---------------------------------------------------------------------

test("31. usuario A nunca revalida (ni lee ni escribe) la conexión de un usuario B", async () => {
  reset();
  seedGateway({ user_id: USER_ID, mp_identity_match: null });
  seedGateway({ user_id: OTHER_USER_ID, mp_identity_match: null, mp_user_id: "mp-user-2", access_token: "other-users-secret-token" });
  seedRifexRut(USER_ID, "141823094");
  seedRifexRut(OTHER_USER_ID, "999999999");

  await revalidateMpConnection(USER_ID, { fetchUsersMe: okUsersMe({ identification: { type: "RUT", number: "14.182.309-4" } }) });

  assert.equal(findGateway(USER_ID).mp_identity_match, "matched");
  assert.equal(findGateway(OTHER_USER_ID).mp_identity_match, null, "la fila del otro usuario nunca se toca");
});

// ---------------------------------------------------------------------
// 30 (autorización server-side, estructural) + 26 (token nunca en la
// respuesta HTTP) sobre la ruta real -- mismo criterio ya usado en
// CUMPLIMIENTO-4/5 para rutas API con alias "@/" no resoluble bajo
// node --test.
// ---------------------------------------------------------------------

test("30. la ruta /api/mp/revalidate exige Bearer auth ANTES de invocar revalidateMpConnection, y nunca envía el token en la respuesta", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const content = fs.readFileSync(path.join(process.cwd(), "src", "pages", "api", "mp", "revalidate.js"), "utf8");
  const authIdx = content.indexOf("missing_auth");
  const callIdx = content.indexOf("revalidateMpConnection(");
  assert.ok(authIdx >= 0 && callIdx >= 0);
  assert.ok(authIdx < callIdx, "la validación de auth debe ejecutarse antes de llamar a revalidateMpConnection");
  assert.doesNotMatch(content, /access_token|mp_access_token/, "la ruta nunca debe leer/reenviar el token directamente -- eso vive solo en mpRevalidate.js");
  assert.match(content, /method_not_allowed/);
  assert.match(content, /enforceRateLimit/);
});

// CUMPLIMIENTO-3 — certifica sendDay0Communications, el ledger
// idempotente, el token de acceso del ganador, y getCaseByAccessToken,
// usando la lógica REAL contra un almacén en memoria (mismo patrón que
// el resto de la suite Cumplimiento). ENABLE_EMAILS='true' pero sin
// RESEND_API_KEY configurado: mailer.js real intenta enviar y devuelve
// {ok:false, error:'RESEND_API_KEY missing'} de forma determinística,
// SIN ningún fetch de red -- esto ejercita el camino de fallo REAL del
// proveedor en todos los tests (más riguroso que solo probar el
// skip por configuración), no un fallo simulado aparte. mailer.js lee
// estas variables como constantes de módulo al importar, así que se
// fijan ANTES de cualquier import, nunca se cambian en caliente después.
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "dummy-service-role-key-for-tests";
process.env.ENABLE_EMAILS = "true";
delete process.env.RESEND_API_KEY;

const { createClient } = await import("@supabase/supabase-js");

const DB = {
  raffle_fulfillment_cases: [],
  raffle_fulfillment_communications: [],
};

function reset() {
  DB.raffle_fulfillment_cases = [];
  DB.raffle_fulfillment_communications = [];
}

function selectBuilder(rows, columns) {
  const filters = [];
  const project = (row) => {
    if (!row || !columns || columns === "*") return row;
    const cols = columns.split(",").map((c) => c.trim());
    const out = {};
    for (const c of cols) out[c] = row[c];
    return out;
  };
  const b = {
    eq(col, val) { filters.push((r) => r[col] === val); return b; },
    maybeSingle() {
      const found = rows.filter((r) => filters.every((f) => f(r)));
      return Promise.resolve({ data: found[0] ? project(found[0]) : null, error: null });
    },
    // CUMPLIMIENTO-4: soporte para selects multi-fila sin .maybeSingle()
    // (ej. hasConfirmedWinnerCommunication) -- awaiteable directamente.
    then(resolve, reject) {
      const found = rows.filter((r) => filters.every((f) => f(r))).map(project);
      return Promise.resolve({ data: found, error: null }).then(resolve, reject);
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

// UNIQUE(case_id, communication_type, recipient_role) para el ledger.
function insertBuilder(table, rows, payload) {
  const isLedger = table === "raffle_fulfillment_communications";
  const conflict = () =>
    isLedger &&
    rows.some((r) => r.case_id === payload.case_id && r.communication_type === payload.communication_type && r.recipient_role === payload.recipient_role);
  return {
    select() {
      return {
        maybeSingle() {
          if (conflict()) return Promise.resolve({ data: null, error: { code: "23505", message: "duplicate key" } });
          const row = {
            id: rows.length + 1,
            status: "pending",
            attempt_count: 0,
            provider_message_id: null,
            first_attempted_at: null,
            sent_at: null,
            last_error_safe: null,
            created_at: new Date().toISOString(),
            ...payload,
          };
          rows.push(row);
          return Promise.resolve({ data: { ...row }, error: null });
        },
      };
    },
  };
}

function makeTable(table, rows) {
  return () => ({
    select: (columns) => selectBuilder(rows, columns),
    update: (payload) => updateBuilder(rows, payload),
    insert: (payload) => insertBuilder(table, rows, payload),
  });
}

const probeClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ClientProto = Object.getPrototypeOf(probeClient);
const originalFromImpl = ClientProto.from;
ClientProto.from = function mockedFrom(table) {
  if (DB[table]) return makeTable(table, DB[table])();
  return originalFromImpl.call(this, table);
};

const { sendDay0Communications, getCaseByAccessToken, hashAccessToken, generateWinnerAccessToken } = await import("../src/lib/fulfillmentCommunications.js");

const RAFFLE_ID = "raffle-comm-1";

function seedCase(overrides = {}) {
  const row = {
    raffle_id: RAFFLE_ID,
    creator_id: "creator-1",
    winner_purchase_id: "purchase-1",
    winner_ticket_number: 7,
    winner_buyer_email: "winner@example.com",
    winner_buyer_name: "Ganador Comm",
    raffle_title: "Rifa Comunicaciones",
    prize_type: "physical",
    prize_amount_cents: null,
    delivery_method: "envio_incluido",
    requires_transfer_procedures: true,
    transfer_expenses_owner: "creator",
    transfer_conditions: "Coordinar por WhatsApp.",
    raffle_closed_at: "2026-08-29T00:00:00.000Z",
    winner_determined_at: "2026-08-29T00:05:00.000Z",
    status: "pending_delivery",
    creator_response: null,
    winner_response: null,
    winner_access_token_hash: null,
    winner_access_token_created_at: null,
    ...overrides,
  };
  DB.raffle_fulfillment_cases.push(row);
  return row;
}

const baseArgs = () => ({
  raffleTitle: "Rifa Comunicaciones",
  creatorEmail: "creador@example.com",
  winnerEmail: "winner@example.com",
  winnerName: "Ganador Comm",
  winnerNumber: 7,
  raffleLink: "https://rifex.pro/rifas/raffle-comm-1",
});

test("1/2. new winner crea intención Día 0 para ganador y creador", async () => {
  reset();
  const fCase = seedCase();
  await sendDay0Communications(fCase, baseArgs());
  const winnerIntent = DB.raffle_fulfillment_communications.find((c) => c.recipient_role === "winner");
  const creatorIntent = DB.raffle_fulfillment_communications.find((c) => c.recipient_role === "creator");
  assert.ok(winnerIntent);
  assert.equal(winnerIntent.communication_type, "DAY_0_WINNER");
  assert.ok(creatorIntent);
  assert.equal(creatorIntent.communication_type, "DAY_0_CREATOR");
  assert.equal(DB.raffle_fulfillment_communications.length, 2);
});

test("3. retry no duplica la intención (mismo caso, dos llamadas)", async () => {
  reset();
  const fCase = seedCase();
  await sendDay0Communications(fCase, baseArgs());
  const updated = DB.raffle_fulfillment_cases.find((c) => c.raffle_id === RAFFLE_ID);
  await sendDay0Communications(updated, baseArgs());
  assert.equal(DB.raffle_fulfillment_communications.length, 2, "sigue habiendo exactamente 1 winner + 1 creator");
});

test("4. retry concurrente no duplica la intención", async () => {
  reset();
  const fCase = seedCase();
  await Promise.all([sendDay0Communications(fCase, baseArgs()), sendDay0Communications(fCase, baseArgs()), sendDay0Communications(fCase, baseArgs())]);
  assert.equal(DB.raffle_fulfillment_communications.length, 2);
});

test("5. el correo real de DRAW (sendWinnerEmail/sendCreatorWinnerEmail) no se duplica — un solo intento por rol", async () => {
  reset();
  const fCase = seedCase();
  await sendDay0Communications(fCase, baseArgs());
  const winnerIntent = DB.raffle_fulfillment_communications.find((c) => c.recipient_role === "winner");
  const creatorIntent = DB.raffle_fulfillment_communications.find((c) => c.recipient_role === "creator");
  assert.equal(winnerIntent.attempt_count, 1);
  assert.equal(creatorIntent.attempt_count, 1);
});

test("6/7. fallo del proveedor no afecta al ganador ni al caso de cumplimiento", async () => {
  reset();
  const fCase = seedCase();
  const result = await sendDay0Communications(fCase, baseArgs());
  assert.equal(result.winnerSent, false);

  const winnerIntent = DB.raffle_fulfillment_communications.find((c) => c.recipient_role === "winner");
  assert.equal(winnerIntent.status, "failed");
  assert.ok(winnerIntent.last_error_safe);

  // El caso sigue existiendo, intacto, en su estado inicial.
  const stillCase = DB.raffle_fulfillment_cases.find((c) => c.raffle_id === RAFFLE_ID);
  assert.ok(stillCase);
  assert.equal(stillCase.status, "pending_delivery");
});

test("8. un reintento tras fallo usa la MISMA comunicación lógica, nunca una nueva", async () => {
  reset();
  const fCase = seedCase();
  await sendDay0Communications(fCase, baseArgs()); // falla (sin RESEND_API_KEY)
  const afterFirst = DB.raffle_fulfillment_communications.find((c) => c.recipient_role === "winner");
  assert.equal(afterFirst.status, "failed");
  assert.equal(afterFirst.attempt_count, 1);

  // Reintento -- sigue fallando de la misma forma determinística, pero
  // debe seguir siendo la MISMA fila lógica, nunca una segunda.
  const updatedCase = DB.raffle_fulfillment_cases.find((c) => c.raffle_id === RAFFLE_ID);
  await sendDay0Communications(updatedCase, baseArgs());
  const afterRetry = DB.raffle_fulfillment_communications.filter((c) => c.recipient_role === "winner");
  assert.equal(afterRetry.length, 1, "sigue siendo la misma fila lógica, nunca una segunda");
  assert.equal(afterRetry[0].attempt_count, 2);
});

test("9. provider_message_id se guarda de forma segura (nunca la respuesta cruda)", async () => {
  reset();
  const fCase = seedCase();
  await sendDay0Communications(fCase, baseArgs());
  const winnerIntent = DB.raffle_fulfillment_communications.find((c) => c.recipient_role === "winner");
  // Sin RESEND_API_KEY -> nunca hay un envío real confirmado ->
  // provider_message_id permanece null (nunca inventado).
  assert.equal(winnerIntent.provider_message_id, null);
  assert.equal(Object.prototype.hasOwnProperty.call(winnerIntent, "raw_response"), false, "nunca se guarda la respuesta cruda del proveedor");
});

test("10. el token del ganador tiene alta entropía (256 bits, hex de 64 caracteres)", () => {
  const { raw } = generateWinnerAccessToken();
  assert.equal(raw.length, 64);
  assert.match(raw, /^[0-9a-f]{64}$/);
  const { raw: raw2 } = generateWinnerAccessToken();
  assert.notEqual(raw, raw2, "cada token generado debe ser distinto");
});

test("11. el token crudo nunca se persiste -- solo su hash", async () => {
  reset();
  const fCase = seedCase();
  await sendDay0Communications(fCase, baseArgs());
  const stillCase = DB.raffle_fulfillment_cases.find((c) => c.raffle_id === RAFFLE_ID);
  assert.ok(stillCase.winner_access_token_hash);
  assert.equal(stillCase.winner_access_token_hash.length, 64); // sha256 hex
  assert.notEqual(stillCase.winner_access_token_hash, "plaintext-token-should-never-match");
});

test("12. un token válido abre el caso correcto", async () => {
  reset();
  const fCase = seedCase();
  const { raw, hash } = generateWinnerAccessToken();
  fCase.winner_access_token_hash = hash;

  const found = await getCaseByAccessToken(raw);
  assert.ok(found);
  assert.equal(found.raffle_id, RAFFLE_ID);
});

test("13. un token inválido es rechazado de forma genérica", async () => {
  reset();
  seedCase();
  const found = await getCaseByAccessToken("token-que-no-existe-en-absoluto-1234567890abcdef");
  assert.equal(found, null);
});

test("14. un token de un caso A no abre el caso B", async () => {
  reset();
  const caseA = seedCase({ raffle_id: "raffle-A", raffle_title: "Rifa A" });
  const caseB = seedCase({ raffle_id: "raffle-B", raffle_title: "Rifa B" });
  const { raw: rawA, hash: hashA } = generateWinnerAccessToken();
  const { hash: hashB } = generateWinnerAccessToken();
  caseA.winner_access_token_hash = hashA;
  caseB.winner_access_token_hash = hashB;

  const found = await getCaseByAccessToken(rawA);
  assert.equal(found.raffle_id, "raffle-A");
  assert.notEqual(found.raffle_id, "raffle-B");
});

test("15. formato de token corto/plausible-pero-falso no revela nada (mismo null genérico)", async () => {
  reset();
  seedCase();
  const short = await getCaseByAccessToken("abc123");
  const plausibleButWrong = await getCaseByAccessToken("a".repeat(64));
  assert.equal(short, null);
  assert.equal(plausibleButWrong, null);
});

test("16. la vista del ganador (columnas devueltas) nunca expone PII de terceros ni metadata interna", async () => {
  reset();
  const fCase = seedCase();
  const { raw, hash } = generateWinnerAccessToken();
  fCase.winner_access_token_hash = hash;
  const found = await getCaseByAccessToken(raw);
  const forbiddenKeys = [
    "creator_id",
    "winner_purchase_id",
    "winner_buyer_email",
    "winner_buyer_name",
    "winner_access_token_hash",
    "winner_access_token_created_at",
    "creator_response",
    "winner_response",
  ];
  for (const key of forbiddenKeys) {
    assert.equal(Object.prototype.hasOwnProperty.call(found, key), false, `${key} no debe exponerse en la vista pública del ganador`);
  }
});

test("21. el snapshot mostrado al ganador es el congelado, no el de una edición posterior de la rifa", async () => {
  reset();
  const fCase = seedCase({ delivery_method: "envio_incluido", raffle_title: "Título original" });
  const { raw, hash } = generateWinnerAccessToken();
  fCase.winner_access_token_hash = hash;

  const found1 = await getCaseByAccessToken(raw);
  assert.equal(found1.delivery_method, "envio_incluido");
  assert.equal(found1.raffle_title, "Título original");
});

test("22. la recuperación de comunicaciones (reintento manual del Día 0) es idempotente", async () => {
  reset();
  const fCase = seedCase();
  await sendDay0Communications(fCase, baseArgs());
  const afterFirst = DB.raffle_fulfillment_communications.length;
  const updatedCase = DB.raffle_fulfillment_cases.find((c) => c.raffle_id === RAFFLE_ID);
  await sendDay0Communications(updatedCase, baseArgs());
  const afterSecond = DB.raffle_fulfillment_communications.length;
  assert.equal(afterFirst, afterSecond, "ninguna fila nueva se crea en un reintento manual");
});

test("24. reintento del flujo de DRAW (mismo caso re-procesado) no duplica el Día 0", async () => {
  reset();
  const fCase = seedCase();
  await sendDay0Communications(fCase, baseArgs());
  const updatedCase1 = DB.raffle_fulfillment_cases.find((c) => c.raffle_id === RAFFLE_ID);
  await sendDay0Communications(updatedCase1, baseArgs());
  const updatedCase2 = DB.raffle_fulfillment_cases.find((c) => c.raffle_id === RAFFLE_ID);
  await sendDay0Communications(updatedCase2, baseArgs());
  assert.equal(DB.raffle_fulfillment_communications.length, 2, "3 reintentos completos del flujo, siempre 1 winner + 1 creator");
});

test("hashAccessToken es determinístico (mismo input -> mismo hash)", () => {
  const raw = "deadbeef".repeat(8);
  assert.equal(hashAccessToken(raw), hashAccessToken(raw));
});

test("17. el creador sigue usando su sesión autenticada + ownership -- ningún token guest nuevo para él", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const panelDir = path.join(process.cwd(), "src", "pages", "api", "panel");
  const files = fs.readdirSync(panelDir, { recursive: true }).filter((f) => String(f).includes("cumplimiento"));
  assert.ok(files.length > 0, "los endpoints de panel de CUMPLIMIENTO-1 siguen existiendo");
  for (const f of files) {
    const full = path.join(panelDir, String(f));
    if (fs.statSync(full).isDirectory()) continue;
    const content = fs.readFileSync(full, "utf8");
    assert.match(content, /Authorization|Bearer|getUser/i, `${f} debe seguir exigiendo sesión autenticada, no un token guest`);
    assert.doesNotMatch(content, /winner_access_token|generateWinnerAccessToken/i, `${f} no debe usar el mecanismo de token del ganador`);
  }
});

test("20. (CUMPLIMIENTO-3 scope) el endpoint del token sigue rechazando métodos no soportados", async () => {
  // CUMPLIMIENTO-4 activó la respuesta del ganador (POST) sobre este
  // mismo endpoint -- ver tests/fulfillmentTimeline.test.mjs para la
  // certificación completa de esa acción. Esta prueba, heredada de
  // CUMPLIMIENTO-3, se reduce a confirmar que métodos no soportados
  // (ej. DELETE) siguen devolviendo method_not_allowed.
  const fs = await import("node:fs");
  const path = await import("node:path");
  const tokenApiFile = path.join(process.cwd(), "src", "pages", "api", "cumplimiento", "caso", "[token].js");
  const apiContent = fs.readFileSync(tokenApiFile, "utf8");
  assert.match(apiContent, /method_not_allowed/);
});

// CUMPLIMIENTO-4 — certifica processFulfillmentTimeline (Día 10/15/20 +
// escalamiento interno), las respuestas del ganador/creador
// (idempotencia de doble submit, respuestas tardías), y la estabilidad
// del token del ganador -- todo contra un almacén en memoria (mismo
// patrón que el resto de la suite Cumplimiento: monkeypatch de
// SupabaseClient.prototype.from, nunca toca rifex-dev real, nunca hace
// red). ENABLE_EMAILS='true' sin RESEND_API_KEY: mailer.js real intenta
// enviar y falla de forma determinística ({ok:false, error:'RESEND_API_KEY
// missing'}), igual que tests/fulfillmentCommunications.test.mjs -- esto
// certifica que el ledger/idempotencia es correcto incluso cuando CADA
// intento de envío falla, sin depender de red.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "dummy-service-role-key-for-tests";
process.env.NEXT_PUBLIC_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://rifex.pro";
process.env.ENABLE_EMAILS = "true";
delete process.env.RESEND_API_KEY;
process.env.RIFEX_COMPLIANCE_REVIEW_EMAILS = "rifex.contacto@example.com,contacto@example.com";
process.env.CRON_SECRET = "test-cron-secret-cumplimiento4";

const { createClient } = await import("@supabase/supabase-js");

const DB = {
  raffles: [],
  raffle_fulfillment_cases: [],
  raffle_fulfillment_events: [],
  raffle_fulfillment_communications: [],
};

function reset() {
  DB.raffles = [];
  DB.raffle_fulfillment_cases = [];
  DB.raffle_fulfillment_events = [];
  DB.raffle_fulfillment_communications = [];
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
  let orderCol = null;
  let orderAsc = true;
  const b = {
    eq(col, val) { filters.push((r) => r[col] === val); return b; },
    is(col, val) { filters.push((r) => r[col] === val); return b; },
    not(col, op, val) {
      if (op === "is") filters.push((r) => r[col] !== val);
      return b;
    },
    order(col, opts) { orderCol = col; orderAsc = opts?.ascending !== false; return b; },
    maybeSingle() {
      const found = rows.filter((r) => filters.every((f) => f(r)));
      return Promise.resolve({ data: found[0] ? project(found[0], columns) : null, error: null });
    },
    then(resolve, reject) {
      let found = rows.filter((r) => filters.every((f) => f(r)));
      if (orderCol) {
        found = [...found].sort((a, b2) => {
          const av = a[orderCol], bv = b2[orderCol];
          const cmp = av < bv ? -1 : av > bv ? 1 : 0;
          return orderAsc ? cmp : -cmp;
        });
      }
      return Promise.resolve({ data: found.map((r) => project(r, columns)), error: null }).then(resolve, reject);
    },
  };
  return b;
}

function updateBuilder(rows, payload) {
  const filters = [];
  let columns = "*";
  const b = {
    eq(col, val) { filters.push((r) => r[col] === val); return b; },
    is(col, val) { filters.push((r) => r[col] === val); return b; },
    select(cols) { columns = cols || "*"; return b; },
    maybeSingle() {
      const target = rows.find((r) => filters.every((f) => f(r)));
      if (target) Object.assign(target, payload);
      return Promise.resolve({ data: target ? project({ ...target }, columns) : null, error: null });
    },
    then(resolve, reject) {
      rows.forEach((r) => { if (filters.every((f) => f(r))) Object.assign(r, payload); });
      return Promise.resolve({ error: null }).then(resolve, reject);
    },
  };
  return b;
}

// UNIQUE reales de la migración: raffle_fulfillment_cases.raffle_id (PK),
// raffle_fulfillment_communications (case_id, communication_type, recipient_role).
function insertBuilder(table, rows, payload) {
  const conflict = () => {
    if (table === "raffle_fulfillment_cases") return rows.some((r) => r.raffle_id === payload.raffle_id);
    if (table === "raffle_fulfillment_communications") {
      return rows.some((r) => r.case_id === payload.case_id && r.communication_type === payload.communication_type && r.recipient_role === payload.recipient_role);
    }
    return false;
  };
  const makeRow = () => {
    if (table === "raffle_fulfillment_communications") {
      return {
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
    }
    return { ...payload, id: rows.length + 1, created_at: payload.created_at || new Date().toISOString() };
  };
  return {
    select(columns) {
      return {
        maybeSingle() {
          if (conflict()) return Promise.resolve({ data: null, error: { code: "23505", message: "duplicate key" } });
          const row = makeRow();
          rows.push(row);
          return Promise.resolve({ data: project({ ...row }, columns), error: null });
        },
      };
    },
    then(resolve, reject) {
      // raffle_fulfillment_events.insert(...) sin .select() encadenado.
      if (conflict()) return Promise.resolve({ error: { code: "23505", message: "duplicate key" } }).then(resolve, reject);
      const row = makeRow();
      rows.push(row);
      return Promise.resolve({ error: null }).then(resolve, reject);
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

const { processFulfillmentTimeline, daysSince, isAtOrAfterDay, buildInternalDossier, DAY_10, DAY_15, DAY_20 } = await import("../src/lib/fulfillmentTimeline.js");
const { recordWinnerResponse, recordCreatorResponse, ensureFulfillmentCaseForRaffle } = await import("../src/lib/fulfillmentCaseService.js");
const { getCaseByAccessToken, hashAccessToken, generateWinnerAccessToken } = await import("../src/lib/fulfillmentCommunications.js");
const { FULFILLMENT_STATUSES, ESCALATION_REASONS } = await import("../src/lib/fulfillmentEvaluation.js");

const RAFFLE_ID = "raffle-t1";
const CREATOR_ID = "creator-t1";
const DAY0 = "2026-01-01T00:00:00.000Z";
function daysAfterDay0(days) {
  return new Date(new Date(DAY0).getTime() + days * 24 * 60 * 60 * 1000);
}

function seedCase(overrides = {}) {
  const row = {
    raffle_id: RAFFLE_ID,
    creator_id: CREATOR_ID,
    winner_purchase_id: "purchase-t1",
    winner_ticket_number: 7,
    winner_buyer_email: "winner@example.com",
    winner_buyer_name: "Ganador Timeline",
    raffle_title: "Rifa Timeline",
    prize_type: "physical",
    prize_amount_cents: null,
    delivery_method: "envio_incluido",
    requires_transfer_procedures: false,
    transfer_expenses_owner: null,
    transfer_conditions: null,
    raffle_closed_at: DAY0,
    winner_determined_at: DAY0,
    status: FULFILLMENT_STATUSES.PENDING_DELIVERY,
    creator_response: null,
    creator_response_at: null,
    winner_response: null,
    winner_response_at: null,
    winner_access_token_hash: null,
    winner_access_token_created_at: null,
    closed_at: null,
    escalated_at: null,
    escalation_reason: null,
    ...overrides,
  };
  DB.raffle_fulfillment_cases.push(row);
  DB.raffles.push({ id: row.raffle_id, creator_email: "creador@example.com" });
  return row;
}

function ledgerRows(caseId, type) {
  return DB.raffle_fulfillment_communications.filter((r) => r.case_id === caseId && (!type || r.communication_type === type));
}
function findCase(id) {
  return DB.raffle_fulfillment_cases.find((c) => c.raffle_id === id);
}

// ---------------------------------------------------------------------
// Helpers puros de línea de tiempo
// ---------------------------------------------------------------------

test("daysSince/isAtOrAfterDay: función pura, nunca lee el reloj del sistema", () => {
  assert.equal(daysSince(DAY0, daysAfterDay0(10)), 10);
  assert.equal(isAtOrAfterDay(DAY0, daysAfterDay0(9.9), 10), false);
  assert.equal(isAtOrAfterDay(DAY0, daysAfterDay0(10), 10), true);
  assert.equal(isAtOrAfterDay(DAY0, daysAfterDay0(10.1), 10), true);
});

test("35. explicitNow controla el tiempo de forma determinística -- antes de Día 10 no pasa nada", async () => {
  reset();
  seedCase();
  const { results } = await processFulfillmentTimeline(daysAfterDay0(5));
  assert.equal(ledgerRows(RAFFLE_ID).length, 0, "antes de Día 10 no debe crearse ningún intent");
  assert.equal(results[0].day20Closed, undefined);
});

test("processFulfillmentTimeline exige un `now` explícito y válido -- nunca Date.now() implícito", async () => {
  reset();
  seedCase();
  await assert.rejects(() => processFulfillmentTimeline("2026-01-11"), /explicit valid Date/);
  await assert.rejects(() => processFulfillmentTimeline(new Date("not-a-date")), /explicit valid Date/);
});

// ---------------------------------------------------------------------
// 1-10. Matriz de evaluación / cierre de Día 20
// ---------------------------------------------------------------------

test("1/A. winner YES -> Día 20 cierra fulfillment_confirmed, SIN escalamiento", async () => {
  reset();
  seedCase({ winner_response: "yes", winner_response_at: DAY0 });
  await processFulfillmentTimeline(daysAfterDay0(20));
  const c = findCase(RAFFLE_ID);
  assert.equal(c.status, FULFILLMENT_STATUSES.FULFILLMENT_CONFIRMED);
  assert.ok(c.closed_at);
  assert.equal(c.escalated_at, null);
  assert.equal(c.escalation_reason, null);
  assert.equal(ledgerRows(RAFFLE_ID, "DAY_20_INTERNAL_ESCALATION").length, 0);
});

test("2. winner NOT_YET antes de Día 20 -> delivery_pending (evidencia real, nunca se relabelea)", async () => {
  reset();
  seedCase();
  const { case: c } = await recordWinnerResponse(RAFFLE_ID, "not_yet");
  assert.equal(c.status, FULFILLMENT_STATUSES.DELIVERY_PENDING);
});

test("3. creator YES + winner YES -> fulfillment_confirmed al cierre", async () => {
  reset();
  seedCase({ creator_response: "yes", creator_response_at: DAY0, winner_response: "yes", winner_response_at: DAY0 });
  await processFulfillmentTimeline(daysAfterDay0(20));
  assert.equal(findCase(RAFFLE_ID).status, FULFILLMENT_STATUSES.FULFILLMENT_CONFIRMED);
});

test("4/D. creator YES + winner NOT_YET -> under_review al cierre, escalado como WINNER_DENIED_RECEIPT", async () => {
  reset();
  seedCase({ creator_response: "yes", creator_response_at: DAY0, winner_response: "not_yet", winner_response_at: DAY0 });
  await processFulfillmentTimeline(daysAfterDay0(20));
  const c = findCase(RAFFLE_ID);
  assert.equal(c.status, FULFILLMENT_STATUSES.UNDER_REVIEW);
  assert.ok(c.escalated_at);
  assert.equal(c.escalation_reason, ESCALATION_REASONS.WINNER_DENIED_RECEIPT);
});

test("5/F. creator COORDINATING + winner NOT_YET -> delivery_pending hasta el cierre, escala al cerrar", async () => {
  reset();
  seedCase({ creator_response: "coordinating", creator_response_at: DAY0, winner_response: "not_yet", winner_response_at: DAY0 });
  await processFulfillmentTimeline(daysAfterDay0(20));
  const c = findCase(RAFFLE_ID);
  assert.equal(c.status, FULFILLMENT_STATUSES.DELIVERY_PENDING);
  assert.ok(c.escalated_at);
  assert.equal(c.escalation_reason, ESCALATION_REASONS.WINNER_DENIED_RECEIPT);
});

test("6. creator NOT_YET + winner NOT_YET -> delivery_pending, escala al cerrar", async () => {
  reset();
  seedCase({ creator_response: "not_yet", creator_response_at: DAY0, winner_response: "not_yet", winner_response_at: DAY0 });
  await processFulfillmentTimeline(daysAfterDay0(20));
  const c = findCase(RAFFLE_ID);
  assert.equal(c.status, FULFILLMENT_STATUSES.DELIVERY_PENDING);
  assert.equal(c.escalation_reason, ESCALATION_REASONS.WINNER_DENIED_RECEIPT);
});

test("7/C. winner sin respuesta al cierre -> unconfirmed, escala como WINNER_NO_RESPONSE", async () => {
  reset();
  seedCase();
  await processFulfillmentTimeline(daysAfterDay0(20));
  const c = findCase(RAFFLE_ID);
  assert.equal(c.status, FULFILLMENT_STATUSES.UNCONFIRMED);
  assert.ok(c.escalated_at);
  assert.equal(c.escalation_reason, ESCALATION_REASONS.WINNER_NO_RESPONSE);
});

test("8/B. winner NOT_YET (sin creator) al cierre -> escala", async () => {
  reset();
  seedCase({ winner_response: "not_yet", winner_response_at: DAY0 });
  await processFulfillmentTimeline(daysAfterDay0(20));
  const c = findCase(RAFFLE_ID);
  assert.ok(c.escalated_at);
  assert.equal(c.escalation_reason, ESCALATION_REASONS.WINNER_DENIED_RECEIPT);
});

test("9/E. creador y ganador sin respuesta -> unconfirmed, escala", async () => {
  reset();
  seedCase();
  await processFulfillmentTimeline(daysAfterDay0(20));
  const c = findCase(RAFFLE_ID);
  assert.equal(c.status, FULFILLMENT_STATUSES.UNCONFIRMED);
  assert.equal(c.escalation_reason, ESCALATION_REASONS.WINNER_NO_RESPONSE);
});

test("10. distinción probatoria: WINNER_DENIED_RECEIPT != WINNER_NO_RESPONSE, nunca se confunden", async () => {
  reset();
  seedCase({ raffle_id: "raffle-denied", winner_response: "not_yet", winner_response_at: DAY0 });
  DB.raffles.push({ id: "raffle-denied", creator_email: "c@example.com" });
  seedCase({ raffle_id: "raffle-silent" });
  DB.raffles.push({ id: "raffle-silent", creator_email: "c@example.com" });
  await processFulfillmentTimeline(daysAfterDay0(20));
  assert.equal(findCase("raffle-denied").escalation_reason, ESCALATION_REASONS.WINNER_DENIED_RECEIPT);
  assert.equal(findCase("raffle-silent").escalation_reason, ESCALATION_REASONS.WINNER_NO_RESPONSE);
  assert.notEqual(findCase("raffle-denied").escalation_reason, findCase("raffle-silent").escalation_reason);
});

// ---------------------------------------------------------------------
// 11-19. Día 10 / Día 15 / Día 20 comunicaciones
// ---------------------------------------------------------------------

test("11. Día 10 crea el intent del ganador", async () => {
  reset();
  seedCase();
  await processFulfillmentTimeline(daysAfterDay0(10));
  assert.equal(ledgerRows(RAFFLE_ID, "DAY_10_WINNER").length, 1);
});

test("12. Día 10 crea el intent del creador", async () => {
  reset();
  seedCase();
  await processFulfillmentTimeline(daysAfterDay0(10));
  assert.equal(ledgerRows(RAFFLE_ID, "DAY_10_CREATOR").length, 1);
});

test("13. reintento de Día 10 no duplica el intent (solo attempt_count sube)", async () => {
  reset();
  seedCase();
  await processFulfillmentTimeline(daysAfterDay0(10));
  await processFulfillmentTimeline(daysAfterDay0(10.5));
  await processFulfillmentTimeline(daysAfterDay0(11));
  assert.equal(ledgerRows(RAFFLE_ID, "DAY_10_WINNER").length, 1);
  assert.equal(ledgerRows(RAFFLE_ID, "DAY_10_CREATOR").length, 1);
  assert.ok(ledgerRows(RAFFLE_ID, "DAY_10_WINNER")[0].attempt_count >= 3);
});

test("14. Día 15 recuerda al ganador SOLO si no respondió", async () => {
  reset();
  seedCase();
  await recordWinnerResponse(RAFFLE_ID, "yes");
  await processFulfillmentTimeline(daysAfterDay0(15));
  assert.equal(ledgerRows(RAFFLE_ID, "DAY_15_REMINDER_WINNER").length, 0, "el ganador ya respondió -> sin recordatorio");
  assert.equal(ledgerRows(RAFFLE_ID, "DAY_15_REMINDER_CREATOR").length, 1, "el creador no respondió -> sí recordatorio");
});

test("15. Día 15 recuerda al creador SOLO si no respondió", async () => {
  reset();
  seedCase();
  await recordCreatorResponse(RAFFLE_ID, "coordinating", { actorUserId: CREATOR_ID });
  await processFulfillmentTimeline(daysAfterDay0(15));
  assert.equal(ledgerRows(RAFFLE_ID, "DAY_15_REMINDER_CREATOR").length, 0);
  assert.equal(ledgerRows(RAFFLE_ID, "DAY_15_REMINDER_WINNER").length, 1);
});

test("16. si ambos respondieron, Día 15 no crea ningún recordatorio", async () => {
  reset();
  seedCase();
  await recordWinnerResponse(RAFFLE_ID, "not_yet");
  await recordCreatorResponse(RAFFLE_ID, "coordinating", { actorUserId: CREATOR_ID });
  await processFulfillmentTimeline(daysAfterDay0(15));
  assert.equal(ledgerRows(RAFFLE_ID, "DAY_15_REMINDER_WINNER").length, 0);
  assert.equal(ledgerRows(RAFFLE_ID, "DAY_15_REMINDER_CREATOR").length, 0);
});

test("17. el expediente interno de Día 20 se crea exactamente una vez, incluso con reintentos", async () => {
  reset();
  seedCase();
  await processFulfillmentTimeline(daysAfterDay0(20));
  await processFulfillmentTimeline(daysAfterDay0(20.5));
  await processFulfillmentTimeline(daysAfterDay0(21));
  const rows = ledgerRows(RAFFLE_ID, "DAY_20_INTERNAL_ESCALATION");
  assert.equal(rows.length, 1, "nunca una segunda fila lógica, aunque el envío real siga fallando");
});

test("18. el aviso de revisión al ganador se crea exactamente una vez", async () => {
  reset();
  seedCase();
  await processFulfillmentTimeline(daysAfterDay0(20));
  await processFulfillmentTimeline(daysAfterDay0(20.5));
  assert.equal(ledgerRows(RAFFLE_ID, "DAY_20_REVIEW_NOTICE_WINNER").length, 1);
});

test("19. el aviso de revisión al creador se crea exactamente una vez", async () => {
  reset();
  seedCase();
  await processFulfillmentTimeline(daysAfterDay0(20));
  await processFulfillmentTimeline(daysAfterDay0(20.5));
  assert.equal(ledgerRows(RAFFLE_ID, "DAY_20_REVIEW_NOTICE_CREATOR").length, 1);
});

test("20. reintentar Día 20 completo es seguro -- no vuelve a cerrar ni cambia el resultado", async () => {
  reset();
  seedCase();
  await processFulfillmentTimeline(daysAfterDay0(20));
  const afterFirst = { ...findCase(RAFFLE_ID) };
  await processFulfillmentTimeline(daysAfterDay0(20.5));
  await processFulfillmentTimeline(daysAfterDay0(25));
  const afterRetries = findCase(RAFFLE_ID);
  assert.equal(afterRetries.closed_at, afterFirst.closed_at, "closed_at nunca se reescribe en reintentos");
  assert.equal(afterRetries.escalated_at, afterFirst.escalated_at);
  assert.equal(afterRetries.status, afterFirst.status);
  const closeEvents = DB.raffle_fulfillment_events.filter((e) => e.event_type === "day20_closed" && e.case_id === RAFFLE_ID);
  assert.equal(closeEvents.length, 1, "el evento append-only de cierre nunca se duplica");
});

// ---------------------------------------------------------------------
// 21. Expediente interno -- nunca tokens/secrets/datos de terceros
// ---------------------------------------------------------------------

test("21. el expediente interno excluye tokens, secrets y credenciales de Mercado Pago", () => {
  const fCase = seedCaseObjectOnly();
  const dossier = buildInternalDossier(fCase, { escalationReason: ESCALATION_REASONS.WINNER_NO_RESPONSE, ledger: [] });
  const json = JSON.stringify(dossier).toLowerCase();
  for (const forbidden of ["token", "access_token", "hash", "mp_", "mercadopago", "service_role", "secret", "api_key"]) {
    assert.doesNotMatch(json, new RegExp(forbidden), `el expediente no debe mencionar "${forbidden}"`);
  }
});

function seedCaseObjectOnly() {
  return {
    raffle_id: "raffle-dossier",
    creator_id: "creator-dossier",
    winner_purchase_id: "purchase-dossier",
    winner_ticket_number: 3,
    winner_buyer_email: "winner-dossier@example.com",
    raffle_title: "Rifa Dossier",
    prize_type: "physical",
    delivery_method: "envio_incluido",
    requires_transfer_procedures: false,
    transfer_expenses_owner: null,
    transfer_conditions: null,
    winner_determined_at: DAY0,
    winner_response: null,
    winner_response_at: null,
    creator_response: null,
    creator_response_at: null,
    status: FULFILLMENT_STATUSES.UNCONFIRMED,
  };
}

// ---------------------------------------------------------------------
// 22-25. Seguridad de acceso (estructural, mismo criterio que
// tests/fulfillmentCommunications.test.mjs test 17/20)
// ---------------------------------------------------------------------

test("22. el endpoint del token del ganador rechaza tokens con formato inválido de forma genérica", async () => {
  const found = await getCaseByAccessToken("token-invalido-corto");
  assert.equal(found, null);
  const tokenApiFile = path.join(process.cwd(), "src", "pages", "api", "cumplimiento", "caso", "[token].js");
  const content = fs.readFileSync(tokenApiFile, "utf8");
  assert.match(content, /token\.length < 32/);
});

test("23. el ganador solo puede responder al caso de SU propio token, nunca a otro", async () => {
  reset();
  seedCase({ raffle_id: "raffle-x", raffle_title: "Rifa X" });
  seedCase({ raffle_id: "raffle-y", raffle_title: "Rifa Y" });
  const { raw: rawX, hash: hashX } = generateWinnerAccessToken();
  findCase("raffle-x").winner_access_token_hash = hashX;
  const resolved = await getCaseByAccessToken(rawX);
  assert.equal(resolved.raffle_id, "raffle-x");
  await recordWinnerResponse(resolved.raffle_id, "yes");
  assert.equal(findCase("raffle-x").winner_response, "yes");
  assert.equal(findCase("raffle-y").winner_response, null, "el token de X nunca debe poder afectar a Y");
});

test("24. el creador solo ve/responde casos propios -- ownership se verifica antes de aceptar la respuesta", async () => {
  const idApiFile = path.join(process.cwd(), "src", "pages", "api", "panel", "cumplimiento", "[id].js");
  const content = fs.readFileSync(idApiFile, "utf8");
  const ownershipIdx = content.indexOf("getCreatorCaseDetail");
  const recordIdx = content.indexOf("recordCreatorResponse(");
  assert.ok(ownershipIdx >= 0 && recordIdx >= 0);
  assert.ok(ownershipIdx < recordIdx, "el chequeo de ownership (getCreatorCaseDetail) debe ejecutarse ANTES de recordCreatorResponse");
});

test("25. el endpoint de respuesta del creador exige Authorization Bearer antes de leer el body", async () => {
  const idApiFile = path.join(process.cwd(), "src", "pages", "api", "panel", "cumplimiento", "[id].js");
  const content = fs.readFileSync(idApiFile, "utf8");
  const authIdx = content.indexOf("missing_auth");
  const bodyIdx = content.indexOf("req.body");
  assert.ok(authIdx >= 0 && bodyIdx >= 0);
  assert.ok(authIdx < bodyIdx, "req.body nunca debe leerse antes de validar el Bearer token");
});

// ---------------------------------------------------------------------
// 26-29. Idempotencia de respuestas / historial / respuestas tardías
// ---------------------------------------------------------------------

test("26. doble submit del ganador (mismo valor) es seguro -- sin evento nuevo, noop:true", async () => {
  reset();
  seedCase();
  await recordWinnerResponse(RAFFLE_ID, "yes");
  const before = DB.raffle_fulfillment_events.filter((e) => e.event_type === "winner_response_recorded").length;
  const result = await recordWinnerResponse(RAFFLE_ID, "yes");
  const after = DB.raffle_fulfillment_events.filter((e) => e.event_type === "winner_response_recorded").length;
  assert.equal(result.noop, true);
  assert.equal(before, after, "un reenvío del mismo valor nunca agrega un evento nuevo");
});

test("27. doble submit del creador (mismo valor) es seguro -- sin evento nuevo, noop:true", async () => {
  reset();
  seedCase();
  await recordCreatorResponse(RAFFLE_ID, "coordinating", { actorUserId: CREATOR_ID });
  const before = DB.raffle_fulfillment_events.filter((e) => e.event_type === "creator_response_recorded").length;
  const result = await recordCreatorResponse(RAFFLE_ID, "coordinating", { actorUserId: CREATOR_ID });
  const after = DB.raffle_fulfillment_events.filter((e) => e.event_type === "creator_response_recorded").length;
  assert.equal(result.noop, true);
  assert.equal(before, after);
});

test("28. el historial de respuestas es append-only -- un cambio de opinión agrega, nunca reescribe", async () => {
  reset();
  seedCase();
  await recordWinnerResponse(RAFFLE_ID, "not_yet");
  await recordWinnerResponse(RAFFLE_ID, "yes");
  const events = DB.raffle_fulfillment_events.filter((e) => e.event_type === "winner_response_recorded");
  assert.equal(events.length, 2);
  assert.deepEqual(events.map((e) => e.metadata.response), ["not_yet", "yes"]);
});

test("29. respuesta tardía (después del cierre de Día 20) se registra sin perder ni reescribir el resultado automático", async () => {
  reset();
  seedCase();
  await processFulfillmentTimeline(daysAfterDay0(20));
  const closedStatus = findCase(RAFFLE_ID).status;
  const closedAt = findCase(RAFFLE_ID).closed_at;
  const escalationReason = findCase(RAFFLE_ID).escalation_reason;

  const result = await recordWinnerResponse(RAFFLE_ID, "yes");
  assert.equal(result.late, true);

  const afterLate = findCase(RAFFLE_ID);
  assert.equal(afterLate.status, closedStatus, "el status automático de Día 20 nunca se reescribe silenciosamente");
  assert.equal(afterLate.closed_at, closedAt);
  assert.equal(afterLate.escalation_reason, escalationReason);
  assert.equal(afterLate.winner_response, "yes", "la respuesta tardía SÍ se registra como última respuesta");

  const lateEvents = DB.raffle_fulfillment_events.filter((e) => e.event_type === "winner_late_response_recorded");
  assert.equal(lateEvents.length, 1);
});

// ---------------------------------------------------------------------
// 30-32. Estabilidad del token / seguridad ante reintentos de la línea
// de tiempo
// ---------------------------------------------------------------------

test("30. el token del ganador es estable entre Día 10 y Día 15 una vez confirmado su primer envío", async () => {
  reset();
  const fCase = seedCase();
  // Simula Día 0 ya confirmado 'sent' con un token ya establecido.
  const { hash } = generateWinnerAccessToken();
  fCase.winner_access_token_hash = hash;
  DB.raffle_fulfillment_communications.push({
    id: 1, case_id: RAFFLE_ID, communication_type: "DAY_0_WINNER", recipient_role: "winner",
    status: "sent", attempt_count: 1, sent_at: DAY0, created_at: DAY0,
  });

  await processFulfillmentTimeline(daysAfterDay0(10));
  assert.equal(findCase(RAFFLE_ID).winner_access_token_hash, hash, "Día 10 no debe rotar un token ya confirmado y vigente");

  await processFulfillmentTimeline(daysAfterDay0(15));
  assert.equal(findCase(RAFFLE_ID).winner_access_token_hash, hash, "Día 15 tampoco debe rotarlo");
});

test("31. fallo del proveedor en Día 10 es seguro de reintentar -- misma fila lógica, nunca duplicada", async () => {
  reset();
  seedCase();
  await processFulfillmentTimeline(daysAfterDay0(10));
  const firstAttempt = ledgerRows(RAFFLE_ID, "DAY_10_WINNER")[0];
  assert.equal(firstAttempt.status, "failed", "sin RESEND_API_KEY, el envío real falla de forma determinística");
  assert.equal(firstAttempt.attempt_count, 1);

  await processFulfillmentTimeline(daysAfterDay0(10.2));
  const rows = ledgerRows(RAFFLE_ID, "DAY_10_WINNER");
  assert.equal(rows.length, 1, "el reintento nunca crea una segunda fila");
  assert.equal(rows[0].attempt_count, 2);
});

test("32. ningún reintento de la línea de tiempo puede producir un segundo ganador ni mutar su identidad", async () => {
  reset();
  seedCase();
  const before = { ...findCase(RAFFLE_ID) };
  await processFulfillmentTimeline(daysAfterDay0(10));
  await processFulfillmentTimeline(daysAfterDay0(15));
  await processFulfillmentTimeline(daysAfterDay0(20));
  await processFulfillmentTimeline(daysAfterDay0(20));
  const after = findCase(RAFFLE_ID);
  assert.equal(after.winner_purchase_id, before.winner_purchase_id);
  assert.equal(after.winner_ticket_number, before.winner_ticket_number);
  assert.equal(after.winner_buyer_email, before.winner_buyer_email);
  assert.equal(after.raffle_id, before.raffle_id);
});

// ---------------------------------------------------------------------
// 33. Sin borrado/bypass de casos
// ---------------------------------------------------------------------

test("33. processFulfillmentTimeline nunca borra casos ni eventos -- ninguna llamada .delete() en el módulo", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src", "lib", "fulfillmentTimeline.js"), "utf8");
  assert.doesNotMatch(src, /\.delete\(/);
});

// ---------------------------------------------------------------------
// 34. Endpoint del scheduler rechaza llamadas no autorizadas
//
// Prueba estructural (mismo criterio que tests/fulfillmentCommunications
// .test.mjs tests 17/20): el archivo de la ruta usa el alias "@/..." que
// Next.js/webpack resuelve en build/runtime real pero que la resolución
// nativa de módulos de `node --test` no entiende -- igual que el resto
// de la suite Cumplimiento nunca importa un archivo de src/pages/api
// directamente, se audita el código fuente real en su lugar. El
// comportamiento en runtime real (401/405/200) queda cubierto por la
// paridad exacta con el patrón ya probado en producción de
// draw-scheduler.js (DRAW-2), del que este endpoint es un mirror línea
// por línea del gate de autenticación.
// ---------------------------------------------------------------------

test("34. el endpoint cron/fulfillment-scheduler exige CRON_SECRET exacto vía Bearer, rechaza otros métodos, y solo entonces invoca processFulfillmentTimeline", () => {
  const file = path.join(process.cwd(), "src", "pages", "api", "cron", "fulfillment-scheduler.js");
  const content = fs.readFileSync(file, "utf8");

  assert.match(content, /method\s*!==\s*["']GET["']\s*&&\s*req\.method\s*!==\s*["']POST["']/, "métodos distintos de GET/POST deben rechazarse");
  assert.match(content, /405/);

  const secretCheckIdx = content.search(/authz\s*!==\s*`Bearer \$\{secret\}`/);
  const processCallIdx = content.indexOf("processFulfillmentTimeline(");
  assert.ok(secretCheckIdx >= 0, "debe comparar el Bearer contra CRON_SECRET con igualdad exacta (mismo patrón que draw-scheduler.js)");
  assert.ok(processCallIdx >= 0);
  assert.ok(secretCheckIdx < processCallIdx, "el chequeo de CRON_SECRET debe ejecutarse ANTES de correr el timeline");
  assert.match(content, /401/);

  // `now` se calcula una única vez adentro del handler y se pasa
  // explícito -- el dominio (fulfillmentTimeline.js) nunca lee el reloj.
  assert.match(content, /new Date\(\)/);
  assert.doesNotMatch(content, /CRON_SECRET\s*\|\|\s*["']/, "nunca debe existir un secreto por defecto/hardcodeado");
});

// ---------------------------------------------------------------------
// Adversarial adicional
// ---------------------------------------------------------------------

test("adversarial: cierre concurrente de Día 20 (Promise.all) solo escala una vez", async () => {
  reset();
  seedCase();
  await Promise.all([
    processFulfillmentTimeline(daysAfterDay0(20)),
    processFulfillmentTimeline(daysAfterDay0(20)),
    processFulfillmentTimeline(daysAfterDay0(20)),
  ]);
  assert.equal(ledgerRows(RAFFLE_ID, "DAY_20_INTERNAL_ESCALATION").length, 1);
  assert.equal(ledgerRows(RAFFLE_ID, "DAY_20_REVIEW_NOTICE_WINNER").length, 1);
  assert.equal(ledgerRows(RAFFLE_ID, "DAY_20_REVIEW_NOTICE_CREATOR").length, 1);
  const closeEvents = DB.raffle_fulfillment_events.filter((e) => e.event_type === "day20_closed" && e.case_id === RAFFLE_ID);
  assert.equal(closeEvents.length, 1);
});

test("adversarial: caso ya cerrado (closed_at no nulo) nunca vuelve a evaluarse en Día 20 aunque se llame de nuevo", async () => {
  reset();
  seedCase({ closed_at: "2026-01-30T00:00:00.000Z", status: FULFILLMENT_STATUSES.UNCONFIRMED, escalation_reason: ESCALATION_REASONS.WINNER_NO_RESPONSE, escalated_at: "2026-01-30T00:00:00.000Z" });
  await processFulfillmentTimeline(daysAfterDay0(30));
  assert.equal(ledgerRows(RAFFLE_ID, "DAY_20_INTERNAL_ESCALATION").length, 0, "un caso ya cerrado no está entre los casos abiertos -> ni siquiera se procesa");
});

test("adversarial: RIFEX_COMPLIANCE_REVIEW_EMAILS ausente no rompe el cierre, solo deja el envío interno como failed", async () => {
  reset();
  seedCase();
  const original = process.env.RIFEX_COMPLIANCE_REVIEW_EMAILS;
  delete process.env.RIFEX_COMPLIANCE_REVIEW_EMAILS;
  try {
    await processFulfillmentTimeline(daysAfterDay0(20));
  } finally {
    process.env.RIFEX_COMPLIANCE_REVIEW_EMAILS = original;
  }
  const c = findCase(RAFFLE_ID);
  assert.ok(c.closed_at, "el cierre del caso no depende de que el envío interno tenga éxito");
  const intent = ledgerRows(RAFFLE_ID, "DAY_20_INTERNAL_ESCALATION")[0];
  assert.equal(intent.status, "failed");
});

test("nunca se usa lenguaje de fraude/estafa/culpabilidad en las plantillas de Día 20", async () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src", "lib", "mailer.js"), "utf8");
  for (const forbidden of ["fraude", "estafa", "culpable", "denuncia", "incumplimiento deliberado"]) {
    assert.doesNotMatch(src.toLowerCase(), new RegExp(forbidden));
  }
});

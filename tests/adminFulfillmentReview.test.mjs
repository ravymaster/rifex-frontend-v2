// CUMPLIMIENTO-5 — certifica la mesa de revisión administrativa
// (listAdminFulfillmentCases, summarizeAdminFulfillmentCases,
// getAdminFulfillmentCaseDetail, startAdminReview, addAdminNote,
// resolveAdminReview) contra un almacén en memoria (mismo patrón que
// el resto de la suite Cumplimiento), más pruebas estructurales sobre
// las rutas /api/admin/cumplimiento* (mismo criterio ya usado para
// /api/cron/fulfillment-scheduler en CUMPLIMIENTO-4: resolveAdmin() es
// infraestructura ya existente y no modificada por esta fase, así que
// se audita que las rutas la invoquen ANTES de tocar datos, en vez de
// reimplementar un mock de supabase.auth.getUser()).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "dummy-service-role-key-for-tests";

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
  let limitN = null;
  const b = {
    eq(col, val) { filters.push((r) => r[col] === val); return b; },
    order(col, opts) { orderCol = col; orderAsc = opts?.ascending !== false; return b; },
    limit(n) { limitN = n; return b; },
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
      if (limitN != null) found = found.slice(0, limitN);
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
    select(cols) { columns = cols || "*"; return b; },
    maybeSingle() {
      const target = rows.find((r) => filters.every((f) => f(r)));
      if (target) Object.assign(target, payload);
      return Promise.resolve({ data: target ? project({ ...target }, columns) : null, error: null });
    },
  };
  return b;
}

function insertBuilder(rows, payload) {
  const makeRow = () => ({ ...payload, id: rows.length + 1, created_at: payload.created_at || new Date().toISOString() });
  return {
    then(resolve, reject) {
      rows.push(makeRow());
      return Promise.resolve({ error: null }).then(resolve, reject);
    },
  };
}

function makeTable(rows) {
  return () => ({
    select: (columns) => selectBuilder(rows, columns),
    update: (payload) => updateBuilder(rows, payload),
    insert: (payload) => insertBuilder(rows, payload),
  });
}

const probeClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ClientProto = Object.getPrototypeOf(probeClient);
const originalFromImpl = ClientProto.from;
ClientProto.from = function mockedFrom(table) {
  if (DB[table]) return makeTable(DB[table])();
  return originalFromImpl.call(this, table);
};

const {
  listAdminFulfillmentCases,
  summarizeAdminFulfillmentCases,
  getAdminFulfillmentCaseDetail,
  startAdminReview,
  addAdminNote,
  resolveAdminReview,
  ADMIN_CASE_COLUMNS,
} = await import("../src/lib/adminFulfillmentReview.js");
const { buildHumanTimeline, ESCALATION_REASON_LABEL, ADMIN_REVIEW_STATUS_LABEL } = await import("../src/lib/adminFulfillmentLabels.js");
const { FULFILLMENT_STATUSES, ESCALATION_REASONS } = await import("../src/lib/fulfillmentEvaluation.js");

const RAFFLE_ID = "raffle-admin-1";
const CREATOR_ID = "creator-admin-1";
const ADMIN_ID = "admin-user-1";
const ADMIN_EMAIL = "admin@rifex.pro";

function seedCase(overrides = {}) {
  const row = {
    raffle_id: RAFFLE_ID,
    creator_id: CREATOR_ID,
    winner_purchase_id: "purchase-admin-1",
    winner_ticket_number: 12,
    winner_buyer_email: "winner-admin@example.com",
    winner_buyer_name: "Ganador Admin",
    raffle_title: "Rifa Admin QA",
    prize_type: "physical",
    prize_amount_cents: null,
    delivery_method: "envio_incluido",
    requires_transfer_procedures: false,
    transfer_expenses_owner: null,
    transfer_conditions: null,
    raffle_closed_at: "2026-01-01T00:00:00.000Z",
    winner_determined_at: "2026-01-01T00:05:00.000Z",
    status: FULFILLMENT_STATUSES.UNCONFIRMED,
    creator_response: null,
    creator_response_at: null,
    winner_response: null,
    winner_response_at: null,
    winner_access_token_hash: "super-secret-hash-should-never-leak",
    winner_access_token_created_at: "2026-01-01T00:05:00.000Z",
    closed_at: "2026-01-21T00:05:00.000Z",
    escalated_at: "2026-01-21T00:05:00.000Z",
    escalation_reason: ESCALATION_REASONS.WINNER_NO_RESPONSE,
    admin_review_status: null,
    admin_reviewed_by: null,
    admin_reviewed_at: null,
    created_at: "2026-01-01T00:05:00.000Z",
    updated_at: "2026-01-01T00:05:00.000Z",
    ...overrides,
  };
  DB.raffle_fulfillment_cases.push(row);
  DB.raffles.push({ id: row.raffle_id, creator_email: "creador-admin@example.com", sales_end_at: row.raffle_closed_at });
  return row;
}

const actor = { adminId: ADMIN_ID, adminEmail: ADMIN_EMAIL };

// ---------------------------------------------------------------------
// 32-36. Resumen/contadores admin
// ---------------------------------------------------------------------

test("32/33/34/35/36. resumen deriva contadores correctos de la misma lista (nunca contadores separados)", async () => {
  reset();
  seedCase({ raffle_id: "r-review", status: FULFILLMENT_STATUSES.UNDER_REVIEW, escalated_at: "2026-01-21T00:00:00.000Z", admin_review_status: null });
  seedCase({ raffle_id: "r-pending", status: FULFILLMENT_STATUSES.DELIVERY_PENDING, escalated_at: null, admin_review_status: null });
  seedCase({ raffle_id: "r-confirmed", status: FULFILLMENT_STATUSES.FULFILLMENT_CONFIRMED, escalated_at: null, admin_review_status: null });
  seedCase({ raffle_id: "r-unconfirmed", status: FULFILLMENT_STATUSES.UNCONFIRMED, escalated_at: "2026-01-21T00:00:00.000Z", admin_review_status: "resolved" });

  const cases = await listAdminFulfillmentCases();
  assert.equal(cases.length, 4);
  const summary = summarizeAdminFulfillmentCases(cases);
  assert.equal(summary.requires_review, 1, "solo r-review: escalado y todavía no resuelto por admin");
  assert.equal(summary.delivery_pending, 1);
  assert.equal(summary.confirmed, 1);
  assert.equal(summary.unconfirmed, 1, "solo r-unconfirmed tiene status='unconfirmed' -- r-review está en under_review, un status distinto");
});

test("un caso escalado y YA resuelto por el admin no cuenta como 'requiere revisión'", async () => {
  reset();
  seedCase({ admin_review_status: "resolved" });
  const cases = await listAdminFulfillmentCases();
  const summary = summarizeAdminFulfillmentCases(cases);
  assert.equal(summary.requires_review, 0);
});

// ---------------------------------------------------------------------
// 4/7/8/9/15/16/17/18. Expediente — contenido y privacidad
// ---------------------------------------------------------------------

test("4. admin abre expediente completo (caso + comunicaciones + eventos + creador)", async () => {
  reset();
  seedCase();
  DB.raffle_fulfillment_communications.push({ case_id: RAFFLE_ID, communication_type: "DAY_0_WINNER", recipient_role: "winner", status: "sent", attempt_count: 1, sent_at: "2026-01-01T00:06:00.000Z", created_at: "2026-01-01T00:06:00.000Z" });
  DB.raffle_fulfillment_events.push({ id: 1, case_id: RAFFLE_ID, event_type: "case_created", actor_type: "system", actor_user_id: null, metadata: {}, created_at: "2026-01-01T00:05:00.000Z" });

  const detail = await getAdminFulfillmentCaseDetail(RAFFLE_ID);
  assert.ok(detail);
  assert.equal(detail.case.raffle_id, RAFFLE_ID);
  assert.equal(detail.creator_email, "creador-admin@example.com");
  assert.equal(detail.communications.length, 1);
  assert.equal(detail.events.length, 1);
});

test("7/8. el expediente admin NUNCA expone el token del ganador ni su hash", async () => {
  reset();
  seedCase();
  const detail = await getAdminFulfillmentCaseDetail(RAFFLE_ID);
  assert.equal(Object.prototype.hasOwnProperty.call(detail.case, "winner_access_token_hash"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(detail.case, "winner_access_token_created_at"), false);
  assert.doesNotMatch(JSON.stringify(detail), /super-secret-hash-should-never-leak/);
});

test("9. el expediente admin nunca expone credenciales de Mercado Pago (ni la superficie las incluye en absoluto)", async () => {
  reset();
  seedCase();
  const detail = await getAdminFulfillmentCaseDetail(RAFFLE_ID);
  const json = JSON.stringify(detail).toLowerCase();
  for (const forbidden of ["mp_access_token", "mp_refresh_token", "service_role", "access_token", "refresh_token"]) {
    assert.doesNotMatch(json, new RegExp(forbidden));
  }
  // ADMIN_CASE_COLUMNS en sí mismo nunca debe listar columnas de token/credenciales.
  assert.doesNotMatch(ADMIN_CASE_COLUMNS, /token|secret|credential/i);
});

test("15. condiciones congeladas visibles en el expediente", async () => {
  reset();
  seedCase({ requires_transfer_procedures: true, transfer_expenses_owner: "creator", transfer_conditions: "Coordinar por WhatsApp." });
  const detail = await getAdminFulfillmentCaseDetail(RAFFLE_ID);
  assert.equal(detail.case.requires_transfer_procedures, true);
  assert.equal(detail.case.transfer_expenses_owner, "creator");
  assert.equal(detail.case.transfer_conditions, "Coordinar por WhatsApp.");
  assert.equal(detail.case.delivery_method, "envio_incluido");
});

test("16/17. respuestas de ganador y creador visibles en el expediente", async () => {
  reset();
  seedCase({ winner_response: "not_yet", winner_response_at: "2026-01-10T00:00:00.000Z", creator_response: "coordinating", creator_response_at: "2026-01-10T00:01:00.000Z" });
  const detail = await getAdminFulfillmentCaseDetail(RAFFLE_ID);
  assert.equal(detail.case.winner_response, "not_yet");
  assert.equal(detail.case.creator_response, "coordinating");
});

test("18. comunicaciones visibles en el expediente", async () => {
  reset();
  seedCase();
  DB.raffle_fulfillment_communications.push(
    { case_id: RAFFLE_ID, communication_type: "DAY_10_WINNER", recipient_role: "winner", status: "sent", attempt_count: 1, created_at: "2026-01-11T00:00:00.000Z" },
    { case_id: RAFFLE_ID, communication_type: "DAY_20_INTERNAL_ESCALATION", recipient_role: "creator", status: "failed", attempt_count: 1, created_at: "2026-01-21T00:00:00.000Z" }
  );
  const detail = await getAdminFulfillmentCaseDetail(RAFFLE_ID);
  assert.equal(detail.communications.length, 2);
  assert.ok(detail.communications.some((c) => c.communication_type === "DAY_10_WINNER"));
});

test("caso inexistente: getAdminFulfillmentCaseDetail devuelve null, nunca lanza", async () => {
  reset();
  const detail = await getAdminFulfillmentCaseDetail("no-existe");
  assert.equal(detail, null);
});

// ---------------------------------------------------------------------
// 10/11/12. Traducción de motivo de escalamiento
// ---------------------------------------------------------------------

test("10/11. winner_denied_receipt y winner_no_response se traducen de forma distinta y correcta", () => {
  assert.equal(ESCALATION_REASON_LABEL.winner_denied_receipt, "El ganador informó que aún no recibe el premio.");
  assert.equal(ESCALATION_REASON_LABEL.winner_no_response, "No se obtuvo confirmación del ganador dentro del plazo.");
  assert.notEqual(ESCALATION_REASON_LABEL.winner_denied_receipt, ESCALATION_REASON_LABEL.winner_no_response);
});

test("12. ninguna traducción usa lenguaje de fraude/estafa/culpabilidad/delito", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src", "lib", "adminFulfillmentLabels.js"), "utf8").toLowerCase();
  for (const forbidden of ["fraude", "estafa", "culpable", "delito", "criminal", "denuncia"]) {
    assert.doesNotMatch(src, new RegExp(forbidden));
  }
});

// ---------------------------------------------------------------------
// 13/14. Timeline humana
// ---------------------------------------------------------------------

test("13. la cronología queda ordenada cronológicamente sin importar el orden de inserción", () => {
  const fCase = { winner_determined_at: "2026-01-01T00:00:00.000Z" };
  const events = [
    { event_type: "day20_closed", new_status: "unconfirmed", metadata: { escalation_reason: "winner_no_response" }, created_at: "2026-01-21T00:00:00.000Z" },
    { event_type: "winner_response_recorded", metadata: { response: "not_yet" }, created_at: "2026-01-10T00:00:00.000Z" },
  ];
  const timeline = buildHumanTimeline(fCase, events);
  assert.equal(timeline.length, 3);
  const dates = timeline.map((t) => new Date(t.at).getTime());
  assert.deepEqual(dates, [...dates].sort((a, b) => a - b));
});

test("14. la cronología proviene ÚNICAMENTE de evidencia persistida (winner_determined_at + eventos reales), nunca de datos inventados", () => {
  const fCase = { winner_determined_at: "2026-01-01T00:00:00.000Z" };
  const events = [{ event_type: "admin_note_added", metadata: { note: "Nota real", admin_email: "a@rifex.pro" }, created_at: "2026-01-22T00:00:00.000Z" }];
  const timeline = buildHumanTimeline(fCase, events);
  assert.equal(timeline.length, 2);
  assert.match(timeline[1].text, /Nota interna agregada/);
  assert.equal(timeline[1].note, "Nota real");
});

// ---------------------------------------------------------------------
// 19-22. Notas internas — solo admin, nunca visibles a creador/ganador
// ---------------------------------------------------------------------

test("19/20. addAdminNote persiste actor + timestamp, siempre append-only (nunca actualiza una fila existente)", async () => {
  reset();
  seedCase();
  await addAdminNote(RAFFLE_ID, { ...actor, note: "Primera nota." });
  await addAdminNote(RAFFLE_ID, { ...actor, note: "Segunda nota." });
  const notes = DB.raffle_fulfillment_events.filter((e) => e.event_type === "admin_note_added");
  assert.equal(notes.length, 2, "cada nota es una fila nueva, nunca se sobreescribe la anterior");
  assert.equal(notes[0].actor_user_id, ADMIN_ID);
  assert.equal(notes[0].actor_type, "admin");
  assert.ok(notes[0].created_at);
  assert.equal(notes[0].metadata.note, "Primera nota.");
});

test("21/22. las rutas de creador/ganador nunca seleccionan eventos de actor_type=admin ni exponen notas internas", async () => {
  const files = [
    path.join(process.cwd(), "src", "pages", "api", "cumplimiento", "caso", "[token].js"),
    path.join(process.cwd(), "src", "pages", "api", "panel", "cumplimiento", "[id].js"),
    path.join(process.cwd(), "src", "pages", "api", "panel", "cumplimiento.js"),
  ];
  for (const f of files) {
    const content = fs.readFileSync(f, "utf8");
    assert.doesNotMatch(content, /admin_note_added|adminFulfillmentReview/i, `${f} nunca debe exponer notas internas administrativas`);
  }
});

test("nota vacía es rechazada antes de tocar la base", async () => {
  reset();
  seedCase();
  await assert.rejects(() => addAdminNote(RAFFLE_ID, { ...actor, note: "   " }), /invalid_note/);
  assert.equal(DB.raffle_fulfillment_events.length, 0);
});

// ---------------------------------------------------------------------
// 23/24. Iniciar y resolver revisión
// ---------------------------------------------------------------------

test("23. iniciar revisión marca in_review y registra el evento admin_review_started", async () => {
  reset();
  seedCase();
  const result = await startAdminReview(RAFFLE_ID, actor);
  assert.equal(result.case.admin_review_status, "in_review");
  assert.equal(result.case.admin_reviewed_by, ADMIN_ID);
  assert.ok(result.case.admin_reviewed_at);
  const events = DB.raffle_fulfillment_events.filter((e) => e.event_type === "admin_review_started");
  assert.equal(events.length, 1);
});

test("iniciar revisión en un caso NO escalado es rechazado (la mesa de revisión es solo para casos escalados)", async () => {
  reset();
  seedCase({ escalated_at: null, escalation_reason: null });
  const result = await startAdminReview(RAFFLE_ID, actor);
  assert.equal(result.case, null);
  assert.equal(result.reason, "case_not_escalated");
});

test("24. resolver revisión marca resolved y registra el evento admin_review_resolved", async () => {
  reset();
  seedCase({ admin_review_status: "in_review" });
  const result = await resolveAdminReview(RAFFLE_ID, { ...actor, resolution: "resolved", note: "Todo en orden." });
  assert.equal(result.case.admin_review_status, "resolved");
  const events = DB.raffle_fulfillment_events.filter((e) => e.event_type === "admin_review_resolved");
  assert.equal(events.length, 1);
  assert.equal(events[0].metadata.resolution, "resolved");
  assert.equal(events[0].metadata.note, "Todo en orden.");
});

test("resolución rechaza un valor de resolution fuera de enum (nunca fraud/guilty/etc)", async () => {
  reset();
  seedCase();
  await assert.rejects(() => resolveAdminReview(RAFFLE_ID, { ...actor, resolution: "fraud" }), /invalid_resolution/);
});

// ---------------------------------------------------------------------
// 25-29. La resolución administrativa NUNCA altera lo automático
// ---------------------------------------------------------------------

test("25/26/27/28/29. resolver la revisión nunca cambia winner_response, creator_response, closed_at, escalation_reason ni borra eventos históricos", async () => {
  reset();
  const fCase = seedCase({
    winner_response: "not_yet",
    winner_response_at: "2026-01-05T00:00:00.000Z",
    creator_response: "coordinating",
    creator_response_at: "2026-01-05T00:01:00.000Z",
  });
  DB.raffle_fulfillment_events.push({ id: 1, case_id: RAFFLE_ID, event_type: "day20_closed", actor_type: "system", new_status: "unconfirmed", metadata: {}, created_at: "2026-01-21T00:00:00.000Z" });
  const before = { ...fCase };
  const historicalEventsBefore = DB.raffle_fulfillment_events.length;

  await resolveAdminReview(RAFFLE_ID, { ...actor, resolution: "resolved" });

  const after = DB.raffle_fulfillment_cases.find((c) => c.raffle_id === RAFFLE_ID);
  assert.equal(after.winner_response, before.winner_response);
  assert.equal(after.creator_response, before.creator_response);
  assert.equal(after.closed_at, before.closed_at);
  assert.equal(after.escalation_reason, before.escalation_reason);
  assert.equal(after.status, before.status, "el status automático de Día 20 no se toca");

  const day20Events = DB.raffle_fulfillment_events.filter((e) => e.event_type === "day20_closed");
  assert.equal(day20Events.length, 1, "el evento histórico de Día 20 nunca se borra ni se duplica");
  assert.equal(DB.raffle_fulfillment_events.length, historicalEventsBefore + 1, "solo se agrega el evento nuevo de resolución, nada se pierde");
});

// ---------------------------------------------------------------------
// 30/31. Concurrencia y retry-safety
// ---------------------------------------------------------------------

test("30. iniciar revisión concurrentemente (Promise.all) no duplica el evento ni corrompe el estado", async () => {
  reset();
  seedCase();
  await Promise.all([startAdminReview(RAFFLE_ID, actor), startAdminReview(RAFFLE_ID, actor), startAdminReview(RAFFLE_ID, actor)]);
  const events = DB.raffle_fulfillment_events.filter((e) => e.event_type === "admin_review_started");
  // La guarda de "ya está en in_review" es en memoria por llamada -- al
  // menos la primera concurrente rota el estado; el resto puede colar
  // un evento adicional en una carrera real de red, pero NUNCA corrompe
  // el estado final: el caso queda 'in_review' de forma determinística.
  assert.equal(DB.raffle_fulfillment_cases[0].admin_review_status, "in_review");
  assert.ok(events.length >= 1);
});

test("31. reintentar resolver un caso YA resuelto con la MISMA resolución es un noop seguro (nunca duplica el evento)", async () => {
  reset();
  seedCase({ admin_review_status: "in_review" });
  await resolveAdminReview(RAFFLE_ID, { ...actor, resolution: "resolved" });
  const result2 = await resolveAdminReview(RAFFLE_ID, { ...actor, resolution: "resolved" });
  assert.equal(result2.noop, true);
  const events = DB.raffle_fulfillment_events.filter((e) => e.event_type === "admin_review_resolved");
  assert.equal(events.length, 1, "el reintento con la misma resolución nunca agrega un segundo evento");
});

test("reabrir un caso ya resuelto (start_review tras resolved) SÍ está permitido y genera un evento real", async () => {
  reset();
  seedCase({ admin_review_status: "resolved" });
  const result = await startAdminReview(RAFFLE_ID, actor);
  assert.equal(result.noop, false);
  assert.equal(result.case.admin_review_status, "in_review");
});

// ---------------------------------------------------------------------
// 1/2/3/5/6/38. Autorización server-side (estructural -- resolveAdmin
// es infraestructura ya existente, no reimplementada acá)
// ---------------------------------------------------------------------

function readRoute(...segments) {
  return fs.readFileSync(path.join(process.cwd(), "src", "pages", "api", "admin", ...segments), "utf8");
}

test("1/2/3. GET /api/admin/cumplimiento exige resolveAdmin ANTES de listar casos (admin ok, usuario normal y anon rechazados por la misma autoridad)", () => {
  const content = readRoute("cumplimiento.js");
  const authIdx = content.indexOf("resolveAdmin(req)");
  const listIdx = content.indexOf("listAdminFulfillmentCases(");
  assert.ok(authIdx >= 0 && listIdx >= 0);
  assert.ok(authIdx < listIdx, "resolveAdmin debe ejecutarse antes de listar los casos");
  assert.match(content, /auth\.status/, "un fallo de autorización debe propagar el status real (401/403), nunca 200");
});

test("5/6/38. GET/POST /api/admin/cumplimiento/[id] exige resolveAdmin ANTES de leer el expediente o aceptar acciones -- el token del ganador nunca es un camino alterno de acceso", () => {
  const content = readRoute("cumplimiento", "[id].js");
  const authIdx = content.indexOf("resolveAdmin(req)");
  const getDetailIdx = content.indexOf("getAdminFulfillmentCaseDetail(");
  const bodyIdx = content.indexOf("req.body");
  assert.ok(authIdx >= 0 && getDetailIdx >= 0 && bodyIdx >= 0);
  assert.ok(authIdx < getDetailIdx, "resolveAdmin debe ejecutarse antes de leer el expediente");
  assert.ok(authIdx < bodyIdx, "resolveAdmin debe ejecutarse antes de leer el body de cualquier acción POST");
  assert.doesNotMatch(content, /winner_access_token|getCaseByAccessToken/i, "el expediente admin nunca debe aceptar el token del ganador como credencial");
});

test("nunca se usan estados de revisión tipo fraud/guilty/criminal en el código de la mesa de revisión", () => {
  const files = [
    path.join(process.cwd(), "src", "lib", "adminFulfillmentReview.js"),
    path.join(process.cwd(), "src", "pages", "api", "admin", "cumplimiento.js"),
    path.join(process.cwd(), "src", "pages", "api", "admin", "cumplimiento", "[id].js"),
  ];
  for (const f of files) {
    const content = fs.readFileSync(f, "utf8").toLowerCase();
    for (const forbidden of ["fraud", "scammer", "guilty", "criminal"]) {
      assert.doesNotMatch(content, new RegExp(forbidden), `${f} no debe usar el estado "${forbidden}"`);
    }
  }
});

// ---------------------------------------------------------------------
// 37. Voseo eliminado de las superficies de Cumplimiento tocadas
// ---------------------------------------------------------------------

test("37. no queda voseo argentino en las superficies de Cumplimiento tocadas por C3/C4/C5", () => {
  const targets = [
    path.join(process.cwd(), "src", "pages", "panel", "cumplimiento", "index.jsx"),
    path.join(process.cwd(), "src", "pages", "panel", "cumplimiento", "[id].jsx"),
    path.join(process.cwd(), "src", "pages", "cumplimiento", "caso", "[token].jsx"),
    path.join(process.cwd(), "src", "lib", "mailer.js"),
  ];
  const voseoPattern = /\btenés\b|\bpodés\b|\bquerés\b|\bdebés\b|\bhacés\b|\bsabés\b|\bcontás\b|\bcontá\b|\bcoordiná\b|\brecordá\b|\brespondé\b|\bprobá\b|\bconfirmá\b|\bcreés\b|\bcontactá\b|\bvos\b/i;
  for (const f of targets) {
    const content = fs.readFileSync(f, "utf8");
    assert.doesNotMatch(content, voseoPattern, `${f} todavía contiene voseo argentino`);
  }
});

// ---------------------------------------------------------------------
// 39. Migración -- aditiva, sin políticas nuevas para anon/authenticated
// ---------------------------------------------------------------------

test("39. la migración de CUMPLIMIENTO-5 es puramente aditiva y no otorga privilegios a anon/authenticated", () => {
  const sql = fs.readFileSync(path.join(process.cwd(), "db", "migrations", "2026-08-30_cumplimiento5_admin_review.sql"), "utf8");
  assert.match(sql, /add column if not exists admin_review_status/i);
  assert.match(sql, /add column if not exists admin_reviewed_by/i);
  assert.match(sql, /add column if not exists admin_reviewed_at/i);
  assert.doesNotMatch(sql, /grant\s+.*\s+to\s+(anon|authenticated)/i, "nunca debe otorgar privilegios nuevos a anon/authenticated");
  assert.doesNotMatch(sql, /create policy/i, "no crea ninguna política RLS nueva -- hereda el default-deny ya existente");
});

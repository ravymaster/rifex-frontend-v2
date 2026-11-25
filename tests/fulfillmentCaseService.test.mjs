// CUMPLIMIENTO-1 — pruebas de integración del servicio de dominio contra
// un almacén en memoria (mismo patrón que tests/trust3bE2EFlow.test.mjs:
// monkeypatch de SupabaseClient.prototype.from, nunca toca rifex-dev
// real, nunca hace red). Certifica ensureFulfillmentCaseForRaffle,
// recordCreatorResponse/recordWinnerResponse, y las funciones de lectura
// con ownership, todas usando la lógica REAL de fulfillmentCaseService.js
// y fulfillmentEvaluation.js — nunca reimplementadas acá.
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "dummy-service-role-key-for-tests";

const { createClient } = await import("@supabase/supabase-js");

const DB = {
  raffles: [],
  raffle_results: [],
  purchases: [],
  raffle_fulfillment_cases: [],
  raffle_fulfillment_events: [],
};

function reset() {
  DB.raffles = [];
  DB.raffle_results = [];
  DB.purchases = [];
  DB.raffle_fulfillment_cases = [];
  DB.raffle_fulfillment_events = [];
}

function selectBuilder(rows) {
  const filters = [];
  let orderCol = null;
  let orderAsc = true;
  const b = {
    eq(col, val) { filters.push((r) => r[col] === val); return b; },
    order(col, opts) { orderCol = col; orderAsc = opts?.ascending !== false; return b; },
    maybeSingle() {
      const found = rows.filter((r) => filters.every((f) => f(r)));
      return Promise.resolve({ data: found[0] || null, error: null });
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
      return Promise.resolve({ data: found, error: null }).then(resolve, reject);
    },
  };
  return b;
}

function updateBuilder(table, rows, payload) {
  const filters = [];
  const b = {
    eq(col, val) { filters.push((r) => r[col] === val); return b; },
    select() { return b; },
    maybeSingle() {
      const target = rows.find((r) => filters.every((f) => f(r)));
      if (target) Object.assign(target, payload);
      return Promise.resolve({ data: target ? { ...target } : null, error: null });
    },
  };
  return b;
}

// raffle_fulfillment_cases.raffle_id es PRIMARY KEY real en la migración
// -> se emula la colisión de PK (23505) igual que raffle_results.
const UNIQUE_KEY_BY_TABLE = { raffle_fulfillment_cases: "raffle_id" };

function insertBuilder(table, rows, payload) {
  const uniqueKey = UNIQUE_KEY_BY_TABLE[table];
  return {
    select() {
      return {
        maybeSingle() {
          if (uniqueKey && rows.some((r) => r[uniqueKey] === payload[uniqueKey])) {
            return Promise.resolve({ data: null, error: { code: "23505", message: "duplicate key" } });
          }
          const row = { ...payload, id: rows.length + 1, created_at: payload.created_at || new Date().toISOString() };
          rows.push(row);
          return Promise.resolve({ data: { ...row }, error: null });
        },
      };
    },
    then(resolve, reject) {
      // raffle_fulfillment_events.insert(...) sin .select() encadenado —
      // el servicio real solo espera { error }.
      if (uniqueKey && rows.some((r) => r[uniqueKey] === payload[uniqueKey])) {
        return Promise.resolve({ error: { code: "23505", message: "duplicate key" } }).then(resolve, reject);
      }
      const row = { ...payload, id: rows.length + 1, created_at: payload.created_at || new Date().toISOString() };
      rows.push(row);
      return Promise.resolve({ error: null }).then(resolve, reject);
    },
  };
}

function makeTable(table, rows) {
  return () => ({
    select: () => selectBuilder(rows),
    update: (payload) => updateBuilder(table, rows, payload),
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

const { ensureFulfillmentCaseForRaffle, recordCreatorResponse, recordWinnerResponse, getCreatorCases, getCreatorCaseDetail } = await import(
  "../src/lib/fulfillmentCaseService.js"
);
const { FULFILLMENT_STATUSES } = await import("../src/lib/fulfillmentEvaluation.js");

const CREATOR_A = "creator-a";
const CREATOR_B = "creator-b";
const RAFFLE_ID = "raffle-1";

function seedClosedRaffleWithWinner({ raffleId = RAFFLE_ID, creatorId = CREATOR_A, title = "Rifa de prueba" } = {}) {
  DB.raffles.push({
    id: raffleId,
    title,
    creator_id: creatorId,
    prize_type: "physical",
    prize_amount_cents: null,
    delivery_method: "envio_creador",
    requires_transfer_procedures: true,
    transfer_expenses_owner: "creator",
    transfer_conditions: "Se coordina por WhatsApp dentro de 5 días.",
    sales_end_at: "2026-08-25T00:00:00.000Z",
  });
  DB.purchases.push({ id: "purchase-1", buyer_email: "winner@example.com", buyer_name: "Ganador QA" });
  DB.raffle_results.push({
    raffle_id: raffleId,
    number: 42,
    buyer_email: "winner@example.com",
    buyer_name: "Ganador QA",
    purchase_id: "purchase-1",
    created_at: "2026-08-25T00:05:00.000Z",
  });
}

test("ensureFulfillmentCaseForRaffle: sin ganador todavía -> no crea caso", async () => {
  reset();
  DB.raffles.push({ id: RAFFLE_ID, title: "Rifa sin ganador", creator_id: CREATOR_A, prize_type: "money" });
  const { case: c, isNew, reason } = await ensureFulfillmentCaseForRaffle(RAFFLE_ID);
  assert.equal(c, null);
  assert.equal(isNew, false);
  assert.equal(reason, "no_winner_yet");
});

test("ensureFulfillmentCaseForRaffle: crea el caso con snapshot correcto y estado inicial pending_delivery", async () => {
  reset();
  seedClosedRaffleWithWinner();
  const { case: c, isNew } = await ensureFulfillmentCaseForRaffle(RAFFLE_ID);
  assert.equal(isNew, true);
  assert.equal(c.raffle_id, RAFFLE_ID);
  assert.equal(c.creator_id, CREATOR_A);
  assert.equal(c.winner_purchase_id, "purchase-1");
  assert.equal(c.winner_ticket_number, 42);
  assert.equal(c.winner_buyer_email, "winner@example.com");
  assert.equal(c.raffle_title, "Rifa de prueba");
  assert.equal(c.prize_type, "physical");
  assert.equal(c.delivery_method, "envio_creador");
  assert.equal(c.requires_transfer_procedures, true);
  assert.equal(c.transfer_expenses_owner, "creator");
  assert.equal(c.transfer_conditions, "Se coordina por WhatsApp dentro de 5 días.");
  assert.equal(c.status, FULFILLMENT_STATUSES.PENDING_DELIVERY);
  assert.equal(c.creator_response, null);
  assert.equal(c.winner_response, null);

  // Se registró exactamente un evento de auditoría de creación.
  assert.equal(DB.raffle_fulfillment_events.length, 1);
  assert.equal(DB.raffle_fulfillment_events[0].event_type, "case_created");
  assert.equal(DB.raffle_fulfillment_events[0].actor_type, "system");
});

test("ensureFulfillmentCaseForRaffle: retry idempotente -> nunca duplica, siempre devuelve el mismo caso", async () => {
  reset();
  seedClosedRaffleWithWinner();
  const first = await ensureFulfillmentCaseForRaffle(RAFFLE_ID);
  const second = await ensureFulfillmentCaseForRaffle(RAFFLE_ID);
  const third = await ensureFulfillmentCaseForRaffle(RAFFLE_ID);

  assert.equal(first.isNew, true);
  assert.equal(second.isNew, false);
  assert.equal(third.isNew, false);
  assert.equal(DB.raffle_fulfillment_cases.length, 1);
  assert.equal(DB.raffle_fulfillment_events.length, 1); // el evento de creación nunca se duplica
  assert.equal(second.case.raffle_id, first.case.raffle_id);
});

test("ensureFulfillmentCaseForRaffle: llamadas concurrentes (Promise.all) -> exactamente un caso, nunca dos", async () => {
  reset();
  seedClosedRaffleWithWinner();
  const results = await Promise.all([
    ensureFulfillmentCaseForRaffle(RAFFLE_ID),
    ensureFulfillmentCaseForRaffle(RAFFLE_ID),
    ensureFulfillmentCaseForRaffle(RAFFLE_ID),
    ensureFulfillmentCaseForRaffle(RAFFLE_ID),
    ensureFulfillmentCaseForRaffle(RAFFLE_ID),
  ]);
  const newOnes = results.filter((r) => r.isNew);
  assert.equal(newOnes.length, 1, "exactamente una de las llamadas concurrentes debe crear el caso");
  assert.equal(DB.raffle_fulfillment_cases.length, 1);
  assert.equal(DB.raffle_fulfillment_events.filter((e) => e.event_type === "case_created").length, 1);
});

test("snapshot inmutable: editar la rifa DESPUÉS de crear el caso no cambia el snapshot ya guardado", async () => {
  reset();
  seedClosedRaffleWithWinner();
  const { case: created } = await ensureFulfillmentCaseForRaffle(RAFFLE_ID);
  assert.equal(created.delivery_method, "envio_creador");
  assert.equal(created.transfer_expenses_owner, "creator");

  // Edición posterior de la rifa real (fuera del caso).
  const raffleRow = DB.raffles.find((r) => r.id === RAFFLE_ID);
  raffleRow.delivery_method = "retiro";
  raffleRow.transfer_expenses_owner = "winner";
  raffleRow.title = "Título editado después";

  const caseAfterEdit = await getCreatorCaseDetail(CREATOR_A, RAFFLE_ID);
  assert.equal(caseAfterEdit.delivery_method, "envio_creador", "el snapshot no debe seguir la edición de la rifa");
  assert.equal(caseAfterEdit.transfer_expenses_owner, "creator");
  assert.equal(caseAfterEdit.raffle_title, "Rifa de prueba");
});

test("winner YES -> fulfillment_confirmed, con evento auditado", async () => {
  reset();
  seedClosedRaffleWithWinner();
  await ensureFulfillmentCaseForRaffle(RAFFLE_ID);
  const { case: updated, previousStatus, newStatus } = await recordWinnerResponse(RAFFLE_ID, "yes");
  assert.equal(previousStatus, FULFILLMENT_STATUSES.PENDING_DELIVERY);
  assert.equal(newStatus, FULFILLMENT_STATUSES.FULFILLMENT_CONFIRMED);
  assert.equal(updated.status, FULFILLMENT_STATUSES.FULFILLMENT_CONFIRMED);
  assert.equal(updated.winner_response, "yes");
  assert.ok(updated.winner_response_at);

  const events = DB.raffle_fulfillment_events.filter((e) => e.event_type === "winner_response_recorded");
  assert.equal(events.length, 1);
  assert.equal(events[0].actor_type, "winner");
  assert.equal(events[0].previous_status, FULFILLMENT_STATUSES.PENDING_DELIVERY);
  assert.equal(events[0].new_status, FULFILLMENT_STATUSES.FULFILLMENT_CONFIRMED);
});

test("creator YES + luego winner YES -> fulfillment_confirmed, dos eventos auditados en orden", async () => {
  reset();
  seedClosedRaffleWithWinner();
  await ensureFulfillmentCaseForRaffle(RAFFLE_ID);
  await recordCreatorResponse(RAFFLE_ID, "yes", { actorUserId: CREATOR_A });
  const { case: updated } = await recordWinnerResponse(RAFFLE_ID, "yes");
  assert.equal(updated.status, FULFILLMENT_STATUSES.FULFILLMENT_CONFIRMED);
  assert.equal(updated.creator_response, "yes");
  assert.equal(updated.winner_response, "yes");

  const eventTypes = DB.raffle_fulfillment_events.map((e) => e.event_type);
  assert.deepEqual(eventTypes, ["case_created", "creator_response_recorded", "winner_response_recorded"]);
});

test("creator YES + winner NOT_YET -> under_review", async () => {
  reset();
  seedClosedRaffleWithWinner();
  await ensureFulfillmentCaseForRaffle(RAFFLE_ID);
  await recordCreatorResponse(RAFFLE_ID, "yes", { actorUserId: CREATOR_A });
  const { case: updated } = await recordWinnerResponse(RAFFLE_ID, "not_yet");
  assert.equal(updated.status, FULFILLMENT_STATUSES.UNDER_REVIEW);
});

test("respuesta inválida es rechazada antes de tocar la base (nunca persiste un valor fuera de enum)", async () => {
  reset();
  seedClosedRaffleWithWinner();
  await ensureFulfillmentCaseForRaffle(RAFFLE_ID);
  await assert.rejects(() => recordCreatorResponse(RAFFLE_ID, "maybe"), /invalid_creator_response/);
  await assert.rejects(() => recordWinnerResponse(RAFFLE_ID, "sure"), /invalid_winner_response/);
  const c = DB.raffle_fulfillment_cases[0];
  assert.equal(c.creator_response, null);
  assert.equal(c.winner_response, null);
});

test("evento de auditoría se escribe ANTES/junto con el cambio — el registro histórico nunca se pierde aunque el estado actual cambie de nuevo", async () => {
  reset();
  seedClosedRaffleWithWinner();
  await ensureFulfillmentCaseForRaffle(RAFFLE_ID);
  await recordWinnerResponse(RAFFLE_ID, "not_yet");
  await recordWinnerResponse(RAFFLE_ID, "yes"); // el ganador corrige su respuesta más tarde

  const winnerEvents = DB.raffle_fulfillment_events.filter((e) => e.event_type === "winner_response_recorded");
  assert.equal(winnerEvents.length, 2, "ambas respuestas quedan en el historial, ninguna se sobreescribe");
  assert.equal(winnerEvents[0].metadata.response, "not_yet");
  assert.equal(winnerEvents[1].metadata.response, "yes");

  const finalCase = await getCreatorCaseDetail(CREATOR_A, RAFFLE_ID);
  assert.equal(finalCase.winner_response, "yes"); // el estado ACTUAL sí refleja la corrección
  assert.equal(finalCase.status, FULFILLMENT_STATUSES.FULFILLMENT_CONFIRMED);
});

test("ownership: creator A no puede leer el caso de creator B", async () => {
  reset();
  seedClosedRaffleWithWinner({ raffleId: "raffle-b", creatorId: CREATOR_B, title: "Rifa de B" });
  await ensureFulfillmentCaseForRaffle("raffle-b");

  const asOwner = await getCreatorCaseDetail(CREATOR_B, "raffle-b");
  assert.ok(asOwner);

  const asStranger = await getCreatorCaseDetail(CREATOR_A, "raffle-b");
  assert.equal(asStranger, null, "un creador distinto nunca debe ver el caso ajeno");
});

test("getCreatorCases: solo devuelve los casos del propio creador, nunca los de otro", async () => {
  reset();
  seedClosedRaffleWithWinner({ raffleId: "raffle-a1", creatorId: CREATOR_A, title: "Rifa A1" });
  seedClosedRaffleWithWinner({ raffleId: "raffle-a2", creatorId: CREATOR_A, title: "Rifa A2" });
  seedClosedRaffleWithWinner({ raffleId: "raffle-b1", creatorId: CREATOR_B, title: "Rifa B1" });
  await ensureFulfillmentCaseForRaffle("raffle-a1");
  await ensureFulfillmentCaseForRaffle("raffle-a2");
  await ensureFulfillmentCaseForRaffle("raffle-b1");

  const casesA = await getCreatorCases(CREATOR_A);
  assert.equal(casesA.length, 2);
  assert.ok(casesA.every((c) => c.creator_id === CREATOR_A));

  const casesB = await getCreatorCases(CREATOR_B);
  assert.equal(casesB.length, 1);
  assert.equal(casesB[0].raffle_id, "raffle-b1");
});

test("caso inexistente: getCreatorCaseDetail devuelve null, nunca lanza", async () => {
  reset();
  const result = await getCreatorCaseDetail(CREATOR_A, "raffle-que-no-existe");
  assert.equal(result, null);
});

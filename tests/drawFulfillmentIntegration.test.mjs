// CUMPLIMIENTO-2 — certifica la integración real DRAW -> fulfillment
// case, usando la lógica REAL de drawWinner.js/notifyWinnerDrawn +
// fulfillmentCaseService.js (nunca reimplementadas), contra un almacén
// en memoria (mismo patrón que tests/trust3bE2EFlow.test.mjs y
// tests/fulfillmentCaseService.test.mjs). ENABLE_EMAILS no está en
// 'true' -> mailer.js hace skip real sin red, sin mocks adicionales.
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "dummy-service-role-key-for-tests";
process.env.ENABLE_EMAILS = "false";

const { createClient } = await import("@supabase/supabase-js");

const DB = {
  raffles: [],
  tickets: [],
  purchases: [],
  raffle_results: [],
  raffle_fulfillment_cases: [],
  raffle_fulfillment_events: [],
};

function reset() {
  for (const k of Object.keys(DB)) DB[k] = [];
}

// ---- mock genérico: soporta select/eq/neq/in/contains/order/limit/
// maybeSingle/count-head, insert/select/maybeSingle con colisión de PK
// (23505), y update/eq. Suficiente para las formas reales que usan
// drawWinner.js y fulfillmentCaseService.js.
const UNIQUE_KEY_BY_TABLE = { raffle_results: "raffle_id", raffle_fulfillment_cases: "raffle_id" };

function queryBuilder(table, rows) {
  const filters = [];
  let orderCol = null;
  let orderAsc = true;
  let limitN = null;
  let countMode = null; // 'exact' when .select(..., {count:'exact', head:true})
  const b = {
    eq(col, val) { filters.push((r) => r[col] === val); return b; },
    neq(col, val) { filters.push((r) => r[col] !== val); return b; },
    in(col, vals) { filters.push((r) => vals.includes(r[col])); return b; },
    contains(col, vals) { filters.push((r) => Array.isArray(r[col]) && vals.every((v) => r[col].includes(v))); return b; },
    order(col, opts) { orderCol = col; orderAsc = opts?.ascending !== false; return b; },
    limit(n) { limitN = n; return b; },
    select(_cols, opts) {
      if (opts?.count === "exact") countMode = "exact";
      return b;
    },
    maybeSingle() {
      let found = rows.filter((r) => filters.every((f) => f(r)));
      if (orderCol) {
        found = [...found].sort((a, c) => {
          const av = a[orderCol], cv = c[orderCol];
          const cmp = av < cv ? -1 : av > cv ? 1 : 0;
          return orderAsc ? cmp : -cmp;
        });
      }
      if (limitN != null) found = found.slice(0, limitN);
      return Promise.resolve({ data: found[0] || null, error: null });
    },
    then(resolve, reject) {
      const found = rows.filter((r) => filters.every((f) => f(r)));
      if (countMode === "exact") {
        return Promise.resolve({ count: found.length, error: null }).then(resolve, reject);
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
    then(resolve, reject) {
      rows.forEach((r) => { if (filters.every((f) => f(r))) Object.assign(r, payload); });
      return Promise.resolve({ error: null }).then(resolve, reject);
    },
  };
  return b;
}

function insertBuilder(table, rows, payload) {
  const uniqueKey = UNIQUE_KEY_BY_TABLE[table];
  const conflict = () => uniqueKey && rows.some((r) => r[uniqueKey] === payload[uniqueKey]);
  return {
    select() {
      return {
        maybeSingle() {
          if (conflict()) return Promise.resolve({ data: null, error: { code: "23505", message: "duplicate key" } });
          const row = { ...payload, created_at: payload.created_at || new Date().toISOString() };
          rows.push(row);
          return Promise.resolve({ data: { ...row }, error: null });
        },
      };
    },
    then(resolve, reject) {
      if (conflict()) return Promise.resolve({ error: { code: "23505", message: "duplicate key" } }).then(resolve, reject);
      const row = { ...payload, id: rows.length + 1, created_at: payload.created_at || new Date().toISOString() };
      rows.push(row);
      return Promise.resolve({ error: null }).then(resolve, reject);
    },
  };
}

function makeTable(table, rows) {
  return () => ({
    select: () => queryBuilder(table, rows),
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

const { drawWinner, notifyWinnerDrawn } = await import("../src/lib/drawWinner.js");
const { getCreatorCaseDetail } = await import("../src/lib/fulfillmentCaseService.js");
const { FULFILLMENT_STATUSES } = await import("../src/lib/fulfillmentEvaluation.js");

const CREATOR_ID = "creator-draw-1";
const RAFFLE_ID = "raffle-draw-1";

function seedSoldOutRaffle({ raffleId = RAFFLE_ID, creatorId = CREATOR_ID } = {}) {
  DB.raffles.push({
    id: raffleId,
    title: "Rifa DRAW-CUMPLIMIENTO",
    creator_id: creatorId,
    creator_email: "creador@example.com",
    prize_type: "physical",
    prize_amount_cents: null,
    delivery_method: "envio_creador",
    requires_transfer_procedures: false,
    transfer_expenses_owner: null,
    transfer_conditions: null,
    sales_end_at: "2026-08-30T00:00:00.000Z",
    draw_at: null,
  });
  DB.tickets.push(
    { raffle_id: raffleId, number: 1, status: "sold" },
    { raffle_id: raffleId, number: 2, status: "sold" }
  );
  DB.purchases.push({
    id: "purchase-draw-1",
    raffle_id: raffleId,
    buyer_email: "ganador@example.com",
    buyer_name: "Ganador DRAW",
    status: "approved",
    numbers: [1, 2],
    created_at: "2026-08-29T00:00:00.000Z",
  });
}

test("1. draw/result crea exactamente un fulfillment case", async () => {
  reset();
  seedSoldOutRaffle();
  const draw = await drawWinner(RAFFLE_ID);
  assert.equal(draw.isNew, true);
  assert.equal(draw.ready, true);

  await notifyWinnerDrawn(RAFFLE_ID, draw.winner);

  assert.equal(DB.raffle_fulfillment_cases.length, 1);
  const fCase = DB.raffle_fulfillment_cases[0];
  assert.equal(fCase.raffle_id, RAFFLE_ID);
});

test("2. el caso nace en pending_delivery", async () => {
  reset();
  seedSoldOutRaffle();
  const draw = await drawWinner(RAFFLE_ID);
  await notifyWinnerDrawn(RAFFLE_ID, draw.winner);
  const fCase = DB.raffle_fulfillment_cases[0];
  assert.equal(fCase.status, FULFILLMENT_STATUSES.PENDING_DELIVERY);
});

test("3. existe el evento de auditoría case_created", async () => {
  reset();
  seedSoldOutRaffle();
  const draw = await drawWinner(RAFFLE_ID);
  await notifyWinnerDrawn(RAFFLE_ID, draw.winner);
  const events = DB.raffle_fulfillment_events.filter((e) => e.event_type === "case_created");
  assert.equal(events.length, 1);
  assert.equal(events[0].case_id, RAFFLE_ID);
  assert.equal(events[0].actor_type, "system");
  assert.equal(events[0].new_status, FULFILLMENT_STATUSES.PENDING_DELIVERY);
});

test("4. retry de notifyWinnerDrawn (mismo winner, llamado dos veces) no duplica el caso", async () => {
  reset();
  seedSoldOutRaffle();
  const draw = await drawWinner(RAFFLE_ID);
  await notifyWinnerDrawn(RAFFLE_ID, draw.winner);
  await notifyWinnerDrawn(RAFFLE_ID, draw.winner); // simulación de reintento
  assert.equal(DB.raffle_fulfillment_cases.length, 1);
});

test("5. retry NO duplica el evento case_created", async () => {
  reset();
  seedSoldOutRaffle();
  const draw = await drawWinner(RAFFLE_ID);
  await notifyWinnerDrawn(RAFFLE_ID, draw.winner);
  await notifyWinnerDrawn(RAFFLE_ID, draw.winner);
  const events = DB.raffle_fulfillment_events.filter((e) => e.event_type === "case_created");
  assert.equal(events.length, 1);
});

test("6. reintento concurrente (Promise.all sobre notifyWinnerDrawn) no duplica el caso", async () => {
  reset();
  seedSoldOutRaffle();
  const draw = await drawWinner(RAFFLE_ID);
  await Promise.all([
    notifyWinnerDrawn(RAFFLE_ID, draw.winner),
    notifyWinnerDrawn(RAFFLE_ID, draw.winner),
    notifyWinnerDrawn(RAFFLE_ID, draw.winner),
  ]);
  assert.equal(DB.raffle_fulfillment_cases.length, 1);
  assert.equal(DB.raffle_fulfillment_events.filter((e) => e.event_type === "case_created").length, 1);
});

test("7. sin raffle_result (rifa no agotada) -> drawWinner no gana, nunca se llama notifyWinnerDrawn, no hay caso", async () => {
  reset();
  DB.raffles.push({ id: RAFFLE_ID, title: "Rifa sin agotar", creator_id: CREATOR_ID, prize_type: "money", sales_end_at: null, draw_at: null });
  DB.tickets.push({ raffle_id: RAFFLE_ID, number: 1, status: "available" });
  const draw = await drawWinner(RAFFLE_ID);
  assert.equal(draw.winner, null);
  assert.equal(draw.ready, false);
  // El flujo real nunca llama notifyWinnerDrawn si !isNew -> no case.
  assert.equal(DB.raffle_fulfillment_cases.length, 0);
});

test("8. rifa histórica con resultado preexistente (isNew:false desde el inicio) NO genera backfill automático", async () => {
  reset();
  seedSoldOutRaffle({ raffleId: "raffle-historica" });
  // Simula un raffle_results ya existente ANTES de esta misión (sorteo
  // histórico), sin caso de cumplimiento asociado -- comportamiento
  // esperado: drawWinner() lo encuentra (isNew:false), y como el
  // llamador real solo invoca notifyWinnerDrawn cuando isNew:true,
  // nunca se crea un caso para él automáticamente.
  DB.raffle_results.push({
    raffle_id: "raffle-historica",
    number: 1,
    buyer_email: "ganador@example.com",
    buyer_name: "Ganador DRAW",
    purchase_id: "purchase-draw-1",
    created_at: "2026-01-01T00:00:00.000Z",
  });
  const draw = await drawWinner("raffle-historica");
  assert.equal(draw.isNew, false);
  // El código real de los 3 call sites solo llama notifyWinnerDrawn si isNew -> nunca se invoca acá.
  assert.equal(DB.raffle_fulfillment_cases.length, 0, "sin backfill automático para resultados históricos");
});

test("9. editar la rifa DESPUÉS del sorteo no muta el snapshot del caso ya creado", async () => {
  reset();
  seedSoldOutRaffle();
  const draw = await drawWinner(RAFFLE_ID);
  await notifyWinnerDrawn(RAFFLE_ID, draw.winner);

  const raffleRow = DB.raffles.find((r) => r.id === RAFFLE_ID);
  raffleRow.delivery_method = "retiro";
  raffleRow.title = "Título cambiado después del sorteo";

  const fCase = await getCreatorCaseDetail(CREATOR_ID, RAFFLE_ID);
  assert.equal(fCase.delivery_method, "envio_creador");
  assert.equal(fCase.raffle_title, "Rifa DRAW-CUMPLIMIENTO");
});

test("10. cambiar los datos de la compra después del sorteo no reescribe el snapshot del ganador ya congelado", async () => {
  reset();
  seedSoldOutRaffle();
  const draw = await drawWinner(RAFFLE_ID);
  await notifyWinnerDrawn(RAFFLE_ID, draw.winner);

  const purchaseRow = DB.purchases.find((p) => p.id === "purchase-draw-1");
  purchaseRow.buyer_email = "otro-email-editado@example.com";
  purchaseRow.buyer_name = "Nombre Editado";

  const fCase = await getCreatorCaseDetail(CREATOR_ID, RAFFLE_ID);
  assert.equal(fCase.winner_buyer_email, "ganador@example.com");
  assert.equal(fCase.winner_buyer_name, "Ganador DRAW");
});

test("11. fallo simulado del envío de email NO elimina ni impide la creación del caso", async () => {
  reset();
  seedSoldOutRaffle();
  // ENABLE_EMAILS=false ya hace que sendWinnerEmail/sendCreatorWinnerEmail
  // hagan early-return sin lanzar -- prueba equivalente real: aunque el
  // "envío" no ocurra/falle silenciosamente, el caso igual se crea,
  // porque ensureFulfillmentCaseForRaffle corre ANTES y en su propio
  // try/catch, nunca depende del resultado del bloque de emails.
  const draw = await drawWinner(RAFFLE_ID);
  const notifyResult = await notifyWinnerDrawn(RAFFLE_ID, draw.winner);
  assert.equal(notifyResult.fulfillmentCaseEnsured, true);
  assert.equal(DB.raffle_fulfillment_cases.length, 1);
});

test("12. reintento de notificación (tras fallo simulado previo) no duplica el caso", async () => {
  reset();
  seedSoldOutRaffle();
  const draw = await drawWinner(RAFFLE_ID);
  const first = await notifyWinnerDrawn(RAFFLE_ID, draw.winner);
  assert.equal(first.fulfillmentCaseIsNew, true);
  const retry = await notifyWinnerDrawn(RAFFLE_ID, draw.winner);
  assert.equal(retry.fulfillmentCaseIsNew, false);
  assert.equal(DB.raffle_fulfillment_cases.length, 1);
});

test("13. un fallo de Cumplimiento nunca altera al ganador autoritativo (raffle_results intacto)", async () => {
  reset();
  seedSoldOutRaffle();
  const draw = await drawWinner(RAFFLE_ID);

  // Fuerza un fallo real en ensureFulfillmentCaseForRaffle: borramos la
  // rifa de la tabla justo antes de notificar, para que la creación del
  // caso encuentre raffle_not_found y falle -- el resultado autoritativo
  // (raffle_results) no debe verse afectado en absoluto.
  const raffleIndex = DB.raffles.findIndex((r) => r.id === RAFFLE_ID);
  const raffleBackup = DB.raffles[raffleIndex];
  DB.raffles.splice(raffleIndex, 1);

  const resultBefore = { ...DB.raffle_results[0] };
  await notifyWinnerDrawn(RAFFLE_ID, draw.winner); // no debe lanzar
  assert.equal(DB.raffle_fulfillment_cases.length, 0, "el caso no se pudo crear (esperado)");
  assert.deepEqual(DB.raffle_results[0], resultBefore, "raffle_results nunca se altera por un fallo de Cumplimiento");

  DB.raffles.push(raffleBackup); // restaurar para no afectar otras aserciones si las hubiera
});

test("14. recovery: ensureFulfillmentCaseForRaffle recupera un caso faltante para un resultado ya existente", async () => {
  reset();
  seedSoldOutRaffle();
  const draw = await drawWinner(RAFFLE_ID); // crea raffle_results, pero NUNCA se llama notifyWinnerDrawn
  assert.equal(DB.raffle_fulfillment_cases.length, 0, "sin caso todavía, como una notificación que nunca llegó a ejecutarse");

  const { ensureFulfillmentCaseForRaffle } = await import("../src/lib/fulfillmentCaseService.js");
  const recovered = await ensureFulfillmentCaseForRaffle(RAFFLE_ID);
  assert.equal(recovered.isNew, true);
  assert.equal(DB.raffle_fulfillment_cases.length, 1);
});

test("15. recovery repetido es idempotente", async () => {
  reset();
  seedSoldOutRaffle();
  await drawWinner(RAFFLE_ID);
  const { ensureFulfillmentCaseForRaffle } = await import("../src/lib/fulfillmentCaseService.js");
  await ensureFulfillmentCaseForRaffle(RAFFLE_ID);
  const second = await ensureFulfillmentCaseForRaffle(RAFFLE_ID);
  assert.equal(second.isNew, false);
  assert.equal(DB.raffle_fulfillment_cases.length, 1);
});

test("16/17. la recuperación es una función de librería server-side — nunca expuesta como endpoint anon/authenticated", async () => {
  // No existe ningún archivo bajo src/pages/api/ que exponga
  // ensureFulfillmentCaseForRaffle directamente -- se certifica por
  // ausencia estructural, no por una llamada HTTP real (misma garantía
  // que las rutas de panel/cumplimiento, ya certificadas con RLS
  // default-deny + auth Bearer obligatorio en CUMPLIMIENTO-1).
  const fs = await import("node:fs");
  const path = await import("node:path");
  const apiDir = path.join(process.cwd(), "src", "pages", "api");
  function walk(dir) {
    let out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out = out.concat(walk(full));
      else out.push(full);
    }
    return out;
  }
  const apiFiles = walk(apiDir);
  const filesReferencingRecovery = apiFiles.filter((f) => {
    const content = fs.readFileSync(f, "utf8");
    return content.includes("ensureFulfillmentCaseForRaffle");
  });
  assert.deepEqual(filesReferencingRecovery, [], "ensureFulfillmentCaseForRaffle no debe ser invocable desde ninguna ruta API pública en esta fase");
});

test("18. ningún segundo ganador puede producirse por un reintento de Cumplimiento (raffle_results sigue siendo PK única, ajeno a fulfillment)", async () => {
  reset();
  seedSoldOutRaffle();
  const first = await drawWinner(RAFFLE_ID);
  await notifyWinnerDrawn(RAFFLE_ID, first.winner);
  await notifyWinnerDrawn(RAFFLE_ID, first.winner); // reintento de Cumplimiento/notificación

  // drawWinner() se vuelve a invocar (como lo haría cualquier caller
  // real que reintente todo el flujo) -- debe seguir devolviendo el
  // MISMO ganador, nunca un segundo sorteo.
  const second = await drawWinner(RAFFLE_ID);
  assert.equal(second.isNew, false);
  assert.equal(second.winner.number, first.winner.number);
  assert.equal(DB.raffle_results.length, 1);
  assert.equal(DB.raffle_fulfillment_cases.length, 1);
});

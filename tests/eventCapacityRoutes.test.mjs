// tests/eventCapacityRoutes.test.mjs
// EVENT-8 — auditoría estructural de las rutas API que tocan aforo/
// asistencia en vivo. Estas rutas usan el alias @/ y no se pueden
// importar bajo node --test (mismo límite ya documentado en
// CUMPLIMIENTO-4/5/ONBOARDING+BANCOS/MP) — se certifica el código fuente
// real: que la validación de formato usa el módulo puro compartido, que
// el error del trigger se traduce a 409 legible, que la RPC de check-in
// (EVENT-4) sigue intacta, y que el contador de asistencia nunca se
// deriva de un campo mutable inventado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function readSrc(...segments) {
  return fs.readFileSync(path.join(process.cwd(), 'src', ...segments), 'utf8');
}

const eventsIndexSrc = readSrc('pages', 'api', 'events', 'index.js');
const eventByIdSrc = readSrc('pages', 'api', 'events', '[id]', 'index.js');
const ticketTypesIndexSrc = readSrc('pages', 'api', 'events', '[id]', 'ticket-types', 'index.js');
const ticketTypeByIdSrc = readSrc('pages', 'api', 'events', '[id]', 'ticket-types', '[typeId].js');
const checkInSrc = readSrc('pages', 'api', 'events', '[id]', 'check-in.js');

// ---------------------------------------------------------------------
// 23-26. Las cuatro rutas de escritura usan el mismo validador puro
// (nunca cuatro copias divergentes de la misma regla de formato).
// ---------------------------------------------------------------------

test('23: POST /api/events usa parseCapacityInput de @/lib/eventCapacity, no una regex/parseInt ad-hoc', () => {
  assert.match(eventsIndexSrc, /import\s*\{\s*parseCapacityInput\s*\}\s*from\s*'@\/lib\/eventCapacity'/);
  assert.match(eventsIndexSrc, /parseCapacityInput\(body\.capacity\)/);
});

test('24: PATCH /api/events/[id] usa el mismo parseCapacityInput compartido', () => {
  assert.match(eventByIdSrc, /import\s*\{\s*parseCapacityInput\s*\}\s*from\s*'@\/lib\/eventCapacity'/);
  assert.match(eventByIdSrc, /parseCapacityInput\(body\.capacity\)/);
});

test('25: ninguna de las dos rutas de eventos duplica la aritmética de redondeo/validación fuera del módulo compartido', () => {
  for (const src of [eventsIndexSrc, eventByIdSrc]) {
    assert.doesNotMatch(src, /Math\.round\(Number\(body\.capacity\)\)/, 'la validación de capacity debe vivir solo en eventCapacity.js');
  }
});

// ---------------------------------------------------------------------
// 27-30. Traducción del error del trigger SQL (P0001 /
// event_capacity_exceeded) a 409 legible en las tres rutas que pueden
// dispararlo: creación/edición de evento, creación/edición de tipo.
// ---------------------------------------------------------------------

test('27: PATCH /api/events/[id] traduce el error del trigger de capacidad a 409 event_capacity_exceeded', () => {
  assert.match(eventByIdSrc, /P0001/);
  assert.match(eventByIdSrc, /event_capacity_exceeded/);
  assert.match(eventByIdSrc, /res\.status\(409\)\.json\(\{ ok: false, error: 'event_capacity_exceeded' \}\)/);
});

test('28: POST /api/events/[id]/ticket-types traduce el error del trigger a 409 (crear un tipo que excede el aforo)', () => {
  assert.match(ticketTypesIndexSrc, /P0001/);
  assert.match(ticketTypesIndexSrc, /res\.status\(409\)\.json\(\{ ok: false, error: 'event_capacity_exceeded' \}\)/);
});

test('29: PATCH /api/events/[id]/ticket-types/[typeId] traduce el error del trigger a 409 (subir cupo o reactivar un tipo)', () => {
  assert.match(ticketTypeByIdSrc, /P0001/);
  assert.match(ticketTypeByIdSrc, /res\.status\(409\)\.json\(\{ ok: false, error: 'event_capacity_exceeded' \}\)/);
});

test('30: las tres traducciones ocurren ANTES de propagar el error como 500 genérico (throw solo en el else)', () => {
  for (const src of [eventByIdSrc, ticketTypesIndexSrc, ticketTypeByIdSrc]) {
    const p0001Idx = src.indexOf('P0001');
    const throwIdx = src.indexOf('throw', p0001Idx);
    assert.ok(p0001Idx > -1 && throwIdx > p0001Idx, 'el chequeo de P0001 debe preceder al throw genérico');
  }
});

// ---------------------------------------------------------------------
// 31-40. check-in.js: contador de asistencia en vivo, nunca una segunda
// fuente de verdad, la RPC de EVENT-4 queda intacta.
// ---------------------------------------------------------------------

test('31: check-in.js sigue invocando exactamente check_in_event_ticket — la RPC de EVENT-4 no fue tocada ni reimplementada', () => {
  assert.match(checkInSrc, /supabase\.rpc\('check_in_event_ticket',/);
  const rpcCalls = checkInSrc.match(/supabase\.rpc\(/g) || [];
  assert.equal(rpcCalls.length, 1, 'check-in.js debe invocar una sola RPC — nunca una segunda para "contar"');
});

test('32: fetchAttendance deriva SIEMPRE de event_tickets.used_at, nunca de una columna mutable en events/event_staff', () => {
  const start = checkInSrc.indexOf('async function fetchAttendance');
  assert.ok(start > -1);
  const fn = checkInSrc.slice(start, checkInSrc.indexOf('\n}', start) + 2);
  assert.match(fn, /event_tickets/);
  assert.match(fn, /not\('used_at', 'is', null\)/);
  assert.doesNotMatch(fn, /checked_in_count|attendance_count/i, 'nunca debe leer un contador mutable inventado');
});

test('33: fetchAttendance nunca escribe (solo .select, nunca .update/.insert/.upsert)', () => {
  const start = checkInSrc.indexOf('async function fetchAttendance');
  const fn = checkInSrc.slice(start, checkInSrc.indexOf('\n}', start) + 2);
  assert.doesNotMatch(fn, /\.(update|insert|upsert|delete)\(/);
});

test('34: GET (ping) solo adjunta attendance cuando authorized=true — nunca expone el conteo a quien no puede operar el scanner', () => {
  const getBlockStart = checkInSrc.indexOf("if (req.method === 'GET')");
  const getBlockEnd = checkInSrc.indexOf("if (req.method === 'POST')");
  const block = checkInSrc.slice(getBlockStart, getBlockEnd);
  assert.match(block, /const attendance = authorized \? await fetchAttendance\(eventId\) : null/);
});

test('35: POST adjunta attendance tanto en respuestas ok=true como ok=false (pass, already_used, void, cross-event, etc.)', () => {
  const postBlockStart = checkInSrc.indexOf("if (req.method === 'POST')");
  const block = checkInSrc.slice(postBlockStart);
  assert.match(block, /res\.status\(status\)\.json\(\{ \.\.\.rpcResult, attendance \}\)/);
  assert.match(block, /res\.status\(200\)\.json\(\{ \.\.\.rpcResult, attendance \}\)/);
});

test('36: attendance se calcula DESPUÉS de la RPC, nunca antes (no puede reflejar un check-in que aún no ocurrió)', () => {
  const postBlockStart = checkInSrc.indexOf("if (req.method === 'POST')");
  const block = checkInSrc.slice(postBlockStart);
  const rpcIdx = block.indexOf("supabase.rpc('check_in_event_ticket'");
  const attendanceIdx = block.indexOf('fetchAttendance(eventId)');
  assert.ok(rpcIdx > -1 && attendanceIdx > rpcIdx, 'fetchAttendance debe llamarse después de resolver la RPC');
});

test('37: fetchAttendance nunca expone qr_token/access_token/PII — solo count + capacity', () => {
  const start = checkInSrc.indexOf('async function fetchAttendance');
  const fn = checkInSrc.slice(start, checkInSrc.indexOf('\n}', start) + 2);
  assert.doesNotMatch(fn, /qr_token|access_token|buyer_email|user_email_snapshot/);
});

test('38: check-in.js sigue sin exponer analytics financiero — canViewEventAnalytics/gross_/commission_ nunca aparecen acá', () => {
  assert.doesNotMatch(checkInSrc, /canViewEventAnalytics|gross_|commission_|net_estimated/);
});

test('39: la ruta ticket-types/index.js sigue sin exponer el trigger a nadie fuera del owner (POST sigue detrás de not_your_event)', () => {
  assert.match(ticketTypesIndexSrc, /not_your_event/);
});

test('40: la ruta PATCH de evento sigue exigiendo assertCreatorEligible antes de aplicar cualquier patch (incluida capacity)', () => {
  const patchStart = eventByIdSrc.indexOf("if (req.method === 'PATCH')");
  const eligIdx = eventByIdSrc.indexOf('assertCreatorEligible', patchStart);
  const capIdx = eventByIdSrc.indexOf('parseCapacityInput(body.capacity)', patchStart);
  assert.ok(eligIdx > -1 && capIdx > eligIdx, 'la elegibilidad debe validarse antes de tocar el patch de capacity');
});

// tests/eventAnalyticsWorkbook.test.mjs
// EVENT-5 — construcción real del workbook (ExcelJS): estructura de 5
// hojas, neutralización de formula injection en celdas reales, y una
// prueba de estrés con datos sintéticos en los límites máximos (20.000
// órdenes/entradas/check-ins + 500 staff) para medir tiempo real de
// writeBuffer() y tamaño real del archivo — nunca asumido, siempre medido.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { computeEventAnalyticsSummary, ANALYTICS_LIMITS } from '../src/lib/eventAnalytics.js';
import { buildEventAnalyticsWorkbook } from '../src/lib/eventAnalyticsWorkbook.js';

function baseEvent(overrides = {}) {
  return {
    id: 'ev-1', organizer_id: 'org-1', title: 'Evento con "comillas" / raros',
    status: 'published', starts_at: '2026-09-01T20:00:00.000Z', ends_at: '2026-09-02T02:00:00.000Z',
    timezone: 'America/Santiago', ...overrides,
  };
}

async function readWorkbookFromBuffer(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}

test('el workbook tiene exactamente las 5 hojas obligatorias, en el orden especificado', async () => {
  const data = {
    event: baseEvent(),
    ticketTypes: [{ id: 'tt1', name: 'General', quantity_total: 10, quantity_sold: 1, quantity_reserved: 0 }],
    orders: [{ id: 'o1', status: 'paid', currency: 'CLP', total_cents: 1000, platform_fee_cents: 70, refund_required: false, buyer_name: 'Ana', buyer_email: 'ana@example.com', paid_at: '2026-08-20T12:00:00.000Z', created_at: '2026-08-20T11:00:00.000Z' }],
    orderItems: [{ order_id: 'o1', quantity: 1, ticket_type_name_snapshot: 'General' }],
    tickets: [{ id: 't1', order_id: 'o1', ticket_type_id: 'tt1', ticket_type_name_snapshot: 'General', ticket_number: 'RFX-1', status: 'valid', issued_at: '2026-08-20T12:00:00.000Z', used_at: null }],
    checkins: [], staff: [],
  };
  const summary = computeEventAnalyticsSummary(data);
  const wb = buildEventAnalyticsWorkbook(data, summary);
  const names = wb.worksheets.map((ws) => ws.name);
  assert.deepEqual(names, ['Resumen', 'Órdenes-Ventas', 'Entradas', 'Check-ins', 'Personal de acceso']);
});

test('formula injection en buyer_name/título/tipo de entrada queda neutralizada como texto literal en las celdas reales', async () => {
  const data = {
    event: baseEvent({ title: '=cmd|/c calc' }),
    ticketTypes: [{ id: 'tt1', name: '+HYPERLINK("evil")', quantity_total: 5, quantity_sold: 1, quantity_reserved: 0 }],
    orders: [{ id: 'o1', status: 'paid', currency: 'CLP', total_cents: 1000, platform_fee_cents: 70, refund_required: false, buyer_name: '=1+1', buyer_email: '@malicious', paid_at: '2026-08-20T12:00:00.000Z', created_at: '2026-08-20T11:00:00.000Z' }],
    orderItems: [],
    tickets: [{ id: 't1', order_id: 'o1', ticket_type_id: 'tt1', ticket_type_name_snapshot: '-DROP TABLE', ticket_number: '=SUM(A1:A9)', status: 'valid', issued_at: '2026-08-20T12:00:00.000Z', used_at: null }],
    checkins: [], staff: [],
  };
  const summary = computeEventAnalyticsSummary(data);
  const wb = buildEventAnalyticsWorkbook(data, summary);
  const buffer = await wb.xlsx.writeBuffer();
  const reloaded = await readWorkbookFromBuffer(buffer);

  const ordersSheet = reloaded.getWorksheet('Órdenes-Ventas');
  const buyerNameCell = ordersSheet.getRow(2).getCell(4).value; // Comprador (nombre)
  const buyerEmailCell = ordersSheet.getRow(2).getCell(5).value; // Comprador (email)
  assert.equal(String(buyerNameCell).startsWith("'="), true, 'buyer_name que empieza con = debe quedar como texto, nunca como fórmula');
  assert.equal(String(buyerEmailCell).startsWith("'@"), true);

  const ticketsSheet = reloaded.getWorksheet('Entradas');
  const ticketNumberCell = ticketsSheet.getRow(2).getCell(1).value;
  const typeNameCell = ticketsSheet.getRow(2).getCell(2).value;
  assert.equal(String(ticketNumberCell).startsWith("'="), true);
  assert.equal(String(typeNameCell).startsWith("'-"), true);
});

test('exactamente en los cuatro límites máximos (20.000/20.000/20.000/500): writeBuffer completa en tiempo y tamaño razonables', async () => {
  const N = ANALYTICS_LIMITS.MAX_TICKETS; // 20000 — mismo tope para orders/tickets/checkins en este escenario
  const STAFF_N = ANALYTICS_LIMITS.MAX_STAFF; // 500

  const ticketTypes = [{ id: 'tt1', name: 'General', quantity_total: N, quantity_sold: N, quantity_reserved: 0 }];
  const orders = [];
  const orderItems = [];
  const tickets = [];
  const checkins = [];
  const staff = [];

  for (let i = 0; i < N; i++) {
    const orderId = `o${i}`;
    orders.push({
      id: orderId, status: i % 7 === 0 ? 'approved_unfulfilled' : 'paid', currency: 'CLP',
      total_cents: 10000, platform_fee_cents: 700, refund_required: i % 50 === 0,
      buyer_name: `Comprador ${i}`, buyer_email: `comprador${i}@example.com`,
      paid_at: `2026-08-${String((i % 27) + 1).padStart(2, '0')}T12:00:00.000Z`,
      created_at: `2026-08-${String((i % 27) + 1).padStart(2, '0')}T11:00:00.000Z`,
    });
    orderItems.push({ order_id: orderId, quantity: 1, ticket_type_name_snapshot: 'General' });
    const ticketId = `t${i}`;
    tickets.push({
      id: ticketId, order_id: orderId, ticket_type_id: 'tt1', ticket_type_name_snapshot: 'General',
      ticket_number: `RFX-EVT-${i}`, status: i % 11 === 0 ? 'void' : 'valid',
      issued_at: '2026-08-20T12:00:00.000Z', used_at: i % 3 === 0 ? '2026-08-25T14:00:00.000Z' : null,
    });
    checkins.push({ id: `c${i}`, ticket_id: ticketId, checked_in_by: i % 2 === 0 ? 'org-1' : `staff-${i % STAFF_N}`, checked_in_at: '2026-08-25T14:00:00.000Z' });
  }
  for (let i = 0; i < STAFF_N; i++) {
    staff.push({ id: `s${i}`, user_id: `staff-${i}`, role: 'door', status: 'active', user_email_snapshot: `staff${i}@example.com`, created_at: '2026-08-01T00:00:00.000Z' });
  }

  const data = { event: baseEvent(), ticketTypes, orders, orderItems, tickets, checkins, staff };

  const t0 = Date.now();
  const summary = computeEventAnalyticsSummary(data);
  const wb = buildEventAnalyticsWorkbook(data, summary);
  const buffer = await wb.xlsx.writeBuffer();
  const elapsedMs = Date.now() - t0;

  console.log(`[stress] N=${N} filas/hoja principal, elapsed=${elapsedMs}ms, buffer=${(buffer.byteLength / 1024 / 1024).toFixed(2)}MB`);

  assert.ok(buffer.byteLength > 0, 'el buffer generado no debe estar vacío');
  // Umbral real, no arbitrario: medido en ~15s tras cachear los
  // Intl.DateTimeFormat (ver eventAnalytics.js) — antes de ese fix real
  // tardaba ~29-30s. 20s deja margen de variancia de CI sin dejar de
  // detectar una regresión de rendimiento como la que este mismo test
  // encontró.
  assert.ok(elapsedMs < 20000, `writeBuffer no debe tardar más de 20s en los límites máximos (tardó ${elapsedMs}ms)`);

  const reloaded = await readWorkbookFromBuffer(buffer);
  assert.equal(reloaded.worksheets.length, 5);
  const ticketsSheet = reloaded.getWorksheet('Entradas');
  assert.equal(ticketsSheet.rowCount, N + 1, 'una fila por ticket + encabezado');
});

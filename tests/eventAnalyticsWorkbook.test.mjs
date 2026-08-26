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

test('las 5 hojas tienen fila 1 congelada; las 4 hojas tabulares además tienen autofiltro (hallazgo real de la sesión de certificación)', async () => {
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
  const buffer = await wb.xlsx.writeBuffer();
  const reloaded = await readWorkbookFromBuffer(buffer);

  for (const name of ['Resumen', 'Órdenes-Ventas', 'Entradas', 'Check-ins', 'Personal de acceso']) {
    const ws = reloaded.getWorksheet(name);
    assert.ok(ws.views?.some((v) => v.state === 'frozen' && v.ySplit === 1), `${name} debe tener la fila 1 congelada`);
  }
  for (const name of ['Órdenes-Ventas', 'Entradas', 'Check-ins', 'Personal de acceso']) {
    const ws = reloaded.getWorksheet(name);
    assert.ok(ws.autoFilter, `${name} debe tener autofiltro`);
  }
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

// ===========================================================================
// Correcciones visuales (auditoría independiente post-aceptación manual de
// Rodrigo): anchos de columna, wrapText, formato moneda CLP, y renombre de
// encabezados técnicos. Reutiliza un dataset con contenido deliberadamente
// largo (nombres/emails/tipos sin tope corto de negocio) para demostrar que
// ya no hay overlap/corte, no solo que "se ve bien" con datos cortos.
// ===========================================================================
function longContentData(overrides = {}) {
  return {
    event: baseEvent({ title: 'Un título de evento deliberadamente largo para probar el wrap de la celda Evento en la hoja Resumen, cerca del máximo de 140 caracteres permitido' }),
    ticketTypes: [{ id: 'tt1', name: 'Entrada General de Temporada — Acceso Completo al Recinto y Zonas VIP', quantity_total: 10, quantity_sold: 2, quantity_reserved: 0 }],
    orders: [{
      id: 'o1', status: 'paid', currency: 'CLP', total_cents: 2603000, platform_fee_cents: 203000, refund_required: true,
      buyer_name: 'María Fernanda de los Ángeles Contreras Rodríguez', buyer_email: 'maria.fernanda.contreras.rodriguez.compras@correo-empresa-larga.example.com',
      paid_at: '2026-08-20T12:00:00.000Z', created_at: '2026-08-20T11:00:00.000Z',
    }],
    orderItems: [{ order_id: 'o1', quantity: 2, ticket_type_name_snapshot: 'Entrada General de Temporada — Acceso Completo al Recinto y Zonas VIP' }],
    tickets: [{
      id: 't1', order_id: 'o1', ticket_type_id: 'tt1',
      ticket_type_name_snapshot: 'Entrada General de Temporada — Acceso Completo al Recinto y Zonas VIP',
      ticket_number: 'RFX-EVT-ABCDEF', status: 'valid', issued_at: '2026-08-20T12:00:00.000Z', used_at: null,
    }],
    checkins: [{ id: 'c1', ticket_id: 't1', checked_in_by: 'staff-1', checked_in_at: '2026-08-25T14:00:00.000Z' }],
    staff: [{ id: 's1', user_id: 'staff-1', role: 'door', status: 'active', user_email_snapshot: 'colaborador.puerta.principal.turno.tarde@correo-empresa-larga.example.com', created_at: '2026-08-01T00:00:00.000Z' }],
    ...overrides,
  };
}

const ERROR_PATTERNS = ['#REF!', '#VALUE!', '#DIV/0!', '#NAME?', '#NULL!', '#NUM!', '#N/A'];

test('montos CLP: numéricos (nunca texto) y con formato de moneda chilena, valor subyacente sin alterar', async () => {
  const data = longContentData();
  const summary = computeEventAnalyticsSummary(data);
  const wb = buildEventAnalyticsWorkbook(data, summary);
  const buffer = await wb.xlsx.writeBuffer();
  const reloaded = await readWorkbookFromBuffer(buffer);

  const wsOrders = reloaded.getWorksheet('Órdenes-Ventas');
  const totalCell = wsOrders.getRow(2).getCell(7); // Total
  const feeCell = wsOrders.getRow(2).getCell(8); // Comisión
  assert.equal(typeof totalCell.value, 'number', 'Total debe seguir siendo un número, nunca texto');
  assert.equal(totalCell.value, 26030, 'el valor numérico subyacente (centsToUnit) no debe cambiar');
  assert.equal(totalCell.numFmt, '"$"#,##0');
  assert.equal(typeof feeCell.value, 'number');
  assert.equal(feeCell.numFmt, '"$"#,##0');

  const wsSummary = reloaded.getWorksheet('Resumen');
  let grossRow = null;
  wsSummary.eachRow((row) => { if (String(row.getCell(1).value ?? '') === 'Recaudación aprobada total') grossRow = row; });
  assert.ok(grossRow, 'la fila de recaudación aprobada total debe existir');
  assert.equal(typeof grossRow.getCell(2).value, 'number');
  assert.equal(grossRow.getCell(2).numFmt, '"$"#,##0');
});

test('encabezados técnicos fueron renombrados a nombres comprensibles; los nombres crudos ya no aparecen como encabezado', async () => {
  const data = longContentData();
  const summary = computeEventAnalyticsSummary(data);
  const wb = buildEventAnalyticsWorkbook(data, summary);
  const buffer = await wb.xlsx.writeBuffer();
  const reloaded = await readWorkbookFromBuffer(buffer);

  const wsTickets = reloaded.getWorksheet('Entradas');
  const ticketsHeaderValues = wsTickets.getRow(1).values.filter(Boolean);
  assert.ok(ticketsHeaderValues.includes('Número de entrada'));
  assert.ok(ticketsHeaderValues.includes('Fecha de ingreso'));
  assert.ok(!ticketsHeaderValues.includes('ticket_number'));
  assert.ok(!ticketsHeaderValues.includes('Ingresó (used_at)'));

  const wsOrders = reloaded.getWorksheet('Órdenes-Ventas');
  const ordersHeaderValues = wsOrders.getRow(1).values.filter(Boolean);
  assert.ok(ordersHeaderValues.includes('Reembolso pendiente'));
  assert.ok(!ordersHeaderValues.includes('Refund requerido'));

  const wsCheckins = reloaded.getWorksheet('Check-ins');
  const checkinsHeaderValues = wsCheckins.getRow(1).values.filter(Boolean);
  assert.ok(checkinsHeaderValues.includes('Número de entrada'));

  const wsSummary = reloaded.getWorksheet('Resumen');
  const summaryLabels = [];
  wsSummary.eachRow((row) => summaryLabels.push(String(row.getCell(1).value ?? '')));
  assert.ok(summaryLabels.includes('Ingresadas válidas'), 'Resumen debe decir "Ingresadas válidas", no solo "Ingresadas"');
  assert.ok(!summaryLabels.includes('Ingresadas'), 'la etiqueta ambigua original ya no debe existir');
  assert.ok(summaryLabels.includes('Órdenes con reembolso pendiente'));
  assert.ok(summaryLabels.includes('Monto con reembolso pendiente'));
  assert.ok(!summaryLabels.some((l) => l.includes('refund_required')), 'ningún nombre crudo de columna debe quedar visible');
});

test('ninguna celda de texto que exceda el ancho de su columna queda sin wrapText — nunca se superpone ni se corta', async () => {
  const data = longContentData();
  const summary = computeEventAnalyticsSummary(data);
  const wb = buildEventAnalyticsWorkbook(data, summary);
  const buffer = await wb.xlsx.writeBuffer();
  const reloaded = await readWorkbookFromBuffer(buffer);

  let checked = 0;
  for (const ws of reloaded.worksheets) {
    const colWidths = ws.columns.map((c) => c.width || 10);
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // encabezado, ya cubierto por styleHeaderRow (siempre wrap)
      row.eachCell((cell, colNumber) => {
        if (typeof cell.value !== 'string') return;
        const width = colWidths[colNumber - 1] || 10;
        if (cell.value.length > width) {
          checked += 1;
          assert.equal(cell.alignment?.wrapText, true, `${ws.name} col ${colNumber}: "${cell.value}" (${cell.value.length} car.) excede el ancho (${width}) sin wrapText`);
        }
      });
    });
  }
  assert.ok(checked > 0, 'el dataset de prueba debe contener al menos una celda realmente más larga que su columna (si no, la prueba no prueba nada)');
});

test('el archivo generado no contiene errores de fórmula (#REF!/#VALUE!/#DIV/0!/etc.) en ninguna celda', async () => {
  const data = longContentData();
  const summary = computeEventAnalyticsSummary(data);
  const wb = buildEventAnalyticsWorkbook(data, summary);
  const buffer = await wb.xlsx.writeBuffer();
  const reloaded = await readWorkbookFromBuffer(buffer);

  for (const ws of reloaded.worksheets) {
    ws.eachRow((row) => {
      row.eachCell((cell) => {
        const v = String(cell.value ?? '');
        for (const pattern of ERROR_PATTERNS) {
          assert.ok(!v.includes(pattern), `${ws.name}: celda con error de fórmula ${pattern}: "${v}"`);
        }
      });
    });
  }
});

test('el archivo generado no contiene secretos: sin JWT, sin password, sin UUID completo de 36 caracteres', async () => {
  const data = longContentData();
  const summary = computeEventAnalyticsSummary(data);
  const wb = buildEventAnalyticsWorkbook(data, summary);
  const buffer = await wb.xlsx.writeBuffer();
  const reloaded = await readWorkbookFromBuffer(buffer);

  const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  for (const ws of reloaded.worksheets) {
    ws.eachRow((row) => {
      row.eachCell((cell) => {
        const v = String(cell.value ?? '');
        assert.ok(!v.startsWith('eyJ'), `${ws.name}: posible JWT expuesto: "${v.slice(0, 20)}..."`);
        assert.ok(!/password/i.test(v), `${ws.name}: mención de password: "${v}"`);
        assert.ok(!uuidPattern.test(v), `${ws.name}: UUID completo de 36 caracteres expuesto: "${v}"`);
      });
    });
  }
});

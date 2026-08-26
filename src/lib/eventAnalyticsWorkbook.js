// src/lib/eventAnalyticsWorkbook.js
// EVENT-5 — construcción del workbook XLSX (ExcelJS) a partir de los datos
// crudos (fetchEventAnalyticsData) y el resumen calculado
// (computeEventAnalyticsSummary), ambos en src/lib/eventAnalytics.js.
// Cinco hojas obligatorias: Resumen, Órdenes-Ventas, Entradas, Check-ins,
// Personal de acceso. Nunca qr_token, nunca access_token, nunca campos
// internos innecesarios, nunca enriquecimiento desde auth.users.
import ExcelJS from 'exceljs';
import { formatEventDateTime, neutralizeFormulaInjection, ANALYTICS_LIMITS } from './eventAnalytics.js';

const ALERT_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
const HEADER_FONT = { bold: true };

const ORDER_STATUS_LABEL = {
  pending: 'Pendiente',
  paid: 'Pagada (cumplida)',
  expired: 'Expirada',
  cancelled: 'Cancelada',
  approved_unfulfilled: 'Aprobada sin emitir',
};

function centsToUnit(cents) {
  return Math.round((Number(cents) || 0) / 100);
}

function shortId(id) {
  return String(id || '').slice(0, 8);
}

function styleHeaderRow(row) {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
  });
}

function nz(v) {
  return neutralizeFormulaInjection(v);
}

/**
 * Construye el workbook completo. Lanza si algún límite ya fue excedido —
 * el caller (endpoint) debe llamar checkAnalyticsLimits ANTES de esta
 * función, nunca depender de esta función para truncar silenciosamente.
 */
export function buildEventAnalyticsWorkbook(data, summary) {
  const { event, orders, orderItems, tickets, checkins, staff } = data;
  const tz = event.timezone || 'America/Santiago';

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Rifex';
  wb.created = new Date();

  // ---- Hoja 1: Resumen ----
  const wsSummary = wb.addWorksheet('Resumen');
  wsSummary.columns = [{ width: 42 }, { width: 24 }];
  wsSummary.addRow(['Evento', nz(event.title)]);
  wsSummary.addRow(['Estado', event.status === 'cancelled' ? 'Cancelado (sigue siendo consultable)' : event.status]);
  wsSummary.addRow(['Zona horaria', tz]);
  wsSummary.addRow([]);

  const opRows = [
    ['Capacidad', summary.operational.capacity],
    ['Vendidas', summary.operational.sold],
    ['Emitidas totales', summary.operational.emitted_total],
    ['Válidas', summary.operational.valid],
    ['Anuladas', summary.operational.voided],
    ['Anuladas usadas antes de anularse', summary.operational.voided_used_before_void],
    ['Ingresadas', summary.operational.checked_in],
    ['Pendientes de ingreso', summary.operational.pending_check_in],
    ['% asistencia', summary.operational.attendance_rate === null ? '—' : `${Math.round(summary.operational.attendance_rate * 1000) / 10}%`],
  ];
  wsSummary.addRow(['KPIs operacionales', '']);
  styleHeaderRow(wsSummary.lastRow);
  for (const r of opRows) {
    const row = wsSummary.addRow(r);
    if (r[0] === 'Anuladas usadas antes de anularse' && Number(r[1]) > 0) row.eachCell((c) => { c.fill = ALERT_FILL; });
  }

  wsSummary.addRow([]);
  wsSummary.addRow(['KPIs financieros', `Moneda: ${summary.financial.currency}`]);
  styleHeaderRow(wsSummary.lastRow);
  const finRows = [
    ['Recaudación aprobada total', centsToUnit(summary.financial.gross_approved_total_cents)],
    ['Recaudación cumplida', centsToUnit(summary.financial.gross_fulfilled_cents)],
    ['Aprobada sin emitir', centsToUnit(summary.financial.gross_unfulfilled_cents)],
    ['Comisión Rifex total', centsToUnit(summary.financial.commission_total_cents)],
    ['Comisión asociada a pagos sin fulfillment', centsToUnit(summary.financial.commission_unfulfilled_cents)],
    ['Neto estimado (no conciliado con Mercado Pago)', centsToUnit(summary.financial.net_estimated_cents)],
    ['Órdenes con refund_required', summary.financial.refund_required_count],
    ['Monto con refund_required', centsToUnit(summary.financial.refund_required_cents)],
  ];
  for (const r of finRows) {
    const row = wsSummary.addRow(r);
    if ((r[0] === 'Aprobada sin emitir' || r[0] === 'Comisión asociada a pagos sin fulfillment') && Number(r[1]) > 0) {
      row.eachCell((c) => { c.fill = ALERT_FILL; });
    }
    if (r[0] === 'Órdenes con refund_required' && Number(r[1]) > 0) row.eachCell((c) => { c.fill = ALERT_FILL; });
  }

  wsSummary.addRow([]);
  wsSummary.addRow(['Desglose por tipo de entrada', '']);
  styleHeaderRow(wsSummary.lastRow);
  const byTypeHeader = wsSummary.addRow(['Tipo', 'Capacidad', 'Vendidas', 'Emitidas', 'Válidas', 'Ingresadas']);
  styleHeaderRow(byTypeHeader);
  for (const t of summary.analytics.by_ticket_type) {
    wsSummary.addRow([nz(t.name), t.capacity, t.sold, t.emitted_total, t.valid, t.checked_in]);
  }

  // ---- Hoja 2: Órdenes-Ventas ----
  const wsOrders = wb.addWorksheet('Órdenes-Ventas');
  const orderQtyByOrderId = new Map();
  for (const it of orderItems) {
    orderQtyByOrderId.set(it.order_id, (orderQtyByOrderId.get(it.order_id) || 0) + (Number(it.quantity) || 0));
  }
  const ordersHeader = wsOrders.addRow(['ID orden', 'Fecha', 'Estado', 'Comprador (nombre)', 'Comprador (email)', 'Cantidad', 'Total', 'Comisión', 'Fulfillment', 'Refund requerido']);
  styleHeaderRow(ordersHeader);
  wsOrders.columns = [
    { width: 12 }, { width: 20 }, { width: 20 }, { width: 26 }, { width: 28 },
    { width: 10 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 16 },
  ];
  for (const o of orders) {
    const fulfillment = o.status === 'paid' ? 'Completo' : o.status === 'approved_unfulfilled' ? 'Sin emitir' : '—';
    const row = wsOrders.addRow([
      shortId(o.id),
      formatEventDateTime(o.paid_at || o.created_at, tz),
      ORDER_STATUS_LABEL[o.status] || o.status,
      nz(o.buyer_name || ''),
      nz(o.buyer_email || ''),
      orderQtyByOrderId.get(o.id) || 0,
      centsToUnit(o.total_cents),
      centsToUnit(o.platform_fee_cents),
      fulfillment,
      o.refund_required ? 'Sí' : 'No',
    ]);
    if (o.status === 'approved_unfulfilled' || o.refund_required) row.eachCell((c) => { c.fill = ALERT_FILL; });
  }

  // ---- Hoja 3: Entradas ----
  const wsTickets = wb.addWorksheet('Entradas');
  const ticketsHeader = wsTickets.addRow(['ticket_number', 'Tipo', 'Válida/Anulada', 'Emitida', 'Ingresó (used_at)', 'Usada antes de anular', 'Orden']);
  styleHeaderRow(ticketsHeader);
  wsTickets.columns = [
    { width: 20 }, { width: 24 }, { width: 16 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 12 },
  ];
  for (const t of tickets) {
    const usedBeforeVoid = t.status === 'void' && !!t.used_at;
    const row = wsTickets.addRow([
      nz(t.ticket_number),
      nz(t.ticket_type_name_snapshot),
      t.status === 'void' ? 'Anulada' : 'Válida',
      formatEventDateTime(t.issued_at, tz),
      t.used_at ? formatEventDateTime(t.used_at, tz) : '—',
      usedBeforeVoid ? 'Sí' : 'No',
      shortId(t.order_id),
    ]);
    if (usedBeforeVoid) row.eachCell((c) => { c.fill = ALERT_FILL; });
  }

  // ---- Hoja 4: Check-ins ----
  const wsCheckins = wb.addWorksheet('Check-ins');
  const ticketsById = new Map(tickets.map((t) => [t.id, t]));
  const staffByUserId = new Map(staff.map((s) => [s.user_id, s]));
  const checkinsHeader = wsCheckins.addRow(['Hora', 'ticket_number', 'Tipo', 'Registrado por']);
  styleHeaderRow(checkinsHeader);
  wsCheckins.columns = [{ width: 20 }, { width: 20 }, { width: 24 }, { width: 28 }];
  const sortedCheckins = [...checkins].sort((a, b) => new Date(a.checked_in_at) - new Date(b.checked_in_at));
  for (const c of sortedCheckins) {
    const ticket = ticketsById.get(c.ticket_id);
    const isOrganizer = c.checked_in_by === event.organizer_id;
    const staffRow = staffByUserId.get(c.checked_in_by);
    const registeredBy = isOrganizer
      ? 'Organizador'
      : nz(staffRow?.user_email_snapshot || 'Personal de acceso');
    wsCheckins.addRow([
      formatEventDateTime(c.checked_in_at, tz),
      ticket ? nz(ticket.ticket_number) : '—',
      ticket ? nz(ticket.ticket_type_name_snapshot) : '—',
      registeredBy,
    ]);
  }

  // ---- Hoja 5: Personal de acceso ----
  const wsStaff = wb.addWorksheet('Personal de acceso');
  const staffHeader = wsStaff.addRow(['Email', 'Rol', 'Estado', 'Alta', 'Check-ins registrados']);
  styleHeaderRow(staffHeader);
  wsStaff.columns = [{ width: 28 }, { width: 14 }, { width: 14 }, { width: 20 }, { width: 20 }];
  for (const s of summary.analytics.staff_activity) {
    const row = wsStaff.addRow([
      s.is_organizer ? '(Organizador — sin snapshot de email)' : nz(s.email_snapshot || ''),
      s.is_organizer ? 'Organizador (propietario)' : 'Puerta',
      s.is_organizer ? 'Activo' : (s.status === 'active' ? 'Activo' : 'Revocado'),
      s.is_organizer ? '—' : formatEventDateTime(staffByUserId.get(s.user_id)?.created_at, tz),
      s.checkins_count,
    ]);
    if (s.is_organizer) row.eachCell((c) => { c.font = { italic: true }; });
  }

  return wb;
}

export { ANALYTICS_LIMITS };

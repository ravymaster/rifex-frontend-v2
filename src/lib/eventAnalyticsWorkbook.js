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

// Formato moneda chilena: agrupador de miles, sin decimales, con "$" — el
// código de formato usa "," como separador de grupo ABSTRACTO (estándar
// del formato de Excel); el glyph que se renderiza en pantalla lo decide
// la configuración regional de quien abre el archivo (en es-CL, "."), sin
// tocar el valor numérico subyacente ni volverlo texto. Nunca usar un "."
// literal en el código de formato — quedaría fijo sin importar el locale.
const CLP_NUMFMT = '"$"#,##0';

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
    cell.alignment = { wrapText: true, vertical: 'middle' };
  });
}

// Hallazgo real (auditoría visual independiente, post-aceptación manual de
// Rodrigo): anchos de columna estáticos insuficientes para contenido real
// causaban texto cortado/superpuesto — ej. "Organizador (propietario)" (25
// caracteres) contra una columna de 14. wrapText es la red de seguridad
// real para cualquier valor más largo de lo previsto (nombres/emails sin
// tope de longitud a nivel de negocio, títulos de evento hasta 140
// caracteres, nombres de tipo de entrada hasta 80).
function applyBodyWrap(row, columnIndexes) {
  for (const idx of columnIndexes) {
    const cell = row.getCell(idx);
    cell.alignment = { wrapText: true, vertical: 'top' };
  }
}

function applyCurrency(cell) {
  cell.numFmt = CLP_NUMFMT;
}

function nz(v) {
  return neutralizeFormulaInjection(v);
}

// Hallazgo real (sesión de certificación EVENT-5, prueba en vivo contra el
// archivo descargado real): ninguna hoja tenía fila congelada ni
// autofiltro — un requisito explícito verificado releyendo el .xlsx real
// generado en rifex-dev, no solo inspeccionado en memoria. Fila 1
// congelada en las 5 hojas (mejora la lectura incluso en Resumen, que
// mezcla varias mini-tablas); autofiltro solo en las 4 hojas realmente
// tabulares (Resumen no es una tabla de filas homogéneas, autofiltrarla no
// tiene sentido estructural).
function freezeHeaderRow(ws) {
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

function applyAutoFilter(ws, lastColumnLetter) {
  ws.autoFilter = `A1:${lastColumnLetter}1`;
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
  // Anchos reales: "Neto estimado (no conciliado con Mercado Pago)" mide 48
  // caracteres — 42 (ancho anterior) ya lo cortaba. El título del evento
  // (hasta 140 caracteres, ver events-create) puede exceder cualquier
  // ancho razonable, de ahí el wrap explícito en esa celda.
  const wsSummary = wb.addWorksheet('Resumen');
  wsSummary.columns = [{ width: 50 }, { width: 34 }];
  freezeHeaderRow(wsSummary);
  wsSummary.addRow(['Evento', nz(event.title)]);
  applyBodyWrap(wsSummary.lastRow, [2]);
  wsSummary.addRow(['Estado', event.status === 'cancelled' ? 'Cancelado (sigue siendo consultable)' : event.status]);
  applyBodyWrap(wsSummary.lastRow, [2]);
  wsSummary.addRow(['Zona horaria', tz]);
  wsSummary.addRow([]);

  const opRows = [
    ['Capacidad', summary.operational.capacity],
    ['Vendidas', summary.operational.sold],
    ['Emitidas totales', summary.operational.emitted_total],
    ['Válidas', summary.operational.valid],
    ['Anuladas', summary.operational.voided],
    ['Anuladas usadas antes de anularse', summary.operational.voided_used_before_void],
    // Renombrado (auditoría visual post-aceptación): "Ingresadas" a secas se
    // confundía con la cuenta de filas de la hoja Check-ins (que registra
    // TODO evento de check-in histórico, incluida una entrada que luego se
    // anuló). Esta cifra cuenta solo entradas VÁLIDAS con used_at — de ahí
    // "válidas" explícito, sin cambiar la fórmula real.
    ['Ingresadas válidas', summary.operational.checked_in],
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
    ['Recaudación aprobada total', centsToUnit(summary.financial.gross_approved_total_cents), true],
    ['Recaudación cumplida', centsToUnit(summary.financial.gross_fulfilled_cents), true],
    ['Aprobada sin emitir', centsToUnit(summary.financial.gross_unfulfilled_cents), true],
    ['Comisión Rifex total', centsToUnit(summary.financial.commission_total_cents), true],
    ['Comisión asociada a pagos sin fulfillment', centsToUnit(summary.financial.commission_unfulfilled_cents), true],
    ['Neto estimado (no conciliado con Mercado Pago)', centsToUnit(summary.financial.net_estimated_cents), true],
    // Renombrado (auditoría visual): "refund_required" era el nombre
    // técnico de la columna en la base de datos, nunca pensado para
    // mostrarse tal cual a un organizador.
    ['Órdenes con reembolso pendiente', summary.financial.refund_required_count, false],
    ['Monto con reembolso pendiente', centsToUnit(summary.financial.refund_required_cents), true],
  ];
  for (const [label, value, isMoney] of finRows) {
    const row = wsSummary.addRow([label, value]);
    if (isMoney) applyCurrency(row.getCell(2));
    if ((label === 'Aprobada sin emitir' || label === 'Comisión asociada a pagos sin fulfillment') && Number(value) > 0) {
      row.eachCell((c) => { c.fill = ALERT_FILL; });
    }
    if (label === 'Órdenes con reembolso pendiente' && Number(value) > 0) row.eachCell((c) => { c.fill = ALERT_FILL; });
  }

  wsSummary.addRow([]);
  wsSummary.addRow(['Desglose por tipo de entrada', '']);
  styleHeaderRow(wsSummary.lastRow);
  const byTypeHeader = wsSummary.addRow(['Tipo', 'Capacidad', 'Vendidas', 'Emitidas', 'Válidas', 'Ingresadas válidas']);
  styleHeaderRow(byTypeHeader);
  for (const t of summary.analytics.by_ticket_type) {
    const row = wsSummary.addRow([nz(t.name), t.capacity, t.sold, t.emitted_total, t.valid, t.checked_in]);
    applyBodyWrap(row, [1]);
  }

  // ---- Hoja 2: Órdenes-Ventas ----
  const wsOrders = wb.addWorksheet('Órdenes-Ventas');
  const orderQtyByOrderId = new Map();
  for (const it of orderItems) {
    orderQtyByOrderId.set(it.order_id, (orderQtyByOrderId.get(it.order_id) || 0) + (Number(it.quantity) || 0));
  }
  // Renombrado: "Refund requerido" era el nombre de columna crudo de
  // event_orders.refund_required. Anchos reales: "Comprador (nombre)" y
  // "Comprador (email)" se superponían porque 26/28 caracteres no
  // alcanzan para nombres/emails reales sin tope de longitud de negocio —
  // ensanchados + wrapText como red de seguridad.
  const ordersHeader = wsOrders.addRow(['ID orden', 'Fecha', 'Estado', 'Comprador (nombre)', 'Comprador (email)', 'Cantidad', 'Total', 'Comisión', 'Fulfillment', 'Reembolso pendiente']);
  styleHeaderRow(ordersHeader);
  wsOrders.columns = [
    { width: 12 }, { width: 20 }, { width: 22 }, { width: 30 }, { width: 34 },
    { width: 10 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 20 },
  ];
  freezeHeaderRow(wsOrders);
  applyAutoFilter(wsOrders, 'J');
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
    applyBodyWrap(row, [4, 5]);
    applyCurrency(row.getCell(7));
    applyCurrency(row.getCell(8));
    if (o.status === 'approved_unfulfilled' || o.refund_required) row.eachCell((c) => { c.fill = ALERT_FILL; });
  }

  // ---- Hoja 3: Entradas ----
  // Renombrados: "ticket_number" y "Ingresó (used_at)" eran nombres de
  // columna/variable crudos, nunca pensados para un lector no técnico.
  const wsTickets = wb.addWorksheet('Entradas');
  const ticketsHeader = wsTickets.addRow(['Número de entrada', 'Tipo', 'Válida/Anulada', 'Emitida', 'Fecha de ingreso', 'Usada antes de anular', 'Orden']);
  styleHeaderRow(ticketsHeader);
  wsTickets.columns = [
    { width: 22 }, { width: 28 }, { width: 16 }, { width: 20 }, { width: 20 }, { width: 24 }, { width: 12 },
  ];
  freezeHeaderRow(wsTickets);
  applyAutoFilter(wsTickets, 'G');
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
    applyBodyWrap(row, [2]);
    if (usedBeforeVoid) row.eachCell((c) => { c.fill = ALERT_FILL; });
  }

  // ---- Hoja 4: Check-ins ----
  const wsCheckins = wb.addWorksheet('Check-ins');
  const ticketsById = new Map(tickets.map((t) => [t.id, t]));
  const staffByUserId = new Map(staff.map((s) => [s.user_id, s]));
  const checkinsHeader = wsCheckins.addRow(['Hora', 'Número de entrada', 'Tipo', 'Registrado por']);
  styleHeaderRow(checkinsHeader);
  wsCheckins.columns = [{ width: 20 }, { width: 22 }, { width: 28 }, { width: 32 }];
  freezeHeaderRow(wsCheckins);
  applyAutoFilter(wsCheckins, 'D');
  const sortedCheckins = [...checkins].sort((a, b) => new Date(a.checked_in_at) - new Date(b.checked_in_at));
  for (const c of sortedCheckins) {
    const ticket = ticketsById.get(c.ticket_id);
    const isOrganizer = c.checked_in_by === event.organizer_id;
    const staffRow = staffByUserId.get(c.checked_in_by);
    const registeredBy = isOrganizer
      ? 'Organizador'
      : nz(staffRow?.user_email_snapshot || 'Personal de acceso');
    const row = wsCheckins.addRow([
      formatEventDateTime(c.checked_in_at, tz),
      ticket ? nz(ticket.ticket_number) : '—',
      ticket ? nz(ticket.ticket_type_name_snapshot) : '—',
      registeredBy,
    ]);
    applyBodyWrap(row, [3, 4]);
  }

  // ---- Hoja 5: Personal de acceso ----
  const wsStaff = wb.addWorksheet('Personal de acceso');
  // Anchos reales: "Organizador (propietario)" mide 25 caracteres contra
  // una columna Rol de 14 (desborde garantizado); "(Organizador — sin
  // snapshot de email)" mide 38 contra Email de 28. Ensanchadas + wrap.
  const staffHeader = wsStaff.addRow(['Email', 'Rol', 'Estado', 'Alta', 'Check-ins registrados']);
  styleHeaderRow(staffHeader);
  wsStaff.columns = [{ width: 34 }, { width: 28 }, { width: 14 }, { width: 20 }, { width: 24 }];
  freezeHeaderRow(wsStaff);
  applyAutoFilter(wsStaff, 'E');
  for (const s of summary.analytics.staff_activity) {
    const row = wsStaff.addRow([
      s.is_organizer ? '(Organizador — sin snapshot de email)' : nz(s.email_snapshot || ''),
      s.is_organizer ? 'Organizador (propietario)' : 'Puerta',
      s.is_organizer ? 'Activo' : (s.status === 'active' ? 'Activo' : 'Revocado'),
      s.is_organizer ? '—' : formatEventDateTime(staffByUserId.get(s.user_id)?.created_at, tz),
      s.checkins_count,
    ]);
    applyBodyWrap(row, [1, 2]);
    if (s.is_organizer) row.eachCell((c) => { c.font = { italic: true }; });
  }

  return wb;
}

export { ANALYTICS_LIMITS };

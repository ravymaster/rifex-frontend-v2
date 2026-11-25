// src/lib/medidorQrWorkbook.js
// MEDIDOR QR V1 — construcción del XLSX de métricas, hermano de
// registrationAnalyticsWorkbook.js/eventAnalyticsWorkbook.js. Reutiliza
// directamente (REUSE DIRECT) neutralizeFormulaInjection y
// formatEventDateTime de eventAnalytics.js. Fila de encabezado
// congelada + autofilter en ambas hojas, mismo criterio ya certificado.
//
// Sección 12 del mandato — CRÍTICO: el Excel contiene MÉTRICAS, NUNCA
// personas. Ninguna fila de acá referencia visitor_key, IP, cookies ni
// ningún identificador técnico — ambas hojas son agregados puros
// (conteos/porcentajes por día u opción), nunca una fila por
// respondedor individual.
import ExcelJS from 'exceljs';
import { formatEventDateTime, neutralizeFormulaInjection } from './eventAnalytics.js';

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
const HEADER_FONT = { bold: true };

function nz(v) {
  return neutralizeFormulaInjection(v);
}

function styleHeaderRow(row) {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { wrapText: true, vertical: 'middle' };
  });
}

/**
 * @param {object} params
 * @param {object} params.medidor fila real de medidores_qr (name, question, options, created_at, measurement_start, measurement_end, timezone)
 * @param {object} params.metrics { scan_count, visit_count, response_count, conversion_pct, breakdown: [{option, count, percent}], destination_clicks, destination_click_pct, daily_evolution: [{date, scans, responses, per_option: [n,n,...]}] }
 */
export function buildMedidorQrWorkbook({ medidor, metrics }) {
  // EXTENSIÓN FINAL — ESCALABILIDAD E INTEGRIDAD V1 (punto 11): usa el
  // timezone persistido del Medidor, nunca un default ciego — cae a
  // 'America/Santiago' solo si la fila es anterior a la columna
  // timezone (backfill).
  const tz = medidor.timezone || 'America/Santiago';
  const options = Array.isArray(medidor.options) ? medidor.options : [];

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Rifex';
  wb.created = new Date();

  // ---------------- HOJA 1 — RESUMEN ----------------
  const wsSummary = wb.addWorksheet('Resumen');
  wsSummary.columns = [{ width: 32 }, { width: 46 }];
  const summaryHeader = wsSummary.addRow(['Campo', 'Valor']);
  styleHeaderRow(summaryHeader);
  wsSummary.views = [{ state: 'frozen', ySplit: 1 }];
  wsSummary.autoFilter = 'A1:B1';

  const summaryRows = [
    ['Nombre', nz(medidor.name || medidor.question)],
    ['Pregunta', nz(medidor.question)],
    ['Fecha de creación', formatEventDateTime(medidor.created_at, tz)],
    ['Inicio de medición', formatEventDateTime(medidor.measurement_start, tz)],
    ['Término de medición', formatEventDateTime(medidor.measurement_end, tz)],
    ['Escaneos', metrics.scan_count],
    ['Visitantes (aproximado)', metrics.visit_count],
    ['Respuestas', metrics.response_count],
    ['Conversión (respuestas / escaneos)', `${metrics.conversion_pct}%`],
    ['Clics al destino', metrics.destination_clicks],
    ['Clics al destino (% sobre respuestas)', `${metrics.destination_click_pct}%`],
  ];
  for (const r of summaryRows) {
    const row = wsSummary.addRow(r);
    row.alignment = { wrapText: true, vertical: 'top' };
  }

  wsSummary.addRow([]);
  const altHeader = wsSummary.addRow(['Alternativa', 'Cantidad / Porcentaje']);
  altHeader.font = { bold: true };
  for (const b of metrics.breakdown) {
    wsSummary.addRow([nz(options[b.option_index] ?? `Opción ${b.option_index + 1}`), `${b.count} (${b.percent}%)`]);
  }

  // ---------------- HOJA 2 — EVOLUCIÓN DIARIA ----------------
  const ws2 = wb.addWorksheet('Evolución diaria');
  const optionCols = options.map((_, i) => ({ width: 16 }));
  ws2.columns = [{ width: 14 }, { width: 12 }, { width: 12 }, ...optionCols];
  const headerLabels = ['Fecha', 'Escaneos', 'Respuestas', ...options.map((o, i) => nz(o) || `Opción ${i + 1}`)];
  const header2 = ws2.addRow(headerLabels);
  styleHeaderRow(header2);
  ws2.views = [{ state: 'frozen', ySplit: 1 }];
  ws2.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headerLabels.length } };

  for (const d of metrics.daily_evolution) {
    const row = ws2.addRow([d.date, d.scans, d.responses, ...d.per_option]);
    row.alignment = { wrapText: true, vertical: 'top' };
  }

  return wb;
}

// src/lib/registrationAnalyticsWorkbook.js
// INSCRIPCIONES V1 — construcción del XLSX de participantes, hermano de
// eventAnalyticsWorkbook.js. Reutiliza directamente (REUSE DIRECT)
// neutralizeFormulaInjection y formatEventDateTime de eventAnalytics.js
// (ambas son utilidades genéricas, sin acoplamiento a Eventos) y las
// mismas convenciones ya certificadas: fila de encabezado congelada +
// autofilter en la única hoja (sección 23 del mandato — hallazgo real
// EVENT-5 de que ambas faltaban en la primera versión del export de
// Eventos, corregido ahí y replicado acá desde el inicio).
//
// Columnas EXACTAS pedidas por el mandato: Nombre, Email, Teléfono,
// Fecha de inscripción, Estado, Hora de check-in — nunca qr_token, nunca
// ningún campo interno innecesario.
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

export function buildRegistrationParticipantsWorkbook({ activity, participants }) {
  const tz = activity.timezone || 'America/Santiago';

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Rifex';
  wb.created = new Date();

  const ws = wb.addWorksheet('Inscritos');
  ws.columns = [
    { width: 30 }, { width: 34 }, { width: 18 }, { width: 20 }, { width: 16 }, { width: 20 },
  ];
  const header = ws.addRow(['Nombre', 'Email', 'Teléfono', 'Fecha de inscripción', 'Estado', 'Hora de check-in']);
  styleHeaderRow(header);
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = 'A1:F1';

  for (const p of participants) {
    const row = ws.addRow([
      nz(p.full_name),
      nz(p.email),
      p.phone ? nz(p.phone) : '—',
      formatEventDateTime(p.registered_at, tz),
      p.checked_in_at ? 'Asistió' : 'Pendiente',
      p.checked_in_at ? formatEventDateTime(p.checked_in_at, tz) : '—',
    ]);
    row.alignment = { wrapText: true, vertical: 'top' };
    row.eachCell((cell) => { cell.alignment = { wrapText: true, vertical: 'top' }; });
  }

  return wb;
}

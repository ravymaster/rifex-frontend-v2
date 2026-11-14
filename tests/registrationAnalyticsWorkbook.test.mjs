// tests/registrationAnalyticsWorkbook.test.mjs
// INSCRIPCIONES V1 — construcción real del XLSX de participantes
// (ExcelJS). Certifica: columnas EXACTAS del mandato (sección 23),
// nunca qr_token; fila 1 congelada + autofiltro (mismo hallazgo real de
// EVENT-5, aplicado desde el día 1 acá); formula injection en
// full_name/email/phone queda neutralizada como texto literal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { buildRegistrationParticipantsWorkbook } from '../src/lib/registrationAnalyticsWorkbook.js';

function baseActivity(overrides = {}) {
  return { id: 'act-1', title: 'Taller de compostaje', timezone: 'America/Santiago', ...overrides };
}

async function readWorkbookFromBuffer(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}

test('el workbook tiene exactamente una hoja "Inscritos" con las columnas exactas del mandato', async () => {
  const wb = buildRegistrationParticipantsWorkbook({
    activity: baseActivity(),
    participants: [
      { full_name: 'Ana Pérez', email: 'ana@example.com', phone: '+56912345678', registered_at: '2026-09-01T12:00:00.000Z', checked_in_at: null },
    ],
  });
  const names = wb.worksheets.map((ws) => ws.name);
  assert.deepEqual(names, ['Inscritos']);

  const buffer = await wb.xlsx.writeBuffer();
  const reloaded = await readWorkbookFromBuffer(buffer);
  const ws = reloaded.getWorksheet('Inscritos');
  const headerRow = ws.getRow(1).values.filter(Boolean);
  assert.deepEqual(headerRow, ['Nombre', 'Email', 'Teléfono', 'Fecha de inscripción', 'Estado', 'Hora de check-in']);
});

test('fila 1 congelada + autofiltro presentes en el archivo real reabierto', async () => {
  const wb = buildRegistrationParticipantsWorkbook({ activity: baseActivity(), participants: [] });
  const buffer = await wb.xlsx.writeBuffer();
  const reloaded = await readWorkbookFromBuffer(buffer);
  const ws = reloaded.getWorksheet('Inscritos');
  assert.ok(ws.views?.some((v) => v.state === 'frozen' && v.ySplit === 1));
  assert.ok(ws.autoFilter);
});

test('participante sin check-in muestra Estado=Pendiente y hora de check-in "—"', async () => {
  const wb = buildRegistrationParticipantsWorkbook({
    activity: baseActivity(),
    participants: [{ full_name: 'Bruno', email: 'bruno@example.com', phone: null, registered_at: '2026-09-01T12:00:00.000Z', checked_in_at: null }],
  });
  const buffer = await wb.xlsx.writeBuffer();
  const reloaded = await readWorkbookFromBuffer(buffer);
  const ws = reloaded.getWorksheet('Inscritos');
  const row = ws.getRow(2).values;
  assert.equal(row[3], '—'); // teléfono ausente
  assert.equal(row[5], 'Pendiente');
  assert.equal(row[6], '—');
});

test('participante con check-in muestra Estado=Asistió y la hora real', async () => {
  const wb = buildRegistrationParticipantsWorkbook({
    activity: baseActivity(),
    participants: [{ full_name: 'Carla', email: 'carla@example.com', phone: '+56900000000', registered_at: '2026-09-01T12:00:00.000Z', checked_in_at: '2026-09-01T13:05:00.000Z' }],
  });
  const buffer = await wb.xlsx.writeBuffer();
  const reloaded = await readWorkbookFromBuffer(buffer);
  const ws = reloaded.getWorksheet('Inscritos');
  const row = ws.getRow(2).values;
  assert.equal(row[5], 'Asistió');
  assert.notEqual(row[6], '—');
});

test('nunca incluye qr_token aunque el objeto participante lo traiga (defensa en profundidad de la capa de export)', async () => {
  const wb = buildRegistrationParticipantsWorkbook({
    activity: baseActivity(),
    participants: [{ full_name: 'Dario', email: 'dario@example.com', phone: null, registered_at: '2026-09-01T12:00:00.000Z', checked_in_at: null, qr_token: 'deadbeef'.repeat(8) }],
  });
  const buffer = await wb.xlsx.writeBuffer();
  const text = buffer.toString('latin1');
  assert.ok(!text.includes('deadbeef'.repeat(8)));
});

test('formula injection en nombre/email/teléfono queda neutralizada como texto literal', async () => {
  const wb = buildRegistrationParticipantsWorkbook({
    activity: baseActivity(),
    participants: [{ full_name: '=cmd|/c calc', email: '@malicious.example', phone: '+HYPERLINK("evil")', registered_at: '2026-09-01T12:00:00.000Z', checked_in_at: null }],
  });
  const buffer = await wb.xlsx.writeBuffer();
  const reloaded = await readWorkbookFromBuffer(buffer);
  const ws = reloaded.getWorksheet('Inscritos');
  const row = ws.getRow(2);
  assert.equal(row.getCell(1).type, ExcelJS.ValueType.String);
  assert.equal(row.getCell(2).type, ExcelJS.ValueType.String);
  assert.equal(row.getCell(3).type, ExcelJS.ValueType.String);
});

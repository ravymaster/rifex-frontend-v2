// tests/asistenteIaNombrePublico.test.mjs
// Nombre público «Asistente de IA» en la interfaz de Rifex DEV. El catálogo
// que consume el chat y el mapa Discovery quedan EXACTAMENTE como en la
// versión que Notebook diagnostica (develop a526678). Sin red ni modelo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, p))).digest('hex');

test('NOMBRE 1: menú, pie, tarjeta, encabezado y panel usan «Asistente de IA» con las mismas rutas', () => {
  const layout = read('src/components/Layout.jsx');
  assert.match(layout, /\{ label: 'Asistente de IA', href: '\/warp-conversacional' \}/);
  assert.match(layout, /<Link href="\/warp-conversacional">Cómo funciona el Asistente de IA<\/Link>/);
  assert.doesNotMatch(layout, /Warp Conversacional/);
  const home = read('src/pages/index.js');
  assert.match(home, /title: 'Asistente de IA',[\s\S]{0,400}href: '\/warp-conversacional'/);
  const landing = read('src/pages/warp-conversacional.jsx');
  assert.ok(landing.includes('title="Asistente de IA para tu sitio web"'));
  assert.ok(landing.includes('eyebrow="RIFEX · ASISTENTE DE IA · PILOTO ASISTIDO"'));
  assert.ok(landing.includes("installation: '$79.990 CLP'") && landing.includes("monthly: '$29.990 CLP'"));
  const panel = read('src/pages/panel/warp.jsx');
  assert.match(panel, /<h1 className=\{styles\.accountTitle\}>Mis solicitudes del Asistente de IA<\/h1>/);
  assert.doesNotMatch(panel, /Mis solicitudes de Warp|Warp Conversacional\./);
  assert.match(read('src/pages/mis-iniciativas.jsx'), /href: '\/panel\/warp', cta: 'Mis solicitudes del Asistente de IA'/);
});

test('REFERENCIA 1: catálogo del chat, ayuda, conector, preguntas sugeridas y mapa sin cambios', () => {
  const expected = {
    'src/lib/warp/rifexServices.js': 'RIFEX_SERVICES',
    'src/lib/warp/rifexHelp.js': 'RIFEX_HELP',
    'src/lib/warp/rifexConnector.js': 'RIFEX_CONNECTOR',
    'src/lib/warp/assistantPrefill.js': 'PREFILL',
    'src/lib/warp/site-map.json': 'SITE_MAP',
  };
  const pinned = JSON.parse(read('tests/fixtures/asistente-ia-referencia.json'));
  for (const f of Object.keys(expected)) assert.equal(sha(f), pinned[f], `${f} no debe cambiar`);
});

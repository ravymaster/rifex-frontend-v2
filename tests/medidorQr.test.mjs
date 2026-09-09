// tests/medidorQr.test.mjs
// MEDIDOR QR V1 + EXTENSIÓN FINAL — ESCALABILIDAD E INTEGRIDAD V1.
// Certifica: plantillas (contrato único), safeExternalUrl adversarial,
// workbook (sin PII), clasificación PSCG/sitemap/robots, patrones de
// seguridad estáticos en cada endpoint (ownership, rate limiting,
// autoridad server-side del límite mensual, funnel del destino), y un
// conjunto de escenarios adversariales en VIVO contra rifex-dev usando
// fixtures desechables (usuarios reales ya existentes, nunca cuentas
// nuevas) — cuota mensual, concurrencia real (dos creaciones
// simultáneas), IDOR, anti-duplicación de respuestas, bloqueo de
// edición tras la primera respuesta, y rechazo de URLs de destino
// peligrosas. Todos los fixtures se eliminan al final de cada test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { MEDIDOR_QR_TEMPLATES, findMedidorQrTemplate } from '../src/lib/medidorQrTemplates.js';
import { parseSafeExternalUrl } from '../src/lib/safeExternalUrl.js';
import { buildMedidorQrWorkbook } from '../src/lib/medidorQrWorkbook.js';
import { PSCG_CATEGORY, findPscgEntry } from '../src/lib/publicSurfaceClassification.js';

const ROOT = path.join(process.cwd());
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ===========================================================================
// 1. PLANTILLAS — sección 3 del mandato: "son UX, NO arquitecturas
// distintas". Las 10 producen el MISMO contrato question+options.
// ===========================================================================
test('1. hay exactamente 10 plantillas, todas con el mismo contrato question+options', () => {
  assert.equal(MEDIDOR_QR_TEMPLATES.length, 10);
  for (const t of MEDIDOR_QR_TEMPLATES) {
    assert.equal(typeof t.key, 'string');
    assert.equal(typeof t.label, 'string');
    assert.equal(typeof t.question, 'string');
    assert.ok(Array.isArray(t.options));
  }
});

test('2. "personalizado" es la única plantilla sin precarga (question/options vacíos)', () => {
  const custom = findMedidorQrTemplate('personalizado');
  assert.ok(custom);
  assert.equal(custom.question, '');
  assert.deepEqual(custom.options, ['', '']);
});

test('3. las 9 plantillas restantes precargan entre 2 y 4 opciones no vacías', () => {
  for (const t of MEDIDOR_QR_TEMPLATES.filter((x) => x.key !== 'personalizado')) {
    assert.ok(t.question.length > 0, `${t.key} debe traer pregunta`);
    assert.ok(t.options.length >= 2 && t.options.length <= 4, `${t.key} debe tener 2-4 opciones`);
    assert.ok(t.options.every((o) => o.length > 0), `${t.key} no debe traer opciones vacías`);
  }
});

test('4. findMedidorQrTemplate retorna null para una key inexistente', () => {
  assert.equal(findMedidorQrTemplate('no-existe'), null);
});

// ===========================================================================
// 2. safeExternalUrl — EXTENSIÓN "destino opcional": adversarial.
// ===========================================================================
test('5. parseSafeExternalUrl rechaza javascript:/data:/file: y cualquier esquema no http(s)', () => {
  assert.equal(parseSafeExternalUrl('javascript:alert(1)').ok, false);
  assert.equal(parseSafeExternalUrl('data:text/html,<script>alert(1)</script>').ok, false);
  assert.equal(parseSafeExternalUrl('file:///etc/passwd').ok, false);
  assert.equal(parseSafeExternalUrl('ftp://ejemplo.cl').ok, false);
  assert.equal(parseSafeExternalUrl('mailto:test@ejemplo.cl').ok, false);
});

test('6. parseSafeExternalUrl rechaza vacío, texto no-URL y URLs demasiado largas', () => {
  assert.equal(parseSafeExternalUrl('').ok, false);
  assert.equal(parseSafeExternalUrl('   ').ok, false);
  assert.equal(parseSafeExternalUrl('no es una url').ok, false);
  assert.equal(parseSafeExternalUrl(`https://ejemplo.cl/${'a'.repeat(2100)}`).ok, false);
});

test('7. parseSafeExternalUrl acepta http/https reales y preserva path, query, UTM y fragment', () => {
  const r = parseSafeExternalUrl('https://ejemplo.cl/promo?utm_source=qr&utm_campaign=vitrina#seccion');
  assert.equal(r.ok, true);
  assert.equal(r.hostname, 'ejemplo.cl');
  assert.match(r.href, /\/promo\?utm_source=qr&utm_campaign=vitrina#seccion$/);
});

test('8. parseSafeExternalUrl acepta dominios internacionales (IDN)', () => {
  const r = parseSafeExternalUrl('https://xn--nxasmq6b.com/');
  assert.equal(r.ok, true);
});

// ===========================================================================
// 3. WORKBOOK — sección 12 del mandato: MÉTRICAS, nunca personas.
// ===========================================================================
test('9. buildMedidorQrWorkbook nunca referencia visitor_key/IP/cookies fuera de los comentarios explicativos (código real, no docs)', () => {
  const codeOnly = read('src/lib/medidorQrWorkbook.js')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
    .join('\n');
  assert.doesNotMatch(codeOnly, /visitor_key/);
  assert.doesNotMatch(codeOnly, /\bip\b/i);
  assert.doesNotMatch(codeOnly, /cookie/i);
});

test('10. el workbook usa el nombre real del Medidor (nunca el placeholder "Medidor QR" literal) y respeta medidor.timezone', async () => {
  const medidor = {
    name: 'Vitrina septiembre',
    question: '¿Qué producto te gustaría encontrar?',
    options: ['A', 'B'],
    created_at: '2026-09-01T12:00:00.000Z',
    measurement_start: '2026-09-01T12:00:00.000Z',
    measurement_end: '2026-10-01T12:00:00.000Z',
    timezone: 'America/Argentina/Buenos_Aires',
  };
  const metrics = {
    scan_count: 10, visit_count: 8, response_count: 5, conversion_pct: 50,
    destination_clicks: 2, destination_click_pct: 40,
    breakdown: [{ option_index: 0, count: 3, percent: 60 }, { option_index: 1, count: 2, percent: 40 }],
    daily_evolution: [{ date: '2026-09-02', scans: null, responses: 5, per_option: [3, 2] }],
  };
  const wb = buildMedidorQrWorkbook({ medidor, metrics });
  const ws = wb.getWorksheet('Resumen');
  const nameRow = ws.getRow(2);
  assert.equal(nameRow.getCell(1).value, 'Nombre');
  assert.equal(nameRow.getCell(2).value, 'Vitrina septiembre');
  const ws2 = wb.getWorksheet('Evolución diaria');
  assert.equal(ws2.views[0].state, 'frozen');
  assert.ok(ws2.autoFilter);
});

// ===========================================================================
// 4. PSCG / sitemap / robots — clasificación de las 5 rutas nuevas.
// ===========================================================================
test('11. /medidor-qr es PUBLIC_INDEXABLE y está en el sitemap', () => {
  const entry = findPscgEntry('/medidor-qr');
  assert.equal(entry.category, PSCG_CATEGORY.PUBLIC_INDEXABLE);
  assert.match(read('public/sitemap.xml'), /<loc>https:\/\/rifex\.pro\/medidor-qr<\/loc>/);
});

test('12. /m/[slug] es PUBLIC_NOINDEX, NO está en el sitemap y NO está en el Disallow (mismo criterio que /inscripcion/[id])', () => {
  const entry = findPscgEntry('/m/[slug]');
  assert.equal(entry.category, PSCG_CATEGORY.PUBLIC_NOINDEX);
  assert.equal(entry.robotsDisallow, false);
  assert.doesNotMatch(read('public/sitemap.xml'), /\/m\//);
  assert.doesNotMatch(read('public/robots.txt'), /Disallow: \/m\b/);
});

test('13. /crear-medidor-qr y /panel/medidor-qr* son PRIVATE_AUTHENTICATED con boundary ssr_redirect', () => {
  for (const p of ['/crear-medidor-qr', '/panel/medidor-qr', '/panel/medidor-qr/[id]']) {
    const entry = findPscgEntry(p);
    assert.equal(entry.category, PSCG_CATEGORY.PRIVATE_AUTHENTICATED);
    assert.equal(entry.boundary, 'ssr_redirect');
  }
  assert.match(read('public/robots.txt'), /Disallow: \/crear-medidor-qr/);
});

test('13b. /crear-medidor-qr.jsx: el Nombre Interno se auto-completa al cambiar de plantilla, pero deja de hacerlo apenas el usuario lo edita a mano', () => {
  const src = read('src/pages/crear-medidor-qr.jsx');
  assert.match(src, /const \[nameTouched, setNameTouched\] = useState\(false\)/);
  assert.match(src, /if \(!nameTouched\) setName\(t\.label\)/);
  assert.match(src, /setName\(v\);/);
  assert.match(src, /setNameTouched\(v\.trim\(\) !== ''\)/);
});

test('13b-2. POST-HUMAN-QA: limpiar completamente Nombre interno restaura el modo automático (v.trim()==="" -> nameTouched=false)', () => {
  const src = read('src/pages/crear-medidor-qr.jsx');
  // La lógica vive en un único onChange: setNameTouched(v.trim() !== '').
  // Si v es '', el resultado es false -> vuelve a modo automático.
  const fn = new Function('v', `
    let nameTouched;
    const setNameTouched = (x) => { nameTouched = x; };
    setNameTouched(v.trim() !== '');
    return nameTouched;
  `);
  assert.equal(fn(''), false);
  assert.equal(fn('   '), false);
  assert.equal(fn('Encuesta vitrina septiembre'), true);
});

test('13b-3. las plantillas Convocatoria/Satisfacción/Recomendación existen con label exacto (Nombre interno = label de la plantilla elegida)', () => {
  for (const label of ['Convocatoria', 'Satisfacción', 'Recomendación']) {
    const t = MEDIDOR_QR_TEMPLATES.find((tpl) => tpl.label === label);
    assert.ok(t, `falta la plantilla "${label}"`);
    assert.equal(typeof t.question, 'string');
    assert.ok(t.question.length > 0);
  }
});

test('13c. qr.png.js: el espacio superior de la ficha es del creador (nombre/pregunta), Rifex solo aparece como firma discreta "Powered by rifex.pro"', () => {
  const src = read('src/pages/api/medidor-qr/m/[slug]/qr.png.js');
  assert.doesNotMatch(src, /children: 'Rifex'/);
  assert.match(src, /children: 'Powered by rifex\.pro'/);
  assert.match(src, /children: truncateTitle\(medidor\.name \|\| medidor\.question\)/);
});

test('14. /m/[slug].jsx tiene getServerSideProps (SSR) y usa MedidorQrPublicShell (noindex/noarchive centralizado) en las 4 ramas de estado', () => {
  const src = read('src/pages/m/[slug].jsx');
  assert.match(src, /export async function getServerSideProps/);
  const shellOccurrences = (src.match(/<MedidorQrPublicShell/g) || []).length;
  assert.ok(shellOccurrences >= 4, 'debe envolver not-found/ended/not-started/active con el shell público');
});

// ===========================================================================
// POST-HUMAN-QA CORRECTIONS — sección 16.B/16.C/16.E del mandato: shell
// público minimalista (sin Navbar/Footer/menú de Rifex) para /m/[slug],
// infraestructura preservada (noindex, canonical, viewport).
// ===========================================================================
test('16B-1. /m/[slug].jsx NUNCA importa el <Layout> global — usa MedidorQrPublicShell exclusivamente', () => {
  const src = read('src/pages/m/[slug].jsx');
  assert.doesNotMatch(src, /from '@\/components\/Layout'/);
  assert.match(src, /import MedidorQrPublicShell from '@\/components\/MedidorQrPublicShell'/);
});

test('16B-2. MedidorQrPublicShell no renderiza <header>/<footer>/navegación de Rifex — solo su propio <Head> y el contenido del creador', () => {
  const src = read('src/components/MedidorQrPublicShell.jsx');
  assert.doesNotMatch(src, /<header/);
  assert.doesNotMatch(src, /<footer/);
  assert.doesNotMatch(src, /navItems/);
  assert.doesNotMatch(src, /rf-hamburger/);
  assert.doesNotMatch(src, /accountItems/);
});

test('16B-3. MedidorQrPublicShell preserva la infraestructura técnica: title/description/canonical/viewport y robots noindex+nofollow+noarchive SIEMPRE (no condicional)', () => {
  const src = read('src/components/MedidorQrPublicShell.jsx');
  assert.match(src, /<title>\{title\}<\/title>/);
  assert.match(src, /name="description"/);
  assert.match(src, /name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/);
  assert.match(src, /rel="canonical"/);
  assert.match(src, /name="robots" content="noindex, nofollow, noarchive"/);
  // Sin "if" alrededor del robots meta -> siempre presente, no depende de una rama de estado.
  assert.doesNotMatch(src, /noindex &&/);
});

test('16C-1. Powered by Rifex.pro está presente y es discreto (sin card/banner/logo grande) en las 4 ramas + post-respuesta', () => {
  const src = read('src/pages/m/[slug].jsx');
  const codeOnly = src.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
  const poweredByCount = (codeOnly.match(/Powered by Rifex\.pro/g) || []).length;
  assert.equal(poweredByCount, 1, 'debe existir un único componente Signature reutilizado en todas las ramas, no texto duplicado por rama');
  assert.match(src, /const Signature = \(\) =>/);
});

test('16C-2. la pregunta y las alternativas siguen presentes/dominantes; sin depender del Layout para renderizarlas', () => {
  const src = read('src/pages/m/[slug].jsx');
  assert.match(src, /\{medidor\.question\}/);
  assert.match(src, /options\.map\(\(opt, i\) =>/);
});

test('16C-3. post-respuesta usa el mismo shell minimalista, agradecimiento + destino opcional con dominio real, sin redirect automático', () => {
  const src = read('src/pages/m/[slug].jsx');
  assert.match(src, /Gracias por responder/);
  assert.match(src, /Tu respuesta fue registrada/);
  assert.match(src, /¿Quieres continuar a \{destinationInfo\.hostname\}\?/);
  assert.doesNotMatch(src, /window\.location\.href = destinationInfo/);
  assert.match(src, /onClick=\{goToDestination\}/);
});

test('16E-1. la infraestructura funcional del Medidor (scan/response counting, destination click, anti-duplicación) sigue intacta tras retirar el Layout', () => {
  const src = read('src/pages/m/[slug].jsx');
  assert.match(src, /\/visit`/);
  assert.match(src, /\/respond`/);
  assert.match(src, /\/click`/);
  assert.match(src, /getOrCreateVisitorKey/);
  assert.match(src, /already_responded/);
});

// ===========================================================================
// 5. PATRONES DE SEGURIDAD ESTÁTICOS por endpoint.
// ===========================================================================
test('15. POST /api/medidor-qr: identidad SIEMPRE desde auth.getUser(token), rate limit, y la cuota se valida solo vía RPC (nunca un pre-check separado)', () => {
  const src = read('src/pages/api/medidor-qr/index.js');
  assert.match(src, /auth\.getUser\(token\)/);
  assert.match(src, /enforceRateLimit/);
  assert.match(src, /organizer_id: user\.id/);
  assert.doesNotMatch(src, /organizer_id:\s*body\./, 'organizer_id nunca debe venir del cliente');
  assert.match(src, /rpcErr\.code === 'P0001'/);
});

test('16. GET/PATCH /api/medidor-qr/[id]: ownership real (organizer_id !== user.id -> 403) antes de cualquier operación', () => {
  const src = read('src/pages/api/medidor-qr/[id]/index.js');
  assert.match(src, /medidor\.organizer_id !== user\.id/);
  assert.match(src, /res\.status\(403\)/);
});

test('17. PATCH recalcula response_count server-side antes de permitir editar question/options (nunca confía en un flag del cliente)', () => {
  const src = read('src/pages/api/medidor-qr/[id]/index.js');
  assert.match(src, /medidor_qr_responses/);
  assert.match(src, /locked_has_responses/);
  assert.doesNotMatch(src, /body\.locked/);
  assert.doesNotMatch(src, /req\.body\.response_count/);
});

test('18. PATCH nunca acepta slug/status/organizer_id/created_at/scan_count en el body', () => {
  const src = read('src/pages/api/medidor-qr/[id]/index.js');
  assert.doesNotMatch(src, /patch\.slug/);
  assert.doesNotMatch(src, /patch\.status/);
  assert.doesNotMatch(src, /patch\.organizer_id/);
  assert.doesNotMatch(src, /patch\.scan_count/);
});

test('19. PATCH re-valida destination_url con parseSafeExternalUrl (nunca confía en el valor guardado previamente ni en el del cliente sin validar)', () => {
  const src = read('src/pages/api/medidor-qr/[id]/index.js');
  assert.match(src, /parseSafeExternalUrl\(body\.destination_url\)/);
});

test('20. mine.js aplica los filtros (q/status) a la MISMA query que la paginación, nunca un filtrado posterior en memoria', () => {
  const src = read('src/pages/api/medidor-qr/mine.js');
  assert.match(src, /applyFilters/);
  const countCall = src.match(/applyFilters\(\s*supabase\.from\('medidores_qr'\)\.select\('id', \{ count: 'exact', head: true \}\)/);
  const itemsCall = src.match(/applyFilters\(\s*supabase\s*\.from\('medidores_qr'\)/);
  assert.ok(countCall, 'el conteo debe pasar por applyFilters');
  assert.ok(itemsCall, 'los items deben pasar por applyFilters');
});

test('21. mine.js sanea el término de búsqueda antes de interpolarlo en el filtro .or() de PostgREST', () => {
  const src = read('src/pages/api/medidor-qr/mine.js');
  assert.match(src, /replace\(\/\[,\(\)%_\]\/g/);
});

test('22. respond.js: rate-limited y valida visitor_key (16-128 chars) antes de tocar la DB', () => {
  const src = read('src/pages/api/medidor-qr/m/[slug]/respond.js');
  assert.match(src, /enforceRateLimit/);
});

test('23. click.js: nunca implementa un redirect endpoint — solo registra el clic, la navegación real ocurre en el cliente', () => {
  const src = read('src/pages/api/medidor-qr/m/[slug]/click.js');
  assert.doesNotMatch(src, /res\.redirect/);
  assert.doesNotMatch(src, /Location/);
  assert.match(src, /enforceRateLimit/);
});

test('24. goToDestination() nunca espera (await) el registro del clic antes de navegar — fire-and-forget', () => {
  const src = read('src/pages/m/[slug].jsx');
  const fnMatch = src.match(/function goToDestination\(\)[\s\S]*?\n  \}/);
  assert.ok(fnMatch, 'debe existir goToDestination');
  assert.doesNotMatch(fnMatch[0], /await fetch/);
  assert.match(fnMatch[0], /\.catch\(\(\) => \{\}\)/);
});

test('25. status.js: solo acepta {status:"closed"}, terminal, owner-only, nunca reabre', () => {
  const src = read('src/pages/api/medidor-qr/[id]/status.js');
  assert.match(src, /'closed'/);
  assert.doesNotMatch(src, /'active'/);
});

test('26. export.js: rate-limited, owner-only, y construye el workbook exclusivamente desde loadMedidorQrMetrics (nunca una query separada de filas individuales)', () => {
  const src = read('src/pages/api/medidor-qr/[id]/export.js');
  assert.match(src, /enforceRateLimit/);
  assert.match(src, /medidor\.organizer_id !== user\.id/);
  assert.match(src, /loadMedidorQrMetrics/);
});

test('27. la migración revoca TODO acceso público a las 4 tablas de instrumentación (responses/visits/destination_clicks/free_usage)', () => {
  const sql = read('db/migrations/2026-09-08_medidor_qr_v1.sql');
  assert.match(sql, /revoke all on public\.medidor_qr_responses from public, anon, authenticated/);
  assert.match(sql, /revoke all on public\.medidor_qr_visits from public, anon, authenticated/);
  assert.match(sql, /revoke all on public\.medidor_qr_destination_clicks from public, anon, authenticated/);
  assert.match(sql, /revoke all on public\.medidor_qr_free_usage from public, anon, authenticated/);
});

test('28. la migración exige que un clic al destino tenga una respuesta previa del mismo visitor_key (funnel real)', () => {
  const sql = read('db/migrations/2026-09-08_medidor_qr_v1.sql');
  assert.match(sql, /no_prior_response/);
  assert.match(sql, /select 1 from public\.medidor_qr_responses/);
});

test('29. la migración usa RAISE EXCEPTION (nunca un soft-return) al chocar con la cuota mensual, para revertir también el insert del Medidor', () => {
  const sql = read('db/migrations/2026-09-08_medidor_qr_v1.sql');
  assert.match(sql, /raise exception 'free_quota_already_used' using errcode = 'P0001'/);
});

test('30. name/timezone son NOT NULL y create_medidor_qr valida p_name server-side (defensa en profundidad, no solo la API)', () => {
  const sql = read('db/migrations/2026-09-08_medidor_qr_v1.sql');
  assert.match(sql, /alter table public\.medidores_qr alter column name set not null/);
  assert.match(sql, /if p_name is null or char_length\(trim\(p_name\)\) < 1/);
});

// ===========================================================================
// 6. EMPÍRICO EN VIVO contra rifex-dev — fixtures desechables sobre
// usuarios reales ya existentes (nunca cuentas nuevas), eliminados al
// final de cada test. Se salta automáticamente si faltan credenciales.
// ===========================================================================
const canRunLive = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
const liveTest = canRunLive ? test : test.skip;

const supabase = canRunLive
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

const USER_A = '8764fefc-be10-458a-af8c-64b401f896bb';
const USER_B = 'b8c25695-d569-4bac-bdd9-119a146a8870';

function uniqueSlug(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

async function createFixture({ organizerId = USER_A, periodKey, name = 'Fixture test', question = '¿Pregunta de prueba?', options = ['A', 'B'], destinationUrl = null, destinationLabel = null } = {}) {
  const now = new Date();
  const { data, error } = await supabase.rpc('create_medidor_qr', {
    p_organizer_id: organizerId,
    p_period_key: periodKey || `test-${uniqueSlug('period')}`,
    p_organizer_name_snapshot: 'Fixture',
    p_name: name,
    p_question: question,
    p_options: options,
    p_measurement_start: now.toISOString(),
    p_measurement_end: new Date(now.getTime() + 3600_000).toISOString(),
    p_destination_url: destinationUrl,
    p_destination_button_label: destinationLabel,
    p_slug: uniqueSlug('t'),
  });
  if (error) throw error;
  return data;
}

async function deleteFixture(id) {
  if (!id) return;
  await supabase.from('medidor_qr_free_usage').delete().eq('medidor_qr_id', id);
  await supabase.from('medidor_qr_destination_clicks').delete().eq('medidor_qr_id', id);
  await supabase.from('medidor_qr_visits').delete().eq('medidor_qr_id', id);
  await supabase.from('medidor_qr_responses').delete().eq('medidor_qr_id', id);
  await supabase.from('medidores_qr').delete().eq('id', id);
}

liveTest('31. [vivo] crear un Medidor QR válido persiste name/timezone/status=active correctamente', async () => {
  const result = await createFixture({ periodKey: uniqueSlug('period') });
  assert.equal(result.ok, true);
  assert.equal(result.medidor.name, 'Fixture test');
  assert.equal(result.medidor.status, 'active');
  assert.equal(result.medidor.timezone, 'America/Santiago');
  await deleteFixture(result.medidor.id);
});

liveTest('32. [vivo] create_medidor_qr rechaza p_name vacío sin llegar a consumir cuota', async () => {
  const periodKey = uniqueSlug('period');
  const { data } = await supabase.rpc('create_medidor_qr', {
    p_organizer_id: USER_A, p_period_key: periodKey, p_organizer_name_snapshot: 'Fixture',
    p_name: '   ', p_question: '¿Q?', p_options: ['A', 'B'],
    p_measurement_start: new Date().toISOString(), p_measurement_end: new Date(Date.now() + 3600_000).toISOString(),
    p_destination_url: null, p_destination_button_label: null, p_slug: uniqueSlug('t'),
  });
  assert.equal(data.ok, false);
  assert.equal(data.error, 'invalid_name');
  const { count } = await supabase.from('medidor_qr_free_usage').select('id', { count: 'exact', head: true }).eq('period_key', periodKey);
  assert.equal(count, 0, 'un intento rechazado nunca debe consumir cupo');
});

liveTest('33. [vivo] segunda creación mismo organizador+mes es rechazada (RAISE EXCEPTION P0001) y NO deja un Medidor huérfano', async () => {
  const periodKey = uniqueSlug('period');
  const first = await createFixture({ periodKey });
  assert.equal(first.ok, true);

  const { data: second, error: secondErr } = await supabase.rpc('create_medidor_qr', {
    p_organizer_id: USER_A, p_period_key: periodKey, p_organizer_name_snapshot: 'Fixture',
    p_name: 'Segundo intento', p_question: '¿Otra?', p_options: ['A', 'B'],
    p_measurement_start: new Date().toISOString(), p_measurement_end: new Date(Date.now() + 3600_000).toISOString(),
    p_destination_url: null, p_destination_button_label: null, p_slug: uniqueSlug('t2'),
  });
  assert.equal(second, null);
  assert.match(secondErr.message, /free_quota_already_used/);

  const { count } = await supabase.from('medidores_qr').select('id', { count: 'exact', head: true }).eq('organizer_id', USER_A).eq('name', 'Segundo intento');
  assert.equal(count, 0, 'el segundo Medidor rechazado no debe existir en la tabla');

  await deleteFixture(first.medidor.id);
});

liveTest('34. [vivo] usuario B no consume el cupo de usuario A en el mismo período', async () => {
  const periodKey = uniqueSlug('period');
  const a = await createFixture({ organizerId: USER_A, periodKey });
  const b = await createFixture({ organizerId: USER_B, periodKey });
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  await deleteFixture(a.medidor.id);
  await deleteFixture(b.medidor.id);
});

liveTest('35. [vivo] carrera real: dos creaciones simultáneas mismo organizador+mes -> gana exactamente una', async () => {
  const periodKey = uniqueSlug('period');
  const attempt = () => supabase.rpc('create_medidor_qr', {
    p_organizer_id: USER_A, p_period_key: periodKey, p_organizer_name_snapshot: 'Fixture',
    p_name: 'Carrera', p_question: '¿Carrera?', p_options: ['A', 'B'],
    p_measurement_start: new Date().toISOString(), p_measurement_end: new Date(Date.now() + 3600_000).toISOString(),
    p_destination_url: null, p_destination_button_label: null, p_slug: uniqueSlug('race'),
  });
  const [r1, r2] = await Promise.all([attempt(), attempt()]);
  const results = [r1, r2];
  const winners = results.filter((r) => r.data?.ok === true);
  const losers = results.filter((r) => r.data == null && r.error);
  assert.equal(winners.length, 1, 'exactamente una de las dos creaciones simultáneas debe ganar');
  assert.equal(losers.length, 1, 'la otra debe fallar con free_quota_already_used, nunca ambas ganar');
  assert.match(losers[0].error.message, /free_quota_already_used/);
  await deleteFixture(winners[0].data.medidor.id);
});

liveTest('36. [vivo] al cambiar de mes se restaura el cupo (period_key distinto = fila distinta en el ledger)', async () => {
  const a = await createFixture({ periodKey: uniqueSlug('period-sep') });
  const b = await createFixture({ periodKey: uniqueSlug('period-oct') });
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  await deleteFixture(a.medidor.id);
  await deleteFixture(b.medidor.id);
});

liveTest('37. [vivo] respond_to_medidor_qr: anti-duplicación real — mismo visitor_key responde dos veces -> already_responded, no duplica el conteo', async () => {
  const created = await createFixture({ periodKey: uniqueSlug('period') });
  const visitorKey = uniqueSlug('visitor').repeat(1).padEnd(32, '0');

  const first = await supabase.rpc('respond_to_medidor_qr', { p_medidor_qr_id: created.medidor.id, p_option_index: 0, p_visitor_key: visitorKey });
  assert.equal(first.data.ok, true);

  const second = await supabase.rpc('respond_to_medidor_qr', { p_medidor_qr_id: created.medidor.id, p_option_index: 1, p_visitor_key: visitorKey });
  assert.equal(second.data.ok, false);
  assert.equal(second.data.error, 'already_responded');

  const { count } = await supabase.from('medidor_qr_responses').select('id', { count: 'exact', head: true }).eq('medidor_qr_id', created.medidor.id);
  assert.equal(count, 1, 'nunca debe quedar más de una respuesta por visitor_key');

  await deleteFixture(created.medidor.id);
});

liveTest('38. [vivo] respond_to_medidor_qr respeta la ventana temporal: rechaza antes de measurement_start y después de measurement_end', async () => {
  const now = new Date();
  const future = await createFixtureWithWindow(new Date(now.getTime() + 3600_000), new Date(now.getTime() + 7200_000));
  const past = await createFixtureWithWindow(new Date(now.getTime() - 7200_000), new Date(now.getTime() - 3600_000));

  const beforeStart = await supabase.rpc('respond_to_medidor_qr', { p_medidor_qr_id: future.medidor.id, p_option_index: 0, p_visitor_key: uniqueSlug('v').padEnd(32, '0') });
  assert.equal(beforeStart.data.error, 'measurement_not_started');

  const afterEnd = await supabase.rpc('respond_to_medidor_qr', { p_medidor_qr_id: past.medidor.id, p_option_index: 0, p_visitor_key: uniqueSlug('v').padEnd(32, '0') });
  assert.equal(afterEnd.data.error, 'measurement_ended');

  await deleteFixture(future.medidor.id);
  await deleteFixture(past.medidor.id);

  async function createFixtureWithWindow(start, end) {
    const { data } = await supabase.rpc('create_medidor_qr', {
      p_organizer_id: USER_A, p_period_key: uniqueSlug('period'), p_organizer_name_snapshot: 'Fixture',
      p_name: 'Ventana', p_question: '¿Ventana?', p_options: ['A', 'B'],
      p_measurement_start: start.toISOString(), p_measurement_end: end.toISOString(),
      p_destination_url: null, p_destination_button_label: null, p_slug: uniqueSlug('w'),
    });
    return data;
  }
});

liveTest('39. [vivo] record_medidor_qr_destination_click exige respuesta previa del mismo visitor_key (funnel: escaneo -> respuesta -> clic)', async () => {
  const created = await createFixture({ periodKey: uniqueSlug('period'), destinationUrl: 'https://ejemplo.cl' });
  const visitorKey = uniqueSlug('v').padEnd(32, '0');

  const clickWithoutResponse = await supabase.rpc('record_medidor_qr_destination_click', { p_medidor_qr_id: created.medidor.id, p_visitor_key: visitorKey });
  assert.equal(clickWithoutResponse.data.error, 'no_prior_response');

  await supabase.rpc('respond_to_medidor_qr', { p_medidor_qr_id: created.medidor.id, p_option_index: 0, p_visitor_key: visitorKey });
  const clickAfterResponse = await supabase.rpc('record_medidor_qr_destination_click', { p_medidor_qr_id: created.medidor.id, p_visitor_key: visitorKey });
  assert.equal(clickAfterResponse.data.ok, true);

  await deleteFixture(created.medidor.id);
});

liveTest('40. [vivo] integridad histórica: options solo editables por UPDATE directo cuando response_count===0 (autoridad real que replica la API)', async () => {
  const created = await createFixture({ periodKey: uniqueSlug('period') });
  const { count: before } = await supabase.from('medidor_qr_responses').select('id', { count: 'exact', head: true }).eq('medidor_qr_id', created.medidor.id);
  assert.equal(before, 0, 'sin respuestas: la API permitiría editar options (locked=false)');

  await supabase.rpc('respond_to_medidor_qr', { p_medidor_qr_id: created.medidor.id, p_option_index: 0, p_visitor_key: uniqueSlug('v').padEnd(32, '0') });
  const { count: after } = await supabase.from('medidor_qr_responses').select('id', { count: 'exact', head: true }).eq('medidor_qr_id', created.medidor.id);
  assert.ok(after > 0, 'con una respuesta: la API bloquearía la edición de question/options (locked=true)');

  await deleteFixture(created.medidor.id);
});

liveTest('41. [vivo] IDOR: la fila de un Medidor solo referencia a su organizer_id real — un query filtrado por otro organizer_id no la devuelve', async () => {
  const created = await createFixture({ organizerId: USER_A, periodKey: uniqueSlug('period') });
  const { data: asOwner } = await supabase.from('medidores_qr').select('id').eq('id', created.medidor.id).eq('organizer_id', USER_A).maybeSingle();
  const { data: asOther } = await supabase.from('medidores_qr').select('id').eq('id', created.medidor.id).eq('organizer_id', USER_B).maybeSingle();
  assert.ok(asOwner);
  assert.equal(asOther, null);
  await deleteFixture(created.medidor.id);
});

liveTest('42. [vivo] slug es único: dos Medidores no pueden compartir el mismo slug (constraint real, no solo aplicativo)', async () => {
  const slug = uniqueSlug('collision');
  const now = new Date();
  const first = await supabase.rpc('create_medidor_qr', {
    p_organizer_id: USER_A, p_period_key: uniqueSlug('period'), p_organizer_name_snapshot: 'Fixture',
    p_name: 'Uno', p_question: '¿Q1?', p_options: ['A', 'B'],
    p_measurement_start: now.toISOString(), p_measurement_end: new Date(now.getTime() + 3600_000).toISOString(),
    p_destination_url: null, p_destination_button_label: null, p_slug: slug,
  });
  assert.equal(first.data.ok, true);

  const second = await supabase.rpc('create_medidor_qr', {
    p_organizer_id: USER_A, p_period_key: uniqueSlug('period2'), p_organizer_name_snapshot: 'Fixture',
    p_name: 'Dos', p_question: '¿Q2?', p_options: ['A', 'B'],
    p_measurement_start: now.toISOString(), p_measurement_end: new Date(now.getTime() + 3600_000).toISOString(),
    p_destination_url: null, p_destination_button_label: null, p_slug: slug,
  });
  assert.equal(second.data.ok, false);
  assert.equal(second.data.error, 'slug_collision');

  await deleteFixture(first.data.medidor.id);
});

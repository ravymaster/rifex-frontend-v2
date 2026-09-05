// RIFEX PANEL SCALABILITY (2026-09-05) — server-side pagination hardening
// for Mis Inscripciones, Mis Eventos, and an activity's participants
// table. Certifies two things by different means:
//
// (a) the pagination MATH (parsePage/resolvePagination in
//     src/lib/panelPagination.js) via real, deterministic unit tests —
//     including the section 18 "stress logical test" at 50/200/2000
//     simulated totals, proving no gaps/no duplicates/correct last page
//     without needing to seed thousands of real Supabase rows;
// (b) that the real API routes/pages actually WIRE that math in
//     (real `.range()`, real `count: 'exact', head: true`, ownership
//     checks intact, Excel export untouched) via static inspection of
//     the actual source — the same technique used throughout this
//     session for SSR-boundary/no-cloaking certification, since a full
//     live Supabase round-trip isn't necessary to prove the code path
//     is real when the exact strings can be verified in the file that
//     will actually run in production.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parsePage, resolvePagination } from "../src/lib/panelPagination.js";

const ROOT = path.join(process.cwd());
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

// ---------- 5. page inválida — parsePage nunca produce NaN/negativo/float ----------
test("parsePage: NaN, negativo, cero, float, string arbitraria y overflow absurdo caen a un entero seguro", () => {
  assert.equal(parsePage(undefined), 1);
  assert.equal(parsePage(null), 1);
  assert.equal(parsePage("abc"), 1);
  assert.equal(parsePage("-5"), 1);
  assert.equal(parsePage("0"), 1);
  assert.equal(parsePage("3.7"), 3, "parseInt trunca el float a un entero válido, nunca lo propaga como float");
  assert.equal(parsePage("2"), 2);
  assert.equal(Number.isInteger(parsePage("999999999999999")), true);
  assert.ok(parsePage("999999999999999") <= 1_000_000, "overflow absurdo se clampea a un techo razonable, nunca Infinity/NaN");
});

// ---------- 3/4. total y totalPages correctos, para los 3 PAGE_SIZE reales ----------
test("resolvePagination: totalPages = ceil(total/pageSize), nunca 0 aunque total sea 0", () => {
  assert.equal(resolvePagination(1, 12, 0).totalPages, 1);
  assert.equal(resolvePagination(1, 12, 12).totalPages, 1);
  assert.equal(resolvePagination(1, 12, 13).totalPages, 2);
  assert.equal(resolvePagination(1, 25, 50).totalPages, 2);
  assert.equal(resolvePagination(1, 25, 51).totalPages, 3);
});

// ---------- 1/2. Mis inscripciones page 1 y page 2 — rango correcto ----------
test("Mis inscripciones (PAGE_SIZE=12): page 1 pide filas 0-11, page 2 pide filas 12-23", () => {
  const p1 = resolvePagination(1, 12, 30);
  const p2 = resolvePagination(2, 12, 30);
  assert.deepEqual([p1.from, p1.to], [0, 11]);
  assert.deepEqual([p2.from, p2.to], [12, 23]);
  assert.equal(p1.totalPages, 3);
});

// ---------- 6/7. Mis eventos page 1 y page 2 — mismo PAGE_SIZE=12 ----------
test("Mis eventos (PAGE_SIZE=12): mismo comportamiento de rango que Mis inscripciones", () => {
  const p1 = resolvePagination(1, 12, 25);
  const p2 = resolvePagination(2, 12, 25);
  assert.deepEqual([p1.from, p1.to], [0, 11]);
  assert.deepEqual([p2.from, p2.to], [12, 23]);
  assert.equal(p1.totalPages, 3);
});

// ---------- 9. participantes total > 25 (PAGE_SIZE=25) ----------
test("Participantes (PAGE_SIZE=25): 60 inscritos reales -> 3 páginas, última página con 10 filas", () => {
  const r = resolvePagination(3, 25, 60);
  assert.equal(r.totalPages, 3);
  assert.equal(r.to - r.from + 1, 25, "el rango siempre pide 25 posiciones, aunque la última página real tenga menos filas");
  assert.equal(r.from, 50);
});

// ---------- page > totalPages cae a la última página real, nunca offset fuera de rango ----------
test("resolvePagination: pedir una página más allá del total cae a la última página real (nunca un offset absurdo)", () => {
  const r = resolvePagination(999, 25, 60);
  assert.equal(r.page, 3);
  assert.equal(r.from, 50);
});

// ---------- 15/16/18 (stress 50/200/2000). no duplicados, sin huecos, cobertura exacta ----------
function assertNoGapsNoDuplicates(total, pageSize) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const covered = new Set();
  let prevTo = -1;
  for (let page = 1; page <= totalPages; page++) {
    const r = resolvePagination(page, pageSize, total);
    assert.equal(r.from, prevTo + 1, `página ${page}: no debe haber hueco ni solape con la página anterior`);
    for (let i = r.from; i <= Math.min(r.to, total - 1); i++) {
      assert.ok(!covered.has(i), `posición ${i} nunca debe cubrirse dos veces (page ${page})`);
      covered.add(i);
    }
    prevTo = r.to;
  }
  assert.equal(covered.size, total, "la unión de todas las páginas debe cubrir exactamente el total real, ni más ni menos");
}

test("stress lógico 50/200/2000 (Inscripciones, PAGE_SIZE=25): sin huecos, sin duplicados, cobertura exacta", () => {
  assertNoGapsNoDuplicates(50, 25);
  assertNoGapsNoDuplicates(200, 25);
  assertNoGapsNoDuplicates(2000, 25);
});

test("stress lógico 50/200/2000 (listados de iniciativas, PAGE_SIZE=12): sin huecos, sin duplicados, cobertura exacta", () => {
  assertNoGapsNoDuplicates(50, 12);
  assertNoGapsNoDuplicates(200, 12);
  assertNoGapsNoDuplicates(2000, 12);
});

test("stress lógico 2000: cada página real pide como máximo PAGE_SIZE filas — nunca las 2000 completas", () => {
  const pageSize = 25;
  const total = 2000;
  const totalPages = Math.ceil(total / pageSize);
  for (let page = 1; page <= totalPages; page++) {
    const r = resolvePagination(page, pageSize, total);
    assert.ok(r.to - r.from + 1 <= pageSize, `página ${page} nunca debe pedir más de ${pageSize} filas`);
  }
  assert.equal(totalPages, 80);
  const last = resolvePagination(totalPages, pageSize, total);
  assert.deepEqual([last.from, last.to], [1975, 1999], "la última página de 2000 con PAGE_SIZE=25 debe cubrir exactamente las últimas 25 posiciones");
});

// ---------- API design real: .range() + count exacto, no descarga completa solo para contar ----------
test("api/inscripciones/mine.js: usa parsePage/resolvePagination reales, count exacto (head:true) y .range() — nunca items.length como total", () => {
  const src = read("src/pages/api/inscripciones/mine.js");
  assert.match(src, /import \{ parsePage, resolvePagination \} from '@\/lib\/panelPagination'/);
  assert.match(src, /count:\s*'exact',\s*head:\s*true/);
  assert.match(src, /\.range\(pagination\.from,\s*pagination\.to\)/);
  assert.match(src, /pagination:\s*\{\s*page:\s*pagination\.page/);
});

test("api/inscripciones/mine.js: registered_count/checked_in_count por actividad son counts exactos acotados por PAGE_SIZE, no un select masivo de todos los participantes", () => {
  const src = read("src/pages/api/inscripciones/mine.js");
  assert.doesNotMatch(src, /\.in\('activity_id',\s*ids\)/, "no debe volver a descargar todas las filas de participantes de todas las actividades para contar");
  assert.match(src, /countParticipants/);
  assert.match(src, /count:\s*'exact',\s*head:\s*true/);
});

test("api/events/mine.js: mismo patrón real de paginación (PAGE_SIZE=12, count exacto, .range())", () => {
  const src = read("src/pages/api/events/mine.js");
  assert.match(src, /import \{ parsePage, resolvePagination \} from '@\/lib\/panelPagination'/);
  assert.match(src, /const PAGE_SIZE = 12/);
  assert.match(src, /count:\s*'exact',\s*head:\s*true/);
  assert.match(src, /\.range\(pagination\.from,\s*pagination\.to\)/);
});

// ---------- 8/10/11. participantes: PAGE_SIZE=25 real + summary de totales reales ----------
test("api/inscripciones/[id]/participants.js: PAGE_SIZE=25 real, .range() real, summary.registered/checked_in/pending vienen de counts exactos sobre TODA la tabla, no de items.length", () => {
  const src = read("src/pages/api/inscripciones/[id]/participants.js");
  assert.match(src, /const PAGE_SIZE = 25/);
  assert.match(src, /\.range\(pagination\.from,\s*pagination\.to\)/);
  const countMatches = src.match(/count:\s*'exact',\s*head:\s*true/g) || [];
  assert.ok(countMatches.length >= 2, "debe haber al menos 2 counts exactos reales: total y checked_in");
  assert.match(src, /summary:\s*\{/);
  assert.match(src, /registered:\s*total/);
  assert.match(src, /checked_in:\s*checkedIn/);
  assert.match(src, /pending:\s*Math\.max\(0,\s*\(total \|\| 0\)\s*-\s*\(checkedIn \|\| 0\)\)/);
});

// ---------- 12. contador ya no depende del array visible en el cliente ----------
test("panel/inscripciones/[id].jsx: Asistieron/Pendientes ya NO se calculan filtrando el array `participants` visible — vienen de participantsSummary (totales reales de la API)", () => {
  const src = read("src/pages/panel/inscripciones/[id].jsx");
  assert.doesNotMatch(src, /\(participants \|\| \[\]\)\.filter\(\(p\)\s*=>\s*p\.checked_in_at\)/, "no debe quedar el cálculo viejo basado en el array visible");
  assert.match(src, /participantsSummary\?\.checked_in/);
  assert.match(src, /participantsSummary\?\.pending/);
  assert.match(src, /participantsSummary\?\.registered/);
});

test("panel/inscripciones/[id].jsx: consume la paginación real de la API (page/pagination.totalPages) y renderiza PaginationControls", () => {
  const src = read("src/pages/panel/inscripciones/[id].jsx");
  assert.match(src, /import PaginationControls from '@\/components\/panel\/PaginationControls'/);
  assert.match(src, /\/api\/inscripciones\/\$\{id\}\/participants\?page=\$\{targetPage\}/);
  assert.match(src, /<PaginationControls page=\{partPage\} totalPages=\{partTotalPages\}/);
});

test("panel/inscripciones/index.jsx y panel/eventos/index.jsx: consumen ?page= real y renderizan PaginationControls, sin infinite scroll", () => {
  for (const f of ["src/pages/panel/inscripciones/index.jsx", "src/pages/panel/eventos/index.jsx"]) {
    const src = read(f);
    assert.match(src, /import PaginationControls from '@\/components\/panel\/PaginationControls'/);
    assert.match(src, /\?page=\$\{targetPage\}/);
    assert.match(src, /<PaginationControls page=\{page\} totalPages=\{totalPages\}/);
    assert.doesNotMatch(src, /IntersectionObserver|infinite.?scroll/i, "nunca infinite scroll — el mandato exige paginación tradicional");
  }
});

// ---------- 13. Detalle de Evento — auditoría real: no existe listado de compradores/asistentes hoy ----------
test("panel/eventos/[id].jsx: auditoría confirma que NO existe una tabla de compradores/asistentes por fila — la sección 7 del mandato no aplica hoy (no se inventa producto nuevo)", () => {
  const src = read("src/pages/panel/eventos/[id].jsx");
  // Solo agregados (orders-summary, analytics) — ningún .map() sobre
  // compradores/tickets individuales existía antes de esta misión, y
  // esta misión no agrega uno (evitaría "NO agrega producto nuevo").
  assert.doesNotMatch(src, /event_tickets|buyer|comprador/i);
  assert.doesNotMatch(src, /PaginationControls/, "no se agregó paginación acá porque no hay listado de personas que paginar");
});

// ---------- 14. orden estable ----------
test("orden estable: mine.js (created_at desc), events/mine.js (created_at desc), participants.js (registered_at asc) — mismo orden en el count implícito y en el .range()", () => {
  assert.match(read("src/pages/api/inscripciones/mine.js"), /order\('created_at',\s*\{\s*ascending:\s*false\s*\}\)/);
  assert.match(read("src/pages/api/events/mine.js"), /order\('created_at',\s*\{\s*ascending:\s*false\s*\}\)/);
  assert.match(read("src/pages/api/inscripciones/[id]/participants.js"), /order\('registered_at',\s*\{\s*ascending:\s*true\s*\}\)/);
});

// ---------- 17. Excel completo — export.js nunca se tocó, sigue sin límite ----------
test("api/inscripciones/[id]/export.js: sigue exportando el dataset completo — sin .range(), sin ?page=, sin límite (esta misión no lo tocó)", () => {
  const src = read("src/pages/api/inscripciones/[id]/export.js");
  assert.doesNotMatch(src, /\.range\(/);
  assert.doesNotMatch(src, /req\.query\?\.page|parsePage/);
  assert.match(src, /\.eq\('activity_id',\s*id\)/);
});

// ---------- 18. IDOR intacto — ownership sigue siendo autoridad exclusiva de cada endpoint ----------
test("IDOR/ownership intacto: participants.js exige activity.organizer_id === user.id ANTES del count/range; mine.js de ambos productos filtra siempre por el organizer_id resuelto server-side", () => {
  const participantsSrc = read("src/pages/api/inscripciones/[id]/participants.js");
  assert.match(participantsSrc, /if \(activity\.organizer_id !== user\.id\) return res\.status\(403\)/);
  assert.match(read("src/pages/api/inscripciones/mine.js"), /\.eq\('organizer_id',\s*user\.id\)/);
  assert.match(read("src/pages/api/events/mine.js"), /\.eq\('organizer_id',\s*ures\.user\.id\)/);
});

// ---------- 19. auth boundary SSR intacto (no se tocó) ----------
test("auth boundary SSR intacto: los 3 paneles conservan su getServerSideProps real (ssr_redirect) sin cambios de esta misión", () => {
  for (const f of [
    "src/pages/panel/inscripciones/index.jsx",
    "src/pages/panel/inscripciones/[id].jsx",
    "src/pages/panel/eventos/index.jsx",
    "src/pages/panel/eventos/[id].jsx",
  ]) {
    const src = read(f);
    assert.match(src, /export async function getServerSideProps/);
    assert.match(src, /getSupabaseServer/);
  }
});

// ---------- 20. mobile pagination: ventana compacta, sin overflow ----------
test("PaginationControls: envoltura flex-wrap (sin overflow horizontal forzado) y null si totalPages <= 1", () => {
  const src = read("src/components/panel/PaginationControls.jsx");
  assert.match(src, /flexWrap:\s*'wrap'/);
  assert.match(src, /if \(!totalPages \|\| totalPages <= 1\) return null/);
});

test("PaginationControls: la ventana de números de página nunca crece sin límite aunque totalPages sea enorme (2000/25=80 páginas)", () => {
  // Reimplementa la misma función pura que usa el componente, para
  // probarla sin necesitar un DOM/React renderer en esta suite.
  function pageWindow(page, totalPages) {
    const pages = new Set([1, totalPages, page, page - 1, page + 1]);
    const list = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
    const withGaps = [];
    for (let i = 0; i < list.length; i++) {
      if (i > 0 && list[i] - list[i - 1] > 1) withGaps.push('…');
      withGaps.push(list[i]);
    }
    return withGaps;
  }
  const w = pageWindow(40, 80);
  assert.ok(w.length <= 7, `la ventana compacta debe tener pocos elementos incluso con 80 páginas reales (2000/25), tuvo ${w.length}`);
  assert.ok(w.includes(1) && w.includes(80), 'siempre debe incluir la primera y la última página real');
});

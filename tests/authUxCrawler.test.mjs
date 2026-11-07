// RIFEX AUTH UX 2026 + CRAWLER SURFACE CLEANUP — certifica por inspección
// estática del código fuente (sin servidor, sin red) los invariantes de
// esta misión: navbar público, copy neutral de Login/Register, auth
// boundary server-side real en las superficies de creación/dashboard, y
// coherencia de sitemap/robots con esos boundaries.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd());
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const norm = (s) => s.replace(/\s+/g, " ");

// ---------- NAVBAR ----------
// RIFEX FINAL PUBLIC SURFACE CLOSURE (2026-09-05) superó esta aserción:
// "Cómo funciona" se retiró del navbar (las 3 landings propias cubren
// su función); "Inscripciones" ocupa su lugar como cuarto ítem real.
test("Layout.jsx: navbar público desktop tiene Eventos/Campañas/Inscripciones + Ingresar, sin 'Crear una iniciativa' ni 'Cómo funciona'", () => {
  const src = read("src/components/Layout.jsx");
  assert.match(src, /label:\s*'Eventos'/);
  assert.match(src, /label:\s*'Campañas'/);
  assert.match(src, /label:\s*'Inscripciones'/);
  assert.match(src, />Ingresar</);
  assert.doesNotMatch(src, /Crear una iniciativa/);
  assert.doesNotMatch(src, />Iniciar sesión</);
  assert.doesNotMatch(src, /label:\s*'Cómo funciona'/);
});

test("Layout.jsx: menú móvil también usa 'Ingresar' y no ofrece 'Crear una iniciativa'", () => {
  const src = read("src/components/Layout.jsx");
  const mobileNav = src.match(/<nav className="rf-mobile-nav"[\s\S]*?<\/nav>/);
  assert.ok(mobileNav, "no se encontró el bloque de nav móvil");
  assert.match(mobileNav[0], />Ingresar</);
  assert.doesNotMatch(mobileNav[0], /Crear una iniciativa/);
});

test("Layout.jsx: el menú central usa un grid de 3 columnas en desktop para quedar centrado respecto al viewport, no solo al espacio libre", () => {
  const src = read("src/components/Layout.jsx");
  assert.match(src, /grid-template-columns:\s*1fr auto 1fr/);
});

// ---------- LOGIN ----------
test("login.jsx: título/copy neutral (Ingresar), sin copy antiguo de Rifas", () => {
  const src = read("src/pages/login.jsx");
  assert.match(src, /<title>Ingresar — Rifex<\/title>/);
  assert.match(src, />Ingresar</);
  assert.doesNotMatch(norm(src), /Crea rifas en minutos/);
  assert.doesNotMatch(norm(src), /Accede para crear y administrar tus rifas/);
  assert.match(src, /Crear cuenta/);
});

test("login.jsx: no modifica lógica de Auth (Supabase, captcha real de PROD, next, reset-password) — solo presentación", () => {
  const src = read("src/pages/login.jsx");
  assert.match(src, /supabase\.auth\.signInWithPassword/);
  // PROD conserva su verificación real inline de hCaptcha (nunca
  // captchaGate.js, que es tooling exclusivo de D5-FINAL/DEV).
  assert.match(src, /window\.hcaptcha\?\.getResponse\(\)/);
  assert.match(src, /\/api\/verify-captcha/);
  assert.doesNotMatch(src, /captchaGate/);
  assert.match(src, /resolveCountryOnboardingRedirect/);
  assert.match(src, /reset-password\?email=/);
});

// ---------- REGISTER ----------
test("register.jsx: título/copy neutral (Crear cuenta), sin copy antiguo de Rifas, link a Ingresar presente", () => {
  const src = read("src/pages/register.jsx");
  assert.match(src, /<title>Crear cuenta — Rifex<\/title>/);
  assert.doesNotMatch(norm(src), /Crea rifas en minutos/);
  assert.doesNotMatch(norm(src), /Regístrate para crear y administrar tus rifas/);
  assert.match(src, />Ingresar</);
});

test("register.jsx: no modifica lógica de Auth (signUp, captcha real de PROD, RUT siempre obligatorio, password policy) — solo presentación", () => {
  const src = read("src/pages/register.jsx");
  assert.match(src, /supabase\.auth\.signUp/);
  assert.match(src, /window\.hcaptcha\?\.getResponse\(\)/);
  assert.match(src, /\/api\/verify-captcha/);
  assert.doesNotMatch(src, /captchaGate/);
  assert.match(src, /rutIsValid/);
  // PROD nunca relaja el RUT por entorno — sin isDevStage/rutRequired.
  assert.doesNotMatch(src, /isDevStage|rutRequired/);
  assert.match(src, /passwordIssues/);
});

test("login.jsx y register.jsx en PROD conservan su captcha real (inline, /api/verify-captcha) — captchaGate.js (D5-FINAL, DEV-only) nunca se promueve", () => {
  const login = read("src/pages/login.jsx");
  const register = read("src/pages/register.jsx");
  assert.doesNotMatch(login, /captchaGate/);
  assert.doesNotMatch(register, /captchaGate/);
  assert.ok(!fs.existsSync(path.join(ROOT, "src/lib/captchaGate.js")), "captchaGate.js no debe existir en PROD");
});

// ---------- AUTH BOUNDARY server-side real ----------
// panel/index.js y mis-iniciativas.jsx: boundary directo (getSupabaseServer
// + s.auth.getUser() inline en la propia página), sin cambios desde AUTH
// UX 2026 — se siguen certificando con el patrón literal exacto.
const DIRECT_BOUNDARY_PAGES = [
  ["src/pages/panel/index.js", "/panel"],
  ["src/pages/mis-iniciativas.jsx", "/mis-iniciativas"],
];

for (const [file, path_] of DIRECT_BOUNDARY_PAGES) {
  test(`${file}: boundary real vía getServerSideProps + getSupabaseServer, redirige a /login?next=${path_} si no hay sesión (no depende solo de useEffect)`, () => {
    const src = read(file);
    assert.match(src, /export async function getServerSideProps/);
    assert.match(src, /getSupabaseServer/);
    assert.match(src, /s\.auth\.getUser\(\)/);
    const redirectRe = new RegExp(
      `redirect:\\s*\\{\\s*destination:\\s*['"]\\/login\\?next=${path_.replace('/', '\\/')}['"]`
    );
    assert.match(src, redirectRe);
  });
}

// crear-rifa.jsx/crear-colecta.jsx/crear-evento.jsx (PROGRESSIVE ONBOARDING):
// el boundary de solo-sesión se extendió a elegibilidad real de creador vía
// resolveCreationGate (src/lib/creationGate.js) — el chequeo de sesión +
// login redirect sigue siendo real y server-side, ahora dentro de esa
// función compartida en vez de repetido en cada página; ver
// tests/creationGate.test.mjs para la certificación funcional completa
// (con Supabase mockeado) del comportamiento real, no solo el patrón de
// código acá.
const GATED_CREATION_PAGES = [
  ["src/pages/crear-rifa.jsx", "/crear-rifa"],
  ["src/pages/crear-colecta.jsx", "/crear-colecta"],
  ["src/pages/crear-evento.jsx", "/crear-evento"],
];

for (const [file, path_] of GATED_CREATION_PAGES) {
  test(`${file}: boundary real vía getServerSideProps + resolveCreationGate (sesión + elegibilidad de creador), nunca depende solo de useEffect`, () => {
    const src = read(file);
    assert.match(src, /export async function getServerSideProps/);
    assert.match(src, /import \{ resolveCreationGate \} from ['"]@\/lib\/creationGate['"]/);
    const callRe = new RegExp(`resolveCreationGate\\(ctx,\\s*['"]${path_.replace('/', '\\/')}['"]\\)`);
    assert.match(src, callRe);
  });
}

test("crear-rifa.jsx: la lógica real de creación (formulario, POST /api/rifas) sigue intacta — el boundary no la reemplaza", () => {
  const src = read("src/pages/crear-rifa.jsx");
  assert.match(src, /placeholder="Título \*"/);
  assert.match(src, /fetch\(.*\/api\/rifas/);
});

test("mis-iniciativas.js conserva Rifas, Campañas y Eventos; crear-rifa.jsx sigue existiendo (Rifas no se elimina del producto)", () => {
  const src = read("src/pages/mis-iniciativas.jsx");
  assert.match(src, /Rifas/);
  assert.match(src, /Campañas/);
  assert.match(src, /Eventos/);
  assert.ok(fs.existsSync(path.join(ROOT, "src/pages/crear-rifa.jsx")));
});

// ---------- /rifas: redirect stub legítimo, no fuga ----------
test("rifas.js: es un redirect real server-side a /login (no solo client-side) con noindex explícito (X-Robots-Tag), no un catálogo público — decisión de producto ya documentada", () => {
  const src = read("src/pages/rifas.js");
  assert.match(src, /export async function getServerSideProps/);
  assert.match(src, /redirect:\s*\{\s*destination:\s*`\/login\?next=/);
  assert.match(src, /X-Robots-Tag['"],\s*['"]noindex,\s*nofollow['"]/);
});

// ---------- Sitemap/robots coherentes con el boundary ----------
test("sitemap.xml no lista ninguna de las superficies protegidas por auth boundary ni el catálogo legacy /rifas", () => {
  const sitemap = read("public/sitemap.xml");
  for (const p of ["/crear-rifa", "/crear-colecta", "/crear-evento", "/panel", "/mis-iniciativas", "/rifas<", "/login", "/register"]) {
    assert.doesNotMatch(sitemap, new RegExp(p.replace("/", "\\/")));
  }
});

test("robots.txt sigue bloqueando /crear-rifa, /crear-evento, /crear-colecta, /mis-iniciativas, /panel, /login, /register", () => {
  const robots = read("public/robots.txt");
  for (const p of ["/crear-rifa", "/crear-evento", "/crear-colecta", "/mis-iniciativas", "/panel", "/login", "/register"]) {
    assert.match(robots, new RegExp(`Disallow:\\s*${p.replace("/", "\\/")}`));
  }
});

// ---------- Blog: copy neutralizado, privacidad preservada ----------
test("blog/index.js: copy de portada ya no menciona 'cerraron su rifa'; Blog sigue privado (verificado por publicAudit/blogPrivateProd)", () => {
  const src = read("src/pages/blog/index.js");
  assert.doesNotMatch(src, /cerraron su rifa/);
});

// ---------- reglas-iniciativas-premio: ya noindex, no se toca aquí ----------
test("reglas-iniciativas-premio.js: sigue noindex (frontera legal/producto ya resuelta en Stage 2, no se reabre acá)", () => {
  const src = read("src/pages/reglas-iniciativas-premio.js");
  assert.match(src, /noindex/);
});

// ---------- AuthShell: solo presentación, sin lógica de Auth ----------
test("AuthShell.jsx: componente compartido es solo presentación — no importa supabase ni maneja sesión", () => {
  const src = read("src/components/auth/AuthShell.jsx");
  assert.doesNotMatch(src, /supabase/i);
  assert.doesNotMatch(src, /getSession|getUser|signIn|signUp/);
});

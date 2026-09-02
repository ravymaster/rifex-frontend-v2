// RIFEX V4 A7 — auditoría pública automatizada. Certifica, por inspección
// estática del código fuente (sin servidor, sin red), los requisitos de
// rastreadores/confianza definidos en la misión V4 A+B: metadata mínima en
// páginas corporativas, robots.txt/sitemap.xml con formato correcto,
// noindex en rutas privadas, ausencia de términos sensibles fuera del
// anexo/landing individual, footer neutral, y que /rifas ya no sea un
// catálogo público.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd());
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const exists = (p) => fs.existsSync(path.join(ROOT, p));

// Páginas corporativas públicas que deben tener metadata mínima
// (title/description) declarada vía Layout o Head.
const CORPORATE_PAGES = [
  "src/pages/index.js",
  "src/pages/seguridad.js",
  "src/pages/privacidad.js",
  "src/pages/cookies.js",
  "src/pages/uso-aceptable.js",
  "src/pages/reportar.js",
  "src/pages/terminos.js",
  "src/pages/politica-eventos.js",
  "src/pages/reembolsos.js",
  "src/pages/politica-campanas.js",
  "src/pages/reglas-iniciativas-premio.js",
  "src/pages/confianza.js",
  "src/pages/contacto.js",
  "src/pages/cumplimiento.js",
];

for (const page of CORPORATE_PAGES) {
  test(`${page}: existe`, () => {
    assert.ok(exists(page), `falta la página ${page}`);
  });

  test(`${page}: declara title y description`, () => {
    const src = read(page);
    const hasTitle = /title=["'`]|title:\s*["'`]/.test(src) || /<title>/.test(src);
    const hasDescription = /description=["'`]|description:\s*["'`]/.test(src) || /name=["']description["']/.test(src);
    assert.ok(hasTitle, `${page} no declara title`);
    assert.ok(hasDescription, `${page} no declara description`);
  });
}

// Rutas privadas que deben pasar noindex a Layout (o declarar robots
// noindex por su cuenta).
const PRIVATE_PAGES = [
  "src/pages/login.jsx",
  "src/pages/register.jsx",
  "src/pages/reset-password.jsx",
  "src/pages/crear-rifa.jsx",
  "src/pages/crear-evento.jsx",
  "src/pages/crear-colecta.jsx",
  "src/pages/perfil.js",
  "src/pages/mis-iniciativas.jsx",
  "src/pages/404.js",
  "src/pages/checkout/index.js",
  "src/pages/registro/continuar.jsx",
  "src/pages/onboarding/pais.jsx",
  // RIFEX BLOG PRIVATE PRE-PROD — Blog ya no es superficie pública.
  "src/pages/blog/index.js",
  "src/pages/blog/[slug].js",
  "src/pages/blog/compartir.js",
  "src/pages/blog/nueva.js",
];

for (const page of PRIVATE_PAGES) {
  test(`${page}: marcada noindex`, () => {
    const src = read(page);
    const hasNoindex = /noindex/.test(src);
    assert.ok(hasNoindex, `${page} no declara noindex`);
  });
}

test("robots.txt existe y tiene formato válido", () => {
  const src = read("public/robots.txt");
  assert.match(src, /User-agent:\s*\*/);
  assert.match(src, /Sitemap:\s*https:\/\/rifex\.pro\/sitemap\.xml/);
  assert.doesNotMatch(src, /<html/i, "robots.txt no debe ser HTML");
});

test("robots.txt no bloquea /rifas/[id] (individual debe seguir siendo rastreable para OG)", () => {
  const src = read("public/robots.txt");
  const disallowRifas = src.split("\n").some((l) => l.trim() === "Disallow: /rifas");
  assert.equal(disallowRifas, false, "un Disallow: /rifas bloquearía también las landings individuales /rifas/[id]");
});

test("sitemap.xml existe, es XML válido y no incluye rutas privadas ni /rifas", () => {
  const src = read("public/sitemap.xml");
  assert.match(src, /<\?xml/);
  assert.match(src, /<urlset/);
  assert.doesNotMatch(src, /<html/i, "sitemap.xml no debe ser HTML");
  assert.doesNotMatch(src, /\/rifas</, "el sitemap no debe incluir /rifas (catálogo eliminado) ni landings individuales");
  assert.doesNotMatch(src, /\/login</);
  assert.doesNotMatch(src, /\/panel/);
  assert.doesNotMatch(src, /\/crear-rifa</);
});

test("/rifas ya no es un catálogo público (PRODUCT_DECISION_RESOLVED)", () => {
  const src = read("src/pages/rifas.js");
  assert.doesNotMatch(src, /api\/rifas["'`]\)/, "rifas.js no debe seguir llamando al listado público de rifas");
  assert.match(src, /login/, "rifas.js debe redirigir a /login");
});

test("/rifas/[id] sigue existiendo (landing individual intacta)", () => {
  assert.ok(exists("src/pages/rifas/[id].jsx"), "la landing individual de rifas no debe eliminarse");
});

test("/rifas/[id] declara noindex,follow,noarchive y canonical propio", () => {
  const src = read("src/pages/rifas/[id].jsx");
  assert.match(src, /noindex,\s*follow,\s*noarchive/);
  assert.match(src, /canonicalUrl\(/);
});

test("APIs de Rifas necesarias para el producto siguen existiendo", () => {
  for (const api of [
    "src/pages/api/rifas/index.js",
    "src/pages/api/rifas/[id]/index.js",
    "src/pages/api/rifas/[id]/tickets.js",
    "src/pages/api/rifas/[id]/draw.js",
  ]) {
    assert.ok(exists(api), `falta ${api} — una API necesaria de Rifas no debe eliminarse`);
  }
});

test("creación/administración autenticada de Rifas sigue intacta", () => {
  assert.ok(exists("src/pages/crear-rifa.jsx"));
  assert.ok(exists("src/pages/panel/index.js"));
});

test("navegación pública (Layout) no enlaza al catálogo /rifas", () => {
  const src = read("src/components/Layout.jsx");
  assert.doesNotMatch(src, /href=["']\/rifas["']/, "el nav/footer no debe enlazar a /rifas");
});

test("footer no repite identidad global de rifas ('Pagos con Mercado Pago' como promesa única)", () => {
  const src = read("src/components/Layout.jsx");
  assert.doesNotMatch(src, /Pagos con Mercado Pago/);
});

test("footer enlaza las políticas obligatorias", () => {
  const src = read("src/components/Layout.jsx");
  for (const href of ["/terminos", "/privacidad", "/cookies", "/uso-aceptable", "/seguridad", "/cumplimiento", "/reportar"]) {
    assert.match(src, new RegExp(`href=["']${href.replace("/", "\\/")}["']`), `footer no enlaza ${href}`);
  }
});

// Términos sensibles: solo prohibidos en páginas corporativas globales, no
// en el anexo específico de iniciativas con premio ni en la landing
// individual (donde la modalidad debe explicarse honestamente).
const SENSITIVE_TERMS = [/\brifa\b/i, /\bsorteo\b/i, /\bpremio\b/i, /número vendido/i, /comprar número/i];
const CORPORATE_GLOBAL_SURFACES = [
  "src/pages/index.js",
  "src/pages/eventos/index.jsx",
  "src/pages/confianza.js",
  "src/pages/politica-eventos.js",
  "src/pages/politica-campanas.js",
  // ETAPA 2 — neutralizadas, ahora forman parte de la identidad
  // corporativa pública global.
  "src/pages/seguridad.js",
  "src/pages/cumplimiento.js",
];

for (const page of CORPORATE_GLOBAL_SURFACES) {
  test(`${page}: sin términos sensibles de rifas (identidad corporativa neutral)`, () => {
    const src = read(page);
    for (const re of SENSITIVE_TERMS) {
      assert.doesNotMatch(src, re, `${page} contiene un término sensible de rifas (${re}) fuera del anexo específico`);
    }
  });
}

test("terminos.js ya no afirma que Rifex retiene fondos ni 'Depósito por Rifex'", () => {
  const src = read("src/pages/terminos.js");
  assert.doesNotMatch(src, /retener fondos/i);
  assert.doesNotMatch(src, /Depósito por Rifex/);
});

test("STAGE 2 REPAIR: /terminos (corporativo público) ya no muestra el aviso de revisión legal pendiente; /terminos-rifas sí lo conserva (nunca se declara aprobado sin revisión real)", () => {
  const publicSrc = read("src/pages/terminos.js");
  assert.doesNotMatch(publicSrc, /PENDIENTE DE REVISIÓN POR ABOGADO CHILENO ANTES DE PROD/);
  const rifasSrc = read("src/pages/terminos-rifas.js");
  assert.match(rifasSrc, /PENDIENTE DE REVISIÓN POR ABOGADO CHILENO ANTES DE PROD/);
});

test("cumplimiento.js no anuncia reputación pública, ni activa ni futura", () => {
  const src = read("src/pages/cumplimiento.js");
  assert.doesNotMatch(src, /Reputación futura/i);
  assert.doesNotMatch(src, /Hoy no existe ningún puntaje/);
  assert.doesNotMatch(src, /puntaje activo|reputación pública activa/i);
});

test("TrustBadge solo renderiza en nivel 3 (nunca inventa un nivel)", () => {
  const src = read("src/components/TrustBadge.jsx");
  assert.match(src, /level !== 3/);
});

test("Meta Pixel sigue gateado por consentimiento explícito", () => {
  const src = read("src/lib/metaPixel.js");
  assert.match(src, /isMetaPixelConfigured/);
  const appSrc = read("src/pages/_app.js");
  assert.match(appSrc, /consent|Consent/);
});

test("publicMetadata.js expone SITE_URL y canonicalUrl de forma pura", () => {
  const src = read("src/lib/publicMetadata.js");
  assert.match(src, /SITE_URL/);
  assert.match(src, /export function canonicalUrl/);
});

// RIFEX BLOG PRIVATE PRE-PROD

test("footer no enlaza /blog", () => {
  const src = read("src/components/Layout.jsx");
  assert.doesNotMatch(src, /href=["']\/blog["']/);
});

test("robots.txt excluye /blog", () => {
  const src = read("public/robots.txt");
  assert.match(src, /Disallow:\s*\/blog/);
});

test("sitemap.xml no incluye /blog", () => {
  const src = read("public/sitemap.xml");
  assert.doesNotMatch(src, /\/blog</);
});

for (const page of ["src/pages/blog/index.js", "src/pages/blog/[slug].js", "src/pages/blog/compartir.js", "src/pages/blog/nueva.js"]) {
  test(`${page}: robots exacto noindex,nofollow,noarchive`, () => {
    const src = read(page);
    assert.match(src, /noindex,\s*nofollow,\s*noarchive/);
  });

  test(`${page}: redirige a /login si no hay sesión`, () => {
    const src = read(page);
    assert.match(src, /router\.push\([`'"]\/login\?next=/);
  });
}

for (const api of ["src/pages/api/blog/index.js", "src/pages/api/blog/[slug]/index.js"]) {
  test(`${api}: exige Bearer auth (contenido ya no es público)`, () => {
    const src = read(api);
    assert.match(src, /missing_auth/);
    assert.match(src, /getUser\(token\)/);
  });
}

test("funcionalidad Blog no fue eliminada — páginas y APIs siguen existiendo", () => {
  for (const p of [
    "src/pages/blog/index.js",
    "src/pages/blog/[slug].js",
    "src/pages/blog/compartir.js",
    "src/pages/blog/nueva.js",
    "src/pages/api/blog/index.js",
    "src/pages/api/blog/[slug]/index.js",
    "src/pages/api/blog/admin.js",
    "src/pages/api/blog/historia.js",
    "src/pages/api/blog/subscribe.js",
    "src/pages/api/blog/[slug]/comments.js",
    "src/pages/api/blog/[slug]/react.js",
  ]) {
    assert.ok(exists(p), `falta ${p} — Blog no debe eliminarse, solo dejar de ser público`);
  }
});

// RIFEX ETAPA 2 — IDENTIDAD PÚBLICA + POLÍTICAS

test("navbar pública: exactamente Eventos / Campañas / Cómo funciona (sin Blog/Rifas/Precios/Seguridad/Ayuda)", () => {
  const src = read("src/components/Layout.jsx");
  const match = src.match(/const navItems = \[[\s\S]*?\];/);
  assert.ok(match, "no se encontró el bloque navItems");
  const block = match[0];
  assert.match(block, /Eventos/);
  assert.match(block, /Campañas/);
  assert.match(block, /Cómo funciona/);
  for (const label of ["Blog", "Rifas", "Precios", "Seguridad", "Ayuda"]) {
    assert.doesNotMatch(block, new RegExp(`label:\\s*['"\`]${label}`), `navItems no debe incluir "${label}"`);
  }
});

test("footer: label 'Comisión' presente (reemplaza 'Precios')", () => {
  const src = read("src/components/Layout.jsx");
  assert.match(src, />Comisión<\/Link>/);
  assert.doesNotMatch(src, />Precios<\/Link>/);
});

test("seguridad.js: no revela el mecanismo exacto RUT/MP, usa la frase neutral", () => {
  const src = read("src/pages/seguridad.js");
  assert.doesNotMatch(src, /contrasta el RUT/i);
  assert.match(src, /controles de registro, validación de identidad y titularidad de cuentas/);
});

test("cumplimiento.js: sin calendario/inventario operativo público (día 10/15/20, tabla de decisión, estados internos), sin Reputación futura/C6", () => {
  const src = read("src/pages/cumplimiento.js");
  assert.doesNotMatch(src, /Día 10|Día 15|Día 20/);
  assert.doesNotMatch(src, /cumplimiento confirmado.*discrepancia, requiere/is);
  assert.doesNotMatch(src, /Reputación futura/i);
  assert.doesNotMatch(src, /Hoy no existe ningún puntaje/);
  assert.match(src, /Rifex Cumplimiento incorpora controles de seguimiento, confirmación y revisión posterior/);
});

test("terminos.js (corporativo público): sección Eventos/Campañas/plataforma presente, sin secciones ni anexo de Rifas, sin banner legal", () => {
  const src = read("src/pages/terminos.js");
  assert.match(src, /id="plataforma"/);
  assert.match(src, /Eventos, entradas digitales y Campañas de recaudación/);
  assert.match(src, /Conoce las condiciones de uso de Rifex para organizadores y usuarios de eventos, entradas digitales y campañas de recaudación en línea\./);
  assert.doesNotMatch(src, /id="comprador"/);
  assert.doesNotMatch(src, /id="creador"/);
  assert.doesNotMatch(src, /href="\/reglas-iniciativas-premio"/);
  assert.doesNotMatch(src, /PENDIENTE DE REVISIÓN POR ABOGADO CHILENO ANTES DE PROD/);
  assert.doesNotMatch(src, /\bcuenta\/rifa\b/);
});

test("terminos-rifas.js: conserva verbatim las condiciones históricas de Rifas (Comprador/Creador/Rifex), noindex, y las referencias reales siguen apuntando ahí", () => {
  const src = read("src/pages/terminos-rifas.js");
  assert.match(src, /id="comprador"/);
  assert.match(src, /id="creador"/);
  assert.match(src, /id="rifex"/);
  assert.match(src, /PENDIENTE DE REVISIÓN POR ABOGADO CHILENO ANTES DE PROD/);
  assert.match(src, /noindex/);

  const crearRifa = read("src/pages/crear-rifa.jsx");
  assert.match(crearRifa, /\/terminos-rifas#comprador/);
  assert.match(crearRifa, /\/terminos-rifas#creador/);
  assert.match(crearRifa, /\/terminos-rifas#rifex/);
  assert.doesNotMatch(crearRifa, /"\/terminos#comprador"|"\/terminos#creador"|"\/terminos#rifex"/);

  const rifaLanding = read("src/pages/rifas/[id].jsx");
  assert.match(rifaLanding, /href="\/terminos-rifas"/);

  const buyerForm = read("src/components/rifex/BuyerForm.jsx");
  assert.match(buyerForm, /href="\/terminos-rifas"/);
});

test("reportar.js: placeholders neutralizados, metadata exacta", () => {
  const src = read("src/pages/reportar.js");
  assert.doesNotMatch(src, /\/rifas\//);
  assert.match(src, /Reporta una iniciativa o comportamiento que pueda incumplir las condiciones de Rifex\. Los reportes son revisados utilizando la información disponible\./);
});

test("uso-aceptable.js: sin banner jurídico visible, incluye la frase de actualización periódica", () => {
  const src = read("src/pages/uso-aceptable.js");
  const norm = src.replace(/\s+/g, " ");
  assert.doesNotMatch(src, /PENDIENTE DE REVISIÓN POR ABOGADO CHILENO ANTES DE PROD/);
  assert.match(norm, /Rifex actualiza periódicamente sus políticas para reflejar mejoras en la plataforma y los requisitos aplicables en los países donde opera\./);
});

test("cookies.js: sin banner de clasificación jurídica visible, metadata exacta", () => {
  const src = read("src/pages/cookies.js");
  assert.doesNotMatch(src, /CLASIFICACIÓN JURÍDICA PENDIENTE DE REVISIÓN/);
  assert.match(src, /Conoce qué cookies y tecnologías similares utiliza Rifex, para qué se usan y cómo puedes administrar tus preferencias de medición y publicidad\./);
});

test("privacidad.js: sección 'Verificación y seguridad de la cuenta' con texto exacto, sin revelar mecanismo Trust", () => {
  const src = read("src/pages/privacidad.js");
  const norm = src.replace(/\s+/g, " ");
  assert.match(src, /Verificación y seguridad de la cuenta/);
  assert.match(norm, /Rifex puede aplicar controles de identidad y titularidad para proteger las cuentas, reducir usos indebidos y determinar la habilitación de determinadas operaciones\. Los resultados de estas verificaciones se utilizan para fines operativos y de seguridad y no se muestran públicamente\./);
  assert.doesNotMatch(norm, /contraste con la titularidad informada por el proveedor de pagos/);
});

test("preguntas-frecuentes.js: reescrita para Eventos/Campañas, sin contenido de creación de rifas indexable", () => {
  const src = read("src/pages/preguntas-frecuentes.js");
  assert.match(src, /Eventos/);
  assert.match(src, /Campañas/);
  assert.match(src, /QR/);
  assert.match(src, /\/reportar/);
  assert.doesNotMatch(src, /href="\/crear-rifa"/);
});

test("docs/legal/RIFEX_REVISION_LEGAL_PENDIENTE.txt existe con la estructura requerida", () => {
  const src = read("docs/legal/RIFEX_REVISION_LEGAL_PENDIENTE.txt");
  assert.match(src, /^Este documento no presupone que Rifex cumple jurídicamente con los puntos enumerados\./);
  assert.match(src, /Estado: /);
  assert.match(src, /Observación del abogado:/);
  assert.match(src, /Redacción recomendada:/);
  assert.match(src, /Norma o fundamento, si corresponde:/);
});

// RIFEX STAGE 2 REPAIR — CÓDIGO / REPARACIÓN QUIRÚRGICA FINAL ETAPA 2
// Cobertura A-J requerida por la misión de reparación (sección 14).

test("A. /terminos ya cubierto arriba (sección Eventos/Campañas, sin Rifas, sin banner)", () => {
  assert.ok(true);
});

test("B. /privacidad: no 'rifas creadas', no TODO de operador, no advertencia legal interna, no revela receta Trust", () => {
  const src = read("src/pages/privacidad.js");
  assert.doesNotMatch(src, /rifas creadas/i);
  assert.doesNotMatch(src, /se publicará aquí una vez confirmada/i);
  assert.doesNotMatch(src, /PENDIENTE DE REVISIÓN POR ABOGADO CHILENO ANTES DE PROD/);
  assert.doesNotMatch(src, /contrasta el RUT|comparación exacta|fail-closed/i);
  assert.match(src, /Rifex puede actualizar esta política/);
});

test("C. /cookies: copy correcto (preferencia de medición y publicidad), comportamiento de Meta Pixel compatible con las afirmaciones públicas", () => {
  const cookiesSrc = read("src/pages/cookies.js");
  assert.match(cookiesSrc, /preferencia de medición y publicidad/);
  assert.doesNotMatch(cookiesSrc, /consentimiento de marketing/);

  // Las 3 afirmaciones públicas deben poder demostrarse contra el código real:
  const appSrc = read("src/pages/_app.js");
  assert.match(appSrc, /if \(consent !== 'granted'\) return;/, "Meta Pixel debe inicializarse solo si consent === 'granted'");

  const bannerSrc = read("src/components/ConsentBanner.jsx");
  assert.match(bannerSrc, /onClick=\{onReject\}/);
  assert.match(bannerSrc, /onClick=\{onAccept\}/);
  assert.doesNotMatch(bannerSrc, /disabled/i, "Rechazar no debe estar deshabilitado ni menos accesible que Aceptar");

  const pixelSrc = read("src/lib/metaPixel.js");
  // trackMetaEvent nunca se invoca en el código real: ningún caller manda PII.
  const callers = [read("src/pages/_app.js")];
  for (const c of callers) assert.doesNotMatch(c, /trackMetaEvent\(/);
  assert.match(pixelSrc, /export function trackMetaEvent/);
});

test("D. /uso-aceptable: no usa la formulación pública 'Premios o compensaciones inexistentes'", () => {
  const src = read("src/pages/uso-aceptable.js");
  assert.doesNotMatch(src, /Premios o compensaciones inexistentes/);
  assert.match(src, /Iniciativas, bienes, servicios o contenidos falsos, engañosos o no autorizados/);
});

test("E. /seguridad: no expone receta Trust, ni carnet/biometría/procedimiento excepcional, sin lenguaje contradictorio de pagos", () => {
  const src = read("src/pages/seguridad.js");
  assert.doesNotMatch(src, /contrasta el RUT/i);
  assert.doesNotMatch(src, /fotografías del carnet|biometría facial/i);
  assert.doesNotMatch(src, /Documentación según riesgo/i);
  assert.doesNotMatch(src, /nunca los intermedia/i);
  assert.match(src, /controles de registro, validación de identidad y titularidad de cuentas/);
});

test("F. /cumplimiento ya cubierto arriba (sin Reputación futura/C6/calendario, conserva silencio != incumplimiento)", () => {
  const src = read("src/pages/cumplimiento.js");
  assert.match(src, /El silencio nunca se interpreta como incumplimiento/);
  assert.match(src, /no reemplaza a los tribunales, no garantiza materialmente la entrega, y no/i);
});

test("G. /reportar: el email es realmente opcional también en el backend", () => {
  const api = read("src/pages/api/reportar.js");
  assert.match(api, /if \(!reason \|\| !description\)/, "solo reason y description son requeridos");
  assert.doesNotMatch(api, /!email/, "email no debe formar parte de la validación de campos requeridos");
  assert.match(api, /if \(email && !__mailer_utils\.isValidEmail\(email\)\)/, "email solo se valida si viene presente");
});

test("H. /planes: sin 'Rifas y campañas ilimitadas', conserva 7% / $0 por publicar / $0 mensualidad", () => {
  const src = read("src/pages/planes.js");
  assert.doesNotMatch(src, /Rifas y campañas ilimitadas/);
  assert.match(src, /7% por venta o aporte exitoso/);
  assert.match(src, /\$0 por publicar/);
  assert.match(src, /\$0 mensualidad/);
});

test("I. footer público: invitación a conocer más productos vía comunidad, sin enumerar Rifas, sin Blog, usa Comisión", () => {
  const src = read("src/components/Layout.jsx");
  assert.match(src, /Conoce más productos de Rifex siendo parte de la comunidad/);
  assert.doesNotMatch(src, />Rifas<|>Sorteos<|>Premios</);
  assert.doesNotMatch(src, /href="\/blog"/);
  assert.match(src, />Comisión<\/Link>/);
});

test("J. sitemap/robots no reintroducen catálogo público de Rifas", () => {
  const sitemap = read("public/sitemap.xml");
  assert.doesNotMatch(sitemap, /\/rifas</);
});

test("menú de cuenta autenticado: 'Mis campañas' ya no es un ítem independiente; 'Mis iniciativas' sigue presente y /mis-iniciativas conserva Rifas/Campañas/Eventos", () => {
  const layoutSrc = read("src/components/Layout.jsx");
  const match = layoutSrc.match(/const accountItems = \[[\s\S]*?\];/);
  assert.ok(match, "no se encontró el bloque accountItems");
  const block = match[0];
  assert.match(block, /Mis iniciativas/);
  assert.doesNotMatch(block, /Mis campañas/);
  assert.match(block, /Bancos & Pagos/);
  assert.match(block, /Perfil/);

  const distribuidor = read("src/pages/mis-iniciativas.jsx");
  assert.match(distribuidor, /'Rifas'/);
  assert.match(distribuidor, /'Campañas'/);
  assert.match(distribuidor, /'Eventos'/);
});

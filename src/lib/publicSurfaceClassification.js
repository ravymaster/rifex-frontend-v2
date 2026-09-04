// src/lib/publicSurfaceClassification.js
// PUBLIC SURFACE CLASSIFICATION GUARD (PSCG) — registro explícito y
// testeable de a qué categoría pertenece cada ruta pública/privada de
// Rifex. No reemplaza robots.txt, sitemap.xml, Layout ni los boundaries
// SSR reales — es la capa mínima que hace esas decisiones explícitas y
// verificables en un solo lugar, en vez de quedar implícitas en cada
// página por separado.
//
// Ver docs/public-surface/PUBLIC_SURFACE_CLASSIFICATION_GUARD.md para la
// explicación completa de las 4 categorías y sus obligaciones.
//
// REGLA FUTURA: toda ruta nueva debe agregarse acá con una categoría
// válida ANTES de mergear. Este registro cubre hoy el baseline auditado
// más las rutas tocadas por la misión que introdujo PSCG — no es un
// backfill retroactivo de cada ruta histórica del repo (deuda documentada
// en la guía, sección "Alcance").

export const PSCG_CATEGORY = Object.freeze({
  PUBLIC_INDEXABLE: "PUBLIC_INDEXABLE",
  PUBLIC_NOINDEX: "PUBLIC_NOINDEX",
  PRIVATE_AUTHENTICATED: "PRIVATE_AUTHENTICATED",
  LEGACY_REMOVED: "LEGACY_REMOVED",
});

const CATEGORIES = Object.values(PSCG_CATEGORY);

export function isValidPscgCategory(value) {
  return CATEGORIES.includes(value);
}

// `boundary` (solo aplica a PRIVATE_AUTHENTICATED) describe el mecanismo
// REAL de protección encontrado en el código, no uno deseado:
//   - "ssr_redirect": getServerSideProps devuelve { redirect } directo
//     para anónimos. El estándar para rutas nuevas.
//   - "ssr_gate_redirect": getServerSideProps delega en una función de
//     gate compartida (p.ej. resolveCreationGate) que devuelve
//     { redirect }. Igual de fuerte, evita duplicar la lógica de sesión.
//   - "ssr_hydrate_client_gate": getServerSideProps existe e hidrata la
//     sesión, pero NO redirige — el redirect y el gate de renderizado
//     quedan en el cliente. Más débil que las dos anteriores.
//   - "client_redirect": sin SSR — useEffect client-side revisa sesión y
//     redirige; el contenido privado no se renderiza antes de resolver
//     la verificación (null o placeholder genérico).
//   - "client_redirect_api_auth": igual que client_redirect, más las
//     APIs de datos exigen Bearer token propio — doble capa, ninguna de
//     las dos es SSR.
export const PSCG_BOUNDARY = Object.freeze({
  SSR_REDIRECT: "ssr_redirect",
  SSR_GATE_REDIRECT: "ssr_gate_redirect",
  SSR_HYDRATE_CLIENT_GATE: "ssr_hydrate_client_gate",
  CLIENT_REDIRECT: "client_redirect",
  CLIENT_REDIRECT_API_AUTH: "client_redirect_api_auth",
});

// Registro auditado contra el estado real del repo (no asumido) al
// introducir PSCG. path = ruta pública; file = archivo de página relativo
// a la raíz del repo (null si la ruta no corresponde a un solo archivo
// de página, p.ej. la home). notes documenta hallazgos reales, incluida
// deuda pre-existente que esta misión no resuelve.
export const PSCG_REGISTRY = [
  // ---------- PUBLIC_INDEXABLE (idéntico a sitemap.xml) ----------
  { path: "/", file: "src/pages/index.js", category: PSCG_CATEGORY.PUBLIC_INDEXABLE },
  { path: "/eventos", file: "src/pages/eventos/index.jsx", category: PSCG_CATEGORY.PUBLIC_INDEXABLE },
  {
    path: "/inscripciones",
    file: "src/pages/inscripciones.jsx",
    category: PSCG_CATEGORY.PUBLIC_INDEXABLE,
    notes: "INSCRIPCIONES V1 — landing comercial estático. Nunca un directorio de actividades de usuarios (eso es /inscripcion/[id], PUBLIC_NOINDEX). No muestra Plus/Gold/precios futuros.",
  },
  { path: "/wizard", file: "src/pages/wizard.js", category: PSCG_CATEGORY.PUBLIC_INDEXABLE },
  { path: "/planes", file: "src/pages/planes.js", category: PSCG_CATEGORY.PUBLIC_INDEXABLE },
  { path: "/seguridad", file: "src/pages/seguridad.js", category: PSCG_CATEGORY.PUBLIC_INDEXABLE },
  { path: "/confianza", file: "src/pages/confianza.js", category: PSCG_CATEGORY.PUBLIC_INDEXABLE },
  { path: "/privacidad", file: "src/pages/privacidad.js", category: PSCG_CATEGORY.PUBLIC_INDEXABLE },
  { path: "/cookies", file: "src/pages/cookies.js", category: PSCG_CATEGORY.PUBLIC_INDEXABLE },
  { path: "/terminos", file: "src/pages/terminos.js", category: PSCG_CATEGORY.PUBLIC_INDEXABLE },
  { path: "/uso-aceptable", file: "src/pages/uso-aceptable.js", category: PSCG_CATEGORY.PUBLIC_INDEXABLE },
  { path: "/reportar", file: "src/pages/reportar.js", category: PSCG_CATEGORY.PUBLIC_INDEXABLE },
  { path: "/politica-eventos", file: "src/pages/politica-eventos.js", category: PSCG_CATEGORY.PUBLIC_INDEXABLE },
  { path: "/politica-campanas", file: "src/pages/politica-campanas.js", category: PSCG_CATEGORY.PUBLIC_INDEXABLE },
  { path: "/reembolsos", file: "src/pages/reembolsos.js", category: PSCG_CATEGORY.PUBLIC_INDEXABLE },
  { path: "/cumplimiento", file: "src/pages/cumplimiento.js", category: PSCG_CATEGORY.PUBLIC_INDEXABLE },
  { path: "/contacto", file: "src/pages/contacto.js", category: PSCG_CATEGORY.PUBLIC_INDEXABLE },
  { path: "/preguntas-frecuentes", file: "src/pages/preguntas-frecuentes.js", category: PSCG_CATEGORY.PUBLIC_INDEXABLE },

  // ---------- PUBLIC_NOINDEX ----------
  {
    path: "/reglas-iniciativas-premio",
    file: "src/pages/reglas-iniciativas-premio.js",
    category: PSCG_CATEGORY.PUBLIC_NOINDEX,
    robotsDisallow: false,
    notes:
      "Anexo legal de Rifas, accesible por link legítimo desde /reembolsos. noindex + fuera de sitemap, pero deliberadamente NO Disallow'd — sigue la guía de Google de no combinar Disallow con noindex cuando la señal real es noindex.",
  },
  {
    path: "/terminos-rifas",
    file: "src/pages/terminos-rifas.js",
    category: PSCG_CATEGORY.PUBLIC_NOINDEX,
    robotsDisallow: false,
    notes: "Mismo tratamiento que /reglas-iniciativas-premio — condiciones históricas de Rifas, noindex, fuera de sitemap, no Disallow'd.",
  },
  {
    path: "/login",
    file: "src/pages/login.jsx",
    category: PSCG_CATEGORY.PUBLIC_NOINDEX,
    robotsDisallow: true,
    notes: "Accesible sin sesión por necesidad funcional (es el punto de entrada de auth). noindex + Disallow.",
  },
  {
    path: "/register",
    file: "src/pages/register.jsx",
    category: PSCG_CATEGORY.PUBLIC_NOINDEX,
    robotsDisallow: true,
    notes: "Mismo caso que /login.",
  },
  {
    path: "/inscripcion/[id]",
    file: "src/pages/inscripcion/[id].jsx",
    category: PSCG_CATEGORY.PUBLIC_NOINDEX,
    robotsDisallow: false,
    notes: "INSCRIPCIONES V1 — página pública de UNA actividad, compartible por link, sin login para el participante. noindex+nofollow (Layout noindex prop), fuera de sitemap, no Disallow'd (misma guía que /reglas-iniciativas-premio: no combinar Disallow con noindex cuando la señal real es noindex).",
  },
  {
    path: "/i/[token]",
    file: "src/pages/i/[token].jsx",
    category: PSCG_CATEGORY.PUBLIC_NOINDEX,
    robotsDisallow: false,
    notes: "INSCRIPCIONES V1 — resolución pública del QR de un participante, hermano de /t/[token] (Eventos). GET puro, nunca consume/modifica la inscripción. noindex, no Disallow'd, mismo criterio que /inscripcion/[id].",
  },

  // ---------- PRIVATE_AUTHENTICATED ----------
  {
    path: "/crear-rifa",
    file: "src/pages/crear-rifa.jsx",
    category: PSCG_CATEGORY.PRIVATE_AUTHENTICATED,
    boundary: PSCG_BOUNDARY.SSR_GATE_REDIRECT,
    robotsDisallow: true,
  },
  {
    path: "/crear-colecta",
    file: "src/pages/crear-colecta.jsx",
    category: PSCG_CATEGORY.PRIVATE_AUTHENTICATED,
    boundary: PSCG_BOUNDARY.SSR_GATE_REDIRECT,
    robotsDisallow: true,
  },
  {
    path: "/crear-evento",
    file: "src/pages/crear-evento.jsx",
    category: PSCG_CATEGORY.PRIVATE_AUTHENTICATED,
    boundary: PSCG_BOUNDARY.SSR_GATE_REDIRECT,
    robotsDisallow: true,
  },
  {
    path: "/crear-inscripcion",
    file: "src/pages/crear-inscripcion.jsx",
    category: PSCG_CATEGORY.PRIVATE_AUTHENTICATED,
    boundary: PSCG_BOUNDARY.SSR_REDIRECT,
    robotsDisallow: true,
    notes: "INSCRIPCIONES V1 — gate propio (sesión + assertOnboardingComplete), deliberadamente NO resolveCreationGate/assertCreatorEligible (sección 4 del mandato: Inscripciones no exige MP/Trust financiero).",
  },
  {
    path: "/panel/inscripciones",
    file: "src/pages/panel/inscripciones/index.jsx",
    category: PSCG_CATEGORY.PRIVATE_AUTHENTICATED,
    boundary: PSCG_BOUNDARY.CLIENT_REDIRECT,
    robotsDisallow: true,
    notes: "Cubierto por el prefijo 'Disallow: /panel'. Mismo boundary que /panel/eventos (client-side, sin SSR gate) — patrón ya existente, no una regresión introducida por esta misión.",
  },
  {
    path: "/panel/inscripciones/[id]",
    file: "src/pages/panel/inscripciones/[id].jsx",
    category: PSCG_CATEGORY.PRIVATE_AUTHENTICATED,
    boundary: PSCG_BOUNDARY.CLIENT_REDIRECT,
    robotsDisallow: true,
    notes: "Cubierto por el prefijo 'Disallow: /panel'. Ownership real verificado server-side en cada endpoint de /api/inscripciones/[id]/*, no solo en el cliente.",
  },
  {
    path: "/panel/inscripciones/[id]/scanner",
    file: "src/pages/panel/inscripciones/[id]/scanner.jsx",
    category: PSCG_CATEGORY.PRIVATE_AUTHENTICATED,
    boundary: PSCG_BOUNDARY.CLIENT_REDIRECT,
    robotsDisallow: true,
    notes: "Cubierto por el prefijo 'Disallow: /panel'. V1 owner-only (sección 20 del mandato) — autorización real en check_in_registration_participant, el ping GET solo decide si se muestra la UI.",
  },
  {
    path: "/panel",
    file: "src/pages/panel/index.js",
    category: PSCG_CATEGORY.PRIVATE_AUTHENTICATED,
    boundary: PSCG_BOUNDARY.SSR_REDIRECT,
    robotsDisallow: true,
  },
  {
    path: "/mis-iniciativas",
    file: "src/pages/mis-iniciativas.jsx",
    category: PSCG_CATEGORY.PRIVATE_AUTHENTICATED,
    boundary: PSCG_BOUNDARY.SSR_REDIRECT,
    robotsDisallow: true,
  },
  {
    path: "/panel/bancos",
    file: "src/pages/panel/bancos.js",
    category: PSCG_CATEGORY.PRIVATE_AUTHENTICATED,
    boundary: PSCG_BOUNDARY.SSR_HYDRATE_CLIENT_GATE,
    robotsDisallow: true,
    notes: "Cubierto por el prefijo 'Disallow: /panel'. getServerSideProps hidrata la sesión pero no redirige — el gate de render y el redirect quedan en cliente. Deuda documentada, no corregida por esta misión.",
  },
  {
    path: "/trust/verificar",
    file: "src/pages/trust/verificar.jsx",
    category: PSCG_CATEGORY.PRIVATE_AUTHENTICATED,
    boundary: PSCG_BOUNDARY.CLIENT_REDIRECT,
    robotsDisallow: false,
    notes: "Hallazgo real de esta auditoría: no tiene entrada propia en robots.txt (ni Disallow directo ni prefijo que la cubra). Deuda documentada, no corregida por esta misión — fuera de su alcance.",
  },
  {
    path: "/registro/continuar",
    file: "src/pages/registro/continuar.jsx",
    category: PSCG_CATEGORY.PRIVATE_AUTHENTICATED,
    boundary: PSCG_BOUNDARY.CLIENT_REDIRECT,
    robotsDisallow: true,
    notes: "Cubierto por el prefijo 'Disallow: /registro'.",
  },
  {
    path: "/perfil",
    file: "src/pages/perfil.js",
    category: PSCG_CATEGORY.PRIVATE_AUTHENTICATED,
    boundary: PSCG_BOUNDARY.CLIENT_REDIRECT,
    robotsDisallow: false,
    notes: "Hallazgo real de esta auditoría: no tiene entrada propia en robots.txt. Deuda documentada, no corregida por esta misión — fuera de su alcance.",
  },
  {
    path: "/blog",
    file: "src/pages/blog/index.js",
    category: PSCG_CATEGORY.PRIVATE_AUTHENTICATED,
    boundary: PSCG_BOUNDARY.CLIENT_REDIRECT_API_AUTH,
    robotsDisallow: true,
    notes: "Protección real vive en las APIs de lectura (exigen Bearer token, ver tests/blogPrivateProd.test.mjs), no en un boundary SSR de la página. Patrón legado — no es el modelo a seguir para rutas nuevas.",
  },
  {
    path: "/difusion",
    file: "src/pages/difusion.jsx",
    category: PSCG_CATEGORY.PRIVATE_AUTHENTICATED,
    boundary: PSCG_BOUNDARY.SSR_REDIRECT,
    robotsDisallow: true,
    notes: "DIFUSIÓN V1 — nueva en esta misión. Usa el boundary más fuerte (ssr_redirect) desde su primer commit, siguiendo PSCG.",
  },

  // ---------- LEGACY_REMOVED ----------
  {
    path: "/rifas",
    file: "src/pages/rifas.js",
    category: PSCG_CATEGORY.LEGACY_REMOVED,
    notes:
      "Antiguo catálogo público de Rifas, retirado. Redirect real (getServerSideProps, 307) a /login preservando next — decisión de producto ya certificada (no un 410) porque sirve como aterrizaje de bookmarks/backlinks antiguos, no porque /login sea un reemplazo de contenido equivalente. X-Robots-Tag: noindex, nofollow. Fuera de sitemap.",
  },
];

export function findPscgEntry(path) {
  return PSCG_REGISTRY.find((e) => e.path === path) || null;
}

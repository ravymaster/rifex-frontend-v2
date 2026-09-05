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
  {
    path: "/eventos",
    file: "src/pages/eventos/index.jsx",
    category: PSCG_CATEGORY.PUBLIC_INDEXABLE,
    notes: "RIFEX FINAL PUBLIC SURFACE CLOSURE (2026-09-05) — URL única y definitiva de Eventos: la landing comercial (antes en /soluciones/eventos) vive acá. El catálogo real de eventos publicados (EVENT-1, GET /api/events) se retiró de esta página por decisión explícita de Rodrigo durante la misión — todavía no hay eventos publicados y un empty-state no aportaba valor hoy; queda documentado para integrarse más adelante cuando exista contenido real, sin eliminar el endpoint ni su lógica de datos. Service+FAQPage JSON-LD.",
  },
  {
    path: "/campanas",
    file: "src/pages/campanas.jsx",
    category: PSCG_CATEGORY.PUBLIC_INDEXABLE,
    notes: "RIFEX PRODUCT LANDINGS V1 — ruta nueva (no existía antes de esta misión, verificado). Landing comercial de Campañas/Colectas. Reemplaza el destino del navItem 'Campañas', que antes apuntaba a /wizard?modo=colecta. Service+FAQPage JSON-LD.",
  },
  {
    path: "/inscripciones",
    file: "src/pages/inscripciones.jsx",
    category: PSCG_CATEGORY.PUBLIC_INDEXABLE,
    notes: "INSCRIPCIONES V1 — landing comercial estático. Nunca un directorio de actividades de usuarios (eso es /inscripcion/[id], PUBLIC_NOINDEX). No muestra Plus/Gold/precios futuros. RIFEX PRODUCT LANDINGS V1: evolucionada a la misma anatomía (hero/features/pasos/casos de uso/bloque operacional/confianza/FAQ/CTA) de Eventos/Campañas, misma ruta y categoría sin cambio. Service+FAQPage JSON-LD agregado.",
  },
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
    path: "/wizard",
    file: "src/pages/wizard.js",
    category: PSCG_CATEGORY.PUBLIC_NOINDEX,
    robotsDisallow: true,
    notes: "RIFEX FINAL PUBLIC SURFACE CLOSURE (2026-09-05) — retirada del navbar (Layout.jsx ya no la enlaza): las 3 landings de Eventos/Campañas/Inscripciones (Product Landings V1) cubren ahora la misma función. Página NO eliminada ni redirigida — sigue accesible por URL directa, solo deja de indexarse/promocionarse para no competir en SEO con las landings reales. Único inbound link vivo que tenía era exactamente ese ítem de navbar (auditado por grep completo antes de decidir).",
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
    path: "/reglas-iniciativas-premio",
    file: "src/pages/reglas-iniciativas-premio.js",
    category: PSCG_CATEGORY.PRIVATE_AUTHENTICATED,
    boundary: PSCG_BOUNDARY.SSR_REDIRECT,
    robotsDisallow: true,
    notes: "RIFEX FINAL PUBLIC SURFACE CLOSURE (2026-09-05) — antes PUBLIC_NOINDEX (accesible anónimo). Rodrigo decidió retirarla de la superficie pública; pasa a ssr_redirect (mismo patrón certificado). El contenido legal no se borra, sigue íntegro para cualquier autenticado. El enlace público que existía en /reembolsos fue reemplazado por copy neutral sin link privado; /terminos-rifas conserva su propio enlace interno sin cambios (contenido histórico ya certificado, fuera de alcance de esta misión).",
  },
  {
    path: "/admin",
    file: "src/pages/admin/index.jsx",
    category: PSCG_CATEGORY.PRIVATE_AUTHENTICATED,
    boundary: PSCG_BOUNDARY.SSR_REDIRECT,
    robotsDisallow: true,
    notes: "RIFEX FINAL PUBLIC SURFACE CLOSURE (2026-09-05) — antes 100% client-side ('Verificando acceso…', useEffect). Ahora getServerSideProps: sesión ausente -> /login; sesión sin user.app_metadata.role==='admin' -> redirect a Home. Autenticación != autorización: lee la MISMA autoridad que src/lib/adminAuth.js#resolveAdmin (app_metadata.role), vía sesión de cookies (getSupabaseServer) en vez de Bearer token — no es un segundo sistema de roles. La autorización real y definitiva de cada acción admin sigue viviendo exclusivamente en cada endpoint /api/admin/* vía resolveAdmin, sin cambios.",
  },
  {
    path: "/panel/eventos",
    file: "src/pages/panel/eventos/index.jsx",
    category: PSCG_CATEGORY.PRIVATE_AUTHENTICATED,
    boundary: PSCG_BOUNDARY.SSR_REDIRECT,
    robotsDisallow: true,
    notes: "Cubierto por el prefijo 'Disallow: /panel'. RIFEX FINAL PUBLIC SURFACE CLOSURE (2026-09-05) — deuda histórica documentada desde la introducción de PSCG (client_redirect) corregida al mismo boundary ya certificado en panel/inscripciones/index.jsx. Carga real de datos (fetch a /api/events/mine con Bearer) sin cambios.",
  },
  {
    path: "/panel/eventos/[id]",
    file: "src/pages/panel/eventos/[id].jsx",
    category: PSCG_CATEGORY.PRIVATE_AUTHENTICATED,
    boundary: PSCG_BOUNDARY.SSR_REDIRECT,
    robotsDisallow: true,
    notes: "Cubierto por el prefijo 'Disallow: /panel'. RIFEX FINAL PUBLIC SURFACE CLOSURE (2026-09-05) — mismo boundary certificado en panel/inscripciones/[id].jsx (next desde prefijo literal + id, saneado con sanitizeNextPath). Autenticación únicamente — ownership real sigue siendo autoridad exclusiva de cada endpoint /api/events/[id]/*.",
  },
  {
    path: "/panel/eventos/[id]/scanner",
    file: "src/pages/panel/eventos/[id]/scanner.jsx",
    category: PSCG_CATEGORY.PRIVATE_AUTHENTICATED,
    boundary: PSCG_BOUNDARY.SSR_REDIRECT,
    robotsDisallow: true,
    notes: "Cubierto por el prefijo 'Disallow: /panel'. RIFEX FINAL PUBLIC SURFACE CLOSURE (2026-09-05) — mismo boundary certificado en panel/inscripciones/[id]/scanner.jsx. Autenticación únicamente — la autorización real para operar el scanner (dueño u organizador con event_staff activo) sigue viviendo en el ping GET/check-in de /api/events/[id]/check-in, sin cambios.",
  },
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
    boundary: PSCG_BOUNDARY.SSR_REDIRECT,
    robotsDisallow: true,
    notes: "Cubierto por el prefijo 'Disallow: /panel'. SSR AUTH HARDENING (2026-09-04): boundary corregido de client_redirect a ssr_redirect — un anónimo ya no recibe el shell del panel antes de redirigir. Deliberadamente NO se corrigió /panel/eventos (mismo patrón client-side histórico) — deuda documentada, fuera del alcance de esa misión.",
  },
  {
    path: "/panel/inscripciones/[id]",
    file: "src/pages/panel/inscripciones/[id].jsx",
    category: PSCG_CATEGORY.PRIVATE_AUTHENTICATED,
    boundary: PSCG_BOUNDARY.SSR_REDIRECT,
    robotsDisallow: true,
    notes: "Cubierto por el prefijo 'Disallow: /panel'. SSR AUTH HARDENING (2026-09-04): boundary corregido a ssr_redirect (next construido desde un literal fijo + el id de ruta, saneado con sanitizeNextPath). Autenticación únicamente — ownership real sigue siendo autoridad exclusiva de cada endpoint de /api/inscripciones/[id]/*, nunca de este boundary.",
  },
  {
    path: "/panel/inscripciones/[id]/scanner",
    file: "src/pages/panel/inscripciones/[id]/scanner.jsx",
    category: PSCG_CATEGORY.PRIVATE_AUTHENTICATED,
    boundary: PSCG_BOUNDARY.SSR_REDIRECT,
    robotsDisallow: true,
    notes: "Cubierto por el prefijo 'Disallow: /panel'. SSR AUTH HARDENING (2026-09-04): boundary corregido a ssr_redirect. V1 owner-only (sección 20 del mandato) — autorización real sigue viviendo en check_in_registration_participant (RPC) y en el ping GET/check-in; este SSR boundary solo demuestra sesión, nunca reemplaza esa autoridad.",
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
  {
    path: "/soluciones/rifas",
    file: "src/pages/soluciones/rifas.jsx",
    category: PSCG_CATEGORY.PRIVATE_AUTHENTICATED,
    boundary: PSCG_BOUNDARY.SSR_REDIRECT,
    robotsDisallow: true,
    notes: "RIFEX PRODUCT LANDINGS V1 — ruta nueva y distinta de /rifas (LEGACY_REMOVED, sin tocar). Landing explicativa de Rifas para usuarios ya autenticados: ssr_redirect desde el primer commit (mismo patrón que mis-iniciativas.jsx/difusion.jsx, destino literal fijo, nunca ctx.query). noindex+nofollow+noarchive, fuera de sitemap, nunca en navItems/navbar público. RIFEX FINAL PUBLIC SURFACE CLOSURE (2026-09-05): Rodrigo decidió retirarla también del menú de cuenta superior (accountItems) — ahora se enlaza únicamente desde el footer, y solo cuando hay sesión (mismo estado `user` client-side ya usado para accountItems); el boundary SSR real de esta página es la protección de fondo, no la visibilidad del link.",
  },

  // ---------- LEGACY_REMOVED ----------
  {
    path: "/rifas",
    file: "src/pages/rifas.js",
    category: PSCG_CATEGORY.LEGACY_REMOVED,
    notes:
      "Antiguo catálogo público de Rifas, retirado. Redirect real (getServerSideProps, 307) a /login preservando next — decisión de producto ya certificada (no un 410) porque sirve como aterrizaje de bookmarks/backlinks antiguos, no porque /login sea un reemplazo de contenido equivalente. X-Robots-Tag: noindex, nofollow. Fuera de sitemap. Distinto de /soluciones/rifas (PRIVATE_AUTHENTICATED, nueva en RIFEX PRODUCT LANDINGS V1) — esta ruta sigue sin tocar.",
  },
  {
    path: "/soluciones/eventos",
    file: "src/pages/soluciones/eventos.jsx",
    category: PSCG_CATEGORY.LEGACY_REMOVED,
    notes:
      "RIFEX FINAL PUBLIC SURFACE CLOSURE (2026-09-05) — landing creada en Product Landings V1, retirada como página independiente: /eventos pasa a ser la URL única y definitiva de Eventos (landing + catálogo). Redirect real (getServerSideProps, 308 permanente) a /eventos — a diferencia de /rifas, acá SÍ hay un reemplazo de contenido realmente equivalente (1:1), por eso 308 en vez de 307. X-Robots-Tag: noindex, nofollow. Fuera de sitemap.",
  },
];

export function findPscgEntry(path) {
  return PSCG_REGISTRY.find((e) => e.path === path) || null;
}

# RIFEX PRODUCT LANDINGS V1 (2026-09-05)

**Estado**: DEV only, `origin/develop`. No promovido a PROD.

**Superseded parcialmente (2026-09-05, misma fecha, misión posterior) — RIFEX FINAL PUBLIC SURFACE CLOSURE**: `/soluciones/eventos`, la ruta nueva descrita en este documento para la landing de Eventos, dejó de existir como página independiente — su contenido se movió tal cual a `/eventos` (que absorbe landing + identidad única de Eventos), y `/soluciones/eventos` pasó a ser un redirect `308` permanente hacia `/eventos`. Todo lo que este documento describe sobre el **contenido** de la landing de Eventos (features, pasos, FAQ, JSON-LD) sigue siendo exacto — solo cambió la URL donde vive. Las secciones de abajo se dejan sin reescribir para preservar el registro histórico de la decisión original; ver `docs/public-surface/FINAL_PUBLIC_SURFACE_CLOSURE.md` para el estado final real de cada ruta.

## Objetivo

Cuatro landings de producto con el mismo lenguaje visual (2026, limpio, premium, cards blancas, bordes suaves, sombras discretas, pasos numerados, CTA visible, mobile-first): Eventos, Campañas, Inscripciones (públicas) y Rifas (privada, autenticada).

## Auditoría de rutas (antes de elegir URLs)

| Producto | Ruta elegida | Ruta existente/ocupada | Decisión |
|---|---|---|---|
| Eventos | `/soluciones/eventos` (nueva) | `/eventos` es el catálogo real de eventos publicados (`src/pages/eventos/index.jsx`) — no se toca | Landing comercial en ruta separada; `/eventos` sigue siendo la única función de catálogo |
| Campañas | `/campanas` (nueva) | Ninguna — confirmado libre por `find src/pages -iname "campanas*"` antes de crear el archivo | Reemplaza el destino del navItem "Campañas" (antes `/wizard?modo=colecta`) |
| Inscripciones | `/inscripciones` (evolucionada) | Ya existía como landing real desde INSCRIPCIONES V1, `PUBLIC_INDEXABLE` | Se evolucionó en el mismo archivo/ruta — nunca se creó una segunda landing competidora |
| Rifas | `/soluciones/rifas` (nueva) | `/rifas` es el redirect `LEGACY_REMOVED` del antiguo catálogo público — no se toca, ruta y archivo distintos | Landing privada nueva, nunca reactiva el catálogo público histórico |

## Clasificación PSCG final

| Ruta | Categoría | Boundary | Sitemap | robots.txt |
|---|---|---|---|---|
| `/soluciones/eventos` | `PUBLIC_INDEXABLE` | — (sin `getServerSideProps`) | Sí | Sin `Disallow` |
| `/campanas` | `PUBLIC_INDEXABLE` | — | Sí | Sin `Disallow` |
| `/inscripciones` | `PUBLIC_INDEXABLE` (sin cambio de categoría) | — | Sí (ya estaba) | Sin `Disallow` |
| `/soluciones/rifas` | `PRIVATE_AUTHENTICATED` | `ssr_redirect` | No | `Disallow: /soluciones/rifas` |

Entradas completas, con `file`/`notes`, en `src/lib/publicSurfaceClassification.js`.

## Arquitectura visual compartida

- `src/styles/productLanding.module.css` — hoja de estilos única (hero, grids de features/casos de uso, pasos numerados, bloque operacional resaltado, lista de confianza, FAQ con `<details>`, CTA final), con un custom property `--pl-accent` que cada página fija a su color de marca (turquesa/Eventos, trébol/Campañas, ultramar/Inscripciones, ámbar/Rifas — el único producto privado, deliberadamente distinto).
- `src/components/product/ProductSections.jsx` — 8 componentes de presentación puros (`ProductPage`, `ProductHero`, `ProductFeatureGrid`, `ProductSteps`, `ProductUseCases`, `ProductOperational`, `ProductSecurity`, `ProductFaq`, `ProductFinalCta`). Cero lógica de negocio, cero fetch — cada página les pasa su propio contenido real.
- `src/lib/productJsonLd.js` — `buildServiceJsonLd`/`buildFaqJsonLd`, usados únicamente en las 3 landings públicas (nunca en Rifas). Import relativo (`./publicMetadata.js`, no `@/lib/...`) para poder testearse con `node:test` sin necesitar el resolver de alias de Next/webpack.

Cada landing compone las secciones con su propio contenido, verificado contra el código real del producto (nunca inventado) — ver el detalle de auditoría de features en la sección siguiente.

## Contenido — solo funciones reales, auditadas contra el código

**Eventos** (`src/pages/soluciones/eventos.jsx`): tipos de entrada con precio/cupo propio, aforo total validado server-side (`event_capacity_exceeded`), QR individual por entrada + email, scanner con contador de asistencia en vivo, personal de acceso real (`event_staff`, `src/lib/eventStaffAuth.js` — no es solo el dueño quien puede escanear), reporte Excel de 5 hojas (`src/lib/eventAnalyticsWorkbook.js`), comisión 7% (`src/lib/platformFee.js`).

**Campañas** (`src/pages/campanas.jsx`): título+descripción+meta opcional, foto principal + hasta 10 de galería, duración 15/30/60 días, montos sugeridos o libres, QR real descargable (`/api/colectas/[id]/qr.png`) + copiar link, progreso/días restantes en la página pública, pagos vía Mercado Pago del organizador (comisión 7%).

**Inscripciones** (`src/pages/inscripciones.jsx`, evolucionada): hasta 50 inscritos gratis, sin Mercado Pago, prevención de duplicados por correo, QR individual de confirmación, scanner (cámara o código manual), panel Inscritos/Asistieron/Pendientes, descarga en Excel (Nombre/Email/Teléfono/Fecha de inscripción/Estado/Hora de check-in). **Nunca** menciona Plus/Gold/precios futuros/"200"/"2.000" — verificado por test dedicado excluyendo comentarios de código.

**Rifas** (`src/pages/soluciones/rifas.jsx`, privada): configuración (premio dinero/físico, precio por número, cantidad, fecha de sorteo, límite de extensiones), venta de números sin cuenta para el comprador, sorteo automático (scheduler) o manual ("Sortear ahora"), extensión de fecha (máx. 3, dentro de 15 días), ganador elegido entre números vendidos, bloqueo de premio tras la primera venta, comisión 7%. Incluye la advertencia de difusión requerida, con link a `/difusion`.

## Navegación

- **Header público** (`navItems`, `src/components/Layout.jsx`): `Eventos` (→ `/eventos`, sin cambio) / `Campañas` (→ `/campanas`, **cambiado** desde `/wizard?modo=colecta`) / `Inscripciones` (→ `/inscripciones`, **nuevo** ítem) / `Cómo funciona` (→ `/wizard`, sin cambio). Rifas nunca aparece acá.
- **Footer público**: columna renombrada "Producto" → "Soluciones", con "Cómo funciona Eventos" → `/soluciones/eventos`, "Cómo funcionan las Campañas" → `/campanas`, "Cómo funcionan las Inscripciones" → `/inscripciones` (reemplazan los enlaces directos "Crear evento/campaña/inscripción" — el CTA de creación ahora vive dentro de cada landing). Rifas nunca aparece en el footer público.
- **Menú de cuenta autenticado** (`accountItems`): se agrega "Rifas" → `/soluciones/rifas`, entre "Mis iniciativas" y "Difusión".
- **`/wizard`**: gana un tercer modo, "Quiero recibir inscripciones" (pasos reales, CTA a `/crear-inscripcion`) — ya no dice "Próximamente" en ningún lado relacionado a Inscripciones. Rifas deliberadamente no se agrega.

## SEO

Las 3 landings públicas: `title`/`description` propios, `canonicalPath` coincidente con la ruta real, Open Graph + Twitter Card automáticos vía `Layout` (nunca `disableAutoMeta`), un solo `<h1>` real (`ProductHero` es el único componente del módulo compartido que renderiza uno — verificado con test), JSON-LD `Service` + `FAQPage` (la FAQ del JSON-LD es exactamente la que se renderiza en `<details>/<summary>`, visible en el HTML inicial, nunca oculta solo por JS).

`/soluciones/rifas`: `noindex, nofollow, noarchive` explícito, sin JSON-LD comercial público, sin promoción en ninguna superficie indexable.

## Sitemap / robots.txt

`public/sitemap.xml` gana `/soluciones/eventos` y `/campanas` (`/inscripciones` ya estaba). `public/robots.txt` gana `Disallow: /soluciones/rifas`. Ninguna otra entrada de ninguno de los dos archivos se modificó.

## Boundary SSR de Rifas (verificado en vivo)

`getServerSideProps` en `soluciones/rifas.jsx` usa el mismo patrón certificado que `mis-iniciativas.jsx`/`difusion.jsx`: `getSupabaseServer` + `s.auth.getUser()`, `redirect` directo a `/login?next=/soluciones/rifas` (destino **literal fijo**, nunca `ctx.query`) para anónimos. Verificado en vivo contra un servidor real (`next start`, puerto 3021), 5 User-Agents (`Mozilla/5.0`, `Googlebot/2.1`, `facebookexternalhit/1.1`, `TikTokBot`, `curl/8`): los 5 reciben `307` real, body de 29 bytes, MD5 idéntico — cero cloaking, cero fuga de HTML privado (`grep` del body contra "Crear una rifa"/"Extensión de fecha"/"Configura tu rifa" → 0 coincidencias). Compilador: `soluciones/rifas` sale `ƒ` (dinámico) en el output de `npm run build`, prueba a nivel de build de que el `getServerSideProps` es real.

## Multi-UA no-cloaking (3 públicas)

Mismo servidor real, mismos 5 User-Agents: `/soluciones/eventos`, `/campanas`, `/inscripciones` devuelven `200` y MD5 byte-idéntico en los 5 casos — cero cloaking.

## Bug real encontrado y corregido en QA visual

`heroVisual` (grid de chips del hero) usaba `grid-template-columns: repeat(auto-fit, minmax(140px, 1fr))` — en viewports de 375px/320px, 3 chips de 140px mínimo más gaps superan el ancho disponible; el `overflow-x: hidden` global (`src/styles/globals.css`) oculta el scroll horizontal pero **recorta** el contenido en vez de reflow. Encontrado programáticamente (`scrollWidth` de elementos individuales vs. `clientWidth` del documento) durante la QA visual en navegador, ya que las capturas de pantalla no compusieron en esta sesión. Corregido a `minmax(96px, 1fr)` — verificado sin overflow en 320px, 375px, 768px y desktop en las 3 landings públicas.

## Tests

`tests/productLandingsV1.test.mjs` (41 tests): clasificación PSCG de las 4 rutas, ausencia de auth boundary en las 3 públicas, boundary SSR real de Rifas (incluida la ausencia de `ctx.query` en el cuerpo real de la función, no en comentarios), sitemap/robots, metadata/canonical, un solo `<h1>` por página (vía `ProductHero`), JSON-LD `Service`+`FAQPage` válido y con FAQ realmente visible, footer con las 3 landings y sin Rifas, menú de cuenta con Rifas, wizard con los 3 flujos y sin Rifas, ausencia de 404s nuevos, ausencia estructural de ramas condicionadas por `User-Agent`, ausencia de Plus/Gold en Inscripciones, "Personal de acceso" respaldado por `eventStaffAuth.js` real, y cero referencias a Payment Engine/Trust/webhooks/comisión en los archivos nuevos.

Dos tests preexistentes se actualizaron para reflejar el cambio intencional del destino de "Campañas" (`tests/publicSurfaceFinalCleanup.test.mjs`, antes esperaba `/wizard?modo=colecta`) — documentado en el propio test como una evolución de producto, no una regresión.

## Regresión y build

`node --test 'tests/*.test.mjs'`: 834/835 (el único fallo es el flake histórico conocido de `eventAnalyticsWorkbook.test.mjs` — timing de `writeBuffer` en los límites máximos, misma firma que en toda misión anterior, no relacionado). `npm run build`: limpio; `/soluciones/eventos`, `/campanas`, `/inscripciones` compilan estáticas (`○`); `/soluciones/rifas` compila dinámica (`ƒ`).

## Deuda real / fuera de alcance

- Ningún cambio a Payment Engine, Trust, webhooks, `marketplace_fee`, comisión, Progressive Onboarding, RLS, Supabase, ni lógica de negocio de Rifas/Eventos/Campañas/Inscripciones — solo presentación, navegación y SEO.
- `/panel/eventos` y demás deuda histórica de boundaries `client_redirect` documentada en misiones anteriores permanece sin tocar — fuera del alcance de esta misión.
- Las capturas de pantalla del navegador no compusieron en esta sesión (pane no visible) — la QA visual se hizo por árbol de accesibilidad, extracción de texto, y verificación programática de `scrollWidth`/overflow en 320px/375px/768px/desktop, que sí encontró y permitió corregir un bug real (ver sección de arriba).

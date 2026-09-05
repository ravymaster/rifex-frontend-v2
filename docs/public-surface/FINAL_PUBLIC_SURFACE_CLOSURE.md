# RIFEX FINAL PUBLIC SURFACE CLOSURE (2026-09-05)

**Estado**: DEV only, branch `dev/final-public-surface-closure-2026-09-05`, push a `origin/develop` únicamente. No promovido a PROD, `origin/main` no tocado.

## Objetivo

Cierre final de la superficie pública de Rifex tras RIFEX PRODUCT LANDINGS V1: consolidar `/eventos` como URL única y definitiva de Eventos, retirar Rifas de toda navegación pública/interna no autorizada, cerrar la deuda histórica de auth boundary `client_redirect` en `/admin` y `/panel/eventos/*`, dar peso real a Inscripciones en Home, y agregar redes sociales reales al footer — sin tocar Payment Engine, Mercado Pago, webhooks, comisión, RLS, Supabase, ni lógica de negocio de ningún producto.

## 1. `/eventos` — consolidación y decisión de producto sobre el catálogo

`/eventos` absorbe el contenido íntegro de la landing comercial que vivía en `/soluciones/eventos` (RIFEX PRODUCT LANDINGS V1): hero, features, pasos, casos de uso, bloque operacional, seguridad, FAQ y CTA final — mismo contenido, auditado contra el código real, ninguna función inventada. `/soluciones/eventos` pasa a ser un redirect `308` permanente hacia `/eventos` (`X-Robots-Tag: noindex, nofollow`), clasificado `LEGACY_REMOVED` — `308` en vez de `307` porque, a diferencia de `/rifas`, sí existe un reemplazo de contenido 1:1 genuinamente equivalente.

**Decisión de producto explícita de Rodrigo, tomada en vivo durante esta misión**: el catálogo real de eventos publicados (`GET /api/events`, construido en EVENT-1) que originalmente iba a vivir debajo de la landing, con un empty-state elegante para cuando no hay eventos, se **retiró de la página** antes de cerrar la misión. Razón dada explícitamente: no hay eventos publicados todavía y un empty-state no aporta valor hoy; la integración queda para más adelante, cuando exista contenido real que listar. No se eliminó el endpoint `/api/events` ni ninguna lógica de datos — solo esta página deja de consumirlo por ahora. `/eventos` es hoy una página 100% estática (sin `fetch`, sin `useEffect`/`useState`), nunca "casi vacía": siempre muestra la landing completa.

## 2. Rifas — retirada de navegación no autorizada

`accountItems` (menú de cuenta autenticado, `src/components/Layout.jsx`) pierde la entrada "Rifas" → `/soluciones/rifas`. En su lugar, el footer autenticado gana un enlace condicional "Cómo funcionan las Rifas" → `/soluciones/rifas`, renderizado únicamente cuando `user` es verdadero (`{user && <Link href="/soluciones/rifas">...}`) — un anónimo nunca ve ese enlace, y aunque lo viera, el destino sigue siendo `ssr_redirect` a `/login` antes de cualquier HTML privado. Rifas nunca aparece en la navbar pública, nunca en `sitemap.xml`, nunca en JSON-LD.

## 3. Navbar pública final

`navItems` queda reducido a exactamente `Eventos` (`/eventos`) · `Campañas` (`/campanas`) · `Inscripciones` (`/inscripciones`) — "Cómo funciona" se retira por completo (desktop y mobile, verificado en el árbol de accesibilidad real del navegador). Rifas nunca estuvo ni queda en la navbar.

## 4. `/wizard` — decisión basada en evidencia real, no en suposición

Antes de decidir su destino, se auditó (agente Explore) cada referencia real a `/wizard` en `src/` y `docs/`. Resultado: el único enlace vivo que apuntaba a `/wizard` en todo el código era la propia entrada de `navItems` en `Layout.jsx` — el resto eran menciones en prosa de documentación/comentarios, no enlaces reales. Decisión: **no se elimina ni se redirige** `/wizard` (sigue siendo una página funcional, sin enlaces internos rotos) — se retira de la navbar y se reclasifica de `PUBLIC_INDEXABLE` a `PUBLIC_NOINDEX` (`noindex` en su `Layout`, fuera de `sitemap.xml`, `Disallow: /wizard` agregado a `robots.txt`). Sin duplicación SEO: al no estar indexado ni enlazado públicamente, no compite con `/eventos`/`/campanas`/`/inscripciones`.

## 5. `/reglas-iniciativas-premio` — privatización

Pasa de `PUBLIC_NOINDEX` a `PRIVATE_AUTHENTICATED`, boundary `ssr_redirect`: nuevo `getServerSideProps` (`getSupabaseServer` + `s.auth.getUser()`, redirect real a `/login?next=/reglas-iniciativas-premio` para anónimos), `Layout` gana `noarchive` (ya tenía `noindex`), se agrega `Disallow: /reglas-iniciativas-premio` a `robots.txt`, se retira de `sitemap.xml`. El contenido **no se elimina** — sigue existiendo íntegro para usuarios autenticados, solo deja de ser accesible sin sesión. El único enlace público que apuntaba ahí, en `/reembolsos.js` ("anexo de iniciativas con premio"), se reemplazó por texto neutral sin enlace ("disponibles para el organizador dentro de su cuenta") — cero enlace roto, cero término legal inventado. El enlace histórico separado desde `/terminos-rifas.js` (contenido certificado en misiones anteriores) se dejó intacto, fuera del alcance de esta misión.

## 6. `/admin` — endurecimiento de autorización SSR

Antes de esta misión, `/admin` verificaba acceso únicamente client-side ("Verificando acceso…", un `useEffect` que llama `/api/admin/me` con Bearer token después de que Next.js ya sirvió el shell del panel). Nuevo `getServerSideProps`: lee sesión vía `getSupabaseServer(ctx.req, ctx.res).auth.getUser()` (cookie-based, apropiado para SSR) y decide con el mismo campo de autoridad real que ya usa `resolveAdmin` (`src/lib/adminAuth.js`) — `user.app_metadata?.role !== "admin"` — deliberadamente **sin crear un segundo sistema de roles**. Anónimo → `/login?next=/admin`; autenticado no-admin → `/` (Home, denegación segura); admin real → panel intacto. La revalidación client-side existente (`/api/admin/me`, Bearer, `resolveAdmin`) queda sin tocar como autoridad real por-acción — el boundary SSR solo demuestra rol antes de servir el shell. `Layout` gana `noarchive` junto al `noindex` ya existente.

## 7. `/panel/eventos/*` — cierre de la deuda histórica `client_redirect`

`/panel/eventos`, `/panel/eventos/[id]` y `/panel/eventos/[id]/scanner` — documentada como deuda desde PSCG original (2026-09-04) y reafirmada como "fuera de alcance" en el addendum de INSCRIPCIONES SSR HARDENING — ahora usan el mismo patrón `ssr_redirect` certificado en `/panel/inscripciones/*`: `getServerSideProps` con `getSupabaseServer`+`s.auth.getUser()`, redirect real antes de renderizar. Las dos rutas dinámicas construyen `next` desde un prefijo literal fijo (`/panel/eventos/${id}`, `/panel/eventos/${id}/scanner`) saneado con `sanitizeNextPath` + `encodeURIComponent`. Cero cambios a la lógica de negocio de Events — check-in, QR, staff (`eventStaffAuth.js`), analytics (`eventAnalyticsWorkbook.js`) y sus llamadas API (que siguen mandando `Authorization: Bearer` como autoridad real de ownership) quedaron intactos; solo se agregó el gate SSR encima.

## 8. Home — Inscripciones con peso real

El eyebrow del hero cambia de "Eventos · Entradas digitales · Campañas de recaudación" a "Eventos · Entradas digitales · Campañas · Inscripciones". Se agrega una 5ª tarjeta de capacidad ("Inscripciones y cupos", copy factual: "Gestiona talleres, cursos y actividades gratuitas con QR y lista de asistentes", badge "Gratis · QR") enlazada a `/inscripciones` — la única tarjeta clicable del grid (`CAPABILITIES.map` renderiza `next/link` cuando `c.href` existe, `div` en caso contrario, sin romper las 4 tarjetas anteriores). No hubo rediseño de Home más allá de esto.

## 9. Footer — redes sociales reales (Facebook/Instagram/TikTok/WhatsApp)

Nuevo `src/lib/socialLinks.js`, fuente única de verdad:

```js
export const SOCIAL_LINKS = {
  facebook: 'https://www.facebook.com/rifexpro/',
  instagram: 'https://www.instagram.com/rifexpro/',
  tiktok: 'https://www.tiktok.com/@rifexpro',
  whatsapp: 'https://wa.me/56959904311',
  youtube: null,
  x: null,
};
```

`Layout.jsx` renderiza un ícono `<a>` únicamente cuando el valor correspondiente es verdadero — arquitectura que garantiza estructuralmente cero `href="#"` y cero placeholders falsos. YouTube y X, con valor `null`, no renderizan absolutamente nada — ni un ícono deshabilitado — pero el patrón es extensible: una futura misión solo necesita cambiar `null` por una URL real, sin tocar `Layout.jsx`. Los 4 íconos son SVG inline (`SocialIcon`, sin dependencia npm nueva), circulares, 36×36px uniformes, con `aria-label` descriptivo, `target="_blank" rel="noopener noreferrer"` en Facebook/Instagram/TikTok (WhatsApp abre `wa.me` directo). Verificado en vivo: exactamente 4 enlaces con las URLs exactas del addendum, ningún ícono de YouTube/X presente, sin overflow horizontal en 320/375/768/desktop (columna en móvil, fila junto al label desde 768px vía media query en 640px).

## 10. PSCG, sitemap.xml, robots.txt — estado final

Cambios de categoría en `src/lib/publicSurfaceClassification.js`:

| Ruta | Antes | Ahora |
|---|---|---|
| `/soluciones/eventos` | `PUBLIC_INDEXABLE` | `LEGACY_REMOVED` (redirect `308`) |
| `/wizard` | `PUBLIC_INDEXABLE` | `PUBLIC_NOINDEX` |
| `/reglas-iniciativas-premio` | `PUBLIC_NOINDEX` | `PRIVATE_AUTHENTICATED` (`ssr_redirect`) |
| `/admin` | (sin boundary SSR documentado) | `PRIVATE_AUTHENTICATED` (`ssr_redirect`) |
| `/panel/eventos`, `/panel/eventos/[id]`, `/panel/eventos/[id]/scanner` | `client_redirect` (deuda documentada) | `PRIVATE_AUTHENTICATED` (`ssr_redirect`) |

`public/sitemap.xml`: se retiran `/soluciones/eventos` y `/wizard`; queda exactamente `/`, `/eventos`, `/campanas`, `/inscripciones` más las páginas legales/soporte ya certificadas. `public/robots.txt`: se agrega `Disallow: /reglas-iniciativas-premio` y `Disallow: /wizard`.

## 11. Multi-UA no-cloaking (verificado en vivo, servidor real puerto 3031)

**Públicas** (`/eventos`, `/campanas`, `/inscripciones`): `200` y MD5 byte-idéntico en los 5 User-Agents (`Mozilla/5.0`, `Googlebot/2.1`, `facebookexternalhit/1.1`, `TikTokBot`, `curl/8`).

**Redirects/privadas**: `/soluciones/eventos` → `308` idéntico a `/eventos`, body 8 bytes, en los 5 UAs. `/soluciones/rifas`, `/reglas-iniciativas-premio`, `/admin`, `/panel/eventos`, `/panel/eventos/[id]` (id de prueba), `/panel/eventos/[id]/scanner` → `307` real a `/login?next=...` (URL-encoded correctamente en las rutas dinámicas), body mínimo (18-79 bytes según ruta), idéntico en los 5 UAs — cero fuga de HTML privado, cero cloaking en cualquier dirección.

## 12. Auditoría de palabras públicas (rifa/sorteo/premio/azar)

`/reglas-iniciativas-premio` confirmado sin servir HTML a un anónimo (redirect antes de cualquier render). Ninguna de las 3 landings públicas (`/eventos`, `/campanas`, `/inscripciones`) ni Home mencionan rifa/sorteo/premio — verificado por `tests/finalPublicSurfaceClosure.test.mjs` y por inspección directa del texto renderizado.

## 13. Auditoría de notas internas

Grep dirigido (case-sensitive para `TODO`/`FIXME`, case-insensitive para el resto) contra los archivos nuevos/modificados de esta misión: cero coincidencias reales de `TODO`/`FIXME`/`localhost`/`staging`/"pendiente de revisión"/"antes de PROD"/"zona gris". El único falso positivo encontrado y corregido durante la escritura del test fue la palabra española "Todo" en el heading "Todo lo que puedes hacer" de `/eventos`, resuelto separando el chequeo de `TODO`/`FIXME` a case-sensitive.

## 14. CSP — no tocado, deliberadamente

Esta misión no habilita ni agrega ninguna Content-Security-Policy, ni siquiera en modo Report-Only. Sigue pendiente, documentado como deuda real en `docs/security/` (sin crear un doc nuevo solo para esto) — decisión explícita del mandato: no es parte del alcance de esta misión.

## 15. Performance — no medido de nuevo

No se re-optimizó nada basado en la medición externa de 10-15s mencionada en la auditoría previa (ruido de medición, no reproducible en este entorno). No se hicieron cambios de infraestructura ni mediciones adicionales — fuera de alcance explícito.

## 16. Tests

`tests/finalPublicSurfaceClosure.test.mjs` (28 tests, cubriendo los 30 escenarios mínimos del mandato, algunos combinados): consolidación de `/eventos` (contenido completo, catálogo retirado, nunca vacío), redirect real de `/soluciones/eventos`, retirada de Rifas de `accountItems` + enlace condicional en footer, navbar final sin "Cómo funciona"/sin Rifas, `/wizard` deindexado, privatización de `/reglas-iniciativas-premio` + link de `/reembolsos` corregido, hardening SSR de `/admin` y `/panel/eventos/*`, Home con Inscripciones, los 4 enlaces sociales reales + ausencia de YouTube/X, PSCG/sitemap/robots actualizados, ausencia de contenido cloaking-condicionado por User-Agent, ausencia de notas internas. 5 archivos de test preexistentes actualizados (no debilitados) para reflejar cambios intencionales de producto: `tests/publicAudit.test.mjs`, `tests/publicSurfaceFinalCleanup.test.mjs`, `tests/authUxCrawler.test.mjs`, `tests/inscripcionesSsrAuthBoundary.test.mjs`, `tests/productLandingsV1.test.mjs`.

## 17. Regresión, build y verificación en vivo

`node --test 'tests/*.test.mjs'` completo, único fallo tolerado el flake histórico conocido de timing en `eventAnalyticsWorkbook.test.mjs` (mismo desde múltiples misiones anteriores, no relacionado). `npm run build` limpio — `/eventos`, `/campanas`, `/inscripciones` compilan estáticas (`○`); `/soluciones/eventos`, `/soluciones/rifas`, `/reglas-iniciativas-premio`, `/admin`, `/panel/eventos`, `/panel/eventos/[id]`, `/panel/eventos/[id]/scanner` compilan dinámicas (`ƒ`) — prueba a nivel de compilador de que cada `getServerSideProps` es real. QA visual en 320px/375px/768px/desktop (Home, `/eventos`, footer social, navbar/mobile) sin overflow horizontal, mobile nav exacto, footer autenticado/anónimo diferenciado correctamente. Capturas de pantalla no compusieron en esta sesión (pane no visible en el navegador embebido) — la QA visual se hizo por árbol de accesibilidad, extracción de texto y verificación programática de `scrollWidth`/overflow, técnica ya usada y documentada en misiones previas.

## Deuda real / fuera de alcance

- Ningún cambio a Payment Engine, Mercado Pago, webhooks, `marketplace_fee`, comisión 7%, reconciliación, Trust backend, RLS, esquema Supabase, migraciones, ni lógica de negocio de ningún producto.
- CSP sigue pendiente (documentado, no implementado — fuera de alcance explícito de esta misión).
- El catálogo real de eventos publicados sigue existiendo (`/api/events`, EVENT-1) pero `/eventos` no lo consume por ahora — decisión de producto explícita de Rodrigo, no un defecto ni una regresión. Reintegrarlo (con o sin empty-state) queda para una misión futura cuando existan eventos reales que listar.
- `/panel/bancos`, `/trust/verificar`, `/registro/continuar`, `/perfil`, `/blog` conservan su deuda histórica de boundary documentada en PSCG original — fuera del alcance explícito de esta misión.

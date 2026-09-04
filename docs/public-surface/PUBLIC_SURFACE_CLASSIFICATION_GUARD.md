# PUBLIC SURFACE CLASSIFICATION GUARD (PSCG)

**Estado**: regla transversal, vigente desde 2026-09-04. Aplica a toda ruta nueva o modificada de Rifex a partir de este punto.

## Propósito

Antes de PSCG, cada ruta pública/privada de Rifex decidía por su cuenta (y de forma implícita) su exposición, indexabilidad, metadata, boundary de auth y presencia en sitemap/robots — reconstruido caso a caso, misión a misión (AUTH UX 2026, PUBLIC SURFACE FINAL CLEANUP, PROGRESSIVE ONBOARDING). Eso funcionó, pero dejó la clasificación real dispersa entre código, docs y memoria de sesión.

PSCG hace esa clasificación **explícita, centralizada y testeable**: `src/lib/publicSurfaceClassification.js` es la fuente de verdad de qué categoría tiene cada ruta y qué mecanismo real la protege. No es un framework nuevo — es un registro delgado sobre la infraestructura que ya existía (`Layout`, `publicMetadata.js`, `getSupabaseServer`, `robots.txt`, `sitemap.xml`) y un conjunto de tests (`tests/pscg.test.mjs`) que verifican esas afirmaciones contra el código real, no contra lo que se supone que debería pasar.

## Las cuatro categorías

### A. PUBLIC_INDEXABLE

Superficie pública legítima que Google/Meta/TikTok pueden descubrir y deben poder promocionar.

Obligaciones:
- Contenido público real (no un shell vacío ni un placeholder).
- `title` y `description` propios.
- `canonical` coherente (vía `Layout`'s `canonicalPath` o `publicMetadata.canonicalUrl`).
- Open Graph (Layout lo genera automáticamente salvo `disableAutoMeta`).
- `index, follow` (el default de `Layout` — no pasar `noindex`).
- Presencia en `sitemap.xml` cuando la ruta es una landing real (no aplica a rutas dinámicas con muchos ids, como `/eventos/[id]`, que se descubren por enlace, no por sitemap literal).
- Structured data (JSON-LD) solo donde ya existe una decisión explícita — hoy, únicamente Home. No se replica automáticamente a cada página nueva.
- Ausencia de contenido privado, de sesión, o de datos financieros de un usuario específico.

### B. PUBLIC_NOINDEX

Accesible sin sesión por necesidad funcional o legal, pero no debe promocionarse en buscadores.

Obligaciones:
- `noindex` (vía `Layout`'s `noindex` prop, o `nofollow`/`noarchive` explícitos según el caso — ver más abajo, no es uniforme).
- Fuera de `sitemap.xml`.
- `canonical` coherente igual que cualquier otra página.
- Sin promoción desde navegación comercial (navbar pública, footer, Home) salvo un enlace legítimo y ya auditado (ej. `/reembolsos` → `/reglas-iniciativas-premio`).
- **`Disallow` en `robots.txt` no es uniforme dentro de esta categoría** — hallazgo real, no una regla que PSCG inventa: `/login` y `/register` están `Disallow`'d (funcionales, sin contenido propio que valga la pena que Google explore); `/reglas-iniciativas-premio` y `/terminos-rifas` deliberadamente NO están `Disallow`'d (siguiendo la guía de Google de no combinar `Disallow` con `noindex` cuando la señal real que se quiere transmitir es `noindex`, certificado en `tests/publicSurfaceFinalCleanup.test.mjs`). El campo `robotsDisallow` en el registro documenta cuál aplica a cada ruta.

### C. PRIVATE_AUTHENTICATED

Superficie privada — solo para sesión autenticada.

Obligaciones:
- Auth boundary real. El estándar para **rutas nuevas** es `getServerSideProps` devolviendo `{ redirect }` directo para anónimos (boundary `ssr_redirect`) o delegando en una función de gate compartida que hace lo mismo (`ssr_gate_redirect`, ej. `resolveCreationGate`). **Nunca depender únicamente de un `useEffect` client-side** — eso deja una ventana real donde un crawler o un cliente sin JS recibe el HTML completo antes del redirect.
- Cero HTML privado en la respuesta para un request anónimo — verificable con `curl` sin sesión: el body debe ser el redirect mínimo (20-30 bytes), no el shell de la página.
- Redirect seguro: `destination` siempre resuelto server-side, nunca reflejando `ctx.query` sin sanear (usar `sanitizeNextPath` cuando el destino pueda venir de query string).
- `noindex, nofollow` como mínimo; `noarchive` cuando la página puede exponer contenido sensible incluso cacheado (usar el prop `noarchive` de `Layout`, agregado junto con PSCG).
- Fuera de `sitemap.xml`.
- Fuera de navegación pública (navbar, footer, Home, wizard, páginas legales) — solo accesible desde el menú de cuenta autenticado o por navegación interna de otra página privada.
- Fuera de structured data público.
- Mismo comportamiento exacto para humano anónimo y crawler anónimo (Googlebot, Meta, TikTok) — probado con multi-UA, cero lógica condicionada por `User-Agent`.
- Cero cloaking, en cualquier dirección.

**Deuda real encontrada al introducir PSCG** (no inventada, no corregida en esta misión salvo donde se indica): `/panel/bancos` tiene `getServerSideProps` pero no redirige ahí — hidrata la sesión y deja el redirect al cliente (`ssr_hydrate_client_gate`). `/trust/verificar`, `/registro/continuar` y `/perfil` no tienen ningún `getServerSideProps` — dependen enteramente de un `useEffect` client-side que no renderiza el contenido real hasta confirmar sesión (`client_redirect`). `/blog` tampoco tiene SSR, pero su protección real está en que las APIs de lectura exigen Bearer token (`client_redirect_api_auth`, certificado en `tests/blogPrivateProd.test.mjs`). `/trust/verificar` y `/perfil` además carecen de entrada propia en `robots.txt`. Ninguno de estos hallazgos se corrige en esta misión — quedan documentados en `PSCG_REGISTRY` (campo `boundary` y `notes`) para que la próxima vez que se toque alguna de esas páginas, el gap ya esté identificado y no haya que re-descubrirlo.

### D. LEGACY_REMOVED

Ruta retirada del producto activo.

Obligaciones:
- Status HTTP semánticamente correcto.
- Redirect solo si existe un reemplazo realmente equivalente en contenido — si no lo hay, `410`/`404` es más honesto que un redirect a una página que no cumple la misma función.
- Sin contenido fantasma (nada del módulo retirado debe seguir renderizándose).
- Fuera de `sitemap.xml`.
- Sin referencias públicas nuevas (navbar, footer, Home no deben enlazarla).

Hoy el único caso real es `/rifas` (antiguo catálogo público de Rifas): redirige (307, real, server-side) a `/login` preservando `next`, con `X-Robots-Tag: noindex, nofollow`. Esto es una decisión de producto ya certificada (Rodrigo, 2026-08-31) — el redirect no pretende ser "un reemplazo equivalente de contenido", sirve como aterrizaje para bookmarks/backlinks antiguos. Documentado así en el registro, no como una excepción silenciosa a la regla.

## Cómo clasificar una ruta nueva

1. Antes de escribir la página, decide su categoría usando las cuatro definiciones de arriba.
2. Si es `PRIVATE_AUTHENTICATED`: usa el patrón `ssr_redirect` desde el primer commit — copia el `getServerSideProps` de `mis-iniciativas.jsx` o de `difusion.jsx` (esta misión), no el de `panel/bancos.js` ni el de `registro/continuar.jsx`, que son deuda histórica, no el modelo a seguir.
3. Agrega la entrada a `PSCG_REGISTRY` en `src/lib/publicSurfaceClassification.js` con `path`, `file`, `category`, y (si es `PRIVATE_AUTHENTICATED`) `boundary`.
4. Si es `PUBLIC_INDEXABLE`, agrega la URL a `public/sitemap.xml`.
5. Si es `PRIVATE_AUTHENTICATED` o `PUBLIC_NOINDEX` con necesidad de bloqueo activo, agrega la entrada correspondiente a `public/robots.txt` (`Disallow: /tu-ruta`).
6. Corre `node --test tests/pscg.test.mjs` — falla si la categoría no es válida, si una `PRIVATE_AUTHENTICATED` aparece en `sitemap.xml`, o si una `PUBLIC_INDEXABLE` no aparece ahí.

## Checklist pre-merge

- [ ] La ruta tiene una entrada en `PSCG_REGISTRY` con categoría válida.
- [ ] Si es `PRIVATE_AUTHENTICATED`: `getServerSideProps` real, redirect antes de cualquier HTML del módulo, verificado con `curl` anónimo.
- [ ] Si es `PRIVATE_AUTHENTICATED` o `PUBLIC_NOINDEX`: fuera de `sitemap.xml`.
- [ ] Metadata (`title`/`description`) sin promesas no verificables ni terminología que la misión activa no autorizó introducir.
- [ ] Sin enlaces desde navegación pública si la categoría no es `PUBLIC_INDEXABLE`.
- [ ] `node --test tests/pscg.test.mjs` pasa.

## Cómo probar crawlers / no-cloaking

Mismo patrón ya usado en `authUxCrawler.test.mjs` y `publicSurfaceFinalCleanup.test.mjs`:

```bash
for ua in "Mozilla/5.0" "Googlebot/2.1" "facebookexternalhit/1.1" "TikTokBot"; do
  curl -s -A "$ua" http://localhost:PUERTO/tu-ruta | md5sum
done
```

Los cuatro hashes deben ser idénticos. Cualquier diferencia es cloaking, sin excepción — nunca condicionar el HTML servido por `User-Agent`.

Para `PRIVATE_AUTHENTICATED`, además verificar en anónimo:

```bash
curl -s -D - -o /dev/null http://localhost:PUERTO/tu-ruta
# esperado: 307, Location: /login?next=%2Ftu-ruta, body de 20-30 bytes
```

## Relación con robots/sitemap/auth existentes

PSCG no reemplaza ninguno de los tres mecanismos reales — los orquesta y los hace explícitos:

- `public/robots.txt`: sigue siendo la única fuente de verdad para `Disallow`. PSCG documenta, por ruta, si debería estar ahí (`robotsDisallow`), pero no genera el archivo.
- `public/sitemap.xml`: sigue siendo estático y mantenido a mano. PSCG documenta qué rutas deberían estar (`PUBLIC_INDEXABLE`) y cuáles no.
- Auth boundary: `getSupabaseServer` (`src/lib/supabaseServer.js`) sigue siendo el único mecanismo real de lectura de sesión server-side; `assertCreatorEligible` (`src/lib/trustIdentityGate.js`) sigue siendo la única autoridad de elegibilidad de creador. PSCG solo documenta cuál de los dos (o ninguno) protege cada ruta.

## Ejemplos actuales (estado real auditado, no supuesto)

| Ruta | Categoría |
|---|---|
| `/` | PUBLIC_INDEXABLE |
| `/eventos` | PUBLIC_INDEXABLE |
| `/reglas-iniciativas-premio` | PUBLIC_NOINDEX |
| `/login`, `/register` | PUBLIC_NOINDEX |
| `/difusion` | PRIVATE_AUTHENTICATED |
| `/crear-rifa`, `/crear-colecta`, `/crear-evento` | PRIVATE_AUTHENTICATED |
| `/mis-iniciativas`, `/panel` | PRIVATE_AUTHENTICATED |
| `/blog` | PRIVATE_AUTHENTICATED |
| `/rifas` | LEGACY_REMOVED |

Lista completa, con `file`/`boundary`/`notes` reales: `src/lib/publicSurfaceClassification.js`.

## Alcance de este registro (importante)

`PSCG_REGISTRY` cubre hoy el baseline auditado al introducir PSCG (2026-09-04) más las rutas tocadas por esta misión. **No es un backfill retroactivo de cada ruta histórica del repo** — páginas como `rifas/[id].jsx`, `colectas/[id].jsx`, `eventos/[id].jsx`, todo `src/pages/api/*`, `src/pages/admin/*`, `src/pages/checkout/*`, etc. no tienen entrada propia todavía. Eso es deuda documentada, no un error silencioso: intentar clasificar de una sola vez cada ruta histórica sin auditarla individualmente habría violado la instrucción de "usar el estado real del repo, no asumir" que rige toda esta misión.

La regla que sí es transversal desde ahora: **toda ruta nueva se clasifica en `PSCG_REGISTRY` antes de mergear**. El backfill del resto del repo, si se decide hacer, es una misión futura separada.

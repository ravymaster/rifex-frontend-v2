# DIFUSIÓN V1

**Ruta**: `/difusion` — **Clasificación PSCG**: `PRIVATE_AUTHENTICATED`, boundary `ssr_redirect`.

> **Actualización V1.1 (2026-09-04) — MULTIPRODUCTO**: ver la sección [V1.1 — Multiproducto](#v11--multiproducto-2026-09-04) al final de este documento. El contenido original de esta página (todo lo que sigue hasta esa sección) describía V1 cuando la guía cubría exclusivamente Rifas — se mantiene como registro histórico de esa fase, no como el estado actual de la página. La clasificación PSCG (`PRIVATE_AUTHENTICATED`, boundary `ssr_redirect`), la ruta única `/difusion`, el auth boundary y la metadata **no cambiaron** en V1.1 — solo el contenido dentro de la página.

## Qué es

Una guía educativa estática, visible solo con sesión, que explica a un creador cómo compartir su iniciativa de Rifex en redes sociales sin prometer resultados y sin intentar evadir las políticas de las plataformas. Es contenido — no una herramienta, no una integración, no un flujo con estado propio más allá de un botón "Copiar".

## Por qué existe

Las redes sociales (Meta, TikTok y otras) pueden aplicar restricciones a publicaciones relacionadas con rifas, sorteos o premios. Rifex no controla esas políticas ni puede prometer que una publicación pase sin problemas — lo único responsable es explicarle al creador, con lenguaje prudente, qué puede pasar y cómo reducir el riesgo de una publicación mal recibida, sin enseñar a evadir la revisión de la plataforma.

## V1 — explícitamente limitada

Esta versión es intencionalmente mínima: información + un ejemplo de texto + un botón de copiar. **No incluye**, por decisión explícita de esta misión: IA, Warp AI, análisis automático de contenido, score de riesgo, revisión inteligente, templates por plataforma, publicación automática, OAuth/conexión con Meta/TikTok/X, scheduler, analítica, generador de copy, ni imágenes automáticas. Cualquiera de esas capacidades requeriría su propia misión, con su propia decisión de producto y su propia superficie de seguridad — no es un efecto secundario de V1.

## Navegación

"Difusión" vive únicamente en el menú de cuenta autenticado (`Layout.jsx`, `accountItems`), entre "Mis iniciativas" y "Bancos & Pagos". No aparece en la navbar pública (`navItems`), footer, Home, wizard ni ninguna página legal.

## Auth boundary

`getServerSideProps` (mismo patrón que `mis-iniciativas.jsx`/`panel/index.js`): lee la sesión vía `getSupabaseServer`, y si no hay usuario devuelve `{ redirect: { destination: '/login?next=/difusion', permanent: false } }` — antes de que el componente de la página se renderice. Un request anónimo recibe un `307` real con un body mínimo (redirect string), nunca el contenido del módulo. `next` es siempre el literal fijo `/difusion` en el redirect de sesión — sin superficie de open-redirect en este código.

## Metadata

- `title`: "Difusión — Rifex"
- `description`: "Guía para compartir tus iniciativas de Rifex en redes sociales de forma clara y responsable."
- `robots`: `noindex, nofollow, noarchive` (vía el nuevo prop `noarchive` de `Layout`, agregado con esta misión — compatible hacia atrás, no afecta a ningún llamador existente).
- `canonical`: mismo patrón que cualquier página privada (`canonicalPath="/difusion"` vía `publicMetadata.canonicalUrl`).
- Sin Open Graph comercial específico — solo el genérico que `Layout` ya agrega a toda página (mismo que recibe `/mis-iniciativas`, no promocional, no indexado).
- Sin entrada en JSON-LD público — el único bloque `Organization`+`WebSite` vive exclusivamente en Home.

## Sitemap / robots

- Ausente de `public/sitemap.xml`.
- `public/robots.txt` gana una línea nueva: `Disallow: /difusion` — mismo patrón que el resto de las rutas `PRIVATE_AUTHENTICATED` con boundary `ssr_redirect`/`ssr_gate_redirect` (`/panel`, `/crear-rifa`, `/crear-colecta`, `/crear-evento`, `/mis-iniciativas`). No se tocó ninguna entrada existente ni la estrategia global del archivo.

## Contenido V1

- **Qué debes saber**: texto exacto especificado por la misión — sin afirmar que las plataformas "siempre" sancionan ni que una publicación "siempre" será eliminada.
- **Antes de publicar**: 7 recomendaciones (claridad, identificación del organizador, información verificable, sin promesas de ganancia, sin mensajes engañosos, enlace oficial, revisar políticas de la red).
- **Palabras sensibles**: explica que términos como "rifa"/"sorteo"/"premio" pueden activar revisiones adicionales — recomienda un texto claro y no engañoso, sin enseñar bypass, evasión, ni sustitución deliberada de palabras para ocultar la naturaleza de la iniciativa.
- **Ejemplo de publicación**: texto copiable con placeholders (`[motivo o causa]`, `[enlace de tu iniciativa]`, `[nombre del organizador]`), botón "Copiar ejemplo" (`navigator.clipboard.writeText`, mismo patrón ya usado en `colectas/[id].jsx`'s botón de compartir — sin ninguna llamada a API), y una nota explícita contra publicar información falsa u ocultar la naturaleza de la oferta.
- **Publicidad pagada**: texto exacto especificado por la misión sobre restricciones adicionales en anuncios pagados — sin inventar enlaces a fuentes externas (ninguna estaba pre-documentada en el repo para enlazar).

Las palabras "rifa"/"sorteo"/"premio"/"azar" sí aparecen dentro de este contenido educativo privado — es la superficie donde la misión explícitamente las autoriza, a diferencia de la metadata (title/description), que permanece limpia.

## Regresión de identidad pública

Confirmado que crear Difusión no introduce "rifa"/"rifas"/"sorteo"/"sorteos"/"premio"/"premios" en ninguna superficie pública: Home, navbar pública, footer público, `sitemap.xml`, JSON-LD, `/wizard`, `/eventos`, campañas públicas — ninguno de esos archivos fue tocado por esta misión salvo `Layout.jsx` (solo el menú de cuenta autenticado) y `robots.txt` (solo una línea `Disallow`).

## Tests

`tests/difusion.test.mjs` certifica: anónimo recibe `307` con `next` correcto; robots `noindex, nofollow, noarchive`; ausente de `sitemap.xml`; ausente de `navItems` (navbar pública) y del footer de `Layout.jsx`; presente en `accountItems` (menú autenticado); contenido educativo, ejemplo copiable y botón "Copiar" presentes en el código fuente; cero referencias a IA/Warp/APIs sociales/Payment Engine/Trust backend/comisión en el archivo de la página.

---

## V1.1 — Multiproducto (2026-09-04)

**Objetivo**: V1 estaba orientada casi exclusivamente a Rifas ("Palabras sensibles" hablaba de "rifa"/"sorteo"/"premio"/"azar" como si fuera la única superficie de riesgo). Rifex ya tiene Rifas, Campañas y Eventos como productos reales — V1.1 hace que Difusión sirva a los tres, más Inscripciones (marcada explícitamente "Próximamente", ya que no es un producto real todavía).

**Qué NO cambió**: la clasificación PSCG (`PRIVATE_AUTHENTICATED`), el boundary (`ssr_redirect` — el mismo `getServerSideProps` byte-idéntico de V1), la ruta (sigue siendo únicamente `/difusion`, no se crearon rutas por producto), la metadata (`title`/`description`/`robots` idénticos), la ubicación en navegación (solo `accountItems`, nunca pública), ni `robots.txt`/`sitemap.xml` (ya cubiertos por V1, sin cambios adicionales).

**Qué sí cambió**: el contenido dentro de la página. Nuevo `src/lib/difusionGuides.js` — estructura de datos pura (sin JSX, sin llamadas de red, sin IA) con `DIFFUSION_PRODUCTS` (los 4 productos) y `DIFFUSION_GUIDES` (el contenido completo de cada uno). `src/pages/difusion.jsx` reescrito para renderizar un selector (`role="tablist"`, 4 botones tipo segmented-control, coherente con el sistema visual inline-styled ya usado en esta página) y el contenido de la guía activa (`useState`, cambio 100% client-side, sin navegación, sin round-trip, sin pérdida de sesión).

**Selector — decisión de default**: "Eventos" queda seleccionado por defecto al entrar. La misión pedía explícitamente no asumir un default sin justificarlo — se eligió Eventos por ser la identidad pública actual de Rifex (primer ítem del navbar público, catálogo principal en `/eventos`), la opción más neutral entre los 3 productos implementados; ninguna documentación del repo indica una preferencia por Rifas.

**Rifas — "Precauciones especiales"**: mantiene (y expande) el contenido de V1 — restricciones por plataforma, la distinción entre publicación orgánica y anuncio pagado, que cambiar palabras no cambia la política real, y la nota de "palabras sensibles" (ahora específica de Rifas, ya que las otras tres guías no giran en torno a esas palabras). Sin enseñar bypass, evasión, engaño de algoritmo, cloaking ni sustitución deliberada — verificado con un test dedicado.

**Campañas — "Comparte tu causa con claridad"**: contenido nuevo, distinto del de Rifas — explicar el motivo, identificar al organizador, describir el uso de los aportes, evitar promesas exageradas/garantías de resultado/"dinero fácil"/presión engañosa/contraprestaciones no contempladas.

**Eventos — "Guía de difusión"**: contenido nuevo — nombre, fecha, hora, lugar, tipo de actividad, disponibilidad de entradas, mención de entradas digitales/QR cuando corresponda. Deliberadamente sin lenguaje de "permitido por Meta"/"garantizado"/"sin riesgo" — es una guía de difusión normal, no una certificación de políticas.

**Inscripciones — "Próximamente"**: `available: false` en el registro. Muestra un texto de vista previa informativa y el ejemplo de publicación futuro ya redactado, pero **sin** botón "Copiar ejemplo" funcional (`ExampleBlock` renderiza un badge "Vista previa" en su lugar cuando `copyable` es `false`) — no se simula funcionalidad de un producto que no existe. Sin ruta nueva, sin backend, sin formulario, sin tabla.

**Ejemplos copiables**: cada guía implementada (Rifas/Campañas/Eventos) tiene su propio texto — verificado que los 3 son distintos entre sí. El botón "Copiar ejemplo" sigue usando exclusivamente `navigator.clipboard.writeText`, ahora parametrizado por el texto de la guía activa (`ExampleBlock`, prop `text={guide.example}`) — mismo mecanismo, sin API nueva.

**Redes mencionadas conceptualmente**: una única línea bajo el subtítulo menciona Facebook, Instagram, TikTok, X y WhatsApp — sin guías independientes por red, sin OAuth, sin API, sin publicación automática, sin scheduler, sin analítica, tal como exige la misión.

**Publicidad pagada**: cada guía implementada tiene su propia nota (Rifas: advertencia fuerte reutilizando el texto de V1; Campañas: evitar claims engañosos/resultados garantizados; Eventos: cada plataforma mantiene sus propias políticas). Un bloque común (`DIFFUSION_COMMON_AD_NOTE`) cierra cada guía con la nota genérica de que las políticas pueden cambiar.

**Componentización**: `difusionGuides.js` es solo datos — ningún framework, ninguna API, ninguna base de datos, ningún CMS. `difusion.jsx` importa el registro y renderiza según `guide.key`, con 3 componentes de presentación pequeños (`RaffleGuide`, `CampaignOrEventGuide`, `RegistrationGuide`) más un `ExampleBlock` compartido para el bloque de ejemplo/copiar — evita duplicar el markup 4 veces sin introducir ninguna abstracción nueva de infraestructura.

**Tests**: `tests/difusion.test.mjs` reescrito completo para V1.1 (22 tests) — certifica los 4 productos, Inscripciones marcada "Próximamente" sin CTA funcional, contenido distinto por producto, precauciones especiales de Rifas sin enseñar evasión, recomendaciones específicas de Campañas, guía de Eventos sin lenguaje de "aprobación garantizada", ejemplos distintos y correctamente vinculados al botón "Copiar", cero rutas/backend nuevos por producto, cero APIs sociales/generación automática, selector sin navegación ni pérdida de sesión, y que el boundary PSCG sigue intacto. `tests/pscg.test.mjs` no requirió ningún cambio — la entrada de `/difusion` en el registro sigue siendo válida sin modificación.

**V2/V3 (documentado, no implementado)**: V2 seleccionaría una iniciativa real del usuario y rellenaría automáticamente nombre/fecha/enlace/organizador. V3 (con generación asistida por IA) agregaría adaptación por plataforma, revisión inteligente y recomendaciones dinámicas. Ambas quedan fuera del alcance de V1.1 — ninguna pieza de infraestructura para ellas fue introducida en este commit.

---

## Addendum (2026-09-04) — Inscripciones deja de ser "Próximamente"

INSCRIPCIONES V1 FREE se implementó como producto real (ver `docs/inscripciones/INSCRIPCIONES_V1_PRODUCT.md`). Único cambio en este archivo/misión: `DIFFUSION_GUIDES.registration` pasa de `available:false`/`tagline:"Próximamente"` a `available:true`/`tagline:"Guía de difusión"`, con contenido real (nombre/fecha/hora/lugar/cupos/enlace, mención del QR de acceso) siguiendo exactamente el mismo formato que Campañas/Eventos. `difusion.jsx` ahora renderiza la guía de Inscripciones vía el mismo componente `CampaignOrEventGuide` que usan Campañas/Eventos (antes usaba `RegistrationGuide`, que queda en el código solo como fallback si algún futuro producto vuelve a marcarse `available:false`). Nada más de este documento cambió: clasificación PSCG, boundary, ruta única `/difusion`, metadata, ubicación en navegación y `robots.txt`/`sitemap.xml` siguen exactamente iguales a V1.1. `tests/difusion.test.mjs` se actualizó en las 2 aserciones que asumían el estado anterior (22/22 PASS).

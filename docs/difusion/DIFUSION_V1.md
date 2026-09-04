# DIFUSIÓN V1

**Ruta**: `/difusion` — **Clasificación PSCG**: `PRIVATE_AUTHENTICATED`, boundary `ssr_redirect`.

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

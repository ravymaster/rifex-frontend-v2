# RIFEX RAFFLE EXPERIENCE 2026 — FINAL VISUAL LOCK (2026-09-08)

DEV only. Última pasada visual/responsive antes de QA humana final y
promoción controlada a PROD. Cero cambios de arquitectura transaccional,
cero producto nuevo. `origin/develop` avanza desde `66692f3` (CHECKOUT V2
UX CORRECTION PASS DEV certified).

## Contexto

QA humana pidió una última pasada visual: la ficha pública y el checkout
funcionaban correctamente pero desperdiciaban demasiado ancho de pantalla
("una pequeña aplicación flotando en un océano vacío"), el fondo tenía un
gris visible, la Buy Box repetía la foto hero a tamaño completo en vez de
usar una miniatura, el checkout hacía lo mismo, y existía un bug real en
mobile: al abrir el lightbox de la galería, el botón de cerrar (X)
quedaba oculto detrás del header hasta hacer scroll.

## Cambios implementados

### 1. Fondo y contenedores

- **Ficha pública** (`src/styles/rifaDetalle.module.css`): fondo
  `#f6f8fb` (gris visible) → `#FAFAFA` (off-white extremadamente suave).
  `.card` pasa de `max-width: 1100px` fijo a `width: 95vw; max-width:
  1700px` — usa casi todo el ancho disponible en desktop, ~95% del
  viewport en mobile. `.page` pierde su padding horizontal fijo para que
  el 95vw del `.card` sea real (evita el doble angostamiento de
  porcentaje-sobre-porcentaje).
- **Checkout** (`src/styles/checkoutV2.module.css`): `.shell` pasa de
  `max-width: 1080px` fijo a `width: 95vw; max-width: 1450px`. El fondo
  puro blanco + separación vía halo/sombra (certificado en la misión
  anterior) se mantiene sin cambios — no contradice el nuevo estándar de
  fondo off-white, que aplica al problema real (la ficha pública, con su
  gris visible), no al checkout, que ya no tenía ese problema.

### 2. Columna de foto dominante

`layout2col` pasa de `1.35fr 1fr` a `2fr 1fr` (~66%/33%) — con el
contenedor mucho más ancho, la portada real (`PrizeGallery`, sin cambios
de lógica: mismas flechas, mismo `object-fit: contain`, mismas
miniaturas, mismo indicador "+N fotos") queda visualmente protagonista.

### 3. Buy Box — miniatura real, consolidada, siempre visible

Antes: la Buy Box repetía la portada completa como foto hero (aspect-ratio
4:3 a todo el ancho del sidebar) y drawCard/statCardsRow vivían como tres
tarjetas separadas encima de ella.

Ahora: la Buy Box es una única tarjeta que:
- muestra una miniatura real de 56×56px (mismo asset
  `raffle.prize_photos[0]`, sin pipeline de imágenes nuevo) junto al
  título y tipo de premio;
- consolida sorteo / disponibles / valor por número (antes repartidos en
  drawCard + statCardsRow) en filas compactas dentro de la misma tarjeta;
- se renderiza **siempre** (ya no detrás de un ternario `canBuy ? <BuyBox>
  : <button>`) — solo la mitad inferior cambia: selector + CTA real
  cuando `canBuy`, o un botón deshabilitado ("Ventas cerradas" / "Rifa
  agotada") cuando no, para no perder la información de sorteo/
  disponibilidad/valor en el estado no-comprable.
- para premios en dinero, agrega una fila "Premio" con el monto real
  (antes vivía en el statCard destacado que se retiró).

Sin chips 1/5/10/20, sin botón Cancelar (mandato previo, sigue vigente).

### 4. Checkout — miniatura real, sin foto hero duplicada

`gridPhoto` (área de grid independiente con la foto a 4:3 completa,
"protagonista, nunca una miniatura" según el comentario original) se
retira por completo. La miniatura (56×56px, mismo asset) ahora vive
dentro de `gridSummary`, junto al título/tipo del premio, seguida de una
fila "Sorteo" nueva (antes el checkout no mostraba la fecha de sorteo) y
las filas de cantidad/precio/total ya certificadas. El grid pasa de 6
áreas a 5 (`head`, `summary`, `form`, `terms`, `cta` — sin `photo`
independiente), manteniendo el mismo orden mobile (título → resumen con
miniatura → datos → términos → CTA) y el mismo 60/40 en desktop.

### 5. Lightbox — fix real del bug de mobile

**Causa raíz encontrada**: `rifas/[id].jsx` envuelve toda la página en un
contenedor con `isolation: isolate` (para aislar sus propios overlays de
pago). Eso crea un stacking context propio para toda la página, que
compite contra el header sticky de `Layout.jsx` (`z-index: 40`) **desde
afuera**. El lightbox (`z-index: 3200` dentro de `PrizeGallery`) nunca
podía ganarle al header porque la comparación de z-index ocurría un nivel
más arriba de donde vive ese 3200 — sin importar qué tan alto fuera ese
número, quedaba atrapado dentro del stacking context de la página, que en
reposo compite como `z-index: auto` (~0) contra el 40 del header.

**Fix**: el lightbox se renderiza vía `createPortal(..., document.body)`
en `PrizeGallery.jsx` — al vivir como hijo directo de `<body>`, su
z-index siempre compite en el nivel raíz, nunca atrapado dentro de ningún
stacking context ajeno. Esto es un fix estructural (no un parche
específico de esta página): cualquier consumidor futuro de
`PrizeGallery` queda protegido del mismo bug automáticamente.

Además: bloqueo de scroll del body mientras el lightbox está abierto
(`document.body.style.overflow = "hidden"`, restaurado al cerrar), cierre
con tecla Escape, y `padding-top`/`top` del backdrop/botón X respetando
`env(safe-area-inset-top)` para nunca quedar detrás del notch/status bar
en iOS.

### 6. Claims y branding

Sin cambios — el mandato pide "no introducir claims absolutos falsos",
no auditar los ya existentes; los badges genéricos preexistentes
(`staticTrustRow`: "Organizador verificado" / "Pago seguro (Mercado
Pago)" / "Transparencia total") están fuera del alcance explícito de esta
misión (igual que se determinó en la misión CHECKOUT V2 UX CORRECTION),
no se tocaron.

## Invariantes funcionales — sin cambios

- `checkout/mp.js`: **diff = 0 líneas** contra `origin/develop` (mismo
  hash md5 `b3f9488f623de0a47ed751b4cfa93a0c` antes y después).
- Payload real de checkout (`raffle_id`, `raffleId`, `quantity`,
  `buyer_email`, `buyer_name`, `accepted_terms`, `terms_version`): sin
  cambios, sin teléfono, sin `numbers`/`assigned_numbers`.
- `idOrSlugColumn` sigue resolviendo UUID/slug igual en ambas páginas.
- Fórmula de cantidad/total de la Buy Box: mismo clamp
  (`Math.max(1, availableCount || 1)` / `Math.min/Math.max` del stepper),
  mismo total = unitario × cantidad.
- Sin RPC, sin RLS, sin migraciones, sin cambios a Payment Engine,
  webhook, Trust backend, QR, draw/winner, Eventos, Campañas,
  Inscripciones. `origin/main` intacto en `84708a9`.

## Tests

`tests/finalVisualLock.test.mjs` (nuevo, 26 escenarios: VL-1 a VL-20 +
SIN-CAMBIOS-VL 1-6) cubre contenedores, hero, thumbnails de Buy Box y
checkout, consolidación de la Buy Box, grid de 5 áreas del checkout,
portal del lightbox + scroll-lock + Escape + safe-area, z-index del
header, y los invariantes funcionales (checkout/mp.js, payload, fórmulas,
slug/UUID).

3 tests pre-existentes actualizados para seguir la lógica reubicada
(mismo criterio, nunca relajado):
- `raffleVisualPolish.test.mjs` LAYOUT 4 (sidebar consolidado en
  `buyBoxInfoRow` en vez de `drawCard`/`statCardsRow`) y LAYOUT 6 (Buy Box
  siempre renderizada, `canBuy` decide el contenido interno en vez de un
  ternario externo).
- `checkoutUnifiedV2.test.mjs`: UX-BUYBOX 1 (mismo ajuste que LAYOUT 6),
  UX-BUYBOX 6 (prop renombrada `maxQuantity` → `availableCount`),
  UX-CHECKOUT 5 (`prizePhoto` → `summaryThumb`), DISEñO-CO 6 (tope de
  `max-width` ahora incluye 1450px).

Regresión completa: **1066/1067** (mismo flake histórico de XLSX,
timing-based, firma exacta ya documentada en misiones anteriores). Build
(`next build`) limpio.

## QA visual — real, interactiva, contra el deploy DEV en producción

**Primer intento** (contra `next dev` local en el worktree efímero):
el Browser pane no llegó a componer frames — `computer{action:"screenshot"}`
falló con "the Browser pane is not displayed, so the page is not
compositing frames", y una investigación exhaustiva (pestaña nueva,
reload duro, `document.hidden`/`visibilityState` permanentemente
`true`/`"hidden"` pese a `tabs_select` y `isActive: true`) confirmó que
React nunca llegó a hidratar en ningún punto, ni siquiera en la página
de inicio (sin relación con esta misión). Se descartó como causa del
propio código en ese momento (`npm run build` compiló limpio, el bundle
contenía la URL/anon key correctas, una consulta REST directa devolvió
el registro esperado, cero errores de consola) — pero seguía siendo un
bloqueo real para la verificación visual.

**Tras el push a `origin/develop`, Vercel desplegó automáticamente**
(`rifex-frontend-main.vercel.app`, alias `-git-develop-`, deploy Ready
~4 min después del push). Contra ese deploy real la hidratación
funcionó correctamente — el problema anterior era específico del
servidor `next dev` local del worktree efímero, no del código ni del
entorno de automatización en general. Se verificó interactivamente:

- **Ficha pública** (`/rifas/tabla-de-surf`, fixture real con 5 fotos,
  desktop 1600px): `.card` mide **1520px** = exactamente 95vw sobre
  1600px; Buy Box con `buyBoxThumb` real de **56×56px**; texto renderizado
  confirma la tarjeta consolidada ("Sorteo 30-09-2026 · 14:00 · Hora de
  Chile", "Disponibles 10 de 10", "Valor por número $2.000", stepper,
  filas de precio/cantidad/total, CTA único).
- **Checkout** (`/rifas/tabla-de-surf/checkout?qty=1`): `.shell` mide
  **1450px** (tope de max-width alcanzado sobre 1600px de viewport);
  `summaryThumb` real de **56×56px**; texto confirma "RESUMEN DE TU
  COMPRA / Tabla de surf / Premio físico / Sorteo 30-09-2026 · 14:00 ·
  Hora de Chile / Cantidad / Precio por número / Total /
  [nombre/correo/términos] / Continuar al pago →" — sin teléfono, sin
  pantalla de método de pago, un solo CTA.
- **Lightbox**: al abrirlo con un click real sobre la portada, se
  confirmó vía JS que el backdrop es **hijo directo de `document.body`**
  (`isDirectBodyChild: true`, prueba directa de que el portal funciona),
  `z-index: 3200`, `document.body` con `overflow: hidden` (scroll
  bloqueado), y el botón de cerrar en `top: 16px` (nunca detrás del
  header) — el bug real que motivó el fix quedó demostrado corregido.
- **Mobile** (375×812): `.card` mide **356.25px** = exactamente 95vw
  sobre 375px, `document.documentElement.scrollWidth === window.innerWidth`
  (sin overflow horizontal).
- **Consola**: cero errores en las cuatro verificaciones anteriores.

Todos los puntos del §23 del mandato quedan demostrados con interacción
real contra un deploy vivo, no solo con HTML estático ni con tests
estructurales — el bloqueo inicial documentado arriba fue un artefacto
puntual del servidor de desarrollo local, corregido de facto al verificar
contra el deploy real.

## Archivos modificados

- `src/pages/rifas/[id].jsx` — Buy Box consolidada (thumbnail, info
  siempre visible, canBuy interno), columna 2fr/1fr.
- `src/styles/rifaDetalle.module.css` — fondo off-white, contenedor
  95vw/1700px, clases `buyBoxHead`/`buyBoxThumb`/`buyBoxInfoRow` nuevas,
  `drawCard`/`statCardsRow`/`buyBoxPhoto`/`cta`/`bottomCta` retiradas
  (dead code tras la consolidación).
- `src/pages/rifas/[id]/checkout.jsx` — miniatura en el resumen, fila de
  sorteo nueva, grid de 5 áreas.
- `src/styles/checkoutV2.module.css` — contenedor 95vw/1450px, clases
  `summaryHead`/`summaryThumb` nuevas, `prizePhoto`/`gridPhoto` retiradas.
- `src/components/rifex/PrizeGallery.jsx` — lightbox vía portal +
  scroll-lock + Escape.
- `src/styles/prizeGallery.module.css` — safe-area-inset-top en el
  backdrop/botón X del lightbox.
- `tests/finalVisualLock.test.mjs` (nuevo), `tests/raffleVisualPolish.test.mjs`,
  `tests/checkoutUnifiedV2.test.mjs` (actualizados).

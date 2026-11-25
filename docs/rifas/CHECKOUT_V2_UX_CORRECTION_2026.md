# CHECKOUT V2 — UX CORRECTION PASS (2026-09-07)

DEV only. Branch `dev/checkout-v2-ux-correction-2026-09-07`, sobre
`origin/develop` (que ya incluía CHECKOUT UNIFICADO V2, commit `0d429fd`).

## Origen

QA humana sobre CHECKOUT UNIFICADO V2: técnicamente correcto pero
visualmente no cumplía el objetivo de producto — panel de cantidad
comprimido, checkout angosto con espacio muerto, sensación de
formulario/panel administrativo en vez de tienda online, stepper 1-2-3
sin valor real, pantalla "Método de pago" fingiendo integraciones
inexistentes, campo teléfono sin uso ni persistencia real.

## Qué cambió

1. **Buy Box photo-first, siempre visible** — ya no vive detrás de un
   botón "Comprar número": es la superficie de compra completa (foto
   real del premio, "Compra segura", stepper grande, filas Precio por
   número / Cantidad / Total, CTA dominante "Continuar →"). Retirados
   por completo: los chips rápidos 1/5/10/20 y el botón Cancelar — quien
   no quiere comprar simplemente no continúa.
2. **Checkout de una sola pantalla** — "Finaliza tu compra" reemplaza el
   flujo de 2 pantallas (datos → pago) de la misión anterior. Layout
   tipo tienda online: contenedor ~1080px centrado, grid de 2 columnas
   en desktop (≥900px, ~60/40 — izquierda: formulario; derecha: foto +
   resumen + CTA) vía `grid-template-areas` con las mismas 6 regiones
   nombradas redefinidas por breakpoint (`head`/`photo`/`summary`/
   `form`/`terms`/`cta`), una sola columna en mobile.
3. **Foto real del premio en ambas superficies** — reutiliza
   `raffle.prize_photos[0]`, el mismo asset que ya usa `PrizeGallery` en
   la ficha pública. Sin pipeline de imágenes nuevo, sin inventar
   portadas.
4. **Teléfono eliminado por completo** — no se muestra, no se recolecta,
   no se envía. El campo que la misión anterior había agregado (sin
   persistencia real) se retiró íntegramente del formulario y del
   payload.
5. **Pantalla "Método de pago" eliminada** — ya no existe el selector
   ficticio de tarjeta/transferencia/saldo/otro. Un único CTA
   "Continuar al pago" dispara directamente el submit real
   (`POST /api/checkout/mp`), sin pantalla intermedia.
6. **Stepper 1-2-3 eliminado** — sin sustituto. En el checkout basta
   "← Volver a la rifa" como único mecanismo de navegación hacia atrás
   (se retiró también el botón "✕" adicional de la misión anterior).
7. **Claims auditados en estas dos superficies** — el copy nuevo usa
   lenguaje prudente ("Compra procesada de forma segura", "Tus datos
   están protegidos") en vez de claims absolutos sin autoridad real
   detrás en el contexto puntual donde se escribió. Los badges
   pre-existentes de la ficha pública (`TrustBadge`, el bloque estático
   estatal ya certificado en misiones anteriores) están fuera del
   alcance de esta pasada — no se tocaron.

## Cero cambios de lógica de pagos

`checkout/mp.js` — **diff = 0 líneas**, confirmado explícitamente. El
payload sigue siendo exactamente `raffle_id`/`raffleId`/`quantity`/
`buyer_email`/`buyer_name`/`accepted_terms`/`terms_version`, siempre con
`raffle.id` (UUID real ya resuelto), nunca el parámetro crudo de la URL.
`assignRandomAvailableNumbers`, `HOLD_MINUTES`, la RPC atómica
`reserve_tickets_for_purchase` — todos intactos, no forman parte del
diff de esta misión.

## NO TOCAR — confirmado intacto

`checkout/mp.js`, Payment Engine, Mercado Pago, comisión 7%, webhook,
RLS, migraciones, schema de Supabase, RPC, Trust backend, QR, draw,
winner, Eventos, Campañas, Inscripciones, `origin/main`. Sin
migraciones SQL nuevas.

## Tests y evidencia

`tests/checkoutUnifiedV2.test.mjs` reescrito — 39 escenarios (MODAL-CO,
TRUST-CO, UX-BUYBOX, UX-CHECKOUT, FLUJO-CO, SIN-CAMBIOS-CO, VALID-CO,
DISEÑO-CO), 39/39 en verde. Un test estructural pre-existente
(`LAYOUT 6` en `raffleVisualPolish.test.mjs`) verificaba el atributo
`disabled={!canBuy}` del botón-gate retirado — se actualizó para seguir
la misma condición `canBuy` a su forma real (Buy Box vs. botón
deshabilitado), sin relajar el criterio. Regresión completa: 1040/1041
(único fallo: el flake histórico ya documentado de
`eventAnalyticsWorkbook.test.mjs`). Build de producción limpio.

QA visual manual contra `next start` real con credenciales `rifex-dev`
(worktree throwaway, ya eliminado): la Buy Box aparece de inmediato al
cargar la ficha pública, sin necesidad de un clic previo; "Continuar"
navega a `/rifas/lambo-6f9973/checkout?qty=1`; la pantalla única
"Finaliza tu compra" muestra foto, resumen y formulario; el formulario
valida en vivo (nombre/correo/términos) y habilita "Continuar al pago"
solo cuando es válido; confirmado por estilos computados: fondo blanco
puro (`rgb(255,255,255)`) en `.page` y `.card`, grid de 2 columnas real
en desktop (1280px → `589px 393px`) y 1 columna en mobile (375px →
`309px`), sin overflow horizontal en ninguno de los dos, cero errores de
consola. No se completó un pago real (evitado deliberadamente, mismo
criterio que la misión anterior: habría reservado un número real de la
rifa de prueba en `rifex-dev` sin necesidad, ya que la ruta de pago en
sí no fue modificada).

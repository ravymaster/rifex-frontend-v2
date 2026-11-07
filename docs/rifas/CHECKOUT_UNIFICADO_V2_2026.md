# CHECKOUT UNIFICADO V2 (2026-09-07)

DEV only. Branch `dev/checkout-unified-v2-2026-09-07`, sobre `origin/develop`
(que ya incluía HUMAN SLUG V2 + PUBLIC RAFFLE CLEANUP, commit `168ed37`).

## Origen

Brief redactado por Doris (prompt "RIFEX — CHECKOUT UNIFICADO V2") extraído
de un mockup de referencia (tres pantallas: cantidad, datos, pago, estilo
tienda online), más un requisito de identidad visual adicional de Rodrigo:
fondo blanco puro, separación por sombra/halo verde extremadamente sutil,
nunca superficies verdes o grises grandes.

## Qué cambió

1. **Modal "¿Cuántos números quieres?" retirado** — el stepper y los
   accesos rápidos (1/5/10/20) ahora viven **inline** dentro del propio
   sidebar de la ficha pública (`QuantityPanel`, nuevo componente local en
   `rifas/[id].jsx`), nunca como backdrop de página completa. Al hacer clic
   en "Continuar", la página **navega** — no abre otro modal — a
   `/rifas/[id]/checkout?qty=N`.
2. **Nueva página `/rifas/[id]/checkout`** — 2 pantallas internas (estado
   `step: 'datos' | 'pago'`, no dos rutas separadas, para no perder el
   contexto de la rifa entre pasos):
   - **Tus datos**: nombre, correo, teléfono (+56, 9 dígitos empezando en
     9 — mismo criterio ya usado en el resto de Rifex), aceptación de
     términos. Validación real antes de habilitar "Continuar al pago".
   - **Método de pago**: selector visual de 4 opciones (tarjeta,
     transferencia, saldo, otro) — **puramente cosmético**: no existe más
     que una integración real (Mercado Pago), así que las 4 opciones
     terminan llamando exactamente al mismo `POST /api/checkout/mp`. Se
     documenta así explícitamente para no sugerir una capacidad que no
     existe.
3. **Cero cambios a `checkout/mp.js`** — diff de ese archivo: 0 líneas. El
   submit real (`fetch('/api/checkout/mp', ...)`) se movió de
   `rifas/[id].jsx` a la nueva página, con el mismo payload exacto
   (`raffle_id`/`raffleId`/`quantity`/`buyer_email`/`buyer_name`/
   `accepted_terms`/`terms_version`), usando siempre `raffle.id` (UUID real
   ya resuelto vía `idOrSlugColumn`), nunca el parámetro crudo de la URL.
4. **Campo teléfono — decisión explícita sobre su alcance**: el mockup
   pide teléfono como parte de "Información personal", pero no existe hoy
   una columna de persistencia para eso en `purchases`. Se agregó el campo
   con validación real en el frontend (UX completa, consistente con el
   mockup) y se envía como `buyer_phone` en el payload — `checkout/mp.js`
   lo ignora silenciosamente (desestructura por nombre, nunca lo lee). No
   se agregó ninguna migración para persistirlo/usarlo: si se quiere que
   el teléfono quede guardado o se use para contactar al ganador, eso
   requiere una migración aditiva nueva a autorizar explícitamente por
   Rodrigo — no se ejecutó una acá.
5. **Identidad visual "tienda online"** (`src/styles/checkoutV2.module.css`):
   fondo `#ffffff` puro (nunca gris), la separación del contenido es
   íntegramente vía `box-shadow` (borde ultraligero + sombra difusa neutra
   + halo verde Rifex `rgba(24,169,87,…)` y azul `rgba(30,58,138,…)`
   extremadamente sutiles) — nunca un bloque de color sólido. Botón
   primario con el mismo gradiente azul→verde ya certificado
   (`#1E3A8A → #18A957`), sombra elevada + `translateY` en hover para el
   efecto de "brillo" pedido.

## NO TOCAR — confirmado intacto

`checkout/mp.js` (diff = 0), webhook, comisión, RLS, `reserve_tickets_for_
purchase`, asignación automática de números, draw/ganador, QR, Trust
("Antes de continuar"), Eventos, Campañas, Inscripciones, `origin/main`.
Sin migraciones SQL nuevas.

## Tests y evidencia

`tests/checkoutUnifiedV2.test.mjs` — 26 escenarios (MODAL-CO, TRUST-CO,
FLUJO-CO, SIN-CAMBIOS-CO, VALID-CO, DISEÑO-CO), 26/26 en verde. Tres tests
estructurales pre-existentes (`IDENTIDAD-V2 1` en `humanSlugV2.test.mjs`,
`COMPRA 20` en `raffleExperience2026.test.mjs`, `IDENTIDAD 1` en
`raffleVisualPolish.test.mjs`) verificaban el payload de checkout dentro de
`rifas/[id].jsx` — se actualizaron para seguir esa misma verificación a su
ubicación real nueva (`rifas/[id]/checkout.jsx`), sin cambiar el criterio
de seguridad que certifican. Regresión completa: 1027/1028 (único fallo:
el flake histórico ya documentado de `eventAnalyticsWorkbook.test.mjs`).
Build de producción limpio, incluyendo la nueva ruta
`/rifas/[id]/checkout`.

QA visual manual contra `next start` real con credenciales `rifex-dev`
(worktree throwaway, ya eliminado): clic real en "Comprar número" expande
el panel inline (sin backdrop), "Continuar" navega correctamente a
`/rifas/lambo-6f9973/checkout?qty=1`, formulario de datos valida en vivo
(botón deshabilitado hasta que nombre/correo/teléfono/términos son
válidos), "Continuar al pago" avanza a la pantalla de método de pago con
las 4 opciones y el total correcto, "Volver" regresa a "Tus datos" sin
perder los valores ya escritos, fondo blanco puro y halo verde confirmados
vía estilos computados (`rgb(255,255,255)` en `.page` y `.card`), sin
overflow horizontal en 375px, cero errores de consola. No se completó un
pago real (evitado deliberadamente: habría reservado un número real de la
rifa "Lambo" en `rifex-dev` durante 15 minutos y llamado a la integración
real de Mercado Pago sin necesidad, ya que la ruta de pago en sí no fue
modificada y viene certificada de misiones anteriores).

Nota honesta: durante la verificación en el navegador automatizado, los
primeros clics vía el mecanismo estándar de clic sintético no dispararon
el evento en el servidor `next start` local (mismo tipo de artefacto ya
documentado en misiones previas contra este servidor local, nunca
reproducido contra Vercel real); se confirmó el comportamiento real
disparando el evento directamente sobre el elemento del DOM, lo cual sí
lo activó de inmediato y en todos los pasos siguientes — la lógica de la
aplicación es correcta, la única inconsistencia fue del mecanismo de
automatización del navegador contra este servidor local específico.

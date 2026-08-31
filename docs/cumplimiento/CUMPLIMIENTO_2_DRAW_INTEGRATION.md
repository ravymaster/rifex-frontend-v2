# CUMPLIMIENTO-2 — DRAW Integration (2026-08-30)

**Estado: integración real en `rifex-dev`. Ningún motor automático activo. `/cumplimiento` sigue siendo roadmap público — "Próximamente".**

## 1. Objetivo

Conectar el resultado autoritativo de DRAW (`raffle_results`) con la
creación exactly-once del caso de cumplimiento correspondiente
(`raffle_fulfillment_cases`), reutilizando `ensureFulfillmentCaseForRaffle`
de CUMPLIMIENTO-1 sin duplicar su lógica.

## 2. Auditoría previa (no confiar en el reporte anterior)

Releído directamente el código real antes de tocar nada:

- **¿Cuándo existe un ganador autoritativo?** Exactamente cuando existe
  una fila en `raffle_results` — `raffle_id` es su **PRIMARY KEY**, así
  que su sola existencia (no el valor de retorno `isNew`) es la
  autoridad. `isNew:true` solo señala "esta llamada fue la primera en
  observarlo".
- **¿Qué operación puede repetirse?** `drawWinner()` es 100% idempotente
  por diseño — siempre segura de reintentar, devuelve el resultado ya
  persistido si existe. Bajo concurrencia real, solo UNA llamada
  concurrente puede recibir `isNew:true` (la colisión de PK en el
  `INSERT` garantiza esto a nivel de base de datos, nunca solo a nivel
  de aplicación).
- **¿Qué ocurre si DRAW gana pero una operación posterior falla?**
  `raffle_results` ya quedó persistido — nada posterior puede
  revertirlo ni forzar un segundo sorteo.
- **¿Qué ocurre si la notificación falla?** Los emails ya estaban en su
  propio `try/catch` desde antes de esta misión — un fallo de envío
  nunca lanza, solo se loguea.
- **¿Qué ocurre si Cumplimiento falla?** Antes de esta misión: nada
  (no existía la integración). Después: debe quedar igual de aislado
  que los emails — ver sección 3.

## 3. Punto de integración elegido y por qué

`notifyWinnerDrawn(raffleId, winner)`, en `src/lib/drawWinner.js` —
**la misma función ya invocada exactamente una vez por sorteo real**
desde los 3 call sites existentes
(`src/pages/api/raffles/winner.js`, `src/pages/api/rifas/[id]/draw.js`,
`src/pages/api/cron/draw-scheduler.js`), siempre condicionada a
`isNew:true` de `drawWinner()`.

Se agregó al inicio de esta función, **antes** de cualquier lógica de
email, una llamada a `ensureFulfillmentCaseForRaffle(raffleId)` en su
propio `try/catch` — nunca lanza, solo loguea si falla. El bloque de
emails que sigue es exactamente el mismo de antes, sin ningún cambio.

Esto satisface el principio crítico del mandato: **la existencia del
caso NUNCA depende del éxito del email**, y el envío de emails NUNCA
depende del éxito de Cumplimiento — ambos son independientes,
compartiendo solo el mismo guard exactly-once (`isNew:true`) que ya
protegía los emails.

Se descartó triplicar la llamada en los 3 call sites por separado: un
único punto de integración es más DRY, más fácil de auditar, y no
requiere tocar el control de flujo de ninguno de los 3 endpoints —
consistente con "no rediseñar `drawWinner()`... cambiar la semántica de
notificación solo lo mínimo necesario".

## 4. `drawWinner()` — sin cambios de comportamiento

Algoritmo de selección, aleatoriedad, elegibilidad de tickets,
semántica de `raffle_results`, y la protección exactly-once existente
(colisión de PK) **no se tocaron**. El único cambio real en todo el
archivo es la llamada a `ensureFulfillmentCaseForRaffle` al inicio de
`notifyWinnerDrawn` (más dos imports extensionless→con-extensión, un
fix de compatibilidad Node ESM sin efecto de comportamiento, necesario
porque este archivo se importa directamente en tests por primera vez).

## 5. Exactly-once / retry — certificado

- Primera ejecución: `isNew:true`, caso creado, evento `case_created`.
- Retry secuencial (`notifyWinnerDrawn` llamado de nuevo con el mismo
  resultado): `isNew:false`, mismo caso, sin evento duplicado.
- Retry concurrente (`Promise.all` de 3 llamadas simultáneas): exactamente
  un caso creado — la defensa real sigue siendo la colisión de PK real
  de `raffle_fulfillment_cases.raffle_id` (heredada de CUMPLIMIENTO-1),
  nunca un "check then insert" desprotegido.
- Retry de `drawWinner()` en sí (reintento de todo el flujo DRAW):
  sigue devolviendo el mismo `raffle_results`, nunca un segundo sorteo.

Certificado con 17 pruebas nuevas (`tests/drawFulfillmentIntegration.test.mjs`)
usando la lógica REAL de `drawWinner`/`notifyWinnerDrawn`/
`ensureFulfillmentCaseForRaffle` contra un almacén en memoria, **más**
una prueba de integración en vivo contra `rifex-dev` real (sección 8).

## 6. Snapshot — sin cambios respecto a CUMPLIMIENTO-1

Se reutiliza exactamente `ensureFulfillmentCaseForRaffle`, que ya
congela `raffle_title`/`prize_type`/`delivery_method`/
`requires_transfer_procedures`/`transfer_expenses_owner`/
`transfer_conditions`/`winner_ticket_number`/`winner_buyer_email`/
`winner_buyer_name` al momento de creación. Certificado de nuevo en el
contexto real de DRAW: editar la rifa o cambiar los datos de la compra
**después** del sorteo no muta el snapshot ya guardado (pruebas 9 y 10).

## 7. Independencia de la notificación — certificado

- Caso A: DRAW no persiste ganador → nunca se llama
  `notifyWinnerDrawn` (los 3 call sites reales solo lo invocan cuando
  `isNew:true`) → no hay caso.
- Caso B: DRAW persiste ganador, la creación del caso falla
  temporalmente (probado forzando `raffle_not_found` borrando la rifa
  justo antes de notificar) → `raffle_results` permanece exactamente
  igual, nunca se revierte ni se re-sortea (prueba 13).
- Caso C: caso creado, "email falla" (`ENABLE_EMAILS=false` produce el
  mismo camino de skip silencioso que un fallo real ya manejado) → el
  caso permanece intacto (prueba 11).
- Caso D: reintento de notificación → nunca duplica el caso (pruebas 4,
  6, 12).

## 8. Prueba de integración en `rifex-dev` real

Fixture desechable creado directamente vía `service_role` (rifa +
ticket vendido + compra aprobada, emails `@example.com`,
`ENABLE_EMAILS=false` → sin red real): `drawWinner()` →
`notifyWinnerDrawn()` → verificado en vivo: caso creado
(`status=pending_delivery`), evento `case_created` presente, retry
(`drawWinner()` + `notifyWinnerDrawn()` de nuevo) confirmado sin
duplicar ni el caso ni el evento.

**Hallazgo real durante la limpieza del fixture — documentado, no un
bug**: el trigger append-only de `raffle_fulfillment_events`
(certificado en CUMPLIMIENTO-1) rechaza también el `DELETE` en cascada
del caso una vez que tiene al menos un evento asociado, lo cual a su
vez bloquea el `DELETE` de la rifa (por la cascada) y de la compra (por
la FK `winner_purchase_id`). **Esto es el comportamiento correcto y
deseado del append-only** — no se intentó deshabilitar ni sortear el
trigger para forzar la limpieza. Quedó como residuo permanente en
`rifex-dev` exactamente 1 fila en `raffles`/`purchases`/
`raffle_fulfillment_cases`/`raffle_fulfillment_events` (título "CUMPLIMIENTO-2
DEV integration fixture", emails `@example.com`, sin PII real) — las
filas de `tickets` y `raffle_results` sí se limpiaron. Implicación real
para el futuro: **cualquier caso de cumplimiento real, una vez creado,
es igualmente permanente** — no existe (ni debe existir) un mecanismo
de borrado, ni siquiera administrativo, para el propio caso una vez que
tiene historial. Esto es consistente con el propósito del módulo
(evidencia de cumplimiento), pero vale la pena que Rodrigo lo sepa
explícitamente.

## 9. Rifas históricas — sin backfill

Certificado explícitamente (prueba 8): un `raffle_results` preexistente
al que nunca se le llamó `notifyWinnerDrawn` (porque `drawWinner()` lo
encuentra con `isNew:false` — el comportamiento real e inmutable de los
3 call sites) **nunca genera un caso automáticamente**. Cumplimiento
empieza prospectivamente. No se ejecutó backfill masivo de ningún tipo.

## 10. Ganador sin cuenta Rifex

Sin cambios respecto a CUMPLIMIENTO-1 — el snapshot usa
`purchases`/`raffle_results` (comprador invitado), nunca exige ni crea
una cuenta Rifex para el ganador. No se implementó ningún token público
de confirmación — eso permanece en una fase posterior.

## 11. Recovery

`ensureFulfillmentCaseForRaffle(raffleId)` (sin cambios respecto a
CUMPLIMIENTO-1) **es** el mecanismo de recuperación: dado un
`raffle_id` con `raffle_results` ya persistido pero sin caso (por
ejemplo, si `notifyWinnerDrawn` nunca llegó a ejecutarse), llamarlo de
nuevo lo crea de forma segura — certificado con las pruebas 14 y 15
(recovery + recovery repetido idempotente). No se expuso ninguna ruta
HTTP nueva para esto — certificado por ausencia estructural (prueba
16/17: ningún archivo bajo `src/pages/api/` referencia
`ensureFulfillmentCaseForRaffle`), consistente con "no exponer una RPC
peligrosa a anon/authenticated".

## 12. Migración

**Ninguna.** CUMPLIMIENTO-1 ya provee exactamente el schema necesario
— esta misión es integración de código, no de datos.

## 13. Qué NO se implementó (explícito)

Día 10/15/20, cron, scheduler, emails de seguimiento, links de
respuesta del ganador, endpoints de escritura de respuestas
creador/ganador, expediente enviado a Rifex, revisión humana,
reputación/scoring, admin Cumplimiento, UI de panel nueva, cualquier
cambio a PROD.

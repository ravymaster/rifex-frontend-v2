# CUMPLIMIENTO-1 — Foundation (2026-08-30)

**Estado: fundación técnica en `rifex-dev`. Ningún motor automático activo. `/cumplimiento` sigue siendo roadmap público — "Próximamente".**

## 1. Objetivo

Preparar el dominio de datos y la lógica de evaluación de Rifex
Cumplimiento (seguimiento post-rifa de la entrega del premio), sobre el
cual CUMPLIMIENTO-2 pueda crear un caso automáticamente cuando una rifa
finalice con ganador. Explícitamente NO implementado en esta fase: cron,
scheduler, emails automáticos, ciclo temporal Día 10/15/20, reputación,
denuncias, mediación, resolución administrativa, ni ningún cambio a
Trust/Payments/Events/PROD.

## 2. Separación de dominio

**Trust** (`trust_onboarding`, `trust_identity_*`) es identidad/
elegibilidad del creador **antes** de publicar una iniciativa.
**Rifex Cumplimiento** es cumplimiento de la entrega **después** de que
una rifa ya finalizó con ganador. Son capas distintas, con datos y
lógica separados — CUMPLIMIENTO-1 no toca ninguna tabla, columna,
función ni política de Trust.

## 3. Auditoría del dominio Rifas/DRAW existente

Modelo real reconstruido desde el schema y el código (nunca asumido):

- **`raffles`**: `id`, `title`, `creator_id`, `prize_type`,
  `prize_amount_cents`, `delivery_method`, `requires_transfer_procedures`,
  `transfer_expenses_owner`, `transfer_conditions`, `sales_end_at`,
  `draw_at`, `status`, entre otras — el creador y las condiciones
  publicadas del premio.
- **`raffle_results`**: `raffle_id` (**PRIMARY KEY**), `number`,
  `buyer_email`, `buyer_name`, `purchase_id`, `created_at`,
  `trigger_source`, `triggered_by`. Es la referencia autoritativa del
  ganador — creada exactamente una vez por `drawWinner()`
  (`src/lib/drawWinner.js`), que ya usa la colisión de esta PK para
  garantizar exactly-once bajo concurrencia (comentario real en el
  código: "Colisión de PK: otro disparador ya sorteó al mismo tiempo →
  re-lee").
- **`purchases`**: `id`, `buyer_email`, `buyer_name`, etc. Los
  ganadores son **compradores invitados sin cuenta Rifex** — nunca hay
  un `auth.users.id` de ganador. `raffle_results.purchase_id` es la
  referencia autoritativa a la compra ganadora;
  `raffle_results.buyer_email`/`buyer_name` son ya un snapshot al
  momento del sorteo (copiados desde `purchases` dentro de
  `drawWinner()`, nunca leídos por join después).

CUMPLIMIENTO-1 hereda el mismo criterio un nivel más abajo: el caso de
cumplimiento reutiliza `raffle_id` como su propia PRIMARY KEY, exactamente
el mismo patrón que `raffle_results` ya certificó.

## 4. Modelo de caso — `raffle_fulfillment_cases`

`raffle_id uuid primary key references raffles(id)`. Al ser la PK,
**imposible crear dos casos para la misma rifa es una garantía de base
de datos**, no solo de aplicación — un segundo `INSERT` con el mismo
`raffle_id` falla con `23505`, resuelto re-leyendo (ver
`ensureFulfillmentCaseForRaffle`, sección 8).

Columnas: ver `db/migrations/2026-08-30_cumplimiento1_foundation.sql`
para el DDL completo. Resumen funcional:

- Identidad: `raffle_id`, `creator_id`.
- Referencia autoritativa del ganador: `winner_purchase_id`,
  `winner_ticket_number`, `winner_buyer_email`, `winner_buyer_name`.
- Snapshot inmutable de premio/entrega (sección 5).
- Timestamps: `raffle_closed_at`, `winner_determined_at`, `created_at`,
  `updated_at`.
- Estado actual: `status` (sección 6).
- Respuestas actuales: `creator_response`/`creator_response_at`,
  `winner_response`/`winner_response_at` (sección 7).

## 5. Snapshot inmutable

Al crear el caso se congelan: `raffle_title`, `prize_type`,
`prize_amount_cents`, `delivery_method`, `requires_transfer_procedures`,
`transfer_expenses_owner`, `transfer_conditions`. Una edición posterior
de la rifa **nunca** cambia retroactivamente lo que fue prometido a este
ganador — certificado con una prueba real
(`tests/fulfillmentCaseService.test.mjs`, "snapshot inmutable: editar la
rifa DESPUÉS de crear el caso no cambia el snapshot ya guardado").

No se duplica PII innecesaria: `winner_buyer_email`/`winner_buyer_name`
son el único dato personal snapshoteado, y solo porque
`raffle_results` ya los trata igual — nunca se agregó un dato nuevo que
no existiera ya en el flujo de sorteo.

## 6. Estados canónicos

Mismos 6 estados ya publicados en `/cumplimiento` (roadmap,
2026-08-29), ahora con su valor DB exacto:

| Roadmap (público) | DB (`status`) |
|---|---|
| Pendiente de entrega | `pending_delivery` |
| Entrega informada | `creator_reported_delivered` |
| Cumplimiento confirmado | `fulfillment_confirmed` |
| Entrega pendiente | `delivery_pending` |
| En revisión | `under_review` |
| Sin confirmación | `unconfirmed` |

Estado inicial: `pending_delivery` (fijado por
`ensureFulfillmentCaseForRaffle`). Terminal-por-defecto:
`fulfillment_confirmed` (camino feliz) y `unconfirmed` (solo alcanzable
con `afterDeadline:true`, ver sección 8 — nunca ejecutado todavía).
No-terminales/reabribles: `creator_reported_delivered`,
`delivery_pending`, `under_review` — cualquiera de estos puede volver a
evaluarse cuando llega una nueva respuesta (ver "corrección de
respuesta" en la sección 7).

## 7. Respuestas — columnas mutables + log append-only, justificación

`creator_response`/`winner_response` son columnas **mutables** en el
caso (lectura O(1) sin agregar el log en cada consulta), respaldadas
por `raffle_fulfillment_events`, un log **append-only** (mismo patrón
exacto que `trust_identity_audit_log`, TRUST-3A: un trigger rechaza
`UPDATE`/`DELETE` incluso con privilegios elevados). Cada cambio se
registra primero como evento antes de sobreescribir la columna — el
historial nunca se pierde aunque el "estado actual" cambie de nuevo
(ej. un ganador que corrige "todavía no" → "sí" más tarde: ambas
respuestas quedan en el log, certificado en
`tests/fulfillmentCaseService.test.mjs`).

Se descartó derivar el estado actual escaneando el log en cada lectura
(event sourcing puro) porque ningún otro dominio de este repo lo hace
— el patrón establecido en todas partes (Trust, Events, DRAW) es
columna de estado actual + tabla de auditoría separada, no
reconstrucción desde eventos.

Valores: `creator_response` ∈ {`yes`, `coordinating`, `not_yet`},
`winner_response` ∈ {`yes`, `not_yet`}. El ganador nunca "coordina" —
solo confirma o dice que todavía no.

## 8. Reglas de evaluación — `src/lib/fulfillmentEvaluation.js`

Función pura `evaluateFulfillmentStatus({ creatorResponse, winnerResponse, afterDeadline })`,
sin I/O, sin scheduler, **sin `Date.now()` escondido** — `afterDeadline`
es un parámetro explícito que CUMPLIMIENTO-2+ deberá calcular y pasar;
hoy nada la invoca con `afterDeadline:true`.

| creator | winner | resultado |
|---|---|---|
| — | `yes` | `fulfillment_confirmed` (prioridad del ganador) |
| `yes` | `not_yet` | `under_review` (discrepancia real) |
| `yes` | *(sin responder)* | `creator_reported_delivered`, o `unconfirmed` si `afterDeadline` |
| *(ninguno respondió)* | *(ninguno respondió)* | `pending_delivery`, o `unconfirmed` si `afterDeadline` |
| cualquier otra combinación | | `delivery_pending` — **nunca** se degrada a `unconfirmed` por plazo, porque ya hay evidencia explícita, no silencio |

Decisión de diseño explícita (documentada para que Rodrigo pueda
corregirla en CUMPLIMIENTO-2 si no coincide con su intención): el
vencimiento del plazo (`afterDeadline`) solo puede convertir en
`unconfirmed` los dos estados de **silencio puro** — nunca los que ya
tienen una señal explícita de alguna de las partes. Esto es consistente
con el ADDENDUM de esta misión: `WINNER_DENIED_RECEIPT` (respuesta
explícita) y `WINNER_NO_RESPONSE` (silencio) deben distinguirse y
tener peso probatorio distinto en el futuro expediente de
escalamiento — ambos ya calzan naturalmente en `under_review`/
`delivery_pending` (señal explícita) vs. `unconfirmed` (silencio puro)
respectivamente.

14 pruebas puras en `tests/fulfillmentEvaluation.test.mjs` cubren la
matriz completa, transiciones inválidas, y la garantía de función pura
(mismo input → mismo output).

## 9. Modelo de auditoría — `raffle_fulfillment_events`

Append-only, mismo patrón que `trust_identity_audit_log`: `case_id`,
`event_type`, `actor_type` (`creator`|`winner`|`system`|`admin`),
`actor_user_id`, `previous_status`, `new_status`, `metadata jsonb`,
`created_at`. Nunca secrets, nunca PII innecesaria en `metadata`. Un
trigger `raffle_fulfillment_events_immutable()` rechaza cualquier
`UPDATE`/`DELETE` con excepción explícita.

## 10. RLS / autorización

**Default-deny total** — mismo criterio que `trust_onboarding`/
`event_orders`: RLS habilitada, `revoke all` de `public`/`anon`/
`authenticated`, **cero políticas**. Todo acceso pasa por
`service_role` desde rutas API server-side
(`src/pages/api/panel/cumplimiento*.js`), que aplican el filtro de
ownership directamente en la query (`.eq('creator_id', uid)`), mismo
patrón que `api/panel/raffles.js`.

El ganador **no** tiene una política RLS basada en `auth.uid()` en esta
fase — no necesariamente tiene cuenta Rifex, y el mecanismo de acceso
seguro para el ganador (link firmado, token) es explícitamente
CUMPLIMIENTO-2+, fuera de alcance aquí.

**Verificado en vivo contra `rifex-dev` real** (no solo por inspección
de schema): una llamada `GET` con la clave `anon` real a
`/rest/v1/raffle_fulfillment_cases` y `/rest/v1/raffle_fulfillment_events`
devuelve `401` / `42501 permission denied for table` en ambas tablas.

## 11. API

Únicamente 2 endpoints, ambos `GET`, ambos exigen `Authorization:
Bearer <token>` real (mismo patrón que `api/panel/raffles.js`):

- `GET /api/panel/cumplimiento` — lista los casos del creador
  autenticado.
- `GET /api/panel/cumplimiento/[id]` — detalle de un caso, con
  ownership aplicado en la query (`getCreatorCaseDetail`) — un caso
  ajeno responde `404`, nunca revela que existe.

Ningún otro método (`POST`/`PATCH`/etc.) está implementado — `405` en
cualquier otro verbo. Verificado en vivo contra un servidor de desarrollo
local: `401 missing_auth` sin token, `405 method_not_allowed` en `POST`.

## 12. Idempotencia — `ensureFulfillmentCaseForRaffle`

`src/lib/fulfillmentCaseService.js` expone
`ensureFulfillmentCaseForRaffle(raffleId)`: si el caso ya existe, lo
devuelve (`isNew:false`); si no, lo crea a partir de `raffle_results` +
`raffles`. La garantía exactly-once **no** depende de un "check then
insert" desprotegido — depende de la PK real de la tabla: si el
`INSERT` falla con `23505` (colisión), se re-lee y se devuelve el caso
ya creado por el otro llamador. Certificado con una prueba de
`Promise.all` de 5 llamadas concurrentes: exactamente una crea el caso,
las otras 4 lo devuelven sin duplicar (`tests/fulfillmentCaseService.test.mjs`).

## 13. Punto de integración futuro con DRAW (auditado, NO conectado)

`drawWinner()`/`notifyWinnerDrawn()` (`src/lib/drawWinner.js`) **no
fueron modificados** por CUMPLIMIENTO-1. El punto de integración
recomendado para CUMPLIMIENTO-2:

- **Archivo/función**: `notifyWinnerDrawn(raffleId, winner)`, ya
  invocada exactamente una vez por sorteo real desde los 3 call sites
  existentes (`src/pages/api/raffles/winner.js`,
  `src/pages/api/rifas/[id]/draw.js`,
  `src/pages/api/cron/draw-scheduler.js`), siempre condicionada a
  `isNew:true` de `drawWinner()` — el mismo guard "solo una vez por
  sorteo real" que ya usan los emails de ganador.
- **Momento transaccional**: después de que `raffle_results` ya se
  insertó exitosamente (el `isNew:true` de `drawWinner()` lo garantiza)
  — nunca antes, para no crear un caso de cumplimiento sin ganador
  real.
- **Datos disponibles en ese punto**: `raffleId`, `winner` (fila de
  `raffle_results` recién insertada) — suficiente para llamar
  `ensureFulfillmentCaseForRaffle(raffleId)` directamente.
- **Riesgo de retry**: ninguno nuevo — `ensureFulfillmentCaseForRaffle`
  ya es idempotente por diseño (sección 12), así que aunque
  `notifyWinnerDrawn` se reintentara, el caso nunca se duplicaría.

CUMPLIMIENTO-1 **no** llama a esta función desde ningún punto real —
esto es documentación para la siguiente fase, no una integración.

## 14. `/cumplimiento` — estado público

Sin cambios de contenido — la página ya afirmaba correctamente que
nada está activo ("🔧 Funcionalidad en preparación — Próximamente"),
y eso sigue siendo cierto después de CUMPLIMIENTO-1 (fundación técnica
interna, cero superficie pública nueva). No se declaró ni se declarará
que Rifex Cumplimiento es un motor automático operativo.

## 15. Qué NO se implementó (explícito)

Cron, scheduler, emails automáticos, Día 10/15/20, reputación/scoring/
estrellas, denuncias, mediación, resolución administrativa, cambios a
Trust/Payments/Events, cualquier cambio a PROD, cualquier endpoint de
escritura de respuestas (`POST`/link firmado para el ganador), el
expediente de escalamiento interno descrito en el ADDENDUM (solo el
schema/dominio están preparados para soportarlo — ver `metadata jsonb`
en `raffle_fulfillment_events` y la distinción `not_yet`/`NULL` en
`winner_response`, que ya permite diferenciar `WINNER_DENIED_RECEIPT`
de `WINNER_NO_RESPONSE` cuando CUMPLIMIENTO-4/5 lo necesite).

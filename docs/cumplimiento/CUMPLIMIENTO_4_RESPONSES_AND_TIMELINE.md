# CUMPLIMIENTO-4 — Responses + Day 10/15/20 + Internal Escalation (2026-08-30)

**Estado: activo en `rifex-dev`. Ningún cron PROD activado. `/cumplimiento`
sigue siendo roadmap público — "Próximamente". No se envió ningún email
real a usuarios ni a `rifex.contacto@gmail.com`/`contacto@rifex.pro`
durante esta fase.**

## 1. Auto-auditoría previa (antes de codificar)

Se releyó en su totalidad el estado dejado por CUMPLIMIENTO-1/2/3:
`raffle_fulfillment_cases`, `raffle_fulfillment_events` (append-only,
trigger `raffle_fulfillment_events_immutable()`),
`raffle_fulfillment_communications` (ledger `UNIQUE(case_id,
communication_type, recipient_role)`, con los 7 tipos de Día 10/15/20 ya
pre-modelados en el CHECK desde CUMPLIMIENTO-3), el token seguro del
ganador (hash-only), `evaluateFulfillmentStatus` (ya soportaba
`afterDeadline`, nunca usado hasta ahora), y `sendDay0Communications`.
**No se duplicó ninguna tabla** — CUMPLIMIENTO-1/2/3 ya dejaron
estructura suficiente. Solo se agregaron 3 columnas nuevas (`closed_at`,
`escalated_at`, `escalation_reason`) a una tabla que ya era exclusiva de
Cumplimiento.

## 2. Modelo de respuestas

- **Ganador** (`src/lib/fulfillmentEvaluation.js`, sin cambios de
  dominio): `yes` / `not_yet`, vía su token seguro de CUMPLIMIENTO-3, sin
  cuenta Rifex. Copia siempre "Sí, recibí mi premio" / "Todavía no lo
  recibo" — nunca fraude/denuncia/estafa/incumplimiento.
- **Creador**: `yes` / `coordinating` / `not_yet`, vía su sesión
  autenticada + ownership (`getCreatorCaseDetail`) — nunca un token de
  invitado nuevo para él.
- Ambas respuestas pasan por `recordCreatorResponse`/
  `recordWinnerResponse` (`src/lib/fulfillmentCaseService.js`), que:
  1. Detectan **doble submit** (mismo valor ya registrado) y devuelven
     `{noop:true}` sin crear un evento nuevo ni reescribir la fila.
  2. Insertan **siempre primero** un evento append-only en
     `raffle_fulfillment_events` (actor/respuesta/timestamp/status
     anterior/status nuevo/caso), y solo después actualizan la columna
     mutable `creator_response`/`winner_response` en el caso — la
     "última respuesta" es mutable por rendimiento, pero el historial
     completo vive siempre en eventos (justificado en CUMPLIMIENTO-1).

## 3. Máquina de estados (sin cambios de dominio, ahora con llamador real)

`evaluateFulfillmentStatus` ya implementaba exactamente las reglas
obligatorias del mandato — se confirmó por lectura, no se modificó:

| Creador | Ganador | Antes del cierre | Después del cierre (`afterDeadline:true`) |
|---|---|---|---|
| — | `yes` | `fulfillment_confirmed` | `fulfillment_confirmed` |
| `yes` | `yes` | `fulfillment_confirmed` | `fulfillment_confirmed` |
| `yes` | `not_yet` | `under_review` | `under_review` |
| `yes` | *(sin resp.)* | `creator_reported_delivered` | `unconfirmed` |
| `coordinating`/`not_yet` | `not_yet` | `delivery_pending` | `delivery_pending` (evidencia real, nunca se relabelea) |
| *(sin resp.)* | *(sin resp.)* | `pending_delivery` | `unconfirmed` |

`CREATOR YES` sin respuesta del ganador **nunca** se auto-confirma —
requiere `winnerResponse==='yes'` explícito o, tras el plazo, queda
`unconfirmed` (nunca `fulfillment_confirmed`).

CUMPLIMIENTO-4 agregó, en el mismo archivo, la única pieza de dominio
nueva:

```js
export const ESCALATION_REASONS = { WINNER_DENIED_RECEIPT: "winner_denied_receipt", WINNER_NO_RESPONSE: "winner_no_response" };
export function determineEscalationReason({ winnerResponse }) { /* yes->null, not_yet->WINNER_DENIED_RECEIPT, null->WINNER_NO_RESPONSE */ }
```

La distinción probatoria del mandato (sección 10) queda modelada así:
una negativa explícita (`not_yet`) pesa distinto que el silencio total
(`null`) — ambas escalan, nunca se presentan como lo mismo.

## 4. Día 10 (`src/lib/fulfillmentTimeline.js#processDay10`)

Crea (o reintenta) `DAY_10_WINNER`/`DAY_10_CREATOR` vía el mismo patrón
exactly-once-intent de CUMPLIMIENTO-3 (`ensureCommunicationIntent`).
Ganador: email con CTA de respuesta usando su link seguro (si el token
sigue siendo rotable — ver sección 8). Creador: email con link
autenticado a `/panel/cumplimiento/[id]`. Reintentos nunca duplican la
fila lógica, solo suben `attempt_count`.

## 5. Día 15 (`processDay15`)

Recordatorio **exclusivamente** a quien no respondió — el intent ni
siquiera se crea para quien ya contestó. Si ambos ya respondieron, Día
15 no genera absolutamente nada. Certificado en DEV real (ver sección
12) y en 6 escenarios de test dedicados.

## 6. Día 20 — cierre automático (`processDay20`)

Matriz A-F del mandato, implementada como una única llamada:

```js
const newStatus = evaluateFulfillmentStatus({ creatorResponse, winnerResponse, afterDeadline: true });
const escalationReason = determineEscalationReason({ winnerResponse });
```

`winnerResponse==='yes'` → `fulfillment_confirmed`, `escalationReason`
`null`, **sin** expediente interno ni avisos de revisión. Cualquier otro
caso escala. Nunca se interpreta un caso como fraude.

**Idempotencia real (crítica, mandato sección 16):** el `UPDATE` que
cierra el caso usa `.eq('raffle_id', caseId).is('closed_at', null)` como
*compare-and-swap* — si dos invocaciones concurrentes del scheduler
llegan al mismo caso, como mucho **una** gana el `UPDATE`; la otra recibe
`updated === null` y no reenvía nada (evento append-only, expediente
interno, avisos de revisión: todos condicionados a haber sido la llamada
que efectivamente cerró). Certificado con `Promise.all` en tests y
reproducido en DEV real.

## 7. Expediente interno (`buildInternalDossier`)

Incluye: id de rifa/caso, referencia del creador, referencia
autoritativa del ganador, número ganador, snapshot de
premio/entrega/transferencia, timestamp Día 0, respuestas de
ganador/creador, resumen de comunicaciones Día 0/10/15, estado final,
motivo de escalamiento, línea de tiempo resumida. **Nunca** incluye
tokens, hashes, secrets, credenciales de Mercado Pago ni datos de otros
compradores — certificado por test dedicado (`grep` sobre el JSON
serializado del expediente).

Se envía vía `sendFulfillmentInternalEscalationEmail` (`mailer.js`),
asunto `"Rifex Cumplimiento — Caso para revisión interna (<id>)"`, sin
lenguaje de fraude/estafa/culpabilidad en ningún template (certificado
por test que audita el código fuente real de `mailer.js`).

**Recipients**: `RIFEX_COMPLIANCE_REVIEW_EMAILS` (env var,
coma-separada) — **nunca hardcodeado en el dominio**. Si la variable no
está configurada, el intent del expediente se crea igual (garantiza
idempotencia futura) pero queda `status='failed'` con
`last_error_safe='RIFEX_COMPLIANCE_REVIEW_EMAILS not configured'` — el
cierre del caso **nunca** depende de que el envío interno tenga éxito.

## 8. Avisos de revisión (`sendReviewNotices`)

Al ganador y al creador, cuando el caso escala. Copia exacta del
mandato: *"El caso terminó su etapa automática y será revisado
internamente por Rifex. Revisaremos los antecedentes registrados durante
el proceso."* Nunca afirma fraude, estafa, culpabilidad, incumplimiento
deliberado, ni compensación garantizada.

## 9. Estabilidad del token del ganador (mandato sección 17)

`ensureWinnerAccessToken` (`fulfillmentCommunications.js`) se
generalizó: mientras **ningún** envío al ganador (Día 0, 10 o 15) haya
sido confirmado `sent`, cada intento sin confirmar puede rotar el token
(mismo comportamiento de reintento ya certificado en CUMPLIMIENTO-3). En
cuanto **cualquier** envío al ganador queda confirmado, el token se
congela para el resto del ciclo de vida del caso — Día 10/15 reutilizan
el mismo hash, `raw` vuelve `null`, y el email correspondiente se envía
sin un link nuevo embebido (el crudo nunca se recupera desde el hash,
por diseño — el ganador sigue teniendo el link ya entregado en un correo
anterior). **Trade-off documentado explícitamente**: dado el
almacenamiento hash-only, una vez el token queda "congelado" ningún
email posterior puede volver a embeber el mismo secreto crudo — se
prefirió esta garantía de estabilidad/no-invalidación sobre incluir
siempre un link fresco. Certificado con test unitario (token fabricado
como `sent`) y con QA real en DEV (donde el token previo de
CUMPLIMIENTO-3 nunca había llegado a `sent`, así que sí rotó — comportamiento
correcto y esperado, no una falla).

## 10. UI activada

- **Ganador** (`/cumplimiento/caso/[token].jsx`): dos botones ("Sí, recibí
  mi premio" / "Todavía no lo recibo"), `POST` al mismo endpoint
  tokenizado, guarda de doble submit (`submitting` + comparación con la
  respuesta ya registrada), confirmación clara post-envío. Nunca muestra
  metadata interna ni correos de revisión.
- **Creador** (`/panel/cumplimiento/index.jsx` + `/panel/cumplimiento/[id].jsx`,
  nuevos): lista mínima + detalle con tres botones ("Sí, ya entregué el
  premio" / "Estamos coordinando la entrega" / "Todavía no lo entrego").
  Sin mega-dashboard — reutiliza los endpoints y el patrón de auth ya
  existentes.

## 11. Respuestas fuera de ventana (mandato sección 20)

- **Antes de Día 10**: se acepta con normalidad si el actor llega
  legítimamente al caso (sin forzar).
- **Día 10-20**: respuesta normal, recalcula estado.
- **Después del cierre de Día 20** (`closed_at` no nulo): la respuesta
  **se registra** (evento `winner_late_response_recorded` /
  `creator_late_response_recorded`, y la columna "última respuesta" se
  actualiza para visibilidad en revisión interna), pero **`status`,
  `closed_at`, `escalated_at` y `escalation_reason` quedan congelados
  tal como los dejó el cierre automático** — nunca se reescribe
  silenciosamente el resultado. Certificado con test unitario y con QA
  real en DEV (paso 6 del script de QA temporal).

## 12. Scheduler (`processFulfillmentTimeline(now)`)

Único punto de entrada, `now` **siempre explícito** (nunca
`Date.now()` interno). Recorre `getOpenFulfillmentCases()`
(`closed_at is null`), y por cada caso aplica Día 10 → Día 15 → Día 20
en la misma pasada cuando el `now` recibido ya superó cada umbral — así
un scheduler "atrasado" (caído varios días) procesa todo lo vencido sin
duplicar nada, porque cada etapa es independientemente idempotente vía
el ledger + la guarda `closed_at`. No depende de ningún estado en
memoria entre llamadas ni de un único proceso — cualquier invocación,
desde cualquier proceso, en cualquier momento, converge al mismo
resultado.

`src/pages/api/cron/fulfillment-scheduler.js` — mismo patrón exacto que
`draw-scheduler.js` (DRAW-2): `CRON_SECRET` vía `Authorization: Bearer`,
igualdad exacta, GET/POST únicamente, `now = new Date()` calculado una
sola vez adentro del handler (único lugar permitido para leer el reloj).
**No activado en Vercel Cron ni GitHub Actions PROD por esta misión.**

## 13. Migración

`db/migrations/2026-08-30_cumplimiento4_timeline_and_escalation.sql` —
puramente aditiva: `closed_at`/`escalated_at`/`escalation_reason` en
`raffle_fulfillment_cases` + índice parcial `where closed_at is null`.
`closed_at IS NOT NULL` es la única señal confiable de "el cierre de Día
20 ya corrió" — `status` por sí solo no sirve de guarda porque un caso
puede llegar a un status similar por evaluación normal antes del cierre
formal. Aplicada **solo** a `rifex-dev`, verificada en vivo (columnas
presentes, RLS default-deny intacto — PostgREST ni siquiera expone la
tabla a `anon`, mismo comportamiento que desde CUMPLIMIENTO-1).

## 14. QA temporal en DEV real (sin esperar 20 días, sin tocar el reloj)

Reutilizó el único caso existente en `rifex-dev` (fixture residual de
CUMPLIMIENTO-2/3, `raffle_id 0656b707-321f-451c-ab34-e8d4b2483936`,
emails `@example.com`) en vez de crear un segundo fixture permanente —
el trigger append-only certificado en CUMPLIMIENTO-2 ya deja cualquier
caso con eventos imposible de borrar, así que un segundo fixture
quedaría igual de permanente. Se invocó `processFulfillmentTimeline`
con `now` explícito calculado como `winner_determined_at + {10,15,20}
días` (nunca `Date.now()`, nunca se alteró el reloj del sistema). Las 6
verificaciones (Día 10, reintento idempotente, Día 15 con
recordatorios reales, Día 20 con cierre+escalamiento+expediente+avisos
exactamente una vez, reintento de Día 20 100% seguro, respuesta tardía
sin reescritura) pasaron contra la base real. **Cero emails reales
salieron**: `ENABLE_EMAILS=true` pero sin `RESEND_API_KEY` (eliminada
antes de cualquier import) → cada intento de envío falló
determinísticamente (`RESEND_API_KEY missing`), sin red real — mismo
patrón que la suite de tests. Las credenciales de `rifex-dev` se
obtuvieron en caliente vía `supabase projects api-keys` (la misma sesión
CLI que usa `scripts/dev-supabase.sh`), nunca se escribieron a disco.

## 15. Regresión y build

296 tests corridos (Cumplimiento 1-4 + DRAW + Trust + Events): 295
pasan, 1 falla — el mismo flaky de timing en XLSX ya documentado en
fases anteriores (no relacionado a Cumplimiento, no bloqueante).
`npm run build` completó sin errores.

## 16. Explícitamente NO implementado en esta fase

Reputación pública, puntajes/estrellas, sanciones automáticas, bloqueo
automático de creadores, resolución legal, mediación, panel admin
completo, activación en PROD, cron real en producción, envío de
expedientes/avisos a las direcciones reales de staff.

## 17. Pendiente para fases futuras

- Activar el cron (`Vercel Cron` o GitHub Actions) apuntando a
  `/api/cron/fulfillment-scheduler` — solo cuando se autorice promoción
  a PROD.
- Panel administrativo para que Rifex revise casos escalados
  (`escalation_reason`, expediente) — hoy solo llega por email interno.
- Definir qué pasa después de la revisión interna (fuera de alcance:
  resolución/mediación/sanciones).

# Rifex WOP

WOP defines the working operating protocol for Rifex. Its purpose is to keep the repository as the source of truth and prevent future work from assuming a state that has not been evidenced.

---

## CUMPLIMIENTO-5 (2026-08-30) — mesa de revisión administrativa dentro de /admin (DEV only)

Baseline reconfirmado: `origin/main = e7311c1`, `origin/develop` incluía
`bee778f`/`ad0b792`/`8cd116b`/`f904c95` (C1-C4). Nueva rama
`cumplimiento-5` desde `origin/develop`.

Autoauditoría previa confirmó que Rifex ya tiene un `/admin` real,
protegido por `src/lib/adminAuth.js#resolveAdmin` (Bearer token +
`auth.getUser()` + `app_metadata.role==='admin'`) — **ese mismo
mecanismo se reutilizó sin cambios**; no se creó ningún panel admin
nuevo, ni segundo login, ni segunda autoridad. La sección "Cumplimiento"
se agregó directamente a `/admin` (resumen con 4 KPIs + enlace) y la
gestión detallada vive en la subruta `/admin/cumplimiento` +
`/admin/cumplimiento/[id]` — dentro del mismo panel, no un sistema
separado.

Otro hallazgo clave de la autoauditoría: `raffle_fulfillment_events`
(C1) ya tenía `actor_type` con `'admin'` permitido en su CHECK desde el
día uno, y `event_type` es texto libre. Iniciar revisión, agregar una
nota interna, y resolver una revisión se implementaron como nuevos
`event_type` sobre esa MISMA tabla append-only — **no se creó ninguna
tabla nueva de notas/revisión**. Solo se agregaron 3 columnas nullable
(`admin_review_status`, `admin_reviewed_by`, `admin_reviewed_at`) a
`raffle_fulfillment_cases` como resumen mutable de lectura rápida
(mismo patrón exacto que `creator_response`/`winner_response` desde
CUMPLIMIENTO-1).

La resolución administrativa es una capa estrictamente posterior:
`resolveAdminReview` nunca toca `winner_response`, `creator_response`,
`closed_at`, `escalation_reason` ni ningún evento histórico — solo
agrega un evento nuevo y actualiza el resumen de revisión. Estados de
revisión: `null` (pendiente), `in_review`, `resolved`,
`closed_without_determination` — deliberadamente sin `fraud`/`guilty`/
`criminal`; el sistema nunca determina delitos.

Se corrigió voseo argentino remanente en las superficies de
Cumplimiento tocadas por C3/C4 (`tenés`→`tienes`, `podés`→`puedes`,
`Contanos`→`Cuéntanos`, `Coordiná`→`Coordina`, `Respondé`→`Responde`,
`vos`→`tú`, etc.) en `mailer.js` y las páginas de
`/cumplimiento`/`/panel/cumplimiento`.

29 tests nuevos (`tests/adminFulfillmentReview.test.mjs`, cubren los 40
escenarios requeridos), certificados también en vivo contra
`rifex-dev` reutilizando el fixture residual de C2/C3/C4 (ya escalado
por la propia QA de C4): listado+resumen, expediente sin exponer el
token del ganador, iniciar revisión, agregar nota, resolver, reintento
idempotente, y verificación explícita de que nada automático se alteró.
325 tests totales en la suite completa (324 pasan, 1 flaky de timing
XLSX ya documentado, no relacionado). Ver
`docs/cumplimiento/CUMPLIMIENTO_5_ADMIN_REVIEW.md` para el detalle
completo, incluida la limitación conocida: no se hizo un click-through
en navegador real de las nuevas páginas `/admin/cumplimiento*` (solo
QA a nivel de librería + forma de API contra datos reales de DEV) —
recomendado antes de un uso más amplio.

Próximo paso: ningún trabajo adicional autorizado sin nueva instrucción
de Rodrigo (explícitamente NO se comienza CUMPLIMIENTO-6).

---

## CUMPLIMIENTO-4 (2026-08-30) — respuestas + Día 10/15/20 + escalamiento interno (DEV only)

Baseline reconfirmado: `origin/main = e7311c1`, `origin/develop` incluía
`bee778f` (C1), `ad0b792` (C2), `8cd116b` (C3). Nueva rama
`cumplimiento-4` desde `origin/develop`. No se duplicó ninguna tabla —
C1/C2/C3 ya dejaban estructura suficiente; solo se agregaron 3 columnas
(`closed_at`, `escalated_at`, `escalation_reason`) a
`raffle_fulfillment_cases`.

Activó las respuestas del ganador (token seguro, sin cuenta) y del
creador (sesión + ownership), extendió `evaluateFulfillmentStatus` con
`determineEscalationReason` (distingue `winner_denied_receipt` de
`winner_no_response`), y construyó `processFulfillmentTimeline(now)`
(`src/lib/fulfillmentTimeline.js`) — orquestador puro en su lógica
temporal (nunca lee el reloj, siempre recibe `now` explícito) que aplica
Día 10 (pregunta), Día 15 (recordatorio solo a quien no respondió) y
Día 20 (cierre automático + escalamiento interno + avisos de revisión),
todo idempotente vía el ledger de comunicaciones de C3 + la guarda
`closed_at is null`. Nuevo endpoint cron
`src/pages/api/cron/fulfillment-scheduler.js` (mismo patrón
`CRON_SECRET` que `draw-scheduler.js`) — **no activado en PROD**. UI
mínima activada en `/cumplimiento/caso/[token].jsx` (respuestas del
ganador) y nuevas `/panel/cumplimiento/{index,[id]}.jsx` (respuestas del
creador). `/cumplimiento` público sigue "Próximamente".

QA temporal certificada contra `rifex-dev` real (`processFulfillmentTimeline`
con `now` explícito = `winner_determined_at + {10,15,20} días`, nunca
esperas reales, nunca se tocó el reloj) reutilizando el fixture residual
de C2/C3 en vez de crear uno nuevo permanente. 41 tests nuevos
(`tests/fulfillmentTimeline.test.mjs`, cubren los 35 escenarios
requeridos + adversariales), 296 tests totales en la suite completa
(295 pasan, 1 flaky de timing XLSX ya documentado, no relacionado). Ver
`docs/cumplimiento/CUMPLIMIENTO_4_RESPONSES_AND_TIMELINE.md` para el
detalle completo.

---

## CUMPLIMIENTO-3 (2026-08-30) — comunicaciones Día 0 + acceso seguro del ganador (DEV only)

Baseline reconfirmado: `origin/main = e7311c1`, `origin/develop` incluía
`bee778f` (CUMPLIMIENTO-1) y `ad0b792` (CUMPLIMIENTO-2). Nueva rama
`cumplimiento-3` desde `origin/develop`.

Auditado el flujo real de emails antes de codificar:
`notifyWinnerDrawn` ya mandaba `sendWinnerEmail`/`sendCreatorWinnerEmail`
sin información de premio/entrega/transferencia ni link de acceso. Se
**enriquecieron esos mismos dos correos** (nunca se creó un tercero) —
ahora incluyen la modalidad de entrega, gastos/condiciones de
transferencia (del snapshot congelado del caso, nunca de la rifa
actual), y, para el ganador, un link seguro a su caso.

`notifyWinnerDrawn` ahora delega a `sendDay0Communications`
(`src/lib/fulfillmentCommunications.js`) después de asegurar el caso
(CUMPLIMIENTO-2, sin cambios) — con fallback a los correos planos sin
enriquecer si el caso no se pudo asegurar, para que Cumplimiento nunca
reduzca la confiabilidad de la notificación ya existente. `drawWinner()`
no se tocó.

Migración aditiva
`db/migrations/2026-08-30_cumplimiento3_communications_and_winner_access.sql`:
`raffle_fulfillment_communications` (ledger idempotente,
`UNIQUE(case_id, communication_type, recipient_role)` como autoridad
real de intención exactly-once — un reintento siempre actualiza la
misma fila, nunca inserta una segunda) + `winner_access_token_hash`/
`winner_access_token_created_at` en `raffle_fulfillment_cases`. RLS
default-deny total en el ledger — verificado en vivo contra `rifex-dev`
real (`401`/`42501`).

Token del ganador: `crypto.randomBytes(32)` (256 bits), **nunca
persistido en texto plano** — solo su SHA-256 se guarda. Se auditó el
patrón existente de `event_orders.access_token` (texto plano) y se
decidió deliberadamente no copiarlo, por instrucción explícita del
mandato. El token nunca expira por tiempo y solo rota mientras el envío
al ganador no esté confirmado (`status='sent'`) — una vez confirmado,
queda estable para todo el ciclo de vida futuro del caso.

Nueva ruta pública `GET /api/cumplimiento/caso/[token]` (rate-limited,
mismo patrón que `/api/events/orders/[token]`) + página
`/cumplimiento/caso/[token]` — solo lectura, sin acciones de respuesta
todavía, expone estrictamente lo necesario (nunca PII de terceros, ni
el propio token). El creador sigue usando su sesión Rifex autenticada
— sin token guest nuevo para él.

44 pruebas nuevas (evaluación de comunicaciones + token + exposición de
datos) + QA en vivo contra `rifex-dev` reutilizando el caso residual ya
documentado de CUMPLIMIENTO-2 (sin fixture nuevo, sin emails reales) +
regresión completa: 255 tests totales, 254 pass, 1 flaky ya documentado
(mismo timing XLSX de EVENT-3) — cero fallos funcionales nuevos.
`npm run build` PASS. PROD, `main` y `/cumplimiento` (que sigue diciendo
"Próximamente") sin tocar. Detalle completo en
`docs/cumplimiento/CUMPLIMIENTO_3_COMMUNICATIONS.md`.
**CUMPLIMIENTO-4 (respuestas creador/ganador) remains NOT AUTHORIZED.**

---

## CUMPLIMIENTO-2 (2026-08-30) — integración DRAW → fulfillment case (DEV only)

Baseline reconfirmado: `origin/main = e7311c1`, `origin/develop` incluía
`bee778f` (CUMPLIMIENTO-1). Nueva rama `cumplimiento-2` desde
`origin/develop`.

Conecta el resultado autoritativo de DRAW (`raffle_results`, PK
`raffle_id`) con `ensureFulfillmentCaseForRaffle` de CUMPLIMIENTO-1: se
agregó una llamada a esa función al inicio de
`notifyWinnerDrawn(raffleId, winner)` en `src/lib/drawWinner.js`, en su
propio `try/catch` — nunca depende del éxito del email ni bloquea su
envío, y viceversa. `notifyWinnerDrawn` ya se invocaba exactamente una
vez por sorteo real (guardado por `isNew:true` de `drawWinner()`) desde
los 3 call sites existentes — ningún call site fue tocado, ningún
cambio al algoritmo de sorteo, elegibilidad de tickets, ni la
protección exactly-once ya certificada de `raffle_results`.

17 pruebas nuevas (`tests/drawFulfillmentIntegration.test.mjs`) contra
un almacén en memoria con la lógica REAL de `drawWinner`/
`notifyWinnerDrawn`/`ensureFulfillmentCaseForRaffle` cubren los 18
escenarios requeridos: exactly-once bajo retry secuencial y
concurrente, snapshot inmutable ante ediciones posteriores de la rifa y
la compra, ausencia total de backfill para resultados históricos,
independencia caso↔notificación en ambos sentidos, recovery idempotente,
y ausencia estructural de cualquier endpoint público que exponga la
recuperación. Además, una prueba de integración real contra
`rifex-dev` (fixture desechable, `ENABLE_EMAILS=false`) confirmó el
flujo completo en vivo.

**Hallazgo real durante la limpieza del fixture de la prueba en vivo**:
el trigger append-only de `raffle_fulfillment_events` (CUMPLIMIENTO-1)
bloquea correctamente el `DELETE` en cascada del caso una vez que tiene
al menos un evento — lo cual es el comportamiento deseado, no un bug.
No se intentó deshabilitar el trigger para forzar la limpieza. Quedó un
residuo permanente en `rifex-dev` (1 fila en `raffles`/`purchases`/
`raffle_fulfillment_cases`/`raffle_fulfillment_events`, sin PII real,
título "CUMPLIMIENTO-2 DEV integration fixture") — implicación real:
todo caso de cumplimiento, una vez creado, es permanente por diseño.
Detalle completo, incluyendo el análisis previo de `drawWinner()`, en
`docs/cumplimiento/CUMPLIMIENTO_2_DRAW_INTEGRATION.md`.

Regresión completa: 235 tests totales, 234 pass, 1 flaky ya documentado
(mismo timing XLSX de EVENT-3) — cero fallos funcionales nuevos.
`npm run build` PASS. Sin migración nueva — CUMPLIMIENTO-1 ya proveía
el schema necesario. PROD, `main` y `/cumplimiento` (que sigue diciendo
"Próximamente") sin tocar. **CUMPLIMIENTO-3 (respuestas creador/ganador)
remains NOT AUTHORIZED.**

---

## CUMPLIMIENTO-1 (2026-08-30) — fundación técnica de Rifex Cumplimiento (DEV only)

Baseline reconfirmado antes de trabajar: `origin/main = e7311c1` (tag
`v2.1-rifex-full-prod`), sin drift. Nueva rama `cumplimiento-1` desde
`origin/develop` (`8cd0cf9`).

Migración aditiva `db/migrations/2026-08-30_cumplimiento1_foundation.sql`
crea `raffle_fulfillment_cases` (`raffle_id` como PRIMARY KEY —
imposible duplicar caso por rifa a nivel de base de datos, mismo patrón
que `raffle_results`) y `raffle_fulfillment_events` (log append-only,
mismo patrón exacto que `trust_identity_audit_log` de TRUST-3A: trigger
rechaza UPDATE/DELETE). RLS default-deny total en ambas — cero
políticas, todo acceso vía `service_role` + ownership filtrado en la
query de la API (mismo criterio que `trust_onboarding`/`event_orders`).
Verificado en vivo contra `rifex-dev` real: la clave `anon` recibe
`401`/`42501 permission denied` en ambas tablas.

Dominio puro `src/lib/fulfillmentEvaluation.js`
(`evaluateFulfillmentStatus`) codifica los 6 estados ya publicados en
`/cumplimiento` desde RIFEX CLOSURE PASS — sin scheduler, sin
`Date.now()` escondido, `afterDeadline` como parámetro explícito que
nadie invoca todavía. `src/lib/fulfillmentCaseService.js` expone
`ensureFulfillmentCaseForRaffle` (idempotente por colisión de PK real,
certificado con 5 llamadas concurrentes vía `Promise.all` → exactamente
un caso creado), `recordCreatorResponse`/`recordWinnerResponse` (cada
respuesta se audita antes de sobreescribir el estado actual) y
`getCreatorCases`/`getCreatorCaseDetail` (ownership aplicado en la
query). 2 endpoints mínimos, ambos GET, ambos exigen Bearer token real:
`GET /api/panel/cumplimiento` y `GET /api/panel/cumplimiento/[id]`.

`drawWinner()`/`notifyWinnerDrawn()` **no fueron modificados** — el
punto de integración para que CUMPLIMIENTO-2 cree el caso
automáticamente al determinar un ganador quedó auditado y documentado
(nunca conectado) en
`docs/cumplimiento/CUMPLIMIENTO_1_FOUNDATION.md`, sección 13.

27 pruebas nuevas (14 evaluación pura + 13 servicio con mock en
memoria, mismo patrón de `tests/trust3bE2EFlow.test.mjs`) + regresión
completa: 218 tests totales, 217 pass, 1 flaky ya documentado (mismo
timing XLSX de EVENT-3) — cero fallos funcionales nuevos. `npm run
build` PASS. Migración aplicada solo a `rifex-dev` — PROD, main y
`/cumplimiento` (que sigue diciendo "Próximamente") sin tocar. Detalle
completo en `docs/cumplimiento/CUMPLIMIENTO_1_FOUNDATION.md`.
**CUMPLIMIENTO-2 (cron/scheduler/emails/ciclo temporal) remains NOT AUTHORIZED.**

---

## RIFEX CLOSURE PASS (2026-08-30) — physical prize transparency + Crear Rifa refresh + Rifex Cumplimiento roadmap (DEV only)

Product closure pass before the next PROD release. Removed the "Temática" selector from Crear Rifa — audited and confirmed it never controlled the ticket-number icon set (`useIconsMap.js` uses a fixed global order, independent of `theme`) and had no other functional effect; new raffles are created with `theme='mixto'` fixed, historical raffles/badges untouched, no data migration. "A convenir" is no longer offered as a delivery option for **new** raffles (only Retiro/Envío pagado por el creador/Envío pagado por el ganador) — historical raffles with `delivery_method='a_convenir'` keep working unchanged.

New transparency contract for physical prizes that require transfer/procedures (e.g. vehicles, property): additive migration (`db/migrations/2026-08-29_physical_prize_transfer_transparency.sql`) adds `requires_transfer_procedures boolean default false`, `transfer_expenses_owner text` (constrained to `creator|winner`), `transfer_conditions text` to `raffles`, applied to `rifex-dev` only. The same migration redefines `create_raffle_with_declarations` (the atomic creation RPC) to include the 3 new columns — its INSERT uses an explicit column list, so without this redefine the new fields would have been silently dropped on every creation. Server-side validation in `POST /api/rifas` and `PATCH /api/rifas/[id]` is fail-closed: money raffles force all delivery/transfer fields to null/false regardless of payload; physical-without-transfer forces owner/conditions to null; physical-with-transfer requires a valid owner and non-empty trimmed conditions. `delivery_method` and the 3 transfer fields are frozen (409 `fields_locked_after_first_sale`) once `tickets.status='sold'` exists for the raffle — same authoritative indicator DRAW-1 already used for `prize_type`/`prize_amount_cents`, extended without redesign.

Public `/rifas/[id]` now shows a single "Información del premio" block (amber when the winner bears a cost, green when the creator includes it, neutral otherwise) before purchase, plus a compact cost-disclosure line in the BuyerForm summary immediately before payment. Términos del Creador gained a paragraph on transfer/delivery disclosure obligations — the "PENDIENTE DE REVISIÓN POR ABOGADO CHILENO ANTES DE PROD" banner is untouched. Footer gained a "Rifex Cumplimiento" link. New public page `/cumplimiento` documents the post-raffle compliance-tracking roadmap (flow, emails, day 0/10/15/20 timeline, decision rules, conceptual states) — explicitly marked "Próximamente/En preparación"; **no scheduler, no real emails, no new storage implemented** — it's documentation, not a backend.

Certified end-to-end against real `rifex-dev`: full creation matrix (money, physical × 3 delivery modes, with/without transfer for both expense owners), adversarial payloads rejected, post-sale freeze confirmed, footer link verified. Commit `a47fc40` (pushed to `origin/develop`). Trust untouched. PROD untouched.

Known limitation this session: could not interactively click-verify the Crear Rifa radio controls nor load `/rifas/[id]` via the browser automation tool (a pre-existing `router.isReady` gate — code not touched by this pass — never resolved for hard-navigated dynamic routes in this specific tool combination; static routes loaded fine). Verified instead via full build success, code review, and exhaustive live API-level testing against real `rifex-dev` data.

## RIFEX TRUST-3B (2026-08-29) — RUT↔Mercado Pago match certified end-to-end (DEV only)

Audited what TRUST-3B already had implemented (`extractMpRutFromUsersMe`, `resolveMpIdentityMatch`, `evaluateMpIdentityMatch`, `assertCreatorEligible` — all pre-existing, none redesigned) and found one real gap: RUT extraction from `/users/me` never checked `identification.type`, only that the number passed Chile's modulo-11 check digit — an identification of another document type whose number happened to match that algorithm would still have been extracted and could produce a false match. Fixed in commit `20b4362` (pushed to `origin/develop`): if `identification.type` is present and isn't `"RUT"`, extraction now returns `null` (never `matched`); if `type` is absent (legacy/unknown shape), original defensive behavior is preserved. Confirmed live against real `rifex-dev`: `identification.type="CPF"` with a number identical to the declared RUT correctly resolves to `unavailable`, not `matched`.

Certified the full flow end-to-end both with a new test suite (`tests/trust3bE2EFlow.test.mjs` — real functions from both modules against a shared in-memory store, not per-function mocks) and live against `rifex-dev`: a disposable QA user completed onboarding, declared a synthetic test RUT, and reproduced the exact `oauth/callback.js` sequence (connect first, resolve match second). Verified: the OAuth race window (connected, match not yet resolved) blocked `POST /api/rifas` with `mp_check_pending`; MATCH allowed it and a real raffle was created; MISMATCH and all CASO 3 variants (no identification, wrong type, malformed response) blocked with the correct reasons. No Mercado Pago RUT was ever persisted — only the comparison result. 119/119 tests pass (113 pre-existing + 6 new), build clean. Trust remains DEV ONLY — nothing was promoted to PROD.

## RIFEX COUNTRY GATE (2026-08-29) — Argentina disabled

The country-selection modal (`onboarding/pais.jsx`) showed Argentina as selectable in DEV because `countryPolicy.js`'s `AR` entry had `devOnly: true`, and `isCountryActive()` activates any `devOnly` country whenever `NEXT_PUBLIC_STAGE=development`. Fixed in commit `f7398b2` (pushed to `origin/develop`) by flipping `AR.devOnly` to `false` — a single-flag change, not a reversal of AR1/AR2 infrastructure. Chile unaffected (`enabled: true`, untouched). Since `evaluateCountryGate`/`isCountryActive` are the single shared source of truth behind the modal, `POST /api/onboarding/country`, and all 5 country-gated points (rifas, colectas, events, MP OAuth start, checkout), this one change closes the UI *and* the `country_code=AR` bypass simultaneously — confirmed via code trace, not just the modal. 10/10 tests pass, build clean. Argentina remains **fuera de operación** — this is not a reactivation of the international payments work.

## RIFEX TRUST REENTRY (2026-08-29) — fail-open fix

`origin/main` (PROD) is now at `3f3d6c4` — EVENTS V1 was promoted to PROD, cherry-picked from `develop` before Trust existed, so Trust remains **DEV ONLY / NOT CERTIFIED PROD** by construction. On `develop`, `assertCreatorEligible` (`src/lib/trustIdentityGate.js`) had a real fail-open: it used a blocklist that only rejected `mismatch`/`needs_review`/`checking`/`not_connected`, so `mp_identity_match = NULL` or `'unavailable'` fell through and authorized the caller. NULL is reachable live — `oauth/callback.js` sets `merchant_gateways.status='connected'` before `resolveMpIdentityMatch` resolves the match in a separate try/caught write. Fixed in commit `2d86d3c` (pushed to `origin/develop`): the gate now only authorizes `mp_identity_match === 'matched'`, everything else blocks. 45/45 tests pass, full build clean. A live, read-only investigation of what Mercado Pago Chile's `/users/me` actually returns for RUT (needed to know whether `'matched'` is realistically reachable at all) follows in the same session — see the report delivered to Rodrigo/Doris for the outcome, not duplicated here.

## RIFEX CURRENT STATE (2026-08-24 — Santiago → Antofagasta notebook handoff)

**Everything below this line, down to "END CURRENT STATE", supersedes the legacy Alignment/Architecture-Audit/Sprint-R4 narrative further down in this file for anything about current branch state, HEAD, or Events work.** That older material (HEAD `1aa97cd`, Sprint R4, DB Recovery incident) is preserved unedited below as historical record — it predates everything described here and is no longer the frontier of the project. Do not resume work from the old section without first reading this one.

### Git baseline (confirmed via `git fetch` + `git log` + `git status`, this session)

| Item | Value |
|---|---|
| `origin/develop` HEAD | `725c4f8` — `feat(events): add tickets and QR fulfillment` |
| `origin/main` HEAD | `c944bb3` — `docs(release): certify Rifex 2.0 production baseline` |
| Local branch | `develop`, matches `origin/develop` exactly |
| Working tree | clean (one stray untracked `supabase/` ephemeral dir from migration tooling was removed; nothing else) |
| Remote | `origin` → `https://github.com/ravymaster/rifex-frontend-v2.git` |

### PROD (`rifex.pro`, Vercel project `rifex-frontend-v2`, Supabase `wrdkdfuiwlujfxxijpao`)

`main` at `c944bb3` — **Rifex 2.0 certified baseline**: raffles + colectas + DRAW-1/1B/2 automatic draw scheduler + PRE-LAUNCH-FIX-1/2 security hardening (atomic ticket reservation, `approved_unfulfilled` late-payment handling, rate limiting, RLS on `rate_limit_hits`/`legal_declarations`). **Events/Eventos has NOT been promoted to PROD in any form** — no `events`/`event_ticket_types`/`event_orders`/`event_order_items`/`event_tickets` tables, no Events code, exist on `main` or in PROD Supabase. PROD Supabase migration history: 6 migrations, most recent `20260823100000` (PRE-LAUNCH-FIX-2 hardening). PROD was **not touched** by any EVENT-1/2/3 session — confirmed read-only after every phase.

### DEV (Supabase project `rifex-dev` / `nwxrvwbzqbhznscyirbq`, Vercel project `rifex-frontend-main` → `rifex-frontend-main.vercel.app`)

`develop` at `725c4f8` — everything PROD has, **plus** the full Events V1 stack through ticket issuance:

| Stage | Status | Delivered |
|---|---|---|
| EVENT-0 | Architecture approved (discovery only, no code) | Domain model, lifecycle, QR design decision, staff model, 6-phase plan |
| EVENT-1 | **DONE** | Foundation — create/publish event, ticket types, public pages, `/mis-iniciativas`, `/panel/eventos` |
| EVENT-2 | **DONE** | Checkout + Orders + Mercado Pago — atomic reservation, TTL, webhook, reconciliation, `approved_unfulfilled`, guest access token, 7% commission via `platformFee.js` |
| EVENT-3 | **DONE** | Tickets + QR — exactly-once issuance, per-ticket QR, guest "my tickets" page, `/t/[token]` resolver |
| EVENT-4 | **DONE — CERTIFIED (100/100 manual acceptance, real phone, Rodrigo)** | Staff (`door` role) + scanner + atomic check-in. Spec at `docs/events/EVENT4_STAFF_SCANNER_CHECKIN.md`. See "EVENT-4 checkpoint" and "final manual acceptance" below |
| EVENT-5 | **IMPLEMENTED — automated tests + build PASS, no live-browser verification yet** | Analytics dashboard + XLSX export (5 sheets), organizer-only. Spec at `docs/events/EVENT5_ANALYTICS_XLSX.md`. See "EVENT-5 checkpoint" below |

Supabase `rifex-dev` migration history: `db/migrations/2026-08-25b_event4_staff_scanner_checkin.sql` applied 2026-08-25 (manually, via the Supabase SQL Editor — see "EVENT-4 checkpoint" below for why). DEV Vercel deploy target: `rifex-frontend-main` project, `--prod` alias (its own top-level environment, unrelated to real PROD — see Reentry Notebook Warnings below).

### EVENT-3 checkpoint (functional, not a documentation-only commit)

```text
develop:  725c4f8
commit:   feat(events): add tickets and QR fulfillment
Verdict:  GO EVENT-4
```

Evidence (live DEV, this session):
- 20/20 functional+security tests PASS (A–T battery: quantities, non-paid states never issue, idempotent repeat-issuance, unique `qr_token`/`ticket_number`, QR 404 on invalid token, 20× GET does not consume, guest-token isolation, organizer-ownership isolation, void auditable).
- **Exactly-once issuance under concurrency**: 20 simultaneous `issue_event_order_tickets` calls on one paid order (quantity=3) → exactly 3 tickets in the database, verified by direct count, not by RPC response alone.
- Replay test: mark-paid + 3 concurrent issuance calls → exactly 2 tickets (not 6).
- `approved_unfulfilled` orders verified to never issue tickets, even with a valid `mp_payment_id`.
- QR scan ≠ check-in verified live in a real browser: `used_at` stayed `null` and `status` stayed `valid` after visiting `/t/[token]`.
- `npm run build` PASS, clean.
- QA fixtures: **0 residual** — see "Cleanup incident and correction" below.
- PROD confirmed untouched before and after (`origin/main` unchanged, PROD Supabase migration count unchanged).

**Cleanup incident and correction (self-detected during this session, not by the user):** EVENT-2's automated concurrency test (20 simultaneous buyers) never added its winning orders to that script's own cleanup list, which silently blocked (via a foreign-key constraint whose error return was never checked) the deletion of 6 test events, their ticket types, and 20 orders — one of those events was left `published` and publicly visible on `/eventos`. Found while doing EVENT-3's own regression smoke, corrected in this session (deleted in the correct FK order: tickets → order_items → orders → ticket_types → events), and reverified with a full sweep showing 0 events/orders/tickets/test-users/fake-gateways remaining on `rifex-dev`. Lesson captured in Risks/Pending below.

### EVENT-4 checkpoint (functional, applied to `rifex-dev` 2026-08-25)

```text
develop:  (this commit)
Verdict:  GO EVENT-4
```

**Migration application mechanism (resolves the open question EVENT-3 left about how SQL reaches `rifex-dev`):** `supabase db push`/`db pull` both refuse to operate — the 9 pre-EVENT-4 migrations were never recorded in the CLI's own `supabase_migrations.schema_migrations` bookkeeping table (`LegacyDbPushMissingLocalError`/`LegacyDbPullMigrationConflictError`), and the only CLI-offered fix, `supabase migration repair`, was explicitly withheld this session. `db/migrations/2026-08-25b_event4_staff_scanner_checkin.sql` was instead applied by pasting the full file into the Supabase Dashboard's SQL Editor for `rifex-dev` and executing it directly (`Success. No rows returned.`) — confirmed applied via read-only verification immediately after (see Evidence below), never via `psql`/`pg_dump`/any direct Postgres connection. Future Events migrations should expect to use the same manual SQL Editor path unless someone deliberately backfills the CLI's migration history first.

Evidence (live DEV, this session):
- Read-only structural verification immediately after the manual apply: `event_staff`/`event_checkins` tables exist; RLS genuinely blocks `anon` (`permission denied`, not just an empty result — confirms `revoke all` took effect, not only a missing SELECT policy); both new RPCs (`check_in_event_ticket`, `find_user_id_by_email`) return `permission denied` (`42501`) for `anon` and succeed for `service_role`; all 5 EVENT-1/2/3 tables still queryable; `event_tickets.used_at` column present.
- **36/36 functional+security tests PASS**, run twice against the real HTTP API (not just the RPC in isolation) with real Supabase-authenticated test users, real events, and real tickets issued via the actual EVENT-3 `issue_event_order_tickets` RPC (not fabricated rows) — organizer/door-active/door-revoked/random/anon authorization; ticket void; ticket from a different event (`ticket_wrong_event`, verified unconsumed after); staff authorized only for a different event; cancelled event; QR malformed → `invalid_token`; nonexistent ticket → 404; `GET /t/[token]` before **and** after check-in never mutates `used_at`, across repeated calls; `event_checkins` gets exactly one row with the correct `checked_in_by`; staff management (owner adds/revokes, non-owner/`door` rejected on both); manual fallback (`ticket_number`) staff-only, same atomic authority as QR; public read endpoints (`/api/events`, `/api/events/[id]`) unaffected.
- **Exactly-once check-in under concurrency**: 20 simultaneous `POST /api/events/[id]/check-in` calls against the real HTTP server, same `qr_token` → exactly 1 `pass`, exactly 19 `already_used`, `used_at` set once, exactly 1 `event_checkins` row — verified by direct DB count, not by response inspection alone. Ran twice (once per test pass) with identical results.
- `npm run build` PASS, clean, after a full `.next` cache wipe (a `.next` corruption from running `build` concurrently with a live `dev` server mid-session was found and fixed — see Risks/pending).
- QA fixtures: **0 residual** — 6 test events, 26 test tickets/orders, 14 test users created across two test passes, all deleted with `if (error) throw` on every step, final sweep confirmed `0`/`0`.
- PROD confirmed untouched: `origin/main` unchanged, no Supabase CLI command targeted `wrdkdfuiwlujfxxijpao`, no `rifex.pro` request made.
- ~~Camera capture/visual overlay not verified in a real browser~~ — **RESOLVED**, see "First manual acceptance test" below. The automated Browser pane limitation noted earlier this session (never reaching a visible/composited state) turned out not to matter: Rodrigo tested on his own real phone instead.

### First manual acceptance test on a real phone (2026-08-25) — bug found and fixed

Rodrigo confirmed on a real device: camera opened correctly, DEV clearly identifiable, mobile-first layout correct, second scan correctly showed "NO PASA — YA UTILIZADA" with the right check-in hour. **But** the first scan's green "PASA" appeared and disappeared too fast to screenshot.

**Root cause, confirmed by code review, not guessed:** `scanner.jsx` had a `RESULT_AUTO_RESET_MS = 2800` timer that automatically cleared the visible result and resumed the camera decode loop 2.8 seconds after *any* result, regardless of whether the phone was still pointed at the same QR. Rodrigo was still aiming at the screen to take a photo when the timer fired, the decode loop resumed, immediately re-detected the same (now-consumed) QR, and fired a second real `POST /api/events/[id]/check-in` — which correctly returned `already_used` and overwrote the visible `pass` result before he could react. **Not a race in the atomic check-in itself** (the DB-level exactly-once guarantee held — only one `event_checkins` row was ever created for that ticket) — the bug was purely in the client's decision to keep scanning after a result, contradicting the spec's own "queda listo rápidamente para el siguiente escaneo" *never* meaning "automatically, without the door person's input."

**Fix**: removed the auto-reset timer entirely. All detection-gating logic was extracted into `src/lib/scannerController.js` — a `locked` flag that a detection sets *synchronously*, before any `await`, and that only `reset()` (wired exclusively to the "Siguiente escaneo" button) can clear. The camera's `requestAnimationFrame` decode loop is now explicitly stopped (`cancelAnimationFrame`) the instant a detection is accepted, not just gated by a flag inside the loop, and only restarted on `reset()`. The manual `ticket_number` fallback and the "Siguiente escaneo" button itself route through the same lock, guarding against double-tap. `tests/scannerController.test.mjs` (`npm run test:scanner-controller`, Node's built-in `node --test`, no new dependency) reproduces the exact failure mode — 5 consecutive detections of the same QR fired synchronously before the first response resolves — and asserts exactly 1 underlying request fires; 4 tests total, all PASS. Re-ran the full 36-test HTTP suite plus the 20-concurrent check-in test after the fix: unaffected (6/6 spot-check + concurrency PASS again), since the fix is entirely client-side.

A second, unconsumed ticket was issued on the same `EVENT-4 TEST` fixture event for Rodrigo to repeat the manual test against the fixed scanner.

### EVENT-4 — final manual acceptance, confirmed (2026-08-25)

Fix committed at `c32713e` (`fix(events): stop scanner from auto-resuming and double-submitting`), deployed to `rifex-frontend-main`, re-tested by Rodrigo on a real phone against a fresh, previously-unconsumed ticket on the same `EVENT-4 TEST` fixture event. Confirmed:

- real browser camera opened and read a real QR off a screen;
- first scan → `PASA`, and it **stayed visible** — no automatic disappearance;
- the camera did **not** resume scanning on its own; resumption only happened when Rodrigo tapped "Siguiente escaneo";
- second scan of the same (now-consumed) QR → `NO PASA — YA UTILIZADA`, with the real check-in hour shown;
- mobile-first layout held up on a real device; manual fallback visible; DEV clearly identifiable as DEV.

```text
develop:  c32713e (fix), on top of a1093b6 (feat)
Verdict:  EVENT-4 — ACEPTADO 100/100 (Rodrigo, real-phone manual test)
```

All EVENT-4 TEST fixture data (1 event, 3 orders/tickets/checkins, 1 ticket type, 1 dedicated test account) was deleted from `rifex-dev` after acceptance, identified and removed by exact ID (not by pattern/prefix) — confirmed `rifex-dev` had exactly this one event and one user in the entire database both before and after, so nothing else could have been or was affected. `origin/main`/PROD untouched throughout.

### Architecture map — Events (EVENT-1/2/3/4), just enough to reorient without re-reading source

**EVENT-1 — catalog**
- `events` (draft/published/cancelled), `event_ticket_types` (active/hidden, `quantity_total`/`quantity_sold`).
- RLS: public SELECT only if `published`/`active`; all writes via service-role API routes, never client-direct.
- Key files: `src/pages/api/events/**`, `src/pages/eventos/**`, `src/pages/crear-evento.jsx`, `src/pages/panel/eventos/**`.

**EVENT-2 — checkout/orders**
- `event_orders` (`pending`/`paid`/`expired`/`cancelled`/`approved_unfulfilled`), `event_order_items` (price/name snapshot per line).
- Inventory: `event_ticket_types.quantity_reserved` added; available = `total - sold - reserved`, enforced by a DB `CHECK`.
- Atomic RPCs: `create_event_order` (reserve + snapshot + fee, all-or-nothing), `expire_event_order` (idempotent TTL release), `mark_event_order_paid` (reserved→sold, late-payment-safe).
- Guest checkout: no login; `event_orders.access_token` (opaque) is the only recovery credential.
- Commission: `src/lib/platformFee.js`, `PLATFORM_FEE_RATE = 0.07` — a **new, Events-only** source, deliberately not merged with the certified `RIFEX_FEE_RATE` in `checkout/mp.js`/`checkout/colecta.js` (touching those was judged higher-risk than the duplication).
- Webhook: `src/pages/api/checkout/webhook-events.js` — sibling file, never touches `webhook.js`/`webhook-colecta.js`.
- Key files: `src/pages/api/events/[id]/checkout.js`, `src/pages/api/checkout/webhook-events.js`, `src/pages/api/events/orders/[token].js`, `src/pages/eventos/pago/**`.

**EVENT-3 — tickets/QR**
- `event_tickets`: `ticket_number` (human, `RFX-EVT-XXXXXX`, never a credential), `qr_token` (opaque, the only real credential), `status` (`valid`/`void` only — no `used`, reserved for EVENT-4), snapshot of ticket-type name/price.
- `event_orders.tickets_issued_at` / `tickets_email_sent_at` — fulfillment state, deliberately separate from payment state.
- Atomic RPC: `issue_event_order_tickets(order_id)` — row-lock-serialized, exactly-once, `paid`-only. `void_event_ticket(ticket_id)` — backend-only invalidation primitive, no UI trigger yet, never deletes.
- Guest pages: `/eventos/orden/[token]` (persistent "my tickets", reuses EVENT-2's access_token), `/t/[token]` (public QR resolver, GET-only, no PII).
- QR image: `src/pages/api/events/tickets/[token]/qr.png.js`, reuses Colectas' satori+sharp+qrcode card-rendering *technique* only — no shared code, no shared domain.
- Key files: `src/lib/eventFulfillment.js` (the single "ensure issued + email" entry point, called from the webhook and lazily from the order-lookup endpoint), `src/lib/eventTicketMailer.js`.

**EVENT-4 — staff/scanner/check-in**
- `event_staff` (`role`: only `door`; `status`: `active`/`revoked`; unique per `event_id`+`user_id`; `user_email_snapshot` for display only, never authoritative). `event_checkins` (audit trail, one row per successful check-in, `unique(ticket_id)` as defense-in-depth).
- `event_tickets.used_at` (left nullable/unwritten since EVENT-3) is now the consumption authority: `NULL` → consumable, non-`NULL` → `already_used`. Never a `status` change — `status` stays `valid`/`void`, untouched by check-in.
- Atomic RPC: `check_in_event_ticket(qr_token, actor_user_id, event_id)` — locks the `event_tickets` row (`FOR UPDATE`), same concurrency pattern as EVENT-3's `issue_event_order_tickets`, just one level down (ticket instead of order). Validates ticket exists → belongs to the given event (cross-event check, before authorization) → actor is organizer or `door`+`active` staff of that event → event not `cancelled` → ticket not `void` → `used_at IS NULL`, then writes `used_at` and inserts `event_checkins` in the same transaction. No `SECURITY DEFINER` (same reasoning as `create_event_order`/`issue_event_order_tickets`: already runs as `service_role`, which already has the privileges it needs).
- `find_user_id_by_email(email)` — the one function in this migration that **does** use `SECURITY DEFINER` (with `search_path` pinned to `public, auth`) because resolving "does a user with this email exist" requires reading `auth.users`, not exposed via PostgREST otherwise. Never a public search — accepts exactly one email, returns one id or `null`, `service_role`-only.
- HTTP surface: `GET/POST /api/events/[id]/staff` (owner-only), `PATCH /api/events/[id]/staff/[staffId]` (owner-only, revoke/reactivate, never `DELETE`), `GET/POST /api/events/[id]/check-in` (`GET` = authorization ping for the UI, `POST` = the real check-in, accepts `qr_token` or staff-only `ticket_number` fallback — both paths converge on the same RPC).
- Scanner: `/panel/eventos/[id]/scanner`, mobile-first, camera via `jsqr` (new dependency — pure decode function, no camera/UI bundled, chosen specifically so the app owns 100% of the capture loop and the strict parsing, never a third-party navigation/URL-handling layer). Parsing lives in `src/lib/parseEventQr.js`: accepts a bare 32-hex token or a `/t/<token>` URL whose **origin must match the scanner's own** — anything else, including a same-shape URL on a foreign host, is "malformado," never navigated to.
- Key files: `db/migrations/2026-08-25b_event4_staff_scanner_checkin.sql`, `src/lib/eventStaffAuth.js`, `src/lib/parseEventQr.js`, `src/lib/scannerController.js` (detection-gating state machine, added after the first manual test found the auto-reset bug — see below), `src/pages/api/events/[id]/check-in.js`, `src/pages/api/events/[id]/staff/*`, `src/pages/panel/eventos/[id]/scanner.jsx`, `src/pages/panel/eventos/[id].jsx` (extended: staff section, "Abrir scanner" CTA, "Ingresaron" count), `src/pages/api/events/[id]/orders-summary.js` (extended additively: `tickets.checked_in`), `tests/scannerController.test.mjs` (`npm run test:scanner-controller`).

### Invariants that must hold across any future Events work

- **PAYMENT STATE ≠ FULFILLMENT STATE.** `event_orders.status` (payment truth) and `tickets_issued_at`/`tickets_email_sent_at` (fulfillment truth) are separate columns, separate concerns. A fulfillment failure must never revert a payment; a payment failure must never be papered over by fulfillment succeeding.
- `paid` is the **only** order status that may issue tickets.
- `approved_unfulfilled` **never** issues tickets, even with a valid `mp_payment_id` — this is the direct consequence of the late-payment-after-resale protection designed in EVENT-2 (never steal stock from a buyer who purchased after the original reservation expired).
- Scanning/opening a ticket's QR is **not** check-in. `GET /t/[token]` never consumes, never mutates `status` or `used_at` — verified again after EVENT-4 shipped: repeated `GET` calls before **and** after a real check-in leave `used_at` unchanged.
- A ticket is never `DELETE`d for being used or voided — `void` is a status, history is preserved. `event_staff` follows the same rule: revoking never deletes the row.
- EVENT-4 owns check-in authority entirely, exclusively via `check_in_event_ticket` — no other code path writes `event_tickets.used_at` or inserts into `event_checkins`.
- **Three separate truths, never merged**: `event_orders.status` (payment), `tickets_issued_at`/`tickets_email_sent_at` (fulfillment), `event_tickets.used_at`/`event_checkins` (access). A check-in never touches payment or inventory columns; verified — `check_in_event_ticket` never references `event_orders` at all.

### Risks / pending (documented, not being worked now)

1. **EVENT-3**: ticket-ready email delivery was not verified end-to-end with a real send — `ENABLE_EMAILS`/`RESEND_API_KEY` activity in DEV was not confirmed this session. The idempotency design (`tickets_email_sent_at`) is fail-safe either way (a skipped/failed send leaves the flag unset and is retried lazily), but nobody has watched a real email land in an inbox.
2. **EVENT-2**: no certified/implemented Mercado Pago refund flow. Cancelling an event with `paid` orders only sets `refund_required = true` on those orders (informational) — no automatic MP refund call exists or was invented.
3. **EVENT-2**: some webhook adversarial cases (amount mismatch, currency mismatch, payment/order mismatch) were verified by code-equivalence to the already-certified Colecta webhook pattern and by direct RPC testing, not by a live Mercado Pago sandbox payment — no sandbox credentials were available in-session.
4. ~~EVENT-4: scanner, staff accounts, and check-in do not exist~~ — **RESOLVED 2026-08-25**, see "EVENT-4 checkpoint" above.
5. **Test hygiene**: any future Supabase cleanup script must check `if (error) throw` (or equivalent) on every delete step, never assume success — see the Cleanup incident above, which happened specifically because an error return was silently ignored.
6. **This worktree's `.env.local` has `NEXT_PUBLIC_SUPABASE_URL` pointing at the PROD Supabase ref (`wrdkdfuiwlujfxxijpao`), not DEV.** This was flagged and deliberately avoided all session (DEV work used explicit `--project-ref nwxrvwbzqbhznscyirbq` on every Supabase CLI call, and the Vercel DEV project's own environment variables, never this local file). Do not `npm run dev` from this checkout without first fixing or overriding that value — see `SUPABASE_DEV_URL`/`SUPABASE_DEV_*` alternates already present in the same file.
7. ~~Live-schema introspection of `rifex-dev` is PENDING~~ — **RESOLVED 2026-08-25**, functionally (not via raw catalog dump — `db pull`/`db dump` remained blocked by the same CLI history-bookkeeping issue described in the EVENT-4 checkpoint above). Verified instead by exercising the real tables/RLS/RPCs directly: all EVENT-1/2/3 tables queryable, `event_staff`/`event_checkins` exist with RLS genuinely enforced, both new RPCs behave and are permission-scoped correctly. A byte-level `information_schema`/`pg_dump` comparison against the versioned SQL was still not done — low residual risk, since every constraint/RLS/grant the migration declares was independently exercised and confirmed behaviorally.
8. **`rifex-dev`'s database password must still be rotated before any direct PostgreSQL connection (`psql`, `pg_dump`, or equivalent) is attempted.** A `supabase db dump --dry-run` run during a 2026-08-25 session printed the real DB password in plaintext into the agent's output. No dump was actually executed, no data was touched, and the password was not saved to any file — but it must be treated as compromised. The user explicitly deferred rotation to the next session ("se realizará mañana") rather than blocking EVENT-4 on it — **rotation is still outstanding as of this checkpoint**, tracked here so it isn't forgotten. **Do not reuse the exposed credential for anything, under any circumstance.**
9. **Supabase CLI (`db push`/`db pull`) cannot be used for this project as-is** — the pre-EVENT-4 migration history was never recorded in the CLI's own bookkeeping table, and the only fix the CLI offers (`supabase migration repair`) has been withheld twice this session by explicit user instruction. Until someone deliberately authorizes a repair/backfill, every future Events migration will need the same manual SQL-Editor-paste path used for EVENT-4 — plan for it, don't assume `db push` will work.
10. ~~Camera/visual scanner UI not verified live~~ — **RESOLVED 2026-08-25**. First real-phone test by Rodrigo found a real bug (auto-reset timer racing the camera loop, overwriting `PASA` with `already_used`); fixed (`src/lib/scannerController.js`, commit `c32713e`); **second real-phone test confirmed the fix** — `PASA` stays visible, camera never resumes on its own, only "Siguiente escaneo" does. EVENT-4 manual acceptance: **100/100, CONFIRMED**, not outstanding anymore.
11. **`.next` build cache corruption from running `npm run build` while `npm run dev` was live** — caused a real `Cannot find module './chunks/vendor-chunks/next.js'` 500 error mid-session. Fixed by stopping `dev`, `rm -rf .next`, restarting. Not a code defect; a reminder not to run `build` and `dev` concurrently against the same checkout.

### PRE-LAUNCH-FIX-3 — `raffle_date_extensions` RLS incident (2026-08-25)

**Real Supabase Security Advisor alert** (email, "Action required: security vulnerabilities detected in your projects", `rls_disabled_in_public`, level ERROR, dated 2026-08-23) for both `rifex-dev` (`nwxrvwbzqbhznscyirbq`) and PROD (`wrdkdfuiwlujfxxijpao`). Not related to Events/EVENT-4.

**Root cause, confirmed by code review**: `public.raffle_date_extensions` (created in `2026-08-19_draw1_temporal_lifecycle.sql`, alongside `legal_declarations`) never received the RLS hardening that `legal_declarations` got in PRE-LAUNCH-FIX-1 (`2026-08-23_prelaunch_fix1_ticket_integrity.sql`, "P1-2") — an omission, not a design choice. No code under `src/` reads or writes this table directly (confirmed by grep); the only real writer is `extend_raffle_draw()`, an RPC that runs under `service_role` and bypasses RLS by design, same as `legal_declarations`'s writer.

**Exposure demonstrated, not assumed** (`rifex-dev`, before the fix): `relrowsecurity = false` at the catalog level (`pg_class`, confirmed via `supabase db query --linked`, the Management-API-based SQL runner — no `psql`, no `--dry-run`, no password involved). An `anon`-key `INSERT` succeeded with **zero error**, matching the alert's own wording ("anyone with your project URL can read, edit, and delete all data in this table") — the test row was immediately deleted via `service_role`, scoped by its own id.

**Fix**: `db/migrations/2026-08-25c_prelaunch_fix3_raffle_date_extensions_rls.sql` — a single `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, no new policies, identical pattern to the already-certified `legal_declarations` fix. Applied to `rifex-dev` via `supabase db query --linked -f <file>` (Management API, bypasses the same migration-history bookkeeping gap noted for EVENT-4 — this command is independent of `db push`/`pull` and was not blocked by it).

**DEV verification, all real, all this session**:
- Catalog re-check: `relrowsecurity = true`.
- Same `anon` `INSERT` now fails with `42501 new row violates row-level security policy`.
- Full security matrix (`anon`/authenticated owner/authenticated non-owner/`service_role` × SELECT/INSERT/UPDATE/DELETE against a real row) — **14/14 PASS**. Notably: even the raffle's own owner cannot read/write this table directly now — by design, matching `legal_declarations` exactly; the real flow goes through `extend_raffle_draw` (`service_role`), never direct table access.
- `extend_raffle_draw` exercised end-to-end (real raffle, real RPC call, real resulting row) — unaffected by the fix, confirms the one real write path still works.
- EVENT-4 check-in exercised end-to-end again (unrelated table, sanity-checked anyway per the mission's regression requirement) — unaffected.
- Full route smoke (`/`, `/login`, `/register`, `/rifas`, `/crear-rifa`, `/crear-colecta`, `/eventos`, `/mis-iniciativas`, `/panel`, `/api/rifas`, `/api/events`) — all 200.
- `npm run build` — PASS.
- Attempted to break the fix: confirmed via full-migration-history grep that `extend_raffle_draw` is the *only* function anywhere that ever writes to this table — no alternate write path exists to bypass.
- All QA fixtures created for this investigation (test users, a test raffle, test rows) deleted, verified `0` residual after each script.

**PROD — RESOLVED**: same `rls_disabled_in_public` finding confirmed via `supabase db advisors --linked --project-ref wrdkdfuiwlujfxxijpao` (ref confirmed explicitly, the persisted `rifex-dev` link was verified unchanged before and after) — PROD's advisor output also confirmed, independently, that **no Events tables or functions exist there** (a strict subset of DEV's findings), consistent with everything already documented. Applying the identical one-line fix to PROD via the agent was **blocked by the harness's own safety classifier** (recognized as a production-database-affecting command) — a deliberate environment safeguard, not worked around. **The user applied the fix manually** in the PROD SQL Editor, same file, same single statement. Verified read-only immediately after: `pg_class.relrowsecurity = true` for `public.raffle_date_extensions` in PROD, and a full `db advisors --type security --level error` re-scan of PROD returned **"No issues found"** — the CRITICAL finding is gone. PROD's `.env`/deploy/`main` branch/`rifex-frontend-v2` code were never touched — this was a database-only change, applied directly, no Git involvement, no deploy.

**PROD functional health, separately confirmed**: the live Vercel deployment behind `rifex-frontend-v2` responds (app and DB both healthy after the fix) when hit directly by its `*.vercel.app` URL. **A separate, unrelated domain incident was flagged here and fully diagnosed afterward — see "P0 — rifex.pro domain expired" immediately below.**

**Other advisor findings, not acted on this session** (lower severity, out of scope for this incident): `function_search_path_mutable` WARNs on several pre-existing functions and on some of EVENT-2/3/4's own RPCs (`create_event_order`, `expire_event_order`, `mark_event_order_paid`, `issue_event_order_tickets`, `void_event_ticket`, `check_in_event_ticket` — flagged regardless of `SECURITY DEFINER` status, a general best-practice warning); `anon`/`authenticated_security_definer_function_executable` WARNs on legacy raffle functions (`create_tickets_for_raffle`, `rifex_set_creator_defaults`, `set_bank_account_owner`, `set_creator_fields`, `set_raffle_creator_from_jwt`); `auth_leaked_password_protection` WARN (PROD only, HaveIBeenPwned check disabled). None are the CRITICAL/ERROR-level issue the email reported.

### P0 — `rifex.pro` domain expired at the registrar (2026-08-26)

**Not a code, deploy, or RLS-fix issue.** Rodrigo confirmed `https://rifex.pro` failing with `ERR_SSL_PROTOCOL_ERROR` from a second device/browser, right after the RLS-fix session above. Diagnosed read-only, no changes made anywhere.

**Root cause, confirmed with direct evidence, not inferred:**
- `vercel domains inspect rifex.pro` shows the domain correctly assigned to `rifex-frontend-v2` (`rifex.pro`, `www.rifex.pro`) — the Vercel-side project/domain assignment was never wrong. Vercel's own "Intended Nameservers" check (`ns1/ns2.vercel-dns.com`, shown with a checkmark) is **stale/no longer true** — it does not reflect what is live today.
- Real, live DNS — cross-checked via two independent public resolvers (Cloudflare `1.1.1.1` and Google `8.8.8.8` DNS-over-HTTPS, not just the local/hotel resolver) — shows the **actual authoritative nameservers are `ns1.dns-expired.com` / `ns2.dns-expired.com`**, not Vercel's. Both the apex (`rifex.pro`) and `www.rifex.pro` resolve to `2.57.91.92`, not any Vercel edge IP.
- `dns-expired.com`'s own SOA record names its authority as `hostinger.mars.orderbox-dns.com` / `business-domains.hostinger.com` — **Hostinger** (confirmed as the registrar; Vercel's own domain inspector already listed the registrar as "Third Party").
- A plain HTTP request to `2.57.91.92` with `Host: rifex.pro` returns Hostinger's own parking page, with the literal page title **"Your domain is expired."**

**Conclusion**: the `rifex.pro` domain **registration itself has lapsed at Hostinger** (not a DNS misconfiguration, not a Vercel certificate problem, not a CAA record, not a proxy). Hostinger's registrar-level expiration handling overrides the nameservers to its own parking service the moment a domain lapses — this is why Vercel still shows a "correct" project assignment and once-correct nameservers, while live DNS today points somewhere Vercel has no control over. **No fix exists inside Vercel** for this — setting an A record, re-adding the domain, or any Vercel-side action cannot restore a domain whose registration has expired at its registrar.

**Corrective action — outside this agent's reach, requires the domain owner:**
1. Log into Hostinger (the registrar for `rifex.pro`) and **renew the domain registration** — this is a billing/account action, not a technical one.
2. Once renewed, confirm Hostinger's nameservers are set back to `ns1.vercel-dns.com` / `ns2.vercel-dns.com` (Vercel's own recommendation, already correctly configured on the Vercel side and requiring no further Vercel changes) — **or**, if Vercel's DNS challenge re-appears after renewal, follow whatever it recommends at that point (do not assume today's exact instructions still apply after a renewal, since Hostinger's post-expiration state may differ).
3. Propagation after a registrar-level renewal + nameserver fix can take from minutes to a few hours depending on Hostinger/Vercel's caching.

**Verified, unaffected by this incident**: the live Vercel deployment (`rifex-frontend-v2`, hit directly by its Vercel-issued URL, bypassing the broken domain) is healthy. `rifex-dev` (DEV Supabase), the local `develop` git branch, and the PRE-LAUNCH-FIX-3 RLS correction from earlier this session are all confirmed untouched by this domain incident and by this investigation.

**No corrective action was applied by the agent** — confirmed there was nothing safe/unambiguous to change inside Vercel (the Vercel-side configuration was already correct), and registrar access was never available to this session. This matches the mission's own stop condition ("necesitas acceso al proveedor DNS externo").

### EVENT-5 checkpoint — CERTIFIED (real manual acceptance by Rodrigo + live verification against Vercel DEV/rifex-dev)

```text
develop:  0f9ab01
Verdict:  EVENT-5 — CERTIFIED
```

EVENT-5 (analytics dashboard + XLSX export) implemented per `docs/events/EVENT5_ANALYTICS_XLSX.md` — organizer-only (`canViewEventAnalytics`, never `door`/staff), corrected financial model (`approved_unfulfilled` included in "aprobada total"/comisión, excluded only from "cumplida"), corrected operational model (`Anuladas usadas antes de anularse` as its own category — real finding: `void_event_ticket` never guards or clears `used_at`), 5-sheet XLSX (ExcelJS 4.4.0, the only dependency installed), deterministic limits (20.000 orders/tickets/checkins, 500 staff), formula-injection neutralization, timezone-safe formatting (`events.timezone`, cached `Intl.DateTimeFormat`). No new table/migration — purely additive read-side code over the existing EVENT-1/2/3/4 schema.

**Rodrigo's real manual acceptance**: dashboard verified visible and correct, XLSX downloaded from real Vercel DEV, file opened correctly, dashboard and XLSX figures confirmed matching — EVENT-5 accepted functionally by him directly.

**Independent visual audit of the downloaded XLSX, found and fixed after Rodrigo's functional acceptance**: buyer name/email columns in Órdenes-Ventas and email/role columns in Personal de acceso overlapped or clipped — traced to static column widths narrower than real content (e.g. "Organizador (propietario)" is 25 characters against a 14-wide column). Fixed in `src/lib/eventAnalyticsWorkbook.js` (commit `0f9ab01`): every column across all 5 sheets widened, `wrapText` added as a real overflow safety net for content with no short business-length cap; CLP amounts given `numFmt: '"$"#,##0'` (values stay numeric, e.g. `29000` renders `$29.000`, never converted to text); raw technical headers renamed to reader-facing labels (`ticket_number` → "Número de entrada", `Ingresó (used_at)` → "Fecha de ingreso", `Refund requerido`/`refund_required` → "Reembolso pendiente"); Resumen's "Ingresadas" renamed to "Ingresadas válidas" to disambiguate from the Check-ins sheet's raw historical row count. Freeze panes, autofilter, alert-row coloring, and every business formula are unchanged.

Local evidence: **31/31 real automated tests PASS** (`npm run test:event-analytics` — 5 new tests added specifically for the visual fixes: currency numeric+format, header rename, wrapText-covers-overflow, no formula errors `#REF!`/`#VALUE!`/`#DIV/0!`/etc., no secrets in the generated file). `npm run build` PASS. `npm run test:scanner-controller` (EVENT-4 regression) 4/4 PASS unchanged — no EVENT-1/2/3/4 file was modified.

**Live evidence, real Vercel DEV + real `rifex-dev`** (across two certification sessions, same day): deployment confirmed `Ready`/Production/`iad1` at every step, commit verified via real build logs each time (`dae5344` → `31e5ac1` → `0f9ab01`). The same real controlled fixture created earlier (4 disposable `@example.com` test users, one event, 3 ticket types, orders/tickets/check-ins/void via real RPCs and endpoints, a genuine `approved_unfulfilled`, a real cancellation setting real `refund_required`) was reused. **17/17 real HTTP authorization+correctness tests PASS**, **24/24 real checks PASS on the file actually downloaded from the live deployment** (5 sheets, frozen row 1 on all, autofilter on the 4 tabular ones, currency numeric with real `numFmt`, renamed headers present, raw names absent, no formula errors, no secrets). Real round-trip timing: ~1.4-1.7s (analytics JSON), ~1.0-1.5s (XLSX export) on the small real fixture.

**Real performance finding, found and fixed earlier the same day**: the stress test first measured ~29-30s to build+serialize the workbook at the 20.000-row maximum — traced to `Intl.DateTimeFormat` being reconstructed on every date-format call (~60.000 times). Fixed by caching formatter instances per timezone; re-measured at ~15s combined. `maxDuration` confirmed against Vercel's current documentation (`vercel.com/docs/functions/configuring-functions/duration`, updated 2026-07-01): with Fluid Compute (platform default since 2025), **300s on every plan** — no `vercel.json`/code override exists in this repo. ~15s (synthetic max load, never uploaded to `rifex-dev`) and ~1-2s (real small load) both fit comfortably.

**Not deleted**: the real fixture event/orders/tickets/staff remain in `rifex-dev` — no cleanup was requested or performed this session.

### EVENT-6 Fase 1 checkpoint (autonomous security/regression audit of EVENT-1..5, DEV only)

```text
develop:  (this commit)
Verdict:  GO for EVENT-1..5 as they stand in rifex-dev — PROD promotion decision reserved for Rodrigo
```

Autonomous adversarial audit against real Vercel DEV (`rifex-frontend-main`) and real `rifex-dev` — auth/IDOR matrix, RLS/grants/Security Advisor, invariants (SCAN≠CHECK-IN, exactly-once, void never revives, PAYMENT≠FULFILLMENT), real concurrency (10 simultaneous ticket issuances, 15 simultaneous check-ins on the same QR), adversarial inputs (SQLi-shaped tokens, oversized tokens, hostile paths), and regression (Rifas/Colectas/Auth/Perfil/Mis-iniciativas/build). Full matrix and evidence: `docs/events/EVENT6_SECURITY_AUDIT.md`.

**30/31 real tests PASS** — the one "failure" was a wrong test expectation (a nonexistent event returns `403`, not `404`, from the analytics endpoint — actually more secure, since it never distinguishes "doesn't exist" from "not yours"). **Two real, low-risk findings from the Security Advisor, both fixed as defense-in-depth, neither exploitable when found** (verified live before fixing, not assumed): (1) 6 EVENT-2/3/4 RPCs had a mutable `search_path` (WARN) — none is `SECURITY DEFINER`, so no privilege-escalation path existed; fixed via `ALTER FUNCTION ... SET search_path = public` (metadata-only, zero logic risk); (2) `events`/`event_ticket_types` (EVENT-1) never received the explicit `revoke insert/update/delete` that every later Events table has — a live PostgREST test against a real published event's real ID confirmed 0 rows were ever affected by an anonymous write attempt before the fix; the revoke was added anyway as a second lock, deliberately leaving `SELECT` untouched (the public catalog read is legitimate). Both in `db/migrations/2026-08-26_event6_hardening_search_path_and_revoke.sql`. Zero application code was changed — no reproducible app-level defect was found.

Real concurrency evidence: 10 simultaneous `issue_event_order_tickets` calls on one order (qty=3) → exactly 3 tickets; 15 simultaneous HTTP check-ins on the same QR → exactly 1 `pass`, 14 `already_used`, exactly 1 `event_checkins` row. Fixture (2 published events, 5 disposable users, orders/tickets/staff) created via real RPCs/endpoints and fully deleted afterward, scoped by exact `event_id`/`user_id` — verified 0 residual rows. Also found and cleaned, as housekeeping, 3 empty leftover draft events from a previous EVENT-5 session's repeated test runs — the real EVENT-5 fixture itself (still holding order/ticket history, the one Rodrigo reviewed) was left untouched.

### EVENT-6 Fase 2 checkpoint (audit of the 16 inherited Rifas/Auth WARN findings + promotion package, DEV only)

```text
develop:  (this commit)
Verdict:  GO for EVENT-1..6 as they stand in rifex-dev — PROD promotion package prepared, not executed, decision reserved for Rodrigo
```

> ⚠️ **Most important finding of this phase, read first**: `public.create_tickets_for_raffle(uuid, integer)` — a legacy, unversioned `SECURITY DEFINER` function with **zero ownership check** and `EXECUTE` granted to `PUBLIC` — let a **completely anonymous** request (no session, just the public `anon` key) mint real tickets in **any raffle it doesn't own**, demonstrated live against a disposable fixture (5 tickets inserted in a stranger's raffle via a bare `POST /rest/v1/rpc/create_tickets_for_raffle`). Fixed in `rifex-dev` this session (`revoke execute ... from public, anon, authenticated`, `service_role` unaffected, verified live: post-fix the same attack returns `401`, 0 tickets created). **This function predates the DEV/PROD fork (no versioned migration — lives in the base schema dump) and is highly likely to be equally exploitable in PROD right now** — this session has no CLI link to PROD and is forbidden from writing there, so this is flagged as an **urgent, independent-of-Events-promotion action for Rodrigo**. Full detail: `docs/events/EVENT6_SECURITY_AUDIT_FASE2.md`.

Individually audited all 16 WARN findings inherited from Rifas/Auth (never grouped under a generic explanation, per instructions). Classification: 1 critical exploitable vulnerability (above, fixed), 8 genuine false positives (4 trigger functions — `rifex_set_creator_defaults`, `set_bank_account_owner`, `set_creator_fields`, `set_raffle_creator_from_jwt` — each flagged twice for anon+authenticated; live-tested, all return `404 PGRST202`, PostgREST never exposes `RETURNS trigger` functions as RPC endpoints, and Postgres itself refuses to invoke a trigger function outside real trigger context regardless of grants), 6 low-risk findings fixed as defense-in-depth (5× `search_path` mutable on `SECURITY INVOKER` functions — same low-risk profile as the EVENT-2/3/4 RPCs fixed in Fase 1; 2× unnecessary `anon`/`authenticated`/`PUBLIC` grant on `create_raffle_with_declarations`/`extend_raffle_draw` — live-tested as an IDOR hypothesis first: an authenticated real attacker calling both directly by RPC with a real victim's `uuid` as `p_user_id` was rejected by RLS itself, `raffle_not_found`/`42501`, because both are `SECURITY INVOKER` and RLS evaluates the caller's real `auth.uid()`, never the forged parameter — **not exploitable**, revoked anyway for consistency since the app only ever calls them via `service_role`), 1 administrative Auth setting (`auth_leaked_password_protection`) left untouched per explicit instruction, documented as pending for Rodrigo.

Security Advisor: 22 WARN → 16 (after Fase 1) → **1** (after Fase 2, purely administrative). Zero ERROR at any point. Zero `src/` files changed — all fixes are database-level (grants/search_path) via 3 new migrations: `2026-08-26b_event6_fase2_critical_revoke_create_tickets_for_raffle.sql`, `2026-08-26c_event6_fase2_hardening_rifas_search_path_and_revoke.sql`, `2026-08-26d_event6_fase2_revoke_trigger_functions_execute.sql`. Regression: real raffle creation + real draw-date extension via the legitimate `service_role` path (same as the real API routes) both still succeed post-fix; `npm run test:event-analytics` 31/31, `npm run test:scanner-controller` 4/4, `npm run build` clean; live smoke against the deployment (`/rifas`, `/crear-rifa`, `/mis-iniciativas`, `/login`, `/register`, `/perfil`, `/eventos`, `/panel`, `/panel/bancos`, `/api/rifas`, `/api/events`, `/onboarding/pais`) all `200`.

A full promotion package (exact commits, pending PROD migrations in order, required env var names, pre-checks, rollback plan, post-promotion tests, Rodrigo's manual actions, accepted risks) is prepared in `docs/events/EVENT6_SECURITY_AUDIT_FASE2.md` — **not executed**. Of the 34 commits between `origin/main` and current `develop`, only ~14 are Events-specific; 17 more (DRAW/Payment Engine/Argentina/UX/dev-policy work) were never audited by this session and need their own review before any promotion decision bundles them in.

### Rifex Trust — canonical design (this session, documentation only)

A full transversal Trust system (onboarding, identity, age verification, creator/organization verification, per-initiative review, fraud prevention, administration, reports, suspension, appeal, reputation from real operations, post-transaction evidence, data protection, future country expansion) was **designed, not implemented**, across 12 documents in `docs/trust/` plus this session's handoff. Start at `docs/trust/RIFEX_TRUST_CANONICAL_DESIGN.md`. Grounded in real, dated legal research (Ley 19.628 vigente; Ley 21.719, published 13-dec-2024, full force 1-dec-2026) and in the real current code (`src/pages/auth/callback.js`, `src/pages/onboarding/pais.jsx`, `legal_declarations`) — confirmed the actual gap: today, onboarding is only a country selector plus an unverified age/prize-ownership checkbox at raffle-creation time, nothing else.

**Most material finding of the whole design effort**: Chilean law treats raffles and public collections as games of chance/restricted activities, in principle authorized only to non-profit legal entities via Ministerio del Interior (Ley 10.262/1952) — Rifex's actual model (individual creators) sits in a real, currently-tensioned legal gray zone (documented by an April 2026 press article on "rifas de influencers"). No amount of identity verification resolves this by itself — flagged as **Prioridad 1** in `docs/trust/TRUST_DECISIONS_FOR_RODRIGO.md`, requires a Chilean lawyer, independent of any technical roadmap.

Explicit design stances worth knowing without reading every document: 18+ is verified, never just declared; a birth certificate is never the standard verification path (only a documented manual exception); no in-house facial recognition without a dedicated legal/security review; documents are preferably never retained past producing a verification result; no numeric risk score is ever shown, only explainable checks with mandatory human review; roles never allow self-approval; four false-document-adjacent methods were compared with real trade-offs, not just recommended blindly.

Roadmap: TRUST-0 (this session, done) through TRUST-9 (adversarial audit before production, same rigor as `EVENT6_SECURITY_AUDIT*`). Nothing beyond TRUST-0 is authorized.

### TRUST-1 checkpoint (onboarding universal — DONE in DEV, authorized end-to-end by Rodrigo)

```text
develop:  6333044 — feat(trust): implement TRUST-1 — universal onboarding + server-side gate
Pushed:   origin/develop 1f01d53..6333044 (authorized)
Migration: db/migrations/2026-08-26e_trust1_onboarding.sql applied to rifex-dev (authorized) — verified: trust_onboarding exists, RLS enabled, zero grants to anon/authenticated/PUBLIC
Deploy:   rifex-frontend-main auto-deployed dpl_HNT2giXgFCAdwpSmqtLN2kgM4QSy from the develop-branch git integration, ~2 min after the push (authorized)
Verdict:  TRUST-1 COMPLETO in DEV. PROD and main untouched.
```

Implemented: `trust_onboarding` table (new, independent of `users_profile`, RLS default-deny total — no client access at all, stricter than the existing `users_profile`/country pattern, precisely to keep `onboarding_completed_at` unreachable from the client); `src/lib/trustOnboardingPolicy.js` (pure validation) + `src/lib/trustOnboardingGate.js` (server authority, mirrors `countryGate.js`); `GET/POST /api/onboarding/trust/{status,complete}`; `/registro/continuar` UI; the server-side gate wired into 13 real sensitive endpoints across Rifas/Colectas/Eventos (create/edit/publish/staff/ticket-types — deliberately excluding pure deletion/revocation actions, which reduce risk rather than increase it, same reasoning applied consistently across both products). 29 real tests pass (`npm run test:trust-onboarding`), including a structural adversarial test proving the client can never smuggle `onboarding_completed_at`/`user_id` through the API. Full regression (`test:event-analytics` 31/31, `test:scanner-controller` 4/4, `npm run build`) clean both before and after applying the migration.

**Live verification in rifex-dev (2026-08-26, two disposable `@example.com` fixtures, deleted after, zero residual rows confirmed)**: isolated the country gate from the Trust gate by completing country onboarding first, then confirmed a real `403 onboarding_incomplete` from the Trust gate on `POST /api/rifas`, `/api/events`, `/api/colectas` while onboarding was incomplete; confirmed onboarding completion is resumable (partial submit returns the real missing-fields list) and idempotent; confirmed the adversarial attempt to inject `onboarding_completed_at`/`user_id` directly through `POST /api/onboarding/trust/complete` had no effect (whitelist holds); confirmed `GET status` without an auth header returns `401`. Security Advisor re-run post-migration: only the pre-existing `auth_leaked_password_protection` WARN (already classified in EVENT-6 Fase 2 as pending an admin/business decision) — **no new finding introduced by TRUST-1**.

**Real deployment risk that was live during this window, now resolved**: this code depends on `trust_onboarding` existing. Migration and code were applied/pushed together in the same authorized sequence, so DEV was never left in the broken state where the code is live but the table is missing.

### TRUST-2 checkpoint (identidad básica declarada — DONE in DEV, autonomous mission, pre-authorized end-to-end)

```text
develop:  5fa5bd4 — feat(trust): implement TRUST-2 — identity básica declarada (RUT chileno + edad 18+)
Pushed:   origin/develop bd8ea53..5fa5bd4
Migration: db/migrations/2026-08-27_trust2_identity.sql applied to rifex-dev — verified: rut_normalized/rut_declared_at columns exist, format CHECK present, unique partial index present, RLS/grants unchanged (still zero for anon/authenticated/PUBLIC)
Deploy:   rifex-frontend-main auto-deployed from the develop-branch git integration
Verdict:  TRUST-2 COMPLETO in DEV. PROD and main untouched.
```

Unlike TRUST-1 (which needed a Fase 9 checkpoint and Rodrigo's explicit "autorizado"), this mission's authorization list pre-cleared the entire sequence — audit, code, migration creation, applying it in `rifex-dev`, disposable fixtures, adversarial tests, commit+push to `origin/develop`, and the automatic `develop` deploy — so it ran to completion without an intermediate stop, exactly as instructed ("Rodrigo está agotado ... trabaja autónomamente"). Human UI testing is deliberately deferred: `PRUEBAS HUMANAS PENDIENTES PARA EL FIN DE SEMANA — RODRIGO DESCANSADO`.

Implemented: `rut_normalized`/`rut_declared_at` added to the SAME `trust_onboarding` row TRUST-1 already uses (never a new table — inherits RLS default-deny total automatically, avoids duplicating `legal_name`/`birth_date`/`phone` TRUST-1 already captures); Chilean RUT modulo-11 check-digit validation + canonical normalization + masking in `src/lib/trustIdentityPolicy.js`; superset gate `assertCreatorEligible` (`src/lib/trustIdentityGate.js`) replaced `assertOnboardingComplete` across the same 12 sensitive endpoints TRUST-1 already protected (Rifas/Colectas/Eventos create/edit/publish/staff/ticket-types) — now also requires declared 18+ and, for Chile only, a format-valid declared RUT. `age_verified`/`identity_verified`/`phone_verified` are literal `false` from `getIdentityStatus` — no column, no code path, nothing in TRUST-2 can ever write them. New `POST /api/onboarding/identity/rut`; `GET /api/onboarding/trust/status` extended with an `identity` block; `/registro/continuar` gained a conditional RUT step (Chile only, via the same `users_profile.country_code` RLS-permitted client read `countryOnboarding.js` already used elsewhere).

**Real bug found adversarially in DEV and fixed in the same session**: `upsertIdentityRut` originally used `.update()`, which silently no-ops (0 rows affected, no error) when the calling user has no `trust_onboarding` row yet (e.g. calling the RUT endpoint before ever completing TRUST-1) — the client got `200 OK` while nothing was actually saved. Caught live with a real fixture that skipped TRUST-1 first. Fixed to `.upsert()` with `onConflict: 'user_id'`, the same pattern `upsertOnboardingFields` already used. A regression test was added.

**Live verification in rifex-dev**, two rounds of disposable `@example.com` fixtures (deleted after each round, zero residual rows confirmed across `trust_onboarding`/`rifas`/`auth.users`): isolated `403 identity_incomplete` confirmed when RUT is missing for a Chilean user with country+TRUST-1 already satisfied; invalid RUT rejected; valid RUT in three input formats (dots/dash, plain, spaced) all normalize identically; `creator_eligible` flips to `true` only once the RUT is declared; declaring a minor's birth date afterward correctly flips `creator_eligible` back to `false` with `age_requirement_not_met`, while TRUST-1's `complete` stays `true` (states stay correctly separated); the `rut_normalized`/`age_verified`/`identity_verified`/`user_id` injection attempt through the RUT endpoint had zero effect; **a second fixture's attempt to declare the exact RUT the first fixture already held returned a real `409 rut_conflict` against Postgres's actual unique index** — confirmed the constraint is live, not just unit-tested against a mock, and confirmed the response never revealed whose RUT it was. Security Advisor re-run post-migration: only the same pre-existing `auth_leaked_password_protection` WARN — **no new finding introduced by TRUST-2**. 36 new tests (`npm run test:trust-identity`) plus full regression (`test:trust-onboarding` 29/29, `test:event-analytics` 31/31, `test:scanner-controller` 4/4, `npm run build`) clean, both before and after the migration.

### TRUST-3A checkpoint (private document verification, manual review — DONE in DEV, autonomous mission, pre-authorized end-to-end)

```text
develop:  f2f018b — feat(trust): implement TRUST-3A — private document verification, manual review (persons only)
Pushed:   origin/develop 1f388b7..f2f018b
Migrations: db/migrations/2026-08-27b_trust3a_identity_verification.sql (tables, bucket, columns) + 2026-08-27c_trust3a_fix_user_deletion_fks.sql (real bug fix, see below) — both applied to rifex-dev
Deploy:   rifex-frontend-main auto-deployed from the develop-branch git integration
Verdict:  TRUST-3A COMPLETO in DEV. PROD and main untouched.
```

Same mission structure as TRUST-2: fully pre-authorized (audit, code, migrations, bucket, applying in `rifex-dev`, disposable fixtures/fake documents, adversarial tests, commit+push to `origin/develop`, automatic `develop` deploy), ran to completion without an intermediate stop. `PRUEBAS HUMANAS PENDIENTES PARA EL FIN DE SEMANA — PRUEBA MANUAL DE TRUST-1, TRUST-2 Y TRUST-3A CON RODRIGO DESCANSADO`.

Implemented: `trust_identity_verifications` (one case per user, explicit state machine in `src/lib/trustIdentityVerificationPolicy.js` — `not_started → draft → submitted → under_review → {approved | correction_required → submitted again | rejected} `, plus `revoked` from `approved`), `trust_identity_documents` (evidence, never overwritten — replacing a side marks the old row `superseded`), `trust_identity_audit_log` (append-only, a DB trigger rejects any application-level UPDATE/DELETE). Private Storage bucket `trust-documents` (`public: false`, zero `storage.objects` policies reference it — default-deny by omission, confirmed live against real anon/authenticated calls, not just SQL inspection). Real defensive image pipeline with `sharp` (`src/lib/trustIdentityDocumentProcessing.js`): real magic-byte sniffing (never the client's Content-Type), explicit input-pixel limit, explicit dimension cap, full re-encode to JPEG (EXIF discarded, orientation normalized), SHA-256 hash for controlled de-duplication. Review queue gated by the SAME real admin primitive already used by `/api/admin/*` (`resolveAdmin`, `app_metadata.role === 'admin'` — no new role system invented, per this mission's explicit instruction). `identity_verified`/`age_verified` are now real columns on `trust_onboarding` — the ONLY code that can write them is `recordDecision`'s `approve` action, which requires two explicit human confirmation checkboxes (no OCR exists, so that confirmation IS the verification). Two-level policy kept explicit and still off: `creator_eligible_basic` (TRUST-2) unchanged; `creator_identity_verified` (TRUST-3A) exists but `isIdentityVerificationRequiredForCreators()` stays `false` — activating it is a pending business decision, not a side effect of this build. Organizations explicitly excluded — `account_type=organization` gets "Verificación de organizaciones próximamente", never the personal-cédula flow (reserved for TRUST-4). UX: `/trust/verificar` (titular), `/panel/admin/trust` + `/panel/admin/trust/[userId]` (review queue + decision, minimal).

**Two real bugs found adversarially in DEV and fixed in the same session**: (1) `start.js` selected a `country_code` column from `trust_onboarding` that has never existed there (it lives on `users_profile`) — the query errored silently (only `data` was destructured, never `error`), so `account_type` resolved `undefined` and **every real person was rejected as if they were an organization**. Fixed to select only `account_type` from the correct table, with the query error now checked and fail-closed. (2) The audit-log immutability trigger blocked the legitimate `DELETE` cascade Postgres issues when an `auth.users` row with any TRUST-3A history is deleted — **deleting any account that had touched TRUST-3A became impossible**, discovered live while cleaning up fixtures. Fixed with a follow-up migration: the audit log no longer has a cascading FK to `auth.users` (the history now intentionally survives account deletion — the correct posture for an audit trail), and `reviewer_id`/`identity_verified_by` became `ON DELETE SET NULL`.

**Live verification in rifex-dev**, four disposable `@example.com` fixtures (one admin, three person accounts) with synthetic JPEG documents generated via `sharp`, each visibly labeled "DOCUMENTO FICTICIO — SOLO PRUEBA" (deleted after, zero residual rows confirmed across all three tables + `auth.users` + `storage.objects`, including the audit-log rows themselves — those were cleaned as an explicit DBA operation, temporarily disabling the immutability trigger, that application code can never do): full happy path (start → upload both sides → submit → admin queue → atomic claim → approve with both confirmations → `identity_verified`/`age_verified` real `true` with `identity_verified_method: 'manual_document_review'`); correction_required → re-upload → resubmit → re-claim cycle; reject as a terminal state (`identity_verified` never touched, further submit blocked); a concurrent double-decision attempt on the same case correctly lost to the atomic `WHERE status='under_review'` update; an admin was correctly blocked from approving their own case (`403 cannot_review_own_case`); anonymous and authenticated-non-owner direct Storage access (list + download) to the bucket both confirmed blocked **against real Supabase Storage**, not just SQL inspection; a fake-extension text file, a real PDF, a corrupted JPEG, an oversized-dimension image, and a JPEG with an appended non-image payload ("polyglot") were all rejected or cleaned correctly. Security Advisor re-run after both migrations: only the same pre-existing `auth_leaked_password_protection` WARN — **no new finding introduced by TRUST-3A**. 43 new tests (`npm run test:trust-identity-verification`, including real `sharp` image-processing tests, not mocked) plus full regression (143/143 across all suites) and `npm run build` clean.

**Real gap, explicitly not closed in this phase**: no automatic expiration/purge job exists yet for documents or cases — `expires_at` is a provisional 2-year placeholder with nothing enforcing it. Document images remain in Storage indefinitely until a real retention job is built (TRUST-3B or a dedicated retention phase) — see `docs/trust/TRUST_DATA_RETENTION_MATRIX.md` for the honest deviation from the original "don't retain the image" design intent.

### Corrección canónica checkpoint (Mercado Pago como control principal + onboarding simplificado — DONE in DEV, autonomous overnight mission, pre-authorized end-to-end)

```text
develop:  0cc59dc — feat(trust): Mercado Pago como control principal + simplifica onboarding
Pushed:   origin/develop 5f41858..0cc59dc
Migrations: db/migrations/2026-08-28_mp_identity_match_onboarding_correction.sql — applied to rifex-dev
Deploy:   rifex-frontend-main auto-deployed from the develop-branch git integration
Verdict:  ONBOARDING MP COMPLETO in DEV. PROD and main untouched. No commits or prior migrations reverted — purely additive/corrective forward.
```

Rodrigo's decision, worked autonomously overnight while he slept, system-permission-only, no manual testing requested: Mercado Pago becomes the primary control that closes creator onboarding — Rifex compares (when the API allows it) the RUT declared in Rifex against the RUT of the connected Mercado Pago account's owner. TRUST-3A remains an exceptional fallback, never the default flow, `isIdentityVerificationRequiredForCreators()` unchanged (`false`).

**Onboarding simplified**: `birth_date` eliminated entirely (capture, storage, calculation, presentation) — confirmed 0 real rows in `rifex-dev` before dropping the column, replaced by a versioned boolean declaration (`adult_declared`/`adult_declared_at`/`adult_declaration_version`, current `adult-declaration-v1.0`) — never presented as `age_verified`. The `account_type` selector replaced by two fields (`person_name`/`organization_name`, exactly one must be filled) — `legal_name` dropped (also confirmed 0 real rows), `account_type` still exists as a column but is now derived server-side from which name field is filled, never trusted from the client. Phone simplified to a Chilean-specific 9-digit widget (fixed `+56` prefix, normalizes to E.164).

**Mercado Pago audit (Fase 4)**: could not empirically confirm whether `GET /users/me` returns an identification/RUT field for Chile — Mercado Pago's official docs blocked every automated fetch attempt (403), and this environment has no Mercado Pago app credentials configured to test against a live sandbox. Full detail in `docs/trust/MP_IDENTITY_MATCH_AUDIT.md`. The match code (`src/lib/mpIdentityMatchGate.js`, `extractMpRutFromUsersMe`) was written defensively: reads the field if present, never invents a match if absent (`unavailable` state, never blocks) — someone with real Mercado Pago credentials still needs to confirm the actual behavior, flagged in `docs/trust/TRUST_DECISIONS_FOR_RODRIGO.md`.

**New real control**: `merchant_gateways` gained `mp_identity_match`/`mp_identity_matched_at`/`mp_identity_match_reason`/`mp_match_rule_version`, plus a real unique index (`provider, mp_user_id) WHERE revoked_at is null` — confirmed live that a second Rifex account cannot claim an already-linked Mercado Pago account. `assertCreatorEligible` (TRUST-2's gate) now also requires, for Chile, a connected + `matched`/`unavailable` Mercado Pago account — `mismatch`/`needs_review` block, `not_connected`/`checking` block, `unavailable` never blocks. Changing the declared RUT invalidates any previous match (confirmed live — an adversarial test sequence accidentally proved this working correctly mid-session). Disconnecting invalidates the match (`disconnected` state).

**Live verification in rifex-dev**, two disposable `@example.com` fixtures (one person, one organization; deleted after, zero residual rows across `trust_onboarding`/`merchant_gateways`/`auth.users`/`rifas`/`events`): isolated `403 mp_not_connected` confirmed when everything else (onboarding, RUT, age) was already satisfied; simulated `matched`/`mismatch`/`unavailable`/`disconnected` Mercado Pago states via direct service-role fixtures (no real Mercado Pago OAuth handshake was possible without credentials) all produced the exact correct gate behavior; the real Postgres unique constraint on `mp_user_id` fired correctly when a second account attempted to claim an already-linked one; direct `/api/mp/status` confirmed `identity_match` is exposed without ever exposing the raw RUT. Security Advisor re-run: only the same pre-existing `auth_leaked_password_protection` WARN — no new finding. 15 new tests (`npm run test:mp-identity-match`) plus the trust-onboarding/trust-identity suites fully rewritten for the new fields, full regression (174/174 across all suites) and `npm run build` clean.

**Documentation-only additions**: `/seguridad` public page (linked from the footer) explaining real security measures honestly, without absolute claims; `docs/trust/META_ANTIFRAUD_STATEMENT.md` for Meta ad-account/business-verification requests; "Términos del Creador" section of `/terminos` substantially expanded (prize existence/ownership, evidence preservation, cooperation with authorities, participant/winner rights, phone-usage limits, non-disclosure of private data to third parties) marked `PENDIENTE DE REVISIÓN POR ABOGADO CHILENO ANTES DE PROD`; 2FA decision recorded (optional for creators now, should be mandatory for admins/reviewers before production, not implemented) in `docs/trust/TRUST_DECISIONS_FOR_RODRIGO.md`.

**Real, honest limitation**: the actual behavior of Mercado Pago's `/users/me` for Chile was never confirmed live in this session — whoever continues this work with real Mercado Pago credentials must connect a real test account and verify whether the identification field is actually present before treating this control as fully proven in practice.

### Adversarial audit checkpoint (read-only, no fixes applied — see `docs/trust/TRUST_MP_ADVERSARIAL_AUDIT_2026-08.md`)

**Verdict: `GO CON CONDICIONES`.** A dedicated audit-only mission (2026-08-29, autonomous, Rodrigo resting, no live DEV writes) found a real, demonstrated **critical fail-open**: `assertCreatorEligible` (`src/lib/trustIdentityGate.js`) uses a blocklist for `mp_identity_match` instead of an allowlist — a `NULL` value (reachable in practice: `oauth/callback.js` sets `status: 'connected'` before calling `resolveMpIdentityMatch` separately in a try/catch that "never blocks the flow if it fails," so a transient failure there leaves `mp_identity_match` permanently `NULL`) passes the gate exactly like `'matched'`, while `getIdentityStatus` correctly reports `creator_eligible: false` for the same data — a real, confirmed inconsistency between the enforcement gate and the UI. Reproduced with an isolated local test now permanently in `tests/trustIdentityGate.test.mjs`. Also found: the `unavailable` state design (never blocks) genuinely conflicts with this audit's requested policy ("unavailable must route to review, never approve silently") — a product decision for Rodrigo, not a bug; the OAuth callback logs the full `state` row (including the PKCE `code_verifier` secret and creator email) in an edge case (`callback.js:42`); a `mismatch` detected after publishing doesn't pause checkout for that already-published initiative; the three `upload-photo.js` endpoints (rifas/colectas/events) aren't gated by `assertCreatorEligible`. Full detail, severities, and proposed minimal fixes (none applied) in the audit report. 175/175 tests pass (174 existing + 1 new adversarial regression documenting the critical finding). No code, migrations, or DEV data changed — read-only audit + one new test file.

### NEXT (exact)

```text
NEXT: fix the CRITICAL fail-open found by the 2026-08-29 adversarial audit (docs/trust/TRUST_MP_ADVERSARIAL_AUDIT_2026-08.md, section 2) BEFORE any further Trust work or human testing with real accounts — assertCreatorEligible allows creation when mp_identity_match is NULL, treating it like 'matched'. Also pending from that audit: Rodrigo's decision on the 'unavailable' policy (section 3.1), the code_verifier logging fix (section 3.2), and the other proposed minimal corrections (section 18) — none applied yet, audit-only mission. EVENT-7 — not scoped, not authorized. Urgent, independent of Events, PC-de-escritorio-only: verify/fix create_tickets_for_raffle grants in PROD (see docs/handover/HANDOVER_NOTEBOOK_TO_DESKTOP_2026-08.md, section 5). TRUST-1, TRUST-2, TRUST-3A and the Mercado Pago identity-match correction are DONE in DEV (code + migrations applied + pushed + deployed) — TRUST-3B/TRUST-4 onward not authorized, not started. Urgent real follow-up: confirm with real Mercado Pago credentials whether /users/me actually returns identification for Chile (docs/trust/MP_IDENTITY_MATCH_AUDIT.md). Human UI testing is scheduled for this weekend with Rodrigo rested. A new Events backlog item was recorded (docs/events/EVENTS_BACKLOG.md) — documentation only, not part of EVENT-7. PROD promotion of Events and of Trust — a business decision, reserved for Rodrigo.
```

Before any further Events work: rotate the `rifex-dev` DB password (risk 8 below, still pending), do a real-device scanner smoke test if not already done (risk 10 below), confirm the real Vercel plan/Fluid Compute setting for `rifex-frontend-main`/`rifex-frontend-v2` (still unconfirmed, no non-interactive dashboard access this session either), and — urgently, desktop-PC-only — check whether PROD's `create_tickets_for_raffle` has the same dangerous grant.

**Canonical specs**: `docs/events/EVENT4_STAFF_SCANNER_CHECKIN.md` (EVENT-4, certified), `docs/events/EVENT5_ANALYTICS_XLSX.md` (EVENT-5, **CERTIFIED**), `docs/events/EVENT6_SECURITY_AUDIT.md` (EVENT-6 Fase 1), `docs/events/EVENT6_SECURITY_AUDIT_FASE2.md` (EVENT-6 Fase 2 — inherited WARN audit + promotion package), and `docs/trust/RIFEX_TRUST_CANONICAL_DESIGN.md` (Rifex Trust — TRUST-1/TRUST-2/TRUST-3A implemented in DEV, TRUST-3B/TRUST-4+ still design only).

### Reentry Notebook Procedure (Antofagasta)

Steps for a new machine, in order — stop and report if any step contradicts what's documented above rather than pushing forward:

1. Clone the repo if not already present: `https://github.com/ravymaster/rifex-frontend-v2.git`.
2. `cd` into the repo.
3. `git checkout develop`.
4. `git fetch origin`.
5. `git pull --ff-only origin develop`.
6. Verify `git rev-parse HEAD` is the EVENT-4 commit (`docs(events)`/`feat(events): add staff scanner and atomic check-in` on top of `725c4f8`) or a descendant. If it does not match, stop and reconcile against this document before touching anything.
7. `npm ci` (or `npm install`) if `node_modules` is missing/stale.
8. Configure the DEV environment **without ever committing secrets to Git**. Variable **names** needed (values must be transferred out-of-band, e.g. password manager or secure note — never pasted into a doc or commit): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (or the `SUPABASE_DEV_*` equivalents already scaffolded in this repo's env pattern — prefer those explicitly for DEV to avoid the PROD-pointing footgun above), `NEXT_PUBLIC_BASE_URL`, `MP_ACCESS_TOKEN`, `MP_CLIENT_ID`, `MP_CLIENT_SECRET`, `MP_PUBLIC_KEY`, `MP_REDIRECT_URI`, `MP_WEBHOOK_SECRET`, `ENABLE_EMAILS`, `RESEND_API_KEY`, `EMAIL_FROM`, `NEXT_PUBLIC_STAGE`, `HCAPTCHA_SECRET`, `NEXT_PUBLIC_HCAPTCHA_SITEKEY`, `ADMIN_API_TOKEN`, `DEV_TEST_EMAIL_TOKEN`, `CREATOR_FALLBACK_EMAIL`, `HOLD_MINUTES`.
9. Start the app locally (`npm run dev`) or work directly against the deployed DEV preview at `rifex-frontend-main.vercel.app` — both are valid, the deployed one requires no local secrets at all for read-only exploration.
10. Verify connectivity to DEV specifically (not PROD) — e.g. `supabase migration list --project-ref nwxrvwbzqbhznscyirbq` (expect the CLI to report the pre-EVENT-4 migrations as remote-only, `"local":""` — this is expected, not an error, see Risks/pending item 9 above; `db/migrations/2026-08-25b_event4_staff_scanner_checkin.sql` was applied manually via the SQL Editor, not via this CLI).
11. Read, in order: this WOP section, `docs/CURRENT_STATE.md`, `docs/handover/HANDOVER_RIFEX_CURRENT.md` (legacy but still has the pre-Events incident history), `docs/events/EVENT4_STAFF_SCANNER_CHECKIN.md`, and this file's Architecture Map / Invariants / Risks sections above.
12. Run a preflight: confirm `origin/develop` HEAD, confirm `origin/main` unchanged, confirm no stray working-tree diffs.
13. EVENT-4 is DONE. Before scoping anything further (EVENT-5 or otherwise): confirm with the user whether the `rifex-dev` DB password was rotated (Risks/pending item 8) and whether a real-device scanner smoke test happened (item 10) — neither was true as of this checkpoint.

### Reentry Prompt (paste verbatim into a new Code/Claude session tomorrow)

```text
Estamos retomando Rifex desde un equipo nuevo (Antofagasta), sesión sin memoria conversacional previa.
No uses memoria de conversación como autoridad — la autoridad es el repo (Git) y docs/WOP.md.
Repo: https://github.com/ravymaster/rifex-frontend-v2.git, branch develop.
Ejecuta el procedimiento "Reentry Notebook Procedure" de docs/WOP.md (sección "RIFEX CURRENT STATE").
Lee en orden: docs/WOP.md (sección RIFEX CURRENT STATE), docs/CURRENT_STATE.md, docs/handover/HANDOVER_RIFEX_CURRENT.md.
Verifica: git fetch, HEAD real de develop (debe incluir EVENT-5 certificado sobre EVENT-4/725c4f8, o un descendiente), origin/main (c944bb3 o su descendiente — si cambió, alerta antes de seguir), git status.
Reconstruye el estado real de EVENT-1/EVENT-2/EVENT-3/EVENT-4/EVENT-5 a partir del repo, no de esta instrucción.
Confirma que EVENT-4 y EVENT-5 están DONE-CERTIFICADOS, y que EVENT-6 Fases 1 y 2 (auditoría autónoma) están COMPLETADAS con veredicto GO — revisa si el hallazgo crítico de create_tickets_for_raffle ya fue verificado/corregido en PROD (acción urgente, solo desde el PC de escritorio en Santiago, ver docs/handover/HANDOVER_NOTEBOOK_TO_DESKTOP_2026-08.md). Confirma también que Rifex Trust TRUST-1, TRUST-2, TRUST-3A, y la corrección canónica de Mercado Pago como control principal (onboarding sin fecha de nacimiento, con persona/organización derivado, y con coincidencia RUT↔Mercado Pago) están COMPLETOS en rifex-dev (código, migraciones aplicadas, bucket privado, pruebas en vivo, deploy) — TRUST-3B/TRUST-4 en adelante (OCR, biometría, organizaciones, apelaciones, retención) sigue siendo diseño puro, no autorizado sin que Rodrigo revise docs/trust/TRUST_DECISIONS_FOR_RODRIGO.md. Verifica con credenciales reales de Mercado Pago si /users/me realmente entrega identificación para Chile (docs/trust/MP_IDENTITY_MATCH_AUDIT.md) — nunca se confirmó en vivo. Confirma si ya se hicieron las pruebas humanas de interfaz de todo lo anterior, agendadas para el fin de semana del 2026-08-27 en adelante. NEXT es EVENT-7, todavía sin alcance ni autorización.
Confirma si la rotación de la contraseña de rifex-dev y el smoke test real de cámara ya se hicieron (WOP, Risks/pending y "NEXT (exact)") — probablemente no.
No modifiques código todavía.
Entrégame un REENTRY REPORT (branch, HEAD, origin/develop, origin/main, git status, resumen EVENT-1/2/3/4/5, riesgos pendientes, NEXT) y detente ahí.
```

### END CURRENT STATE

---

## Current Documentary State

| Gate | Status |
|---|---|
| PRE-ALIGNMENT AUDIT | GO |
| ALIGNMENT A1 | GO |
| ALIGNMENT A2 | GO |
| CHECKPOINT A2 | GO |
| ALIGNMENT A3 | GO |
| ALIGNMENT A4 | GO |
| ALIGNMENT A5 | GO |
| ALIGNMENT | CLOSED - GO |
| ARCHITECTURE AUDIT AA1 | GO |
| ARCHITECTURE AUDIT AA2 | GO |
| ARCHITECTURE AUDIT AA3 | GO |
| ARCHITECTURE AUDIT DOCUMENTATION READY | YES |
| ARCHITECTURE AUDIT | CLOSED - GO |
| ARCHITECTURE DESIGN AD1 | GO |
| ARCHITECTURE DESIGN AD1 ADVERSARIAL REVIEW | GO |
| ARCHITECTURE DESIGN AD1 CORRECTION | GO |
| ARCHITECTURE DESIGN AD2 | GO |
| ARCHITECTURE DESIGN AD3 | GO |
| ARCHITECTURE DESIGN CLOSING GATE | GO |
| ARCHITECTURE DESIGN DOCUMENTATION READY | YES |
| ARCHITECTURE DESIGN | CLOSED - GO |
| R4 SPRINT READINESS | GO |
| SPRINT R4 | CLOSED - GO |
| SPRINT | R4 CLOSED; OTHER SPRINTS NOT YET OPEN / NOT AUTHORIZED |
| DB RECOVERY | DONE — 2026-08-14/15, informal/incident-driven, not via a Sprint packet (see Current Stage below) |
| MERCADO PAGO DIRECT CHECKOUT | CONFIRMED FUNCTIONAL IN PRODUCTION |
| ARCHITECTURE AUDIT — FRONTEND/LOGIC SEPARATION | OPEN - AUTHORIZED (2026-08-15) |


## Next Eligible Stage

```text
SPRINT R4: CLOSED — GO
DB RECOVERY: DONE (informal, incident-driven)
NEXT ELIGIBLE STAGE: ARCHITECTURE AUDIT — FRONTEND/LOGIC SEPARATION
ARCHITECTURE AUDIT — FRONTEND/LOGIC SEPARATION: OPEN - AUTHORIZED
OTHER SPRINTS: NOT AUTHORIZED
```
## Official Project States

| State | Meaning |
|---|---|
| BEGIN | New project initialization |
| ALIGNMENT | Reconstruction of an existing project before changing behavior |
| ARCHITECTURE AUDIT | Analysis of real architecture; no implementation |
| ARCHITECTURE DESIGN | Future architecture design; no implementation |
| SPRINT | Authorized implementation cycle |
| RELEASE AUDIT | Verification before commit/push |
| PAUSED | Work intentionally stopped |
| PRODUCTION | Production operation state |
| MAINTENANCE | Controlled maintenance |
| LEGACY | Legacy state or component |

## Current Stage

Rifex has closed `ALIGNMENT`, `ARCHITECTURE AUDIT` and `ARCHITECTURE DESIGN`. Architecture Design AD3 is documented with `GO`, Architecture Design Closing Gate is `GO`, R4 Sprint Readiness is `GO`, and Sprint R4 (Build Baseline Recovery) is `CLOSED - GO`: implemented, Release Audit confirmed GO, committed and pushed at HEAD `bbaf8a0` (`fix: restore checkout page build`).

**DB Recovery — done, but not through the formal Sprint packet process.** On 2026-08-14/15, the user disclosed that the original production Supabase project (`huoepoxuqaodfgbtbalb`) had been deleted directly in Supabase (not through this repository). This was discovered mid-session, confirmed live (`rifex.pro/api/rifas` returning `TypeError: fetch failed`), and constituted an active production incident, not a planned Sprint. Recovery was executed through direct, explicitly authorized, turn-by-turn user instruction rather than a pre-written packet: Vercel's production `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` were repointed to a new Supabase project (`wrdkdfuiwlujfxxijpao`, already provisioned earlier the same session for local sandbox testing via `db/restore/001_schema_supabase_clean.sql`), all sandbox/test rows were purged from it first, and production was confirmed restored to a genuinely empty, functional state. This is recorded as `DONE`, not as a closed Sprint — the WOP's Git Rules and Stage Change Process were not fully followed (no packet, no isolated Sprint commit boundary) because incident response took priority over ceremony. See `docs/handover/HANDOVER_RIFEX_CURRENT.md` for the full evidence trail.

Two code fixes were also implemented and pushed the same session, each independently verified against real data before commit: `webhook_events` was never written to despite the table, its unique index and its `event_id` builder already existing (`7e8e6b7`); `mp/disconnect.js` only cleared 8 of 13 credential columns, leaving a live `mp_refresh_token` behind after "disconnecting" (`1aa97cd`). Both were found live, not from static review.

**Production Validation, 2026-08-15.** After DB recovery, a real end-to-end purchase was completed on `rifex.pro`: a newly registered real Rifex account created a real raffle, the user's own real Mercado Pago account was connected as the seller via OAuth (no environment mismatch — this only reproduces cleanly in real production, not in sandbox, see Critical Risks), and a different real Mercado Pago account completed payment. Ticket sold, purchase approved, payment recorded, a real Mercado Pago webhook was received and logged, buyer/creator emails sent. This is the first `CONFIRMED FUNCTIONAL` evidence for the Mercado Pago checkout flow in this repository's documented history.

This does not certify every flow, does not adopt the three preserved recovery/hardening diffs (which, correction: are already part of `main` at HEAD — see Baseline Decision below), does not implement Mercado Pago split payments (requires direct engagement with Mercado Pago's commercial team, not a code or certification path — see `docs/handover/HANDOVER_RIFEX_CURRENT.md`), and does not by itself authorize the newly opened Architecture Audit beyond its stated scope (frontend/logic separation, in preparation for a UI/UX redesign — explicitly authorized by the user on 2026-08-15).

## Baseline Decision

```text
PROPOSED BASELINE DECISION: C
```

Decision C is the documentary baseline decision approved during Alignment A1 and carried forward through the A2 checkpoint. HEAD `1aa97cd43e63649d2d17255a42ee71600e631315` is the current confirmed HEAD (`fix: clear all credential fields on MP disconnect, not just half`). `bbaf8a02d2ff3681186e8f84317ce1c7cdd064ee` (`fix: restore checkout page build`), the R4 implementation commit, is an ancestor of HEAD. Previous citations (`b46ef9d`, `48013ce`, `bbaf8a0`, `1fc064a`) each lagged the real HEAD because the commit that closed a gate did not bump its own self-citation — a recurring pattern in this repository; see `docs/audits/EXECUTION_ENVIRONMENT_AUDIT.md` for the first reconciliation (`STALE, NOT CORRUPTED`, no diverged history). Correction to a separate stale claim: `mailer.js`, `reconcile-payments.js` and `webhook.js` are **not** an outstanding working-tree diff — `git diff --stat` against HEAD for those three files is empty; they are ordinary committed files in `main`. That claim was already stale before this session began. The PostgreSQL backup corresponds to the original Supabase project, which has since been deleted (see Current Stage) — it is now the only surviving evidence of that project's data, and remains sensitive evidence outside the Git baseline. R4 build-success is confirmed; beyond that, the Mercado Pago checkout flow is now `CONFIRMED FUNCTIONAL` in production (see Current Stage, Production Validation) — a materially stronger claim than "build-success only," scoped specifically to that flow.

| Layer | Status |
|---|---|
| HEAD `1aa97cd` | CONFIRMED current HEAD (fix: clear all credential fields on MP disconnect, not just half) |
| R4 implementation commit `bbaf8a0` | CONFIRMED ancestor of HEAD (fix: restore checkout page build) |
| `webhook_events` fix `7e8e6b7` | CONFIRMED; verified live with a real Mercado Pago webhook in production |
| `mp/disconnect.js` fix `1aa97cd` | CONFIRMED; verified by seeding all 13 credential columns and confirming full clear |
| Supabase project | CONFIRMED changed: original (`huoepoxuqaodfgbtbalb`) deleted by the user outside this repo; current baseline is `wrdkdfuiwlujfxxijpao`, used by **both** production and local dev — architecture gap, not target state |
| PostgreSQL backup | CONFIRMED sensitive evidence outside Git baseline; corresponds to the deleted project, not the current one |
| A2 documents | CONFIRMED documentation materialization |
| Architecture Audit documents | CONFIRMED documentation materialization |
| Architecture Design AD3 report | CONFIRMED documentation materialization |
| R4 Sprint packet | CLOSED - GO; implemented at `bbaf8a0`, `npm run build` passes |
| Production Validation | CONFIRMED 2026-08-15; real seller, real buyer, real webhook — see Current Stage |
| Recovery decision | B: split recovery into R4, DB, R1, R2, R3 Technical and Fees Policy; DB unit executed informally (incident-driven), R1/R2/R3/Fees Policy still not authorized |

## Recovery Sequence

```text
R4 -> DB Recovery Contract -> R1 -> R2 -> R3 Technical -> Fees Policy -> Release Audits -> Separate Commits
```

This sequence is approved as a recovery plan, not as implementation. Recovery changes must not be implemented before Architecture Design and an explicitly authorized Sprint.

## Alignment Closing Criteria

Alignment may close when product identity, Git baseline, working tree ownership, current architecture, domain, database, security, known risks and recovery plan are documented with no unresolved integrity uncertainty.

Condition to open Architecture Design: Architecture Audit must be closed with `GO`, the current dirty working tree must remain explained, and the user must explicitly authorize Architecture Design.

## Known Working Tree

`src/lib/mailer.js`, `src/pages/api/admin/reconcile-payments.js` and `src/pages/api/checkout/webhook.js` were previously described here as "pre-existing functional diffs." Correction: they are ordinary committed files in `main` at HEAD, with no working-tree diff (`git diff --stat` against HEAD is empty). That description was already stale before this session began.

Sensitive artifact:

- `db_cluster-10-11-2025@05-41-59.backup.gz` — corresponds to the original Supabase project (`huoepoxuqaodfgbtbalb`), deleted 2026-08-14/15. It is now the only surviving evidence of that project's data. Still outside the Git baseline; do not inspect, move or delete without a specific mission.

New untracked artifact:

- `db/restore/001_schema_supabase_clean.sql` — the schema-provisioning script actually used to build the current Supabase project (`wrdkdfuiwlujfxxijpao`), now serving both production and local dev. Untracked as of HEAD `1aa97cd`; should be committed, since it is no longer just a sandbox artifact.

## Blockers And Limits

| Item | Classification |
|---|---|
| Functional verification | PARTIAL — Mercado Pago direct-collection checkout CONFIRMED FUNCTIONAL in production (2026-08-15); other flows remain UNVERIFIED |
| DB remote state | CONFIRMED (new project `wrdkdfuiwlujfxxijpao`, schema applied, empty of legacy data, currently serving both production and local dev) |
| Canonical ticket/purchase/payment states | CONTRADICTORY claim inherited from prior audits of the now-deleted original project; not re-verified against the new project's data model, which was restored from the same schema and is presumed to carry the same contradiction until checked |
| Mercado Pago split payments (1:N) | NOT AVAILABLE; requires direct engagement with Mercado Pago's commercial team, not a code change or self-service certification |
| Sandbox testing of Mercado Pago OAuth-connected-seller flow | BLOCKED as currently configured — the app has no sandbox-specific OAuth Client ID/Secret, so any OAuth-connected token comes back tied to the production Client ID (`APP_USR-` prefix, not `TEST-`), causing an environment mismatch when paired with a sandbox buyer. Only verified working in real production |
| Architecture Audit | CLOSED - GO |
| Architecture Design | CLOSED - GO |
| R4 Sprint Readiness | GO |
| Sprint R4 | CLOSED - GO |
| DB Recovery | DONE — informal, incident-driven, 2026-08-14/15 |
| Architecture Audit — Frontend/Logic Separation | OPEN - AUTHORIZED (2026-08-15) |
| Sprint | R4 CLOSED; OTHERS NOT YET OPEN / NOT AUTHORIZED |

## Rules For AI Agents

- Use the repository as source of truth.
- Distinguish facts, inferences, and proposals.
- Use `CONFIRMED`, `INFERRED`, `PROPOSED`, `UNKNOWN`, `UNVERIFIED`, `NOT IMPLEMENTED`, `NOT EVIDENCED`, `CONTRADICTORY`, and `BLOCKED`.
- Do not present code presence as functional verification.
- Do not mix HEAD with working tree diffs.
- Do not treat the backup as Git baseline.
- Do not expose secrets, personal data, or backup rows.
- Preserve user and previous-agent work unless explicitly authorized.

## Gate Values

| Gate | Meaning |
|---|---|
| GO | Evidence satisfies the stated gate |
| PARTIAL | Most work is complete but documented gaps remain |
| NO GO | Integrity, scope, or evidence failed |

## Git Rules

- No Sprint is complete without Release Audit.
- Closed work requires commit, push, HEAD verified, and clean working tree.
- Dirty working trees must be explained by category.
- Do not use destructive Git commands without explicit authorization.
- Do not stage, commit, or push during Architecture Design documentation materialization unless explicitly authorized.

## Stage Change Process

A later stage can open only when the current gate is reported and the user authorizes the next stage. Sprint R4 was explicitly authorized, implemented, release-audited GO, committed and pushed. DB Recovery was subsequently executed informally — not through this process — in direct response to a production incident (see Current Stage); it is `DONE`, not `CLOSED - GO` in the packet sense, and that distinction is preserved deliberately rather than retrofitted. The user has since explicitly authorized the next formal stage: `ARCHITECTURE AUDIT — FRONTEND/LOGIC SEPARATION` (2026-08-15), scoped to mapping business logic vs. presentation ahead of a UI/UX redesign — no redesign implementation is authorized yet.

## Resume Handover

| Item | Status |
|---|---|
| Recovery preservation | GO |
| Recovery branch | `recovery/rifex-hardening-preserved` |
| Recovery commit | `1c23702f401f8c501077ecfd265a213245e62a63` |
| Handover | `docs/handover/HANDOVER_RIFEX_CURRENT.md` |
| R4 | CLOSED - GO at ancestor `bbaf8a0` |
| DB Recovery | DONE (informal, incident-driven, 2026-08-14/15) |
| Production Validation | CONFIRMED 2026-08-15 — see Current Stage |
| Next eligible / open stage | Architecture Audit — Frontend/Logic Separation; OPEN - AUTHORIZED |

Recovery preservation keeps the R1/R2/R3 hardening work on its own branch, recoverable without adopting it into `main` — that decision is unaffected by today's events, since the branch's three files are already present in `main` at HEAD regardless (see Baseline Decision correction). DB Recovery is done, but through incident response rather than the packet process; R1/R2/R3/Fees Policy remain `NOT AUTHORIZED`. The currently open stage is the Architecture Audit into frontend/logic separation, authorized 2026-08-15, in preparation for — but not itself authorizing — a UI/UX redesign. See `docs/handover/HANDOVER_RIFEX_CURRENT.md` for the full narrative.

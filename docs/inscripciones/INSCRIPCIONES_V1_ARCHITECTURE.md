# INSCRIPCIONES V1 FREE — Arquitectura

**Fecha**: 2026-09-04 · Migración: `db/migrations/2026-09-04_inscripciones1_foundation.sql`, aplicada a `rifex-dev` (`nwxrvwbzqbhznscyirbq`) vía `scripts/dev-supabase.sh db query --file ... --project-ref nwxrvwbzqbhznscyirbq --linked`. `origin/main`/PROD nunca tocado.

## Auditoría de reuso de Eventos (Fase 0)

Clasificación de cada pieza auditada antes de implementar, por categoría:

| Pieza de Eventos | Clasificación | Resultado |
|---|---|---|
| `assertOnboardingComplete` (`trustOnboardingGate.js`) | REUSE DIRECT | Autoridad de onboarding general — cero lógica de RUT/MP. Usada tal cual en `POST /api/inscripciones` y `PATCH /api/inscripciones/[id]`. |
| `assertCreatorEligible` / `resolveCreationGate` | DO NOT REUSE | Exigen RUT/Mercado Pago — prohibido por el mandato para Inscripciones. |
| `createScannerController` (`scannerController.js`) | REUSE DIRECT | Máquina de guardas cliente-side genérica, sin acoplamiento a Eventos. |
| Patrón RLS default-grant + policy SELECT acotada (`events`) | ADAPT | Aplicado a `registration_activities`. |
| Patrón RLS `revoke all` (`event_tickets`/`event_staff`/`event_checkins`) | ADAPT | Aplicado a `registration_participants`/`registration_checkins`/`registration_free_usage`. |
| RPC atómica con `for update` (`create_event_order`/`check_in_event_ticket`) | ADAPT | Mismo patrón en `register_for_activity`/`check_in_registration_participant`. |
| Split `qr_token` opaco vs identificador legible | ADAPT (simplificado) | Inscripciones usa solo `qr_token` — sin equivalente a `ticket_number`, no hay necesidad de un identificador de soporte separado en V1. |
| `enforceRateLimit`/`resolveClientIp` (`rateLimit.js`) | REUSE DIRECT | Sin cambios. |
| `sendEmail` (`mailer.js`) | REUSE DIRECT | Envuelto en `registrationMailer.js`, hermano de `eventTicketMailer.js`. |
| `neutralizeFormulaInjection`/`formatEventDateTime` (`eventAnalytics.js`) | REUSE DIRECT | Genéricas, sin acoplamiento a Eventos — usadas en `registrationAnalyticsWorkbook.js`. |
| Técnica QR PNG (`qrcode`+`satori`+`sharp`+fuentes Inter empaquetadas) | ADAPT | Mismo mecanismo, branding/contenido propio. |
| `event_staff` + rol `door` + `find_user_id_by_email` | DO NOT REUSE (V1) | V1 es owner-only — agregar un staff equivalente habría duplicado una tabla completa para un producto todavía gratuito. Documentado como decisión, ampliable después sin tocar la RPC de check-in (solo su condición de autorización). |
| Country Gate (`countryGate.js`) | DO NOT REUSE | El mandato nunca menciona geografía para Inscripciones; el producto debe ser máximamente accesible sin dependencia financiera. |
| `eventCapacity.js` (triggers de aforo por suma de tipos de entrada) | DO NOT REUSE | Inscripciones tiene un pool plano único (no tipos de entrada) — el aforo se valida inline en `register_for_activity`, más simple por diseño. |

Nunca se reusó Eventos "en bloque": ninguna tabla de Eventos fue modificada, ninguna RPC de Eventos fue tocada, ninguna ruta de Eventos cambió de comportamiento.

## Modelo de datos

Cuatro tablas nuevas, independientes de `events`/`raffles`/`colectas`:

- **`registration_activities`**: la actividad. `organizer_id`, `plan` (`free`/`plus`/`gold`, CHECK), `capacity` (entero, NOT NULL), `status` (`draft`/`active`/`closed`/`archived`, CHECK), snapshot `organizer_name_snapshot`. RLS: grants por defecto de Supabase + policy `select` acotada a `status='active'` (mismo criterio que `events`) — el organizador ve sus propias actividades en cualquier estado vía la API (`service_role`, bypassa RLS).
- **`registration_participants`**: `activity_id`, `full_name`, `email`, `normalized_email` (autoridad real de duplicado, `UNIQUE(activity_id, normalized_email)`), `phone`, `qr_token` (`UNIQUE`, 64 hex — dos UUID sin guiones concatenados), `checked_in_at`, `checked_in_by`. RLS: `revoke all` — cero acceso público, ni de solo lectura.
- **`registration_checkins`**: auditoría insert-only de cada check-in exitoso (`UNIQUE(participant_id)` como defensa en profundidad; la autoridad primaria de consumo es `registration_participants.checked_in_at`, protegida por el lock de fila de la RPC). RLS: `revoke all`.
- **`registration_free_usage`**: ledger insert-only del cupo mensual FREE. `UNIQUE(organizer_id, period_key)` **es** la autoridad de concurrencia — nunca se borra, nunca se actualiza, sin política de acceso público. RLS: `revoke all`.

## RPCs atómicas (única autoridad real de escritura)

- **`create_free_registration_activity(...)`**: nunca acepta `plan`/`capacity` como parámetro — los hardcodea a `'free'`/`50` dentro de la función. Inserta la actividad y el consumo del cupo mensual en la misma transacción implícita: si `registration_free_usage` falla por `unique_violation`, todo el insert de la actividad se revierte (`raise exception 'free_quota_already_used'`, código `P0001`).
- **`register_for_activity(...)`**: `select ... for update` sobre la fila de la actividad ANTES de leer el conteo de confirmados — autoridad real de concurrencia del aforo. `UNIQUE(activity_id, normalized_email)` como defensa en profundidad para duplicados (capturado vía `unique_violation`).
- **`check_in_registration_participant(...)`**: resuelve y lockea el participante por `qr_token` primero; su `activity_id` real (nunca lo que mande el cliente para otro propósito) es la fuente de verdad para "pertenece a esta actividad". V1 owner-only: `activity.organizer_id = p_actor_user_id`.

Las tres funciones: `revoke execute ... from public, anon, authenticated; grant execute ... to service_role;` — inalcanzables salvo desde la API server-side.

## API (`src/pages/api/inscripciones/**`)

`POST /api/inscripciones` (crear, `assertOnboardingComplete`, nunca lee `plan`/`capacity` del body) · `GET /api/inscripciones/mine` (listado propio) · `GET`/`PATCH /api/inscripciones/[id]` (público solo si `active`; PATCH owner-only, nunca acepta `plan`/`capacity`/`status`/`organizer_id`) · `POST /api/inscripciones/[id]/publish` (draft→active) · `POST /api/inscripciones/[id]/status` (closed/archived) · `POST /api/inscripciones/[id]/register` (público, rate-limited por IP, `activity_not_found`/`activity_not_active` colapsados al mismo 404 anti-enumeration) · `GET /api/inscripciones/[id]/participants` (owner-only) · `GET /api/inscripciones/[id]/export` (owner-only, XLSX) · `GET`+`POST /api/inscripciones/[id]/check-in` (ping + ejecución, owner-only) · `GET /api/inscripciones/i/[token]` (resolución pública anti-enumeration) · `GET /api/inscripciones/i/[token]/qr.png` (ficha QR descargable).

## Páginas y PSCG

| Ruta | Categoría PSCG | Boundary |
|---|---|---|
| `/inscripciones` | `PUBLIC_INDEXABLE` | — |
| `/inscripcion/[id]` | `PUBLIC_NOINDEX` | — (noindex, fuera de sitemap, no Disallow'd) |
| `/i/[token]` | `PUBLIC_NOINDEX` | — |
| `/crear-inscripcion` | `PRIVATE_AUTHENTICATED` | `ssr_redirect` (gate propio: sesión + `assertOnboardingComplete`, nunca `resolveCreationGate`) |
| `/panel/inscripciones` | `PRIVATE_AUTHENTICATED` | `ssr_redirect` |
| `/panel/inscripciones/[id]` | `PRIVATE_AUTHENTICATED` | `ssr_redirect` |
| `/panel/inscripciones/[id]/scanner` | `PRIVATE_AUTHENTICATED` | `ssr_redirect` |

Registrado en `src/lib/publicSurfaceClassification.js`. `robots.txt`: `Disallow: /crear-inscripcion` (añadido); `/panel/inscripciones/*` ya cubierto por el prefijo `Disallow: /panel`. `sitemap.xml`: `/inscripciones` añadida.

### Addendum (2026-09-04) — PRIVATE SSR AUTH BOUNDARY HARDENING

Las tres superficies `/panel/inscripciones`, `/panel/inscripciones/[id]` y `/panel/inscripciones/[id]/scanner` nacieron con el mismo boundary client-side histórico de `/panel/eventos` (un `useEffect` que revisaba la sesión y redirigía DESPUÉS de que Next.js ya había enviado el shell del panel al navegador). Como Inscripciones es un módulo nuevo clasificado `PRIVATE_AUTHENTICATED` desde su primer commit, esa deuda no debía propagarse — se corrigió en una misión quirúrgica dedicada, sin ampliar el diff hacia Eventos (que conserva la deuda histórica, documentada, no corregida).

Las tres páginas ahora exportan `getServerSideProps` con el mismo patrón exacto ya certificado en `mis-iniciativas.jsx`/`crear-inscripcion.jsx`: `getSupabaseServer(ctx.req, ctx.res)` + `s.auth.getUser()`, `{ redirect: { destination: '/login?next=...' } }` si no hay sesión — **antes** de que el componente de la página se ejecute. Para las dos rutas dinámicas (`[id]`, `[id]/scanner`), `next` se construye siempre a partir de un prefijo literal fijo (`/panel/inscripciones/`) + el `id` de la ruta, pasado por `sanitizeNextPath` (`src/lib/countryPolicy.js`, la misma sanitización real basada en `URL()`/comparación de origin ya usada en el resto del repo) y `encodeURIComponent` antes de ir a la URL de login — el prefijo literal hace estructuralmente imposible que un `id` adversarial produzca un redirect fuera del origen.

**Evidencia adversarial real** (servidor Next.js real corriendo en este worktree, `curl` con múltiples User-Agents): las 3 rutas (+ `/crear-inscripcion` como regresión) devuelven `307` real, body de 30-85 bytes, **cero** marcadores privados (`Scanner`, `Descargar Excel`, `Asistieron`, `Pendientes`, `Editar`, `Inscritos`), idéntico byte a byte entre navegador, `Googlebot`, `facebookexternalhit` y `TikTokBot` — cero cloaking. Casos adversariales de `next` probados en vivo: `id=".."` es normalizado por el propio Next.js antes de llegar a la página (redirect a `/panel`, nunca ejecuta el `getServerSideProps` de Inscripciones); `id` con `%2f%2fevil.com` produce un `Location` que sigue empezando literalmente con `/panel/inscripciones/` (nunca sale del origen); `id` con secuencia `%0d%0a` (intento de inyección de cabecera/`Set-Cookie`) es rechazado por el chequeo de caracteres de control de `sanitizeNextPath`, cayendo al fallback `/panel/inscripciones` — sin ningún `Set-Cookie` inyectado en la respuesta real.

**Autenticación vs autorización**: este boundary SSR únicamente demuestra sesión. La autoridad real de ownership (quién es dueño de la actividad) sigue viviendo exclusivamente en cada endpoint de `/api/inscripciones/[id]/*` (comparación server-side de `organizer_id`) y, para el check-in, en la RPC `check_in_registration_participant` — ninguna de las dos capas fue tocada ni debilitada por esta misión.

## Capacidad futura — Plus/Gold (documentado, no implementado)

Ver `INSCRIPCIONES_FUTURE_BILLING.md`.

## Pruebas realizadas

**Unitarias committeadas** (`node --test`, 26 tests nuevos, todos PASS): `registrationPlans.test.mjs`, `registrationFreeQuota.test.mjs` (incluye el caso "día 18 → día 1 del mes siguiente", nunca rolling-30-días), `parseRegistrationQr.test.mjs`, `registrationAnalyticsWorkbook.test.mjs`.

**Adversariales en vivo contra `rifex-dev`** (RPCs reales, vía `scripts/dev-supabase.sh db query`, con fixtures creados y limpiados en la misma sesión — cero residuo verificado): creación FREE con `plan='free'`/`capacity=50` reales; segundo intento mismo organizador+mes → `free_quota_already_used`; mes distinto → permitido; inscripción pública ok; email duplicado (normalizado, case-insensitive) → `already_registered`; actividad inexistente → `activity_not_found`; actividad en `draft` → `activity_not_active`; `UNIQUE` de `qr_token` confirmado con `unique_violation` real; check-in válido → `pass`; segundo check-in del mismo QR → `already_used`; QR de otra actividad del mismo organizador → `wrong_activity`; check-in por un actor que no es el organizador → `not_authorized` (ownership real). **Concurrencia real** (dos llamadas disparadas en el mismo turno, conexiones separadas): dos creaciones FREE simultáneas mismo organizador+mes → exactamente una gana, la otra recibe `free_quota_already_used`; dos inscripciones simultáneas para el último cupo de una actividad `capacity=1` → exactamente una obtiene el cupo, la otra recibe `capacity_full` — nunca overbooking.

**Regresión**: 762 tests de la suite completa preexistente, 759 PASS. 2 fallos eran expectativas obsoletas de `tests/difusion.test.mjs` (asumían Inscripciones `available:false`/inexistente — actualizadas para reflejar el estado real, sección 31 del mandato) — corregidos y reverificados 22/22 PASS. 1 fallo es el flake histórico de `eventAnalyticsWorkbook.test.mjs` (timing del stress-test a los límites máximos, ~28-37s vs 20s de budget) — reproducido en aislamiento con la misma firma exacta, sin relación con esta misión, no tocado.

**Build**: `npm run build` limpio, todas las rutas nuevas compilan con la clasificación estática/dinámica esperada (coherente con el patrón ya usado por Eventos).

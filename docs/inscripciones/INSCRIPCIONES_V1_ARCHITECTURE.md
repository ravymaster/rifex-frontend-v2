# INSCRIPCIONES V1 FREE — Arquitectura

**Fecha**: 2026-09-04 · **Estado: PROD, en vivo.** Migración: `db/migrations/2026-09-04_inscripciones1_foundation.sql`, aplicada a `rifex-dev` (`nwxrvwbzqbhznscyirbq`) durante certificación DEV, y posteriormente a **PROD** (`wrdkdfuiwlujfxxijpao`) el 2026-09-04, ejecutada manualmente por Rodrigo vía el SQL Editor de Supabase (mecanismo humano-en-el-loop ya establecido para cambios de esquema en PROD — ningún agente automatizado tiene ni debe tener acceso de escritura directo a la base de datos de PROD).

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
| `enforceRateLimit`/`resolveClientIp` (`rateLimit.js`) | REUSE DIRECT | Sin cambios. |
| `sendEmail` (`mailer.js`) | REUSE DIRECT | Envuelto en `registrationMailer.js`, hermano de `eventTicketMailer.js`. |
| `neutralizeFormulaInjection`/`formatEventDateTime` (`eventAnalytics.js`) | REUSE DIRECT | Genéricas, sin acoplamiento a Eventos — usadas en `registrationAnalyticsWorkbook.js`. |
| Técnica QR PNG (`qrcode`+`satori`+`sharp`+fuentes Inter empaquetadas) | ADAPT | Mismo mecanismo, branding/contenido propio. |
| `event_staff` + rol `door` | DO NOT REUSE (V1) | V1 es owner-only — decisión documentada. |
| Country Gate (`countryGate.js`) | DO NOT REUSE | Sin dependencia geográfica para Inscripciones. |
| `eventCapacity.js` (triggers de aforo por suma de tipos de entrada) | DO NOT REUSE | Inscripciones tiene un pool plano único. |

## Modelo de datos

Cuatro tablas nuevas, independientes de `events`/`raffles`/`colectas`:

- **`registration_activities`**: la actividad. `organizer_id`, `plan` (`free`/`plus`/`gold`, CHECK), `capacity` (entero, NOT NULL), `status` (`draft`/`active`/`closed`/`archived`, CHECK), snapshot `organizer_name_snapshot`. RLS: grants por defecto de Supabase + policy `select` acotada a `status='active'`.
- **`registration_participants`**: `activity_id`, `full_name`, `email`, `normalized_email` (`UNIQUE(activity_id, normalized_email)`), `phone`, `qr_token` (`UNIQUE`, 64 hex). RLS: `revoke all`.
- **`registration_checkins`**: auditoría insert-only de cada check-in exitoso. RLS: `revoke all`.
- **`registration_free_usage`**: ledger insert-only del cupo mensual FREE. `UNIQUE(organizer_id, period_key)`. RLS: `revoke all`.

## RPCs atómicas (única autoridad real de escritura)

- **`create_free_registration_activity(...)`**: nunca acepta `plan`/`capacity` como parámetro.
- **`register_for_activity(...)`**: `select ... for update` como autoridad de aforo.
- **`check_in_registration_participant(...)`**: owner-only V1, sin validación de fecha de actividad (decisión de producto V1: check-in siempre disponible una vez inscrito).

Las tres funciones: `revoke execute ... from public, anon, authenticated; grant execute ... to service_role;`.

## API y Páginas — PSCG

Ver `docs/public-surface/PUBLIC_SURFACE_CLASSIFICATION_GUARD.md` para la tabla completa. Resumen: `/inscripciones` PUBLIC_INDEXABLE; `/inscripcion/[id]`+`/i/[token]` PUBLIC_NOINDEX; `/crear-inscripcion`+`/panel/inscripciones/*` PRIVATE_AUTHENTICATED con boundary `ssr_redirect` real (ver sección SSR abajo).

## SSR AUTH BOUNDARY HARDENING (2026-09-04)

Las tres superficies `/panel/inscripciones`, `/panel/inscripciones/[id]` y `/panel/inscripciones/[id]/scanner` nacieron con el mismo boundary client-side histórico de `/panel/eventos`. Corregidas en una misión quirúrgica dedicada: las tres exportan ahora `getServerSideProps` (mismo patrón que `mis-iniciativas.jsx`) — `getSupabaseServer`+`s.auth.getUser()`, redirect `307` real antes de renderizar. `next` en las rutas dinámicas se construye desde un prefijo literal fijo + `sanitizeNextPath` + `encodeURIComponent`, estructuralmente a prueba de open-redirect. `/panel/eventos/*` conserva su patrón client-side histórico, deliberadamente fuera de alcance.

## PROD promotion (2026-09-04)

Autorizado explícitamente por Rodrigo ("GO A PROD"). `origin/main` avanzó de `c66909d` (tag `v2.8-rifex-prod-pscg-difusion`) a `6f24bab` vía reconstrucción quirúrgica desde una rama `release/inscripciones-v1` — nunca un merge de `develop`. Los 8 archivos compartidos (robots.txt, sitemap.xml, Layout.jsx, difusionGuides.js, publicSurfaceClassification.js, difusion.jsx, mis-iniciativas.jsx, tests/difusion.test.mjs) se confirmaron byte-idénticos entre el PROD real y el baseline DEV pre-misión antes de aplicar el diff certificado; los 28 archivos restantes (rutas API, páginas, módulos lib, tests) y la migración eran nuevos, sin divergencia posible con PROD.

**Migración PROD**: aplicada manualmente por Rodrigo en el SQL Editor de Supabase, proyecto `wrdkdfuiwlujfxxijpao`, tras un pre-check confirmando cero tablas/funciones preexistentes con esos nombres. Certificación post-apply (consultas ejecutadas por Rodrigo, resultados confirmados): 4 tablas presentes, 3 RPCs presentes, RLS habilitado en las 4, grants exactos (`registration_activities` con grants por defecto filtrados por policy; las otras 3 sin ninguna fila de grant público).

**Deploy**: Vercel auto-desplegó desde el push a `main` (dpl_HQYUgVeYT9CmA3TqiSeRoLKHw4HJ, target `production`, alias real a `rifex.pro`/`www.rifex.pro`), confirmado `Ready` ~22 minutos después del push.

**Smoke en vivo contra `rifex.pro`** (Claude Code, lectura y requests anónimos únicamente): `/inscripciones` — contenido, título, descripción, canonical, OG, cero mención de Plus/Gold/precios, todo coincide con el mandato. `robots.txt`/`sitemap.xml` correctos en vivo. `/crear-inscripcion`, `/panel/inscripciones`, `/panel/inscripciones/[id]`, `/panel/inscripciones/[id]/scanner`: los 4 devuelven `307` real, body de 30-85 bytes, **idéntico byte a byte** entre curl por defecto, navegador, Googlebot, `facebookexternalhit` y TikTokBot — cero cloaking, cero fuga de HTML privado. Página pública individual y `/i/[token]` con id/token inexistentes: `noindex` presente, las APIs subyacentes devuelven `{"ok":false,"error":"not_found"}` genérico (anti-enumeración confirmada).

**Prueba funcional completa en PROD real** (ejecutada por Rodrigo, cuenta real `rodrigo0878`/`rodrigo00787@hotmail.com`, sin Mercado Pago conectado): actividad de prueba creada y publicada; 2 participantes inscritos con emails distintos (`rifex.contacto@gmail.com`, `rodrigo00787@hotmail.com`); QR recibido y visible en pantalla inmediatamente tras inscribirse (el correo de confirmación llegó, aunque a uno de los proveedores cayó en spam — observación de deliverability, no un defecto); scanner probado con **ingreso manual del código** (equivalente funcional exacto al escaneo por cámara, mismo endpoint/RPC): primer check-in → **PASA**; validado por Rodrigo como funcionando "perfecto". Excel descargado y verificado visualmente: hoja "Inscritos", columnas exactas (Nombre/Email/Teléfono/Fecha de inscripción/Estado/Hora de check-in), encabezado congelado con autofiltro, 2 filas reales ambas "Asistió" con hora de check-in real, cero rastro de `qr_token` o dato técnico.

**Consumo real**: esta prueba consumió el cupo FREE del mes calendario de la cuenta de Rodrigo — esperado y documentado, no revertido ni manipulado.

## Pruebas realizadas (resumen)

26 tests unitarios DEV + 23 tests estáticos de SSR boundary + batería adversarial en vivo contra `rifex-dev` (creación FREE, cupo mensual con y sin concurrencia, duplicado de email, actividad inexistente/en borrador, `UNIQUE` de QR, check-in válido/doble/cross-activity/sin autorización, capacidad con concurrencia real) + smoke y prueba funcional completa en PROD real descritos arriba. Regresión completa en el candidate de PROD: 802 tests, 801 PASS (único fallo: el flake histórico de XLSX, misma firma, no relacionado). Build limpio.

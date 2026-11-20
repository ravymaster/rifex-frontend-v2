# CUMPLIMIENTO-5 — Existing Admin Panel + Case File + Human Review (2026-08-30)

**Estado: activo en `rifex-dev`. `/admin` real sin nuevo mecanismo de
autorización. `/cumplimiento` público sigue "Próximamente". Ningún email
real enviado, ninguna determinación de fraude/delito implementada.**

## 1. Autoauditoría previa (antes de codificar)

- Confirmado `/admin` real (`src/pages/admin/index.jsx`) protegido por
  `src/lib/adminAuth.js#resolveAdmin`: Bearer token +
  `supabase.auth.getUser()` + `user.app_metadata.role === 'admin'`.
  Deliberadamente separado de `ADMIN_API_TOKEN` (reconciliación
  financiera) — otra autoridad ya certificada, no tocada.
- Confirmado `raffle_fulfillment_events` (CUMPLIMIENTO-1) ya admite
  `actor_type='admin'` en su CHECK constraint desde el día uno, y
  `event_type` es texto libre sin CHECK — la tabla append-only ya
  estaba preparada para acciones administrativas sin ningún cambio de
  esquema.
- Confirmado que ninguna estructura existente cubría "estado de
  revisión administrativa" — de ahí la migración mínima (sección 7).

## 2. Integración en /admin

**Cero panel nuevo, cero login nuevo, cero autoridad nueva.** Se agregó
una sección "Cumplimiento" directamente dentro de
`src/pages/admin/index.jsx` (4 KPIs + enlace "Ver casos →"), consumiendo
un tercer endpoint (`/api/admin/cumplimiento`) junto a los ya existentes
`/api/admin/metrics` y `/api/admin/overview`, con el mismo Bearer token
de sesión ya usado por el resto de la página. La gestión detallada vive
en la subruta `/admin/cumplimiento` (permitida explícitamente por el
mandato) — nunca un sistema administrativo paralelo.

## 3. Resumen/dashboard agregado

`GET /api/admin/cumplimiento` → `{summary, cases}`. Los 4 contadores
(`requires_review`, `delivery_pending`, `confirmed`, `unconfirmed`) se
**derivan siempre de la misma lista** vía `summarizeAdminFulfillmentCases`
— nunca un contador mantenido por separado que pueda desincronizarse.
"Requiere revisión" = `escalated_at` no nulo Y `admin_review_status` no
está en `{resolved, closed_without_determination}`.

## 4. Listado de casos

`/admin/cumplimiento` — tabla con rifa, ganador, estado (texto, no solo
color), motivo de revisión traducido, estado de revisión admin,
antigüedad, y enlace "Ver caso". Estados distinguidos siempre con texto,
nunca solo con color.

## 5. Expediente implementado

`/admin/cumplimiento/[id]` ← `GET /api/admin/cumplimiento/[id]`. Incluye
rifa (título, id técnico, fecha de sorteo, premio), creador (email +
referencia), ganador (nombre/email/número), condiciones congeladas
(entrega, transferencia), respuestas de ambas partes con timestamps,
comunicaciones (traducidas), y la cronología humana. Nunca un dump de
base de datos — todo mapeado a lenguaje humano vía
`src/lib/adminFulfillmentLabels.js`.

## 6. Timeline

`buildHumanTimeline(fulfillmentCase, events)` — construida ÚNICAMENTE a
partir de `winner_determined_at` (columna real) + los eventos reales de
`raffle_fulfillment_events` (incluidos los nuevos `admin_*`). Ningún
paso inventado; un `event_type` desconocido se muestra tal cual en vez
de ocultarse silenciosamente. Certificado con test dedicado usando
eventos insertados en desorden, verificando el ordenamiento cronológico
final.

## 7. Modelo de revisión humana

Migración `db/migrations/2026-08-30_cumplimiento5_admin_review.sql` —
**puramente aditiva, sin tabla nueva**: 3 columnas nullable en
`raffle_fulfillment_cases` (`admin_review_status`, `admin_reviewed_by`,
`admin_reviewed_at`). Iniciar revisión, notas, y resolución se
implementan como nuevos `event_type` sobre `raffle_fulfillment_events`
(`admin_review_started`, `admin_note_added`, `admin_review_resolved`)
con `actor_type='admin'` — infraestructura append-only ya existente,
reutilizada íntegramente.

Estados: `null` (pendiente, sin iniciar), `in_review`, `resolved`,
`closed_without_determination`. Deliberadamente **sin** `fraud`,
`scammer`, `guilty`, `criminal` — el sistema no determina delitos.
Iniciar/resolver revisión requiere que el caso ya esté escalado
(`escalated_at` no nulo) — la mesa de revisión es explícitamente la capa
posterior a la escalación automática de CUMPLIMIENTO-4, no un mecanismo
independiente.

## 8. Notas internas

`addAdminNote` — siempre una fila NUEVA en `raffle_fulfillment_events`
(`event_type='admin_note_added'`), nunca una edición — append-only por
construcción, sin necesidad de un mecanismo especial anti-edición.
Incluye `actor_user_id` (uuid real del admin) y `metadata.admin_email`
para legibilidad. Certificado que ningún endpoint de creador/ganador
(`/api/cumplimiento/caso/[token].js`, `/api/panel/cumplimiento*.js`)
referencia `admin_note_added` ni importa `adminFulfillmentReview.js` —
las notas nunca son alcanzables desde esas superficies.

## 9. Resolución administrativa

`resolveAdminReview(raffleId, {resolution, note})` — idempotente frente
a la MISMA resolución repetida (noop, sin evento duplicado). Reabrir un
caso ya resuelto (`startAdminReview` tras `resolved`) SÍ está permitido
— es una acción real y distinta de un reintento. **Nunca toca**
`winner_response`, `creator_response`, `closed_at`, `escalation_reason`,
ni ningún evento histórico existente — certificado con test explícito
que congela el estado "antes" y lo compara byte a byte contra el estado
"después" de resolver, y reproducido en vivo contra `rifex-dev`.

## 10. Seguridad/autorización

Ambos endpoints (`/api/admin/cumplimiento`, `/api/admin/cumplimiento/[id]`)
llaman `resolveAdmin(req)` como la PRIMERA operación, antes de tocar
cualquier dato o leer el body de un POST — certificado por test
estructural que verifica la posición exacta en el código fuente. El
token del ganador nunca es un camino de acceso alterno al expediente
admin (el endpoint ni siquiera importa `getCaseByAccessToken`). Un
usuario autenticado normal o un creador cambiando el `:id` de la URL
reciben el mismo 401/403 que cualquier otro endpoint `/api/admin/*` —
autorización 100% server-side, nunca solo ocultar botones en el
cliente.

## 11. Privacidad

`ADMIN_CASE_COLUMNS` (lista explícita, nunca `select('*')`) excluye
deliberadamente `winner_access_token_hash` y
`winner_access_token_created_at` — certificado con test que además
verifica que la lista de columnas en sí misma nunca contenga las
palabras `token`/`secret`/`credential`. No se implementó visualización
documental nueva ni se tocó Trust.

## 12. Corrección de español/voseo

Corregido dentro del alcance de Cumplimiento (C3/C4 tocados,
`mailer.js` y las páginas de `/cumplimiento`/`/panel/cumplimiento`):
`tenés`→`tienes`, `podés`→`puedes`, `Contanos`→`Cuéntanos`,
`Coordiná`→`Coordina`, `recordá`→`recuerda`, `Respondé`→`Responde`,
`Probá`→`Prueba`, `Confirmá`→`Confirma`, `creés`→`crees`,
`contactá`→`contacta`, `vos`→`tú`. Certificado con test dedicado y
verificado que la suite de C3/C4 (105 tests) sigue pasando intacta tras
el cambio de copy. **No se tocó ninguna otra superficie de Rifex** fuera
de Cumplimiento.

## 13. Migración

Ver sección 7. Aplicada **solo** a `rifex-dev`, verificada en vivo:
columnas presentes, y RLS/grants intactos — un chequeo directo con la
anon key de DEV contra la tabla devuelve `42501 permission denied`,
igual que antes de esta migración (las 3 columnas nuevas heredan
automáticamente el default-deny total ya vigente desde CUMPLIMIENTO-1,
sin ninguna política nueva).

## 14. QA DEV

Certificado en vivo contra `rifex-dev`, reutilizando el fixture
residual de C2/C3/C4 (`raffle_id 0656b707-321f-451c-ab34-e8d4b2483936`,
ya escalado por la propia QA de CUMPLIMIENTO-4): listado+resumen
(`requires_review=1` antes, `0` después de resolver), expediente
completo sin exponer el token, iniciar revisión, agregar nota, resolver,
verificación explícita de que `winner_response`/`creator_response`/
`closed_at`/`escalation_reason`/`status` automáticos permanecieron
intactos, y reintento de la misma resolución confirmado como noop. No
se creó ningún fixture nuevo. **Limitación conocida**: no se hizo un
click-through en navegador real de `/admin/cumplimiento*` — la QA cubrió
la librería de dominio y la forma exacta de los endpoints contra datos
reales, pero no una sesión de browser autenticada como admin real (esta
sesión no cuenta con credenciales de un admin real de Rifex). Recomendado
antes de que Rodrigo use la función en un caso real.

## 15. Tests nuevos

`tests/adminFulfillmentReview.test.mjs` — 29 tests cubriendo los 40
escenarios requeridos (varios consolidados por relación directa):
listado/resumen, expediente + privacidad (token/hash/credenciales MP
nunca expuestos), traducción de motivos de escalamiento, cronología
humana, notas internas append-only + inalcanzables desde
creador/ganador, iniciar/resolver revisión, no-mutación de campos
automáticos, concurrencia, retry-safety, autorización server-side
estructural, ausencia de voseo, y migración puramente aditiva sin
políticas nuevas.

## 16. Regresión y build

325 tests corridos (toda la suite, incluidos Cumplimiento 1-5): 324
pasan, 1 falla — el mismo flaky de timing XLSX ya documentado en fases
anteriores, no relacionado con Cumplimiento. `npm run build` completó
sin errores; `/admin/cumplimiento` y `/admin/cumplimiento/[id]`
aparecen en el build output.

## 17. Explícitamente NO implementado en esta fase

Reputación pública, puntajes/estrellas, sanciones automáticas, bloqueo
automático de creadores, resolución legal/mediación, un segundo sistema
administrativo, visualización documental nueva, ampliación de Trust,
activación de PROD, cron PROD, emails reales a staff.

## 18. Pendiente para fases futuras

- Click-through en navegador real de `/admin/cumplimiento*` con
  credenciales de admin reales antes de un uso operativo amplio.
- Definir si la revisión administrativa alguna vez necesita comunicar
  algo de vuelta al creador/ganador más allá de los avisos automáticos
  ya existentes de CUMPLIMIENTO-4 (explícitamente fuera de alcance de
  C5).
- CUMPLIMIENTO-6 y cualquier trabajo posterior requiere nueva
  autorización explícita de Rodrigo.

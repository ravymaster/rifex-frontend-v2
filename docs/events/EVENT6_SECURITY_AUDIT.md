# EVENT-6 Fase 1 — Auditoría autónoma de EVENT-1 a EVENT-5

Auditoría de seguridad/regresión autónoma contra el deployment real de Vercel DEV (`rifex-frontend-main`) y `rifex-dev` (Supabase), sin promoción a PROD. Mismo criterio de evidencia que el resto de este proyecto: toda afirmación respaldada por una prueba real ejecutada, nunca supuesta.

Estado: **auditoría completa. 2 hallazgos reales de bajo riesgo, corregidos como defensa en profundidad — ningún hallazgo era explotable en el momento de encontrarlo (verificado antes de corregir, no asumido). Cero regresiones. EVENT-7 NO AUTORIZADO.**

---

## Alcance y método

- Entornos: código local, `rifex-dev` (`nwxrvwbzqbhznscyirbq`), Vercel `rifex-frontend-main`. PROD/`rifex-frontend-v2`/`rifex.pro`/Supabase PROD nunca tocados.
- Fixture real y controlado, creado y eliminado en esta sesión (ver "Fixtures"): 5 usuarios desechables (`@example.com`, sin PII real), 2 eventos publicados de organizadores distintos (para pruebas cross-event genuinas), órdenes/tickets vía RPCs reales, staff activo/revocado.
- Todas las pruebas de la matriz se ejecutaron contra el deployment real (`rifex-frontend-main.vercel.app`) y `rifex-dev` reales — nunca contra un mock.

## Matriz de pruebas (31 pruebas reales, 30 PASS / 1 expectativa de test corregida)

### A — Autenticación, autorización, IDOR

| # | Prueba | Resultado |
|---|---|---|
| 1 | anon → listado de staff → `401` | PASS |
| 2 | usuario random → listado de staff → `403` | PASS |
| 3 | `door` activo → listado de staff (no gestiona staff) → `403` | PASS |
| 4 | organizador de OTRO evento real → staff de este evento → `403` (cross-event genuino, no simulado) | PASS |
| 5 | usuario random → crear tipo de entrada → `403` | PASS |
| 6 | usuario random → publicar (owner-only) → `403` | PASS |
| 7 | organizador de OTRO evento → cancelar este evento → `403` | PASS |
| 8 | IDOR: ticket real de Evento B escaneado contra el check-in de Evento A → `ticket_wrong_event`, nunca pasa | PASS |
| 9 | IDOR: `ticket_number` real de Evento B resuelto vía fallback manual de Evento A → `404`, nunca resuelve cross-event | PASS |
| 10 | evento inexistente → analytics → esperaba `404`, devolvió `403` | Expectativa de test corregida — ver "Hallazgos no reales" |
| 11 | `event_id` malformado (no UUID) → nunca `500` | PASS |

### B — RLS y base de datos

Ver sección dedicada "RLS, grants y Security Advisor" más abajo — 2 hallazgos reales, ambos corregidos.

### C — Invariantes

| # | Invariante | Resultado |
|---|---|---|
| 12-13 | `GET /t/[token]` antes del check-in → `200`, `used_at` sigue `null` | PASS |
| 14-16 | check-in real → `pass`; `GET /t/[token]` después → sigue sin alterar `used_at` entre llamadas repetidas | PASS |
| 17 | reintento del mismo QR ya usado → `already_used`, nunca `pass` dos veces | PASS |
| 18-19 | `void_event_ticket` sobre un ticket nunca usado, luego check-in → `ticket_void`, nunca pasa | PASS |
| 20 | `mark_event_order_paid` repetido sobre una orden ya `paid` → idempotente, mismo resultado | PASS |

### D — Concurrencia

| # | Prueba | Resultado |
|---|---|---|
| 21 | 10 llamadas concurrentes a `issue_event_order_tickets` sobre la misma orden (qty=3) → exactamente 3 tickets reales en la base | PASS |
| 22 | 15 check-ins HTTP concurrentes al MISMO `qr_token` → exactamente 1 `pass`, 14 `already_used` | PASS |
| 23 | `event_checkins` tiene exactamente 1 fila para ese ticket pese a 15 intentos concurrentes | PASS |
| 24-25 | revocar `door` activo y probar check-in inmediatamente después → `403 not_authorized`, sin ventana de gracia | PASS |
| 26-27 | cancelar el evento, luego check-in de un ticket aún válido → `409 event_cancelled`, nunca pasa | PASS |

### E — Entradas adversariales

| # | Prueba | Resultado |
|---|---|---|
| 28 | `qr_token` con contenido tipo SQLi (`' OR '1'='1`) → rechazado limpio, nunca `500`, nunca pasa | PASS |
| 29 | `qr_token` de 5.000 caracteres → rechazado limpio, nunca `500` | PASS |
| 30 | `GET /t/[token]` con contenido hostil en el path (intento de `DROP TABLE`) → nunca `500`; confirmado además que `event_tickets`/`events` siguieron existiendo y consultables después | PASS |
| 31 | orden que excede `max_per_order` (3 pedidas contra un tope de 2) → rechazada por la RPC (`exceeds_max_per_order`) | PASS |

Formula injection en XLSX, límites deterministas de exportación, y saneamiento de nombre de archivo ya estaban cubiertos por la batería de tests de EVENT-5 (31/31, sin cambios este sprint — ver `docs/events/EVENT5_ANALYTICS_XLSX.md`) — no se repitieron aquí porque ningún archivo de esa capa fue tocado.

### F — Regresión

| Área | Resultado |
|---|---|
| `npm run test:event-analytics` | 31/31 PASS |
| `npm run test:scanner-controller` (EVENT-4) | 4/4 PASS |
| `npm run build` | PASS, sin errores ni warnings |
| `/rifas`, `/mis-iniciativas`, `/login`, `/register`, `/perfil`, `/eventos`, `/panel`, `/api/rifas`, `/api/events` | `200` reales contra el deployment |
| `/colectas` (sin `index.jsx`, solo `/colectas/[id]`) | `404` — comportamiento preexistente, no una regresión introducida |
| Mercado Pago | Ningún cobro real intentado — todas las órdenes de prueba se reconciliaron vía las RPCs reales (`create_event_order`/`mark_event_order_paid`), el mismo patrón ya usado y aceptado en las certificaciones de EVENT-2 a EVENT-5 |
| Emails | Usuarios de prueba creados con `email_confirm: true` vía `service_role` — Supabase Auth no dispara correo de confirmación por esa vía; cero correos reales enviados |

## Hallazgos no reales (verificados, descartados)

- **#10 (evento inexistente → analytics)**: mi expectativa de test asumía `404`. El código real (`canViewEventAnalytics`) devuelve `403` tanto para un evento inexistente como para uno ajeno — sin distinguir los dos casos. Esto es **más seguro**, no un defecto: un atacante no puede usar la respuesta para confirmar si un `event_id` existe o no. No se modificó código; se corrige aquí la expectativa, no la aplicación.
- **Superposición hostil en `/t/[token]`**: el path devuelve `200` (página Next.js del lado del cliente, resuelve el token vía JS después de cargar) en vez de un código de error HTTP — comportamiento normal de un router de páginas, no una vulnerabilidad. Confirmado que ninguna tabla fue alterada.

## RLS, grants y Security Advisor

`supabase db advisors --linked --type security` (read-only) sobre `rifex-dev`: **0 hallazgos ERROR**, 22 hallazgos WARN antes de esta auditoría.

**RLS habilitada en las 7 tablas de Eventos** (`events`, `event_ticket_types`, `event_orders`, `event_order_items`, `event_tickets`, `event_staff`, `event_checkins`) — confirmado por consulta directa a `pg_class.relrowsecurity`, no asumido.

**Las 6 RPCs de EVENT-2/3/4 son `SECURITY INVOKER`** (`create_event_order`, `expire_event_order`, `mark_event_order_paid`, `issue_event_order_tickets`, `void_event_ticket`, `check_in_event_ticket`) — confirmado por `information_schema.routines.security_type`. `find_user_id_by_email` es la única `SECURITY DEFINER`, con `search_path` ya fijado desde EVENT-4 y `EXECUTE` revocado de `anon`/`authenticated` (confirmado: solo `service_role`/`postgres` pueden ejecutarla).

### Hallazgo real #1 — `search_path` mutable en 6 RPCs (WARN, corregido)

El Security Advisor marcó las 6 RPCs de Eventos con `search_path` no fijado. Ninguna es `SECURITY DEFINER` (confirmado arriba), así que un `search_path` hostil no puede escalar privilegios ahí — el riesgo real era bajo, no un exploit activo. Corregido de todas formas como endurecimiento estándar, vía `ALTER FUNCTION ... SET search_path = public` (cambio de metadata, cero riesgo de tocar la lógica de negocio) — `db/migrations/2026-08-26_event6_hardening_search_path_and_revoke.sql`. Reverificado: **0 advertencias `function_search_path_mutable` para funciones de Eventos** tras aplicar la migración (antes: 6; ahora: 0). Los 16 hallazgos WARN restantes son de Rifas/Auth, preexistentes, fuera de alcance de EVENT-1..5 — no tocados.

### Hallazgo real #2 — `events`/`event_ticket_types` sin `revoke` explícito de escritura (bajo riesgo, corregido)

A diferencia de todas las tablas de Eventos creadas después (EVENT-2/3/4), `events` y `event_ticket_types` (EVENT-1) nunca recibieron el `revoke insert/update/delete` explícito que sí tiene el resto — conservaban el GRANT completo por defecto de Supabase a `anon`/`authenticated`.

**Verificado en vivo, ANTES de corregir, que esto no era explotable**: un `INSERT`/`UPDATE`/`DELETE` anónimo directo vía PostgREST (bypass total de la app) contra la fila real de un evento publicado (`id` real, no un filtro amplio) devolvió `200` con **0 filas afectadas** en los tres casos — la política RLS `events_select_public`/`event_ticket_types_select_public` solo cubre `SELECT`, así que sin política de escritura, Postgres deniega por defecto. El título y el `price_cents` reales se confirmaron sin cambios en una lectura posterior. **No había vulnerabilidad activa.**

Corregido igual, como segundo cerrojo real (defensa en profundidad, mismo criterio que PRE-LAUNCH-FIX-1/2/3): `revoke insert, update, delete, truncate on public.events/event_ticket_types from anon, authenticated;` — deliberadamente **sin tocar `SELECT`**, porque las políticas públicas de lectura (`status='published'`/`status='active'`) son la funcionalidad real y legítima del catálogo público (`/eventos`, `/eventos/[id]`).

`event_orders`, `event_order_items`, `event_tickets`, `event_staff`, `event_checkins` ya tenían grants completamente vacíos para `anon`/`authenticated` — confirmado directamente (`information_schema.role_table_grants`, 0 filas) — coincide exacto con lo documentado desde EVENT-2/3/4, sin cambios necesarios.

### Fuera de alcance, observado, no corregido

`create_tickets_for_raffle`, `rifex_set_creator_defaults`, `set_bank_account_owner`, `set_creator_fields`, `set_raffle_creator_from_jwt` (SECURITY DEFINER ejecutables por `anon`/`authenticated`), `rate_limit_hit`/`create_raffle_with_declarations`/`extend_raffle_draw`/`reserve_tickets_for_purchase`/`converge_purchase_tickets_sold` (search_path mutable), y `auth_leaked_password_protection` (config global de Auth) — todos pertenecen a Rifas/Colectas/Auth, ninguno a EVENT-1..5. Tocarlos habría sido exceder el alcance explícito de esta misión ("No agregues funcionalidades ni amplíes el producto" / auditoría de EVENT-1..5). Quedan documentados como observados, no como pendientes de EVENT-6.

## Concurrencia — evidencia detallada

- **Emisión exactly-once**: orden real con `quantity=3`, 10 llamadas simultáneas (`Promise.all`) a `issue_event_order_tickets` sobre la MISMA orden → verificado por `COUNT` directo en `event_tickets`: exactamente 3, nunca 30 ni menos. El lock `FOR UPDATE` sobre la fila de la orden (ver `db/migrations/2026-08-25_event3_tickets_qr.sql`) sigue siendo la autoridad real.
- **Check-in exactly-once**: 15 llamadas HTTP simultáneas (no solo RPC en aislamiento — el endpoint real completo, con rate limit y todo) al mismo `qr_token` → exactamente 1 `pass`, 14 `already_used`, exactamente 1 fila en `event_checkins` (el `UNIQUE(ticket_id)` y el lock `FOR UPDATE` de `check_in_event_ticket` sostienen la garantía bajo carga real, no solo en teoría).
- **Revocación vs operación**: revocar `door` y, en la siguiente request inmediata (sin esperar ningún caché), intentar check-in → rechazado. `canCheckIn`/`check_in_event_ticket` resuelven el estado de staff en cada llamada, sin ventana de gracia.
- **Cancelación vs check-in**: cancelar el evento y luego intentar check-in de un ticket que seguía siendo válido → rechazado (`event_cancelled`), confirmando que `check_in_event_ticket` respeta `events.status` en cada llamada, no solo al momento de emitir el ticket.

## Fixtures creados y eliminados

Creados (sesión EVENT-6 Fase 1): 5 usuarios desechables (`event6audit.*@example.com`), 2 eventos publicados ("EVENT-6 AUDIT ..."), 4 tipos de entrada, 3 órdenes pagadas, 6 tickets, 2 check-ins, 2 filas de staff (activo/revocado). **Todo eliminado al finalizar**, acotado por `event_id`/`user_id` exactos (nunca por patrón), verificado por conteo antes/después: 0 filas residuales.

También se encontraron y limpiaron, como housekeeping, 3 eventos borrador vacíos (`EVENT-5 TEST cross-event owner`, 0 tipos de entrada, 0 órdenes) — residuo de re-ejecuciones del script de prueba de la sesión de certificación EVENT-5 anterior. Eliminados por ID exacto con un guard adicional de título. **El fixture principal de EVENT-5** (`EVENT-5 TEST bxajh8j`, cancelado, con historial real de órdenes/tickets/check-ins) **se dejó intacto** — es el que Rodrigo revisó y aceptó; no había instrucción de eliminarlo en esta misión.

## Regresión y despliegue

`npm run test:event-analytics` 31/31, `npm run test:scanner-controller` 4/4, `npm run build` limpio. Ningún archivo de EVENT-1/2/3/4/5 fue modificado — la única corrección de esta auditoría es una migración SQL nueva y aditiva (`db/migrations/2026-08-26_event6_hardening_search_path_and_revoke.sql`), sin cambios de código de aplicación.

## Riesgos pendientes

- Rotación de la contraseña de `rifex-dev` (expuesta en texto plano por un `--dry-run` el 2026-08-25) — sigue pendiente, decisión explícita de una sesión anterior de posponerla, no un olvido de esta auditoría.
- Los 16 hallazgos WARN de Rifas/Colectas/Auth observados en el Security Advisor quedan fuera de alcance de EVENT-1..5 — recomendado auditarlos en un sprint dedicado a esas áreas, no como parte de Eventos.
- Confirmación del plan real de Vercel (Fluid Compute/maxDuration) para `rifex-frontend-main`/`rifex-frontend-v2` — pendiente desde la certificación de EVENT-5, sin acceso no-interactivo al dashboard en esta sesión tampoco.

## Veredicto

**GO** para EVENT-1 a EVENT-5 en su estado actual en `rifex-dev` — ningún defecto explotable real fue encontrado; los dos hallazgos del Security Advisor eran de bajo riesgo y ya fueron corregidos como defensa en profundidad, con evidencia de que ninguno era explotable antes del fix. 30/31 pruebas reales de la matriz PASS (la única "falla" fue una expectativa de test incorrecta, no un defecto de la aplicación). Cero regresiones en Rifas/Colectas/Auth/Perfil/Mis-iniciativas/build. **La decisión de promover Eventos a PROD queda reservada para Rodrigo** — esta auditoría certifica el estado de DEV, no autoriza ni recomienda por sí sola el paso a producción, que implica decisiones de negocio (comisiones, lanzamiento, soporte) fuera del alcance técnico de esta misión.

**PROD confirmado intacto**: `origin/main` sin cambios, Supabase PROD (`wrdkdfuiwlujfxxijpao`) no fue tocado en ningún momento de esta sesión.

**EVENT-7: NO AUTORIZADO.** No se propuso, diseñó ni implementó ninguna funcionalidad nueva.

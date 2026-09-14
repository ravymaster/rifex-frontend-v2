# EVENT-4 — Staff + Scanner + Check-in

Documento canónico de especificación para EVENT-4. Traslado fiel de la instrucción de reentry (`RIFEX_NOTEBOOK_REENTRY_EVENT4.txt`, secciones C–T), sin rediseño ni ampliación de alcance. Este documento es la referencia autoritativa para implementar EVENT-4; `docs/WOP.md` apunta aquí en vez de duplicar el contenido.

Estado: **NEXT / no iniciado**. Ningún código de EVENT-4 existe todavía en `develop` — ver `docs/WOP.md`, sección "RIFEX CURRENT STATE", para la verificación Git que lo confirma (ninguna rama remota relacionada, `used_at` sin referencias en `src/`).

---

## Objetivo

```text
ticket QR
→ scanner autorizado
→ validación server-side
→ PASA / NO PASA
→ check-in exactly-once
→ impedir reutilización
→ auditoría del acceso.
```

Puerta real esperada:

```text
Portero autorizado abre scanner
→ escanea QR
→ ticket válido = PASA
→ ingreso queda registrado
→ escanea el mismo QR nuevamente
→ NO PASA / YA UTILIZADO.
```

## Estado anterior — EVENT-1/2/3 (no reconstruir, solo adaptar)

EVENT-4 se construye sobre lo ya existente y verificado; **no reimplementa** ninguna pieza de EVENT-1/2/3.

- **EVENT-1** — `events` (draft/published/cancelled), `event_ticket_types` (active/hidden). RLS: SELECT público solo si published/active; todo write vía API server-side con `service_role`.
- **EVENT-2** — `event_orders` (pending/paid/expired/cancelled/approved_unfulfilled), `event_order_items`. RPCs atómicas: `create_event_order`, `expire_event_order`, `mark_event_order_paid`. `access_token` opaco para checkout de invitado.
- **EVENT-3** — `event_tickets` (`status`: solo `valid`/`void`), `ticket_number` (humano, nunca credencial) y `qr_token` (credencial real, opaco). RPC `issue_event_order_tickets` (exactly-once vía lock de fila) y `void_event_ticket` (nunca `DELETE`). Checkpoint funcional: commit `725c4f8`.

Antes de programar, releer la implementación real de: `event_tickets`, `issue_event_order_tickets`, `void_event_ticket`, `/t/[token]`, el endpoint de QR, ownership de `events`, Auth, RLS, rate limit, y el panel de Eventos. Adaptar EVENT-4 al código real, no al recuerdo de esta especificación.

## Invariante EVENT-3 — SCAN ≠ CHECK-IN

`GET /t/[token]` **continúa siendo lectura** y **no consume** el ticket. Solo una operación de EVENT-4, autenticada y autorizada, puede ejecutar check-in. Verificado en esta sesión: ningún archivo de `src/` referencia `used_at` — la columna existe en el esquema desde EVENT-3 pero está intocada hasta EVENT-4.

## Separación PAYMENT STATE ≠ FULFILLMENT STATE

Principio heredado de EVENT-2/3, que EVENT-4 debe preservar: `event_orders.status` (verdad de pago) nunca se confunde con `tickets_issued_at`/`tickets_email_sent_at` (verdad de fulfillment). EVENT-4 agrega una tercera capa — **verdad de acceso** (`used_at` / `event_checkins`) — que tampoco debe mezclarse con las otras dos. Un check-in nunca modifica pagos ni inventario financiero.

## Principios generales

- QR no cambia — `qr_token` sigue siendo la credencial opaca ya emitida por EVENT-3.
- Scanner no confía en datos visuales ni del cliente. Validación final siempre server-side.
- Check-in atómico. Ticket consumible una sola vez.
- Dos porteros simultáneos jamás aceptan dos veces el mismo ticket.
- Staff solo opera eventos autorizados. Ticket de Evento A jamás pasa en Evento B.
- `void` jamás pasa. Inexistente jamás pasa.
- Mínima PII.
- Check-in no modifica pagos ni inventario financiero.
- Ticket nunca se `DELETE` por uso.
- Acceso exitoso auditable.

## Fuera de alcance (NO HACER)

PROD, Argentina, Redis, sprint de refund, Payment Engine nuevo o refactor general, analytics/CSV (EVENT-5), pentest general, reconocimiento facial, geolocalización obligatoria, almacenamiento de imágenes de asistentes.

## Staff mínimo

Dominio mínimo `event_staff` (o equivalente). `events.organizer_id` sigue siendo la autoridad del owner; `event_staff` almacena colaboradores adicionales.

### Rol `door`

Único rol V1 adicional. Sin RBAC empresarial.

- El organizador puede autorizar otra cuenta Rifex existente como puerta.
- Preferir usuario existente; **no** búsqueda pública de usuarios; **no** aceptar `user_id` arbitrario sin validación.
- Solo el owner gestiona staff.
- `door` puede escanear/hacer check-in, pero **no** editar el evento, gestionar staff ni acceder a finanzas innecesarias.

### Estado active/revoked

Cada fila de `event_staff` tiene `status`: `active` o `revoked`.

### Autorización server-side

Crear `canCheckIn(eventId, userId)` (o equivalente):

- permite: `organizer` del evento, y `staff` con rol `door` y `status='active'` para ese evento;
- rechaza: `revoked`, usuario aleatorio, `anon`, y staff autorizado para **otro** evento.

## `event_checkins` y auditoría

Crear `event_checkins` (o equivalente). Mínimo conceptual:

```text
id
event_id
ticket_id
checked_in_by
checked_in_at
created_at
```

### `used_at` como autoridad de consumo

EVENT-3 dejó `event_tickets.used_at` nullable, sin escritor. EVENT-4 usa `used_at` como autoridad de consumo:

- **Primer check-in**: `used_at IS NULL` → se fija timestamp autoritativo → `PASS`.
- **Segundo intento**: `used_at` ya definido → `already_used` → `NO PASA`.

Protección obligatoria a nivel de base de datos, no de aplicación.

### RPC / transacción atómica

Crear `check_in_event_ticket(...)` (o equivalente) con esta secuencia mínima:

1. identidad autorizada;
2. resolver `qr_token`;
3. lock del ticket (`FOR UPDATE`);
4. validar existencia;
5. validar evento;
6. validar `status = 'valid'`;
7. validar `used_at IS NULL`;
8. validar evento permitido (no `cancelled`);
9. marcar `used_at`;
10. insertar en `event_checkins`;
11. devolver resultado.

**Prohibido** el patrón `SELECT → JS → UPDATE` (vulnerable a carrera) — mismo criterio que `issue_event_order_tickets` de EVENT-3, que serializa vía lock de fila, no vía lectura-luego-escritura desde la aplicación.

## Concurrencia crítica

Mismo QR, 20 check-ins concurrentes. Resultado obligatorio:

- exactamente 1 `PASS`;
- 19 `already_used` (o equivalente);
- `used_at` definido una sola vez;
- `event_checkins` con exactamente 1 fila exitosa para ese ticket.

## Scanner web

Ruta: `/panel/eventos/[id]/scanner` (o equivalente coherente con el código real). Mobile-first, pensada para fila de asistentes.

- Usar la cámara del navegador cuando sea viable. Inspeccionar primero dependencias/capacidades ya existentes en el repo.
- Si hace falta una librería QR: elegir una mantenida, mínima y compatible, y justificarla. Sin upgrades generales de otras dependencias.

### Parseo estricto del QR

- Aceptar únicamente el QR Rifex esperado (URL `/t/<token>` o el token, según implementación real).
- No ejecutar URLs arbitrarias. No navegar a dominios externos. Extraer solo el token Rifex válido.
- Malformado → `NO PASA / QR no válido`.

### Resultados de UI

Muy visibles, no dependientes solo del color.

**PASA**: entrada válida, tipo, `ticket_number`, hora.

**NO PASA — YA UTILIZADA**: hora del ingreso previo, si es seguro mostrarla.

**NO PASA**: entrada anulada / inválida / otro evento.

El scanner debe quedar listo rápidamente para el siguiente escaneo, sin navegar hacia atrás.

### Fallback manual

Si la cámara falla, permitir un fallback seguro. `ticket_number` nunca es secreto público.

Si se permite búsqueda/check-in manual por `ticket_number`:

- endpoint staff-only;
- resolución server-side;
- acotado (scoped) al evento;
- check-in mediante la **misma** autoridad atómica que el escaneo de QR.

**Nunca** un endpoint público de check-in por `ticket_number`.

## Casos obligatorios de autorización y rechazo

| Caso | Resultado esperado |
|---|---|
| Cross-event: staff A intenta check-in de ticket de evento B | `NO PASA`; ticket B **no se consume** |
| `void` | `NO PASA`; `used_at` permanece intacto |
| Evento `cancelled` | Check-in rechazado, no ejecutado |
| Ventana horaria | Sin regla rígida que pueda bloquear una puerta real por configuración; documentar la política elegida. `cancelled` sí debe bloquear |
| Offline | EVENT-4 V1 es **online**. No implementar modo offline. Sin conexión → *"Sin conexión. No se pudo validar la entrada."* No aceptar offline y sincronizar después |

## Panel

En `/panel/eventos/[id]`:

- listado de personal de acceso, con estado/rol;
- acción de revocar;
- CTA "Abrir scanner".

Panel mínimo de métricas: vendidas, emitidas, ingresaron/check-ins. **No** analytics de EVENT-5.

## RLS + API + rate limit

- `event_staff` y `event_checkins` con RLS ON. Cero escritura pública directa. Mutaciones exclusivamente vía API/RPC server-side. Sin SELECT general para `authenticated`.
- Endpoints conceptuales (adaptar al repo real):
  - `GET/POST /api/events/[id]/staff`
  - `DELETE/PATCH /api/events/[id]/staff/[staffId]`
  - `POST /api/events/[id]/check-in`
- **Nunca** aceptar como autoridad desde el cliente: `ticket status`, `used_at`, `owner`, `checked_in_by`, resultado o timestamp.
- Rate limit del scanner por staff/evento, suficientemente alto para una puerta real. Usar la infraestructura de rate limit ya existente en el repo. **No Redis.**

## Pruebas obligatorias (A–T)

Fixtures DEV desechables.

| # | Caso | Resultado esperado |
|---|---|---|
| A | organizer + ticket válido | `PASS` |
| B | mismo ticket, segunda vez | `already_used` |
| C | 20 check-ins concurrentes, mismo ticket | exactamente 1 `PASS` |
| D | `door` `active` | `PASS` |
| E | `door` `revoked` | reject |
| F | usuario aleatorio | reject |
| G | `anon` | reject |
| H | ticket `void` | reject |
| I | ticket inexistente | reject |
| J | QR malformado | reject |
| K | ticket de Evento B, desde scanner de Evento A | reject, sin consumir |
| L | evento `cancelled` | reject |
| M | `GET /t/token` antes del check-in | no consume |
| N | `GET /t/token` después del check-in | no muta; refleja uso si la UX lo contempla |
| O | filas exitosas en `event_checkins` para el ticket | exactamente 1 |
| P | `checked_in_by` | correcto |
| Q | owner agrega staff | permitido |
| R | non-owner agrega staff | rechazado |
| S | owner revoca staff | permitido |
| T | `door` intenta gestionar staff | rechazado |

Además, prueba de UI real (no sustituible por solo RPC): QR real de EVENT-3 → scanner → `PASA`; mismo QR otra vez → `NO PASA / YA UTILIZADA`.

## QA mobile

Prioridad Android/mobile: scanner útil, resultado grande, sin overflow, operable con una mano, reescaneo rápido, sin navegación innecesaria.

## Regresión obligatoria

- **EVENT-3**: issuance, QR, acceso a la orden, `/t/[token]`, void, `approved_unfulfilled` no emite. Scan público sigue sin consumir.
- **EVENT-2**: checkout, orden, stock, `paid`, webhook/reconciliación.
- **Rifas + Colectas + Auth + Mis iniciativas**: smoke dirigido, no auditoría general.

Regla de la chapa: si una puerta tiene una chapa correcta, se avanza; si está rota, se repara. Sin pentest general.

## Procedimiento de aplicación previsto (obligatorio, en este orden)

1. Crear el archivo SQL versionado en `db/migrations/`, siguiendo la convención real del repo (`AAAA-MM-DD_descripcion.sql`, con sufijo de letra si hay más de un archivo en la misma fecha — ver `db/README_DB.md`).
2. Revisar el SQL y **commitearlo en `develop`** antes de aplicarlo contra cualquier base de datos.
3. Aplicar el SQL **exclusivamente** contra `rifex-dev` (project ref `nwxrvwbzqbhznscyirbq`). Nunca contra PROD (`wrdkdfuiwlujfxxijpao`), bajo ninguna circunstancia.
4. Verificar el esquema resultante y el comportamiento funcional (tablas, constraints, RLS, RPC) contra lo versionado.
5. Ejecutar la prueba de concurrencia obligatoria (20 check-ins simultáneos sobre el mismo ticket → exactamente 1 `PASS`) antes de dar por cerrada la migración.
6. Actualizar `docs/WOP.md` con el nuevo checkpoint funcional (commit, evidencia, estado de EVENT-4).
7. **Nunca tocar PROD** en ningún paso de este procedimiento.

## Migración + build + cleanup

- Migración de EVENT-4 **solo** en `rifex-dev`. Esperado: `event_staff`, `event_checkins`, constraints, índices, RLS, RPC de check-in — solo los campos mínimos adicionales. **Nunca PROD.**
- `npm run build` → `PASS` obligatorio.
- Todo cleanup de Supabase debe verificar errores explícitamente (`if (error) throw`) — lección ya documentada de un incidente real en EVENT-2.
- Barrido final obligatorio antes de cerrar: 0 eventos QA, 0 órdenes QA, 0 tickets QA, 0 staff QA, 0 checkins QA, 0 usuarios QA, 0 gateways QA falsos.

## Git

Commit acotado exclusivamente a EVENT-4 + integración mínima. Sugerido: `feat(events): add staff scanner and atomic check-in`. Push exclusivamente a `origin/develop`. **Nunca `main`.**

## Definition of Done (GO EVENT-5 solo si todo lo siguiente se cumple)

- Scanner mobile funciona.
- Owner autorizado; `door` `active` autorizado; `revoked` rechazado.
- Cross-event rechazado; `void` rechazado.
- Check-in exactly-once; 20 concurrentes = 1 `PASS`; segundo scan = `NO PASA`.
- `event_checkins` auditable.
- Scan público sigue siendo distinto de check-in.
- EVENT-3, EVENT-2, Rifas y Colectas intactos (regresión verificada).
- `npm run build` `PASS`.
- Fixtures de prueba en 0.
- PROD intacto.

## Informe final esperado al cerrar EVENT-4

Reentry report; HEAD inicial/final; WOP utilizado; archivos tocados; migración; `event_staff`; `event_checkins`; autorización; RPC de check-in; exactly-once; concurrencia; scanner; parser de QR; fallback manual; cross-event; void; cancelled; gestión de staff; RLS; rate limit; política offline; pruebas A–T; prueba de QR real en UI; QA mobile; panel mínimo; regresión EVENT-3/EVENT-2/Rifas/Colectas; build; cleanup verificado; commit en `develop`; estado de `origin/develop`/`origin/main`; confirmación de PROD intacto; riesgos; veredicto GO/NO-GO para EVENT-5.

Regla de la chapa aplicada también al cierre: P0/P1 nuevo y causado directamente por EVENT-4 → reparar. P2/P3 → documentar. No convertir EVENT-4 en una auditoría general — construir la puerta, probar la chapa, avanzar.

Al entregar ese informe: detenerse. No EVENT-5. No PROD. No Argentina. No nuevo pentest.

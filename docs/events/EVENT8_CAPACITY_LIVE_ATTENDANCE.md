# EVENT-8 — Aforo, tipos de entrada y asistencia en vivo

Migración: `db/migrations/2026-08-30_event8_capacity_live_attendance.sql`.
Numeración: EVENT-6 ya está tomado (auditoría de seguridad, 2026-08-26) y
EVENT-7 está reservado (QR promocional descargable, diferido por
instrucción explícita — ver `EVENTS_BACKLOG.md`). Esta misión es EVENT-8.

## 1. Qué existía antes de esta misión

Auditoría previa (sin código escrito hasta confirmar todo lo siguiente):

- `event_ticket_types` ya existía desde EVENT-1, con CRUD completo
  (`/api/events/[id]/ticket-types/*`) y UX de creador ya construida en
  `/crear-evento.jsx` — **no se creó ninguna abstracción paralela**, se
  reutilizó tal cual.
- `check_in_event_ticket` (EVENT-4) ya era la única autoridad atómica de
  check-in — lock de fila por `qr_token`, exactly-once vía
  `used_at IS NULL`, ya devolvía `ticket_type_name` tanto en `pass` como
  en `already_used`. **No se modificó.**
- `eventAnalytics.js` (EVENT-5) ya calculaba `operational.sold`,
  `operational.checked_in` y `analytics.by_ticket_type` desde las mismas
  fuentes autoritativas (`event_ticket_types`, `event_tickets.used_at`).
- No existía ningún campo equivalente a "aforo del evento" — confirmado
  por lectura de las 4 migraciones de Events y por consulta en vivo a
  `information_schema.columns` sobre rifex-dev antes de escribir la
  migración.
- `check-in.js` no devolvía ningún contador de asistencia — ni en el GET
  (ping) ni en el POST (check-in real).

## 2. `events.capacity` — decisión de producto

Columna `integer`, **nullable**. `NULL` = "sin aforo definido" — nunca un
valor inventado (0 sería falso: "no vende nada"; cualquier número
arbitrario sería una afirmación no verificada sobre un evento real). Un
evento histórico o uno nuevo sin aforo simplemente no tiene la validación
activa; la UI lo muestra explícitamente como "No definido", nunca como 0
ni omitido en silencio.

```sql
alter table public.events add column if not exists capacity integer;
alter table public.events add constraint events_capacity_positive
  check (capacity is null or capacity > 0);
```

## 3. Invariante capacidad↔cupos — trigger SQL, no solo validación en API

Autoridad real: `public._check_event_capacity(p_event_id)`, invocada por
dos triggers (`event_ticket_types_capacity_trg`,
`events_capacity_change_trg`). Fórmula ("comprometido"):

- tipo **activo**: cuenta su `quantity_total` completo (cupo vendible
  configurado — la regla literal del mandato).
- tipo en **cualquier otro estado** (oculto, etc.): cuenta
  `quantity_sold + quantity_reserved`, nunca su `quantity_total`.

La segunda rama cierra un hallazgo real de la auditoría: un tipo ocultado
DESPUÉS de vender entradas sigue representando asistentes reales, y no
puede "desaparecer" del cálculo de aforo. Ejemplo certificado en DEV QA
(sección 6): capacity=10, tipo activo A (total 5, sold 5) + tipo oculto B
(total 8, sold 8) → comprometido=13, reducir/mantener capacity=10 es
rechazado por el trigger.

`raise exception 'event_capacity_exceeded' using errcode = 'P0001'` — las
tres rutas que pueden dispararlo (`PATCH /api/events/[id]`,
`POST/PATCH /api/events/[id]/ticket-types*`) traducen `P0001` a
`409 {error:'event_capacity_exceeded'}`, nunca un 500 crudo.

Ningún trigger escucha `quantity_sold`/`quantity_reserved` — esas columnas
solo cambian dentro de las RPCs atómicas de EVENT-2 (`create_event_order`,
`mark_event_order_paid`, `expire_event_order`), que ya están acotadas por
su propio CHECK (`sold+reserved<=quantity_total`). El camino caliente de
checkout/pago/expiración nunca dispara estos triggers.

`src/lib/eventCapacity.js` — espejo puro en JS (`parseCapacityInput`,
`computeCommittedCapacity`, `wouldExceedCapacity`), mismo criterio que
`eventStaffAuth.js` frente a la RPC de check-in: mejor UX (evita un
round-trip solo para descubrir un formato inválido), nunca un reemplazo
de la autoridad real del trigger.

## 4. Asistencia en vivo — sin segunda fuente de verdad

`check-in.js` gana una función `fetchAttendance(eventId)`: cuenta
`event_tickets` con `used_at IS NOT NULL` para el evento (mismo índice
parcial `event_tickets_used_at_idx` creado en EVENT-4 para este uso
exacto) + lee `events.capacity`. Solo lectura — nunca escribe.

- GET (ping): adjunta `attendance` únicamente si `authorized=true`.
- POST (check-in real): adjunta `attendance` en **toda** respuesta (pass,
  already_used, void, cross-event, etc.) — un refetch liviano tras cada
  intento de escaneo, exactamente lo que el mandato pide ("nunca
  WebSockets/Realtime solo para esto").
- La RPC `check_in_event_ticket` no fue tocada — sigue siendo la única
  invocación de escritura en el archivo.

No existe ningún contador mutable nuevo en `events`/`event_staff` — el
número que ve el scanner siempre se deriva de `event_tickets.used_at` en
el momento de la consulta.

## 5. `available_to_sell` — nunca `capacity - sold`

`eventAnalytics.js` gana `operational.event_capacity` (el aforo real,
distinto y nunca fusionado con `operational.capacity`, que desde EVENT-5
significa "suma de `quantity_total` configurado en tipos" — contrato
intacto) y `operational.available_to_sell`:

```
available_to_sell = Σ (tipos ACTIVOS) max(0, quantity_total - quantity_sold - quantity_reserved)
```

Nunca `event_capacity - sold` — esa resta ignoraría aforo sin asignar a
ningún tipo y tipos ocultos con cupo aún vigente. `by_ticket_type` gana un
campo `available` por tipo, misma fórmula.

## 6. DEV QA — certificación en vivo contra rifex-dev

Fixture creado y **eliminado al terminar** vía las mismas RPCs que usa la
app real (`create_event_order` → `mark_event_order_paid` →
`issue_event_order_tickets` → `check_in_event_ticket`), sin pagos ni
emails reales: evento "EVENTS CAPACITY DEV QA", `capacity=10`,
General/VIP/Premium con stock 5/3/2 (suma=10, límite exacto).

Certificado en vivo, todos GO:

1. Crear un 4º tipo que llevaría la suma a 11 → rechazado
   (`P0001`/`event_capacity_exceeded`).
2. Reducir `capacity` a 5 con 10 ya comprometidos → rechazado.
3. Escaneo válido → `checked_in` +1, `ticket_type_name` visible en la
   respuesta.
4. Reescaneo del mismo ticket → `already_used`, conteo sin cambios.
5. Segundo ticket válido (tipo distinto) → `checked_in` +1 de nuevo.
6. QR inexistente → `ticket_not_found`, conteo sin cambios.
7. Ticket del evento 1 escaneado contra el evento 2 → `ticket_wrong_event`,
   conteo del evento 1 sin cambios.

`events` en rifex-dev vuelve a su conteo previo (1) tras la limpieza —
verificado.

## 7. Fuera de alcance (sin tocar)

Payment Engine, MP OAuth/webhooks/reconciliación, `merchant_gateways`,
Trust/onboarding, Bancos, Cumplimiento, Rifas/Campañas/Colectas, la RPC
`check_in_event_ticket`, Realtime/WebSockets, seats/mapas/promos.

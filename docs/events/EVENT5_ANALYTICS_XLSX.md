# EVENT-5 — Analytics + reporte Excel (XLSX)

Documento canónico de especificación e implementación de EVENT-5. Sigue el mismo criterio de evidencia que `docs/events/EVENT4_STAFF_SCANNER_CHECKIN.md`: toda afirmación está respaldada por código real, tests reales o una medición real — nunca supuesta.

Estado: **implementado, verificado por tests automatizados reales y `npm run build` real. Sin verificación en navegador real contra `rifex-dev`** (ver "Estado de verificación" al final — limitación de herramienta de este sprint, no una omisión deliberada).

---

## Objetivo

Dar al organizador un dashboard de analytics del evento (operacional + financiero + desgloses) y un reporte Excel (XLSX) descargable con el mismo contenido a nivel de detalle, sin exponer nunca `qr_token`/`access_token`/otros secretos, y sin colapsar silenciosamente ninguna cifra financiera u operacional que el diseño previo a este documento (ver el intercambio de diseño previo a la implementación) identificó como críticamente distinta.

## Dos correcciones obligatorias que este documento fija (auditadas contra código real antes de programar)

**1. `approved_unfulfilled` es dinero real, no un estado a excluir silenciosamente.**

Evidencia:
- `mark_event_order_paid` ([db/migrations/2026-08-24_event2_checkout_orders.sql:276-338](../../db/migrations/2026-08-24_event2_checkout_orders.sql)) solo se invoca desde el webhook después de que este verifica `mpStatus === 'approved'` ([src/pages/api/checkout/webhook-events.js:233](../../src/pages/api/checkout/webhook-events.js)) y que el monto/moneda pagados coinciden exacto con la orden.
- `checkout.js` pasa `platform_fee_cents` como `marketplace_fee` real de Mercado Pago ([src/pages/api/events/[id]/checkout.js:100-145](../../src/pages/api/events/[id]/checkout.js)) — la comisión se cobra en el momento real del pago, independiente de si la orden termina `paid` o `approved_unfulfilled`.
- `issue_event_order_tickets` exige `status = 'paid'` estrictamente ([db/migrations/2026-08-25_event3_tickets_qr.sql:88-92](../../db/migrations/2026-08-25_event3_tickets_qr.sql)) — `approved_unfulfilled` nunca emite ningún ticket, sin excepción, sin importar si algún `event_order_items.fulfilled` quedó `true`.

Consecuencia en el modelo: "Recaudación aprobada total" y "Comisión Rifex total" **incluyen** `approved_unfulfilled`; "Recaudación cumplida" lo **excluye**; "Aprobada sin emitir" lo aísla explícitamente como alerta.

**2. Un ticket `void` puede tener `used_at` no nulo — hallazgo real de `void_event_ticket`.**

Evidencia: `void_event_ticket` ([db/migrations/2026-08-25_event3_tickets_qr.sql:137-155](../../db/migrations/2026-08-25_event3_tickets_qr.sql)) solo verifica `status = 'void'` para idempotencia y actualiza `status`/`updated_at` — nunca referencia ni limpia `used_at`. Un ticket que ya hizo check-in real (`used_at` seteado por `check_in_event_ticket`, EVENT-4) puede anularse después sin restricción, y `used_at` permanece para siempre.

Consecuencia en el modelo: "Anuladas" y "fue ingresada" no son mutuamente excluyentes. Se agrega una categoría explícita, "Anuladas usadas antes de anularse", nunca oculta dentro de "Anuladas".

## Arquitectura

```text
lib/eventAnalytics.js         — núcleo puro: fetch de datos + fórmulas + timezone + injection/filename. Sin ExcelJS.
lib/eventAnalyticsAuth.js     — canViewEventAnalytics: organizer_id exclusivamente, nunca door/staff.
lib/eventAnalyticsWorkbook.js — construcción del workbook (ExcelJS), separado para no acoplar las fórmulas a la librería XLSX.
api/events/[id]/analytics/index.js  — GET JSON, dashboard.
api/events/[id]/analytics/export.js — GET XLSX, descarga.
```

Una sola fuente de verdad de cada fórmula (`computeEventAnalyticsSummary`), consumida tanto por el JSON del dashboard como por el workbook — nunca se recalcula la misma cifra dos veces en dos archivos.

## Autorización

`canViewEventAnalytics` (`src/lib/eventAnalyticsAuth.js`) es **estrictamente `events.organizer_id`** — deliberadamente separada de `canCheckIn` (EVENT-4), que sí acepta `door` activo. Un colaborador `door` nunca ve analytics/finanzas, coherente con el principio ya establecido en EVENT-4 ("door... no acceder a finanzas innecesarias"). Verificado por 7 tests reales (`tests/eventAnalyticsAuth.test.mjs`): organizador real, door (rechazado), usuario random, organizador de otro evento (cross-event, rechazado), anon (rechazado sin tocar la base), evento inexistente, error de infraestructura (falla cerrado).

## Modelo financiero (KPIs)

| KPI | Fórmula |
|---|---|
| Recaudación aprobada total | `SUM(total_cents)` para `status IN ('paid','approved_unfulfilled')` |
| Recaudación cumplida | `SUM(total_cents)` para `status='paid'` |
| Aprobada sin emitir | `SUM(total_cents)` para `status='approved_unfulfilled'` |
| Comisión Rifex total | `SUM(platform_fee_cents)` para `status IN ('paid','approved_unfulfilled')` |
| Comisión sin fulfillment | `SUM(platform_fee_cents)` para `status='approved_unfulfilled'` |
| Neto estimado (no conciliado con MP) | `Recaudación aprobada total - Comisión Rifex total` |
| Refund requerido | conteo y monto de `refund_required=true` |

## Modelo operacional (KPIs)

| KPI | Fórmula |
|---|---|
| Capacidad | `SUM(event_ticket_types.quantity_total)` |
| Vendidas | `SUM(event_ticket_types.quantity_sold)` |
| Emitidas totales | `COUNT(event_tickets)` — TODAS las filas, incluidas `void` |
| Válidas | `COUNT(event_tickets)` con `status != 'void'` |
| Anuladas | `COUNT(event_tickets)` con `status = 'void'` |
| Anuladas usadas antes de anularse | `COUNT(event_tickets)` con `status='void' AND used_at IS NOT NULL` |
| Ingresadas | `COUNT(event_tickets)` con `status != 'void' AND used_at IS NOT NULL` |
| Pendientes de ingreso | `COUNT(event_tickets)` con `status != 'void' AND used_at IS NULL` |
| % asistencia | `Ingresadas / Válidas`, o `—` si `Válidas = 0` (nunca `NaN`/`Infinity`) |

## Analytics de desglose

- Por tipo de entrada: capacidad, vendidas, cantidad ordenada, emitidas, válidas, ingresadas.
- Ventas por fecha, agrupadas en `events.timezone` (nunca UTC ni el timezone del runtime).
- Check-ins por hora, agrupados en `events.timezone`.
- Actividad de organizer y staff: check-ins registrados por cada uno, organizer como fila propia (sin email — nunca se enriquece desde `auth.users`).
- Alertas explícitas: `approved_unfulfilled_alert`, `refund_required_alert`.
- Un evento `cancelled` sigue devolviendo el resumen completo — nunca bloqueado por `status`.

## Workbook XLSX — 5 hojas

1. **Resumen** — KPIs operacionales + financieros + desglose por tipo, con relleno de alerta (rojo claro) en filas críticas (`Anuladas usadas antes de anularse`, `Aprobada sin emitir`, `Comisión sin fulfillment`, `refund_required`).
2. **Órdenes-Ventas** — id corto, fecha, estado traducido, comprador (nombre/email — ya legítimamente en `event_orders`, nunca enriquecido), cantidad, total, comisión, fulfillment, refund. (Nombre corregido de "Órdenes/Ventas" a "Órdenes-Ventas": ExcelJS prohíbe `/` en nombres de hoja — hallazgo real, ver "Estado de verificación".)
3. **Entradas** — `ticket_number`, tipo, válida/anulada, emitida, `used_at`, "usada antes de anular" (booleano explícito), orden. Nunca `qr_token`.
4. **Check-ins** — hora, `ticket_number`, tipo, quién registró (organizador o email de staff), orden cronológico.
5. **Personal de acceso** — email snapshot, rol, estado, alta, check-ins registrados; organizador como fila diferenciada, `revoked` conserva historial.

Formula injection: todo valor derivado de input de usuario (`buyer_name`, `buyer_email`, título de evento, nombre de tipo de entrada, `ticket_number`) pasa por `neutralizeFormulaInjection` — si empieza con `= + - @` o tab/CR, se antepone un apóstrofe, forzando texto literal. Verificado con 4 payloads reales inyectados y releídos desde el buffer XLSX generado (`tests/eventAnalyticsWorkbook.test.mjs`).

## Límites deterministas

`checkAnalyticsLimits` (`src/lib/eventAnalytics.js`) verifica, con `COUNT(..., head:true)` — nunca cargando filas primero — los cuatro límites de forma independiente y en orden fijo (orders → tickets → checkins → staff):

| Límite | Máximo |
|---|---|
| Órdenes | 20.000 |
| Entradas | 20.000 |
| Check-ins | 20.000 |
| Personal de acceso | 500 |

Regla: `count > max` rechaza (exactamente en el máximo NO rechaza); nunca trunca; nunca genera un informe parcial; el endpoint `export.js` verifica los límites **antes** de tocar `fetchEventAnalyticsData`/ExcelJS, devolviendo `422` con el límite exacto excedido.

## Prueba de estrés real — hallazgo y corrección de rendimiento

Se generaron datos sintéticos en los cuatro máximos simultáneos (20.000 órdenes + 20.000 entradas + 20.000 check-ins + 500 staff) y se midió `writeBuffer()` real, sin mocks (`tests/eventAnalyticsWorkbook.test.mjs`).

**Primera medición (antes de corregir)**: `computeEventAnalyticsSummary` 16.4s + construcción de filas 29.1s + `writeBuffer` 9.5s ≈ **~38s combinados** — inaceptable para una función serverless.

**Causa raíz real, encontrada por perfilado manual**: las tres funciones de formateo de fecha (`formatEventDateTime`, y las internas de agrupación por fecha/hora) construían una instancia nueva de `Intl.DateTimeFormat` en **cada** llamada — hasta ~60.000 construcciones para el escenario de estrés. La construcción del formateador (carga de datos de locale/timezone) es cara; el propio `.format()` es barato.

**Corrección real**: cache de instancias de `Intl.DateTimeFormat` por `(timeZone, variante)` a nivel de módulo (`src/lib/eventAnalytics.js`).

**Medición después de corregir**: `computeEventAnalyticsSummary` **1.4s**, construcción de filas **4.65s**, `writeBuffer` **~9s** ≈ **~15s combinados**, buffer final **1.85 MB**. Reproducido de forma estable en 3 corridas consecutivas (28.9-29.2s → ahora consistentemente ~15s tras el fix).

**Corrección (sesión de certificación EVENT-5, evidencia real)**: la afirmación original de este documento — "~15s cabe en el timeout de Pro (60s) pero excedería el límite de Hobby (10s)" — estaba basada en cifras desactualizadas, no en la documentación vigente de Vercel. Verificado contra la documentación real de Vercel (`vercel.com/docs/functions/configuring-functions/duration`, actualizada 2026-07-01): con Fluid Compute (activo por defecto en todos los planes desde 2025), el `maxDuration` por defecto es **300s (5 minutos) en Hobby, Pro y Enterprise por igual** — no hay distinción de 10s/60s vigente. El repo no tiene `vercel.json` ni ningún override de `maxDuration` en código, así que aplica ese default de 300s. Los ~15s reales medidos (carga máxima de 20.000/20.000/20.000/500) caben cómodamente, con amplio margen, en cualquier plan. No se implementó ExcelJS streaming — no se justifica con esta evidencia. Confirmar si Fluid Compute fue desactivado explícitamente para este proyecto sigue pendiente (requiere el dashboard de Vercel, sin acceso no-interactivo disponible en esta sesión) — sin evidencia de que lo esté, y siendo el estado por defecto de la plataforma, no se asume lo contrario.

## Timezone / filename / entrega HTTP

- Toda fecha se formatea server-side con `Intl.DateTimeFormat` y `timeZone` explícito (`events.timezone`, nunca el timezone del proceso ni el de Excel del usuario) — el valor ya queda como texto en la celda.
- `sanitizeFilename` conserva letras/números/espacio/guion/guion_bajo, quita acentos, colapsa espacios, trunca a 80 caracteres, nunca retorna vacío (`'evento'` por defecto).
- `export.js` genera el buffer completo en memoria (`workbook.xlsx.writeBuffer()`, sin escritura a disco) y responde con `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` + `Content-Disposition: attachment; filename="..."` + `Content-Length`.

## Privacidad

- `buyer_name`/`buyer_email` solo en la hoja Órdenes-Ventas, ya legítimamente almacenados en `event_orders` — nunca enriquecidos desde `auth.users`.
- Fila de organizador en "Personal de acceso" sin email — Rifex no almacena el email del organizador en ninguna tabla accesible sin consultar `auth.users`, y este módulo tiene el mandato explícito de nunca hacerlo.
- Nunca `qr_token`, nunca `access_token`, nunca IDs internos completos (se usa `shortId`, primeros 8 caracteres, solo para trazabilidad visual).
- `door` no tiene ningún acceso a este módulo (ver Autorización).

## Rate limiting

`GET /api/events/[id]/analytics`: 30 hits/60s por usuario+evento (mismo criterio que otros endpoints de panel). `GET /api/events/[id]/analytics/export`: 6 hits/60s — deliberadamente más bajo, dado el costo real medido de generar el XLSX.

## Tests reales (25/25 PASS, `npm run test:event-analytics`)

- `tests/eventAnalytics.test.mjs` (15): modelo financiero (approved_unfulfilled incluido/excluido correctamente), modelo operacional (void con used_at), % asistencia sin división por cero, refund_required, evento cancelado, desglose por tipo, agrupación por timezone real (caso límite de cambio de día UTC→Santiago), `formatEventDateTime` determinista, formula injection, filename sanitization, límites (dentro/excede/exacto/staff independiente).
- `tests/eventAnalyticsAuth.test.mjs` (7): organizador, door (rechazado), random, cross-event, anon, evento inexistente, error de infraestructura.
- `tests/eventAnalyticsWorkbook.test.mjs` (3): estructura de 5 hojas, formula injection en celdas reales releídas del buffer, estrés en los 4 límites máximos.

`npm run build`: PASS, sin errores ni warnings relacionados a EVENT-5, ambas rutas nuevas registradas (`/api/events/[id]/analytics`, `/api/events/[id]/analytics/export`).

`npm run test:scanner-controller` (regresión EVENT-4): 4/4 PASS, sin cambios de comportamiento — este sprint no modificó ningún archivo de EVENT-1/2/3/4.

## Estado de verificación — certificación real en DEV (sesión posterior, mismo día)

En una sesión posterior a la implementación inicial, se ejecutó el flujo completo contra el deployment real de Vercel DEV (`rifex-frontend-main`, alias `rifex-frontend-main.vercel.app`, confirmado por logs de build reales como el commit exacto en cada paso) y `rifex-dev` (Supabase, `nwxrvwbzqbhznscyirbq`) — no el preview local, siguiendo la instrucción explícita de no usar el panel de vista previa (que en este entorno estaba anclado a un proyecto ajeno).

**Deployment**: confirmado `Ready`, target `Production`, región `iad1`. Commit `dae5344` primero, luego `31e5ac1` (con el fix de autofiltro/fila congelada, ver abajo) — ambos confirmados por `Cloning github.com/ravymaster/rifex-frontend-v2 (Branch: develop, Commit: ...)` en los logs reales de build, no supuestos.

**Fixture real** (`rifex-dev`, controlado, sin PII real, `@example.com`, sin pagos ni correos reales): 4 usuarios desechables (organizador, `door` activo, `door` revocado, usuario random), un evento "EVENT-5 TEST", 3 tipos de entrada, creados vía HTTP real contra el deployment. Órdenes/tickets vía las RPCs reales (`create_event_order`, `mark_event_order_paid`, `issue_event_order_tickets`, `expire_event_order`, `void_event_ticket`) — incluyendo un `approved_unfulfilled` real producido por el mismo camino de "pago tardío" ya certificado en EVENT-2 (invariante 15: reservar el último cupo, expirar, dejar que otra orden se lo quede, y recién ahí reconciliar el pago tardío). Check-ins vía el endpoint real `/check-in`. Staff vía los endpoints reales `/staff`. Cancelación del evento vía el endpoint real `PATCH /api/events/[id]`, que puso `refund_required=true` en las 3 órdenes `paid` reales. **Único paso con escritura directa `service_role`, documentado**: `users_profile.country_code='CL'` para los organizadores de prueba — no existe un endpoint aislado para el onboarding de país fuera del flujo completo de UI (`/onboarding/pais`); todo lo demás usó RPCs o endpoints HTTP reales.

**Fase 3 — 17/17 pruebas reales PASS** contra el deployment: organizador → `200`; `door` activo → `403`; `door` revocado → `403`; usuario random → `403`; anónimo → `401`; organizador real de OTRO evento (cross-event genuino, no simulado) → `403`, con verificación adicional de que ese mismo usuario SÍ puede ver el analytics de su propio evento; `approved_unfulfilled` separado y con alerta; `refund_required` visible (3, coincide exacto con lo que devolvió la cancelación real); evento cancelado sigue devolviendo el resumen completo; y las 9 cifras operacionales (`emitted_total=4`, `voided=2`, `voided_used_before_void=1`, `checked_in=1`, `valid=2`, `pending_check_in=1`, etc.) coinciden exactamente con lo esperado del fixture real, incluyendo el caso demostrado en vivo de un ticket anulado que conserva `used_at`.

**Fase 4 — descarga y relectura real del `.xlsx`** (no solo inspección en memoria antes de serializar): workbook válido, exactamente 5 hojas en el orden correcto, sin ningún valor de celda igual a `qr_token`/`access_token`, fechas pre-formateadas en texto (`DD-MM-YYYY HH:mm:ss`, zona del evento, nunca ISO/`Z`), y el total de "Emitidas totales" del Resumen coincide exacto con el JSON del dashboard.

**Hallazgo real corregido en esta misma sesión de certificación**: la primera descarga real reveló que ninguna hoja tenía fila congelada ni autofiltro — requisito explícito que se había omitido al implementar. Corregido en `src/lib/eventAnalyticsWorkbook.js` (fila 1 congelada en las 5 hojas; autofiltro en las 4 tabulares), cubierto por un test nuevo, commiteado (`31e5ac1`), redesplegado, y **reverificado descargando el archivo real de nuevo** — confirmado presente en el `.xlsx` real.

**Fase 5 — rendimiento real medido, sin subir 20.000 filas reales a Supabase** (dataset pequeño real + estrés local sintético):
- Analytics JSON, dataset real pequeño (4 órdenes/tickets, 2 check-ins, 2 staff), contra el deployment real: **~1.4-1.7s** round-trip completo (incluye red + cold/warm de la función serverless).
- Export XLSX, mismo dataset real: **~1.0-1.5s** round-trip completo.
- Carga máxima (20.000/20.000/20.000/500), medida localmente con datos sintéticos (nunca subidos a `rifex-dev`, por instrucción explícita): **~15s** de cómputo puro, ver sección de estrés arriba.
- `maxDuration` real aplicable: **300s** en cualquier plan (Fluid Compute, default de la plataforma desde 2025, confirmado contra la documentación vigente de Vercel — no hay override en el repo). Ambas cifras (1-2s real pequeño, ~15s estrés máximo sintético) caben con amplio margen.

**Lo único que sigue pendiente, explícito, no oculto**: la confirmación visual de Rodrigo — clic real en el botón "Descargar reporte Excel" desde el panel, y apertura del archivo en Excel/Sheets real de su parte. Todo lo demás de las Fases 1-5 fue verificado de punta a punta contra el deployment y la base de datos reales.

### Prueba manual para Rodrigo

1. Entra a `https://rifex-frontend-main.vercel.app/login` con la cuenta de prueba desechable (credenciales entregadas por chat, no en este documento — no son permanentes, es una cuenta creada solo para esta prueba).
2. Ve a `https://rifex-frontend-main.vercel.app/panel/eventos/<event_id>` (el ID exacto se entrega junto con las credenciales).
3. Revisa la sección "Analytics": deberías ver la alerta roja de "Aprobada sin emitir" y de "refund_required", más los 18 KPIs.
4. Pulsa "Descargar reporte Excel".
5. Abre el archivo descargado en Excel o Google Sheets. Debe abrir sin ninguna advertencia de reparación. Verifica que tenga 5 pestañas (Resumen, Órdenes-Ventas, Entradas, Check-ins, Personal de acceso), que la fila 1 de cada pestaña quede fija al hacer scroll, y que las pestañas de datos tengan flechitas de filtro en el encabezado.
6. El evento de prueba ya está cancelado a propósito (para poder demostrar `refund_required` y "evento cancelado sigue siendo consultable") — es esperado, no un error.

El fixture **no se ha eliminado** — queda disponible para que Rodrigo lo revise antes de cualquier limpieza.

## Fuera de alcance (no tocado en este sprint)

PROD, `rifex.pro`, comisión 7%, suscripciones, EVENT-6, cualquier cambio a EVENT-1/2/3/4 (ningún archivo de esos sprints fue modificado — solo archivos nuevos y una extensión aditiva de `src/pages/panel/eventos/[id].jsx`).

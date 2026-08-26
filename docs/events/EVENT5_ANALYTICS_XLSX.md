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

## Estado de verificación — limitación real de esta sesión

A diferencia de EVENT-4 (certificado con prueba manual real en teléfono), **EVENT-5 no fue verificado en un navegador real contra `rifex-dev`** en este sprint. Causa: el panel de vista previa (Browser pane) de este entorno estaba anclado a la raíz de un proyecto distinto y no lanzó el servidor de desarrollo de `rifex-frontend-v2` — corregido a mitad de sesión (`change_directory`), pero el efecto solo aplica a partir del siguiente turno, después de que este documento y el commit ya se hayan entregado.

Lo que **sí** está verificado, real, sin mocks donde es posible:
- Fórmulas financieras/operacionales, contra datos sintéticos que replican exactamente los casos límite reales encontrados en el código (`approved_unfulfilled`, void-con-used_at).
- Autorización, con lógica real (no solo aserciones triviales).
- El workbook XLSX real, generado con ExcelJS real, releído desde su propio buffer binario para confirmar contenido — no solo inspeccionado en memoria antes de serializar.
- Rendimiento real, medido con reloj real, en el escenario de carga máxima real.
- Compilación completa de Next.js (`npm run build`), sin mocks.

Lo que queda pendiente, explícito, no oculto: clic real en `/panel/eventos/[id]`, descarga real del archivo desde un navegador real, apertura del `.xlsx` resultante en Excel/Sheets real para confirmar que abre sin advertencias de reparación. Recomendado como el último paso antes de considerar EVENT-5 certificado al mismo nivel que EVENT-4.

## Fuera de alcance (no tocado en este sprint)

PROD, `rifex.pro`, comisión 7%, suscripciones, EVENT-6, cualquier cambio a EVENT-1/2/3/4 (ningún archivo de esos sprints fue modificado — solo archivos nuevos y una extensión aditiva de `src/pages/panel/eventos/[id].jsx`).

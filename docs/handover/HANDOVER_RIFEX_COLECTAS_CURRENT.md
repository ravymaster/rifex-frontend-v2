# Rifex — Handover Colectas/Campañas V1 — CERTIFIED

## Estado

```text
CAMPAÑAS V1 — CERTIFIED / PRODUCTION READY
```

Producto completo verificado de punta a punta con datos y un pago reales:
`crear campaña → publicar → compartir/QR → aportar → Mercado Pago → webhook →
approved → recaudado → dashboard → C5R (reconciliación) → notificaciones →
C6F (resolución de ownership sin mp_user_id ambiguo)`.

## HEAD final — desplegado y verificado en producción

```text
branch:      main
HEAD:        bb6bc917a1cce874a8b8577fcc67dbeb15016606
origin/main: igual a HEAD (0 ahead, 0 behind)
tag:         v1.0-colectas-certified -> bb6bc91 (apunta exactamente a este commit)
working tree: limpio (solo ?? .claude/, local, no se commitea)
```

Commits de cierre (más reciente primero):

```text
bb6bc91  fix: C6F — resolver ownership de merchant_gateways sin mp_user_id ambiguo
e2e3d59  feat: C6 — notificaciones de aporte para Colecta + certificación V1
7d83f66  feat: C5R — reconciliación de respaldo para pagos de Colecta
```

## Producto certificado — qué está en producción hoy

- Creación de campaña (`/crear-colecta`), duración fija (15/30/60 días), meta opcional (`goal_cents`, nullable).
- Fotos: recorte/compresión en navegador + **re-encode server-side obligatorio** con `sharp` (nunca se persiste el buffer del cliente — probado con archivo polyglot).
- Página pública (`/colectas/[id]`): dos columnas, tarjeta de Recaudado (con o sin meta) + QR embebido.
- Recaudado y cantidad de aportes públicos, siempre calculados en vivo (`SUM(amount_cents) WHERE status='approved'`).
- Checkout propio (`checkout/colecta.js`): idempotencia, comisión Rifex 7%, token del vendedor real.
- Webhook propio (`checkout/webhook-colecta.js`): firma validada, re-fetch obligatorio a MP, nunca confía en el body.
- **C5R — reconciliación de respaldo** (`admin/reconcile-colecta-payments.js`): busca pagos por `external_reference = contribution.id` (nunca por `mp_payment_id`, que no existe aún en una fila `pending`), token del vendedor resuelto por `creator_id` (no por un hint ambiguo). 36/36 pruebas.
- Dashboard "Mis campañas", QR descargable (Colecta y Rifa, mismo patrón `satori`+`sharp`+Inter empaquetada).
- Acceso "Mis campañas" en el menú de cuenta.

## Primer aporte real — evidencia E2E certificada

```text
contribution_id:      d35c7d38-6f5b-489f-a1c4-7f3e859150b2
colecta_id:            b4703ec1-5a77-4774-8ccd-40474f142c79 ("prueba de uso, ayuda a bruno")
mp_payment_id:         173393385525
live_mode:              true
status:                 approved
monto:                  $500 CLP
collector_id:           2501448870  == mp_user_id del creador (dinero al destino correcto)
application_fee:        $35  (7% exacto)
metadata:                coincide byte a byte con la fila real
pending -> approved:     ~40s real
raised_cents público:    50000 (coincide)
contributor_count:       1 (coincide)
C5R sobre este mismo aporte: already_processed:true, status:approved — no lo re-procesó ni lo degradó
```

Verificado independientemente contra `GET /v1/payments/{id}` con el token real del vendedor, no solo contra la base propia.

## C6 — Notificaciones

**Archivos:**
- Nuevo: `src/lib/colectaMailer.js` — `notifyColectaApproved()`, `sendColectaContributorEmail()`, `sendColectaCreatorEmail()`. Reutiliza `sendEmail()`/`__mailer_utils` de `mailer.js` (import de solo lectura, `mailer.js` queda intacto — 0 diff).
- Modificado (aditivo, autorizado explícitamente): `webhook-colecta.js` y `reconcile-colecta-payments.js` — un import + un bloque `if (approved) { try { await notifyColectaApproved(...) } catch {} }` insertado después de la línea que ya loggeaba la transición exitosa. Cero líneas financieras existentes cambiadas.

**Idempotencia de las notificaciones:** sin mecanismo nuevo — se apoya 100% en el guard financiero ya certificado (`UPDATE ... WHERE status='pending' ...`). El correo solo se intenta en la rama que sigue a un `updated` no-nulo, es decir, solo el proceso que efectivamente ganó la transición. Probado: webhook duplicado, C5R después del webhook, C5R repetido, dos C5R concurrentes, dos webhooks concurrentes, aporte `pending` sin pago (`kept_pending`) — ninguno llega al código de notificación, `updated_at` del aporte real no cambió en ninguna prueba.

**Qué NO incluyen los correos:** `mp_payment_id`, comisión/`marketplace_fee`, ni ningún dato financiero interno — verificado interceptando el body real que se arma para Resend, no solo revisando el código fuente.

## C6F — Resolución de ownership sin `mp_user_id` ambiguo

**Hallazgo (auditado, causa raíz confirmada):** `merchant_gateways` upsertea por `(user_id, provider)` — cada usuario Rifex tiene su propia fila, pero `mp_user_id` nunca tuvo restricción de unicidad. Nada en el OAuth de MP impide que dos usuarios Rifex distintos conecten la misma cuenta MP real; ocurrió con datos reales (`4b4c1cef...` y `020bb993...`, el creador real de la colecta de Bruno, ambas conexiones legítimas). Esto rompía `.eq('mp_user_id', hint).maybeSingle()` en `fetchPayment()` de `webhook-colecta.js`.

**Decisión:** no se agregó `UNIQUE(mp_user_id)` — una misma cuenta MP conectada a más de un usuario Rifex no es necesariamente ilegítima, y el dinero siempre va a la cuenta MP real conectada independientemente de cuál login Rifex la usó. El problema era de **resolución**, no de integridad de datos.

**Fix (confinado a `fetchPayment()` en `webhook-colecta.js`, único archivo tocado):** en vez de asumir una sola fila candidata, se traen todas y se prueba cada token contra la API real de MP — la propia respuesta de MP decide cuál token puede ver el pago, no una suposición nuestra. El chequeo de metadata que ya existía más abajo (`colecta_id`/`contribution_id` reales del pago) sigue siendo la autoridad final. `reconcile-colecta-payments.js` no se tocó (ya resolvía por `creator_id`, único, nunca sufrió este problema).

**Probado contra el escenario real** (las dos filas reales, sin fabricar nada): webhook replicado en producción → `already_processed:true, status:approved`, **converge exactamente con C5R** sobre el mismo aporte. Prueba aislada de `fetchPayment()` extraída verbatim (4/4): primera candidata falla → prueba la segunda con éxito; primera funciona → no sigue de más; ambas fallan → falla segura; sin candidatas → no llama a MP. `updated_at` del aporte real idéntico antes/después en todas las corridas — cero notificaciones duplicadas (el código de C6 sigue siendo inalcanzable desde la rama "ya procesada").

## Protected Baseline (Rifa) — verificado, intacto

```text
tag:    v1.0-rifex-baseline (anotado)
commit: 18138ae3f04319e43caa22dd881240cd65cb0dd0
```

`git diff v1.0-rifex-baseline` = 0 en: `checkout/mp.js`, `checkout/webhook.js`, `checkout/confirm.js`, `admin/reconcile-payments.js`, `lib/drawWinner.js`, `lib/mailer.js`, `api/mp/*`, `api/rifas/*` (excepto el `qr.png.js` nuevo, sibling), `api/raffles/*`, `panel/*` (excepto la línea aditiva del QR de Rifa, ya autorizada y pusheada), `rifas/*` páginas.

### Qué NO debe tocarse al retomar

- Todo lo listado arriba.
- El bug conocido de `fetchPayment()` en el webhook de **Rifa** (404 con token plataforma no cae al fallback) — sigue sin corregir, deliberadamente fuera de scope de Colecta (es el equivalente exacto de lo que sí se corrigió en `webhook-colecta.js` con C6F, pero tocar el archivo de Rifa no está autorizado).
- `panel/bancos.js` — solo enlazado.

## Riesgos y deudas conocidas

1. Webhook certificado de Rifa: comportamiento conocido (404 → no fallback), idéntico en naturaleza al que C6F corrigió del lado de Colecta. Fuera de scope, documentado, no tocado.
2. Admin real de Rifex, pendiente para etapa posterior.
3. C6 no probó el envío real a una bandeja de entrada humana verificable (por diseño — se usaron solo direcciones `@rifex-test.local`, no entregables, para no mandar correos de prueba a personas reales). El motor de envío (`sendEmail`/Resend) ya está certificado y en producción para Rifa desde antes; lo nuevo en C6 es únicamente el enganche de idempotencia + los templates de Colecta, ambos probados exhaustivamente.

## Cerrado

`merchant_gateways.mp_user_id` duplicado entre dos usuarios reales — **resuelto por C6F** (ver arriba). Ya no es un riesgo abierto.

## Tag de cierre

```text
v1.0-colectas-certified -> bb6bc917a1cce874a8b8577fcc67dbeb15016606
```

## Siguiente etapa

Evento. El QR de Evento será **transaccional**, distinto en naturaleza al QR público/informativo de Colecta — no reusar el mismo diseño sin pensarlo de nuevo.

---

## Sprint de cierre UX previo a Country Gate (posterior a la certificación V1)

Tres pendientes visibles resueltos, **cero cambios al flujo financiero** (checkout, webhook, C5R, `marketplace_fee`, OAuth MP, `merchant_gateways`, comisión 7% — todos en 0 diff). Sin commitear/pushear todavía a la espera de autorización.

### 1. Home multiproducto
`src/pages/index.js` + `src/styles/index.module.css`. El hero pasó de ser 100% rifa (`"Crea. Comparte. Sortea."`, badge con una estadística inventada de rifas) a mencionar ambos productos explícitamente, y se agregó una sección nueva "Dos formas de recaudar con Rifex" con una tarjeta por producto (Rifas / Campañas de recaudación), cada una con su propio CTA. Grid con `auto-fit`/`minmax` a propósito — agregar una tercera tarjeta (Eventos) más adelante no requiere tocar el CSS. En el marketing de Home el producto se llama **"Campañas de recaudación"**, nunca "Colecta" — el término interno `colecta` sigue igual en rutas/tablas/código.

### 2. Fix `/rifas` (listado público vacío)
**Causa raíz, doble bug, no relacionado a datos ni a RLS:**
1. `GET /api/rifas` siempre devolvió `{ ok, items }`, pero `src/pages/rifas.js` leía `j?.data` (`undefined` siempre) → `items` quedaba vacío sin importar cuántas rifas reales activas existieran. Fix: leer `j?.items`.
2. Los campos del render eran nombres en español (`r.titulo`, `r.precio_clp`, `r.cupos`, `r.estado`, `r.temas`) que **nunca existieron** en `raffles` (la tabla usa inglés: `title`, `price_cents`, `total_numbers`, `status`, `theme`). Fix: usar los nombres reales.
3. Hallazgo adicional durante la auditoría: el filtro público por defecto era `.neq('status','deleted')` — más laxo de lo debido (dejaría pasar cualquier estado que no fuera `deleted`, incluido un hipotético `draft`). Se acotó a `.in('status', ['active','closed'])` en `src/pages/api/rifas/index.js` — el único archivo tocado dentro de `api/rifas/*` (protegido), cambio de una línea, sin tocar nada financiero.
4. Hallazgo adicional: `"Mis rifas"` nunca filtró por dueño (el parámetro `mine=true` no se leía en el backend, y el fetch no mandaba token). Se resolvió reusando `/api/panel/raffles` (endpoint ya existente, ya probado, con filtro real por `creator_id`/`creator_email`) en vez de reinventar la lógica.

Probado (9/9, intentando romperlo): rifa real `Prueba` aparece en público; `active`/`closed` de prueba aparecen; `deleted` y `draft` NO aparecen en público; `draft` SÍ aparece en "Mis rifas" del dueño; un usuario ajeno no ve las rifas de otro; sin sesión, `/api/panel/raffles` responde `401`.

### 3. Contacto oficial
Búsqueda completa del repo: **solo** `src/pages/contacto.js` tenía `hola@rifex.app` (2 apariciones) — reemplazadas por `contacto@rifex.pro`. `terminos.js` y `preguntas-frecuentes.js` ya usaban `contacto@rifex.pro` correctamente, sin cambios. Placeholders de formularios (`tucorreo@dominio.com`, `tu@email.com`) no se tocaron a propósito — no son el contacto oficial.

### Pendientes explícitos después de este sprint (en orden)

1. **COUNTRY GATE V1 — Chile only**
2. **Rifex Admin / Operations Backend V1**
3. **Production V1 final audit → lanzamiento/publicidad**

**Pendiente financiero obligatorio antes del lanzamiento comercial definitivo:** falta la prueba real de `marketplace_fee` con una **segunda cuenta Mercado Pago genuinamente distinta** de la que hoy es dueña de la app `rifexv3` (confirmado por auditoría: hoy el owner de `rifexv3` y el vendedor de prueba son la misma cuenta MP — `2501448870` — por eso el primer pago real de $500 no descontó la comisión Rifex). No bloqueó este sprint de UX; sí bloquea el lanzamiento comercial.

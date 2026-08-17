# Rifex — Handover Colectas/Campañas V1 — CERTIFIED

## Estado

```text
Colecta/Campañas V1 — CERTIFIED
```

Producto completo verificado de punta a punta con datos y un pago reales:
`crear campaña → publicar → compartir/QR → aportar → Mercado Pago → webhook →
approved → recaudado → dashboard → C5R (reconciliación) → notificaciones`.

## HEAD

```text
branch:  main
HEAD antes de esta sesión: 7d83f66f3fcf5fe3d8bf79b626ed0cac12c6f641 (C5R)
origin/main: igual a ese HEAD

Cambios de C6 en esta sesión — TODAVÍA NO COMMITEADOS NI PUSHEADOS:
 M src/pages/api/checkout/webhook-colecta.js
 M src/pages/api/admin/reconcile-colecta-payments.js
?? src/lib/colectaMailer.js
```

Commit/push/tag de C6 quedan pendientes de autorización explícita por separado
(no autorizados en esta sesión a propósito).

## Producto certificado — qué está en producción hoy (sin contar C6, aún no pusheado)

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

## C6 — Notificaciones (esta sesión, no pusheado aún)

**Archivos:**
- Nuevo: `src/lib/colectaMailer.js` — `notifyColectaApproved()`, `sendColectaContributorEmail()`, `sendColectaCreatorEmail()`. Reutiliza `sendEmail()`/`__mailer_utils` de `mailer.js` (import de solo lectura, `mailer.js` queda intacto — 0 diff).
- Modificado (aditivo, autorizado explícitamente): `webhook-colecta.js` y `reconcile-colecta-payments.js` — un import + un bloque `if (approved) { try { await notifyColectaApproved(...) } catch {} }` insertado después de la línea que ya loggeaba la transición exitosa. Cero líneas financieras existentes cambiadas.

**Idempotencia de las notificaciones:** sin mecanismo nuevo — se apoya 100% en el guard financiero ya certificado (`UPDATE ... WHERE status='pending' ...`). El correo solo se intenta en la rama que sigue a un `updated` no-nulo, es decir, solo el proceso que efectivamente ganó la transición. Probado: webhook duplicado, C5R después del webhook, C5R repetido, dos C5R concurrentes, dos webhooks concurrentes, aporte `pending` sin pago (`kept_pending`) — ninguno llega al código de notificación, `updated_at` del aporte real no cambió en ninguna prueba.

**Qué NO incluyen los correos:** `mp_payment_id`, comisión/`marketplace_fee`, ni ningún dato financiero interno — verificado interceptando el body real que se arma para Resend, no solo revisando el código fuente.

**Hallazgo colateral, fuera de alcance, no corregido:** `merchant_gateways` tiene el mismo `mp_user_id` en dos filas reales (dos usuarios de Rifex conectaron la misma cuenta MP en momentos distintos) — rompe el fallback por "hint" de `fetchPayment()` en `webhook-colecta.js` (ya certificado, no tocado). Falla en modo seguro (no escribe nada, no notifica). C5R no lo sufre porque resuelve por `creator_id` (único), no por `mp_user_id`.

## Protected Baseline (Rifa) — verificado, intacto

```text
tag:    v1.0-rifex-baseline (anotado)
commit: 18138ae3f04319e43caa22dd881240cd65cb0dd0
```

`git diff v1.0-rifex-baseline` = 0 en: `checkout/mp.js`, `checkout/webhook.js`, `checkout/confirm.js`, `admin/reconcile-payments.js`, `lib/drawWinner.js`, `lib/mailer.js`, `api/mp/*`, `api/rifas/*` (excepto el `qr.png.js` nuevo, sibling), `api/raffles/*`, `panel/*` (excepto la línea aditiva del QR de Rifa, ya autorizada y pusheada), `rifas/*` páginas.

### Qué NO debe tocarse al retomar

- Todo lo listado arriba.
- El bug conocido de `fetchPayment()` en el webhook de Rifa (404 con token plataforma no cae al fallback) — no corregir dentro de Colecta.
- El hallazgo colateral de `merchant_gateways.mp_user_id` duplicado — no corregir sin decisión explícita (afecta datos reales de dos usuarios reales conectados a la misma cuenta MP).
- `panel/bancos.js` — solo enlazado.

## Riesgos y deudas conocidas

1. Webhook certificado de Rifa: comportamiento conocido (404 → no fallback). Fuera de scope, documentado.
2. `merchant_gateways.mp_user_id` no es único — rompe el fallback por hint del webhook de Colecta si la misma cuenta MP se conecta a 2+ usuarios. Falla en modo seguro. No corregido (fuera de alcance de C6).
3. Admin real de Rifex, pendiente para etapa posterior.
4. C6 no probó el envío real a una bandeja de entrada humana verificable (por diseño — se usaron solo direcciones `@rifex-test.local`, no entregables, para no mandar correos de prueba a personas reales). El motor de envío (`sendEmail`/Resend) ya está certificado y en producción para Rifa desde antes; lo nuevo en C6 es únicamente el enganche de idempotencia + los templates de Colecta, ambos probados exhaustivamente.

## Pendiente — orden acordado

1. **Certificación de este informe** (Doris revisa el cierre).
2. Autorización separada de: commit → push → verificación en producción → tag/checkpoint final de Colecta V1.
3. Después: Evento. El QR de Evento será **transaccional**, distinto en naturaleza al QR público/informativo de Colecta — no reusar el mismo diseño sin pensarlo de nuevo.

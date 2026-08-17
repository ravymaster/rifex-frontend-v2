# Rifex — Handover Colectas (cierre de sesión)

## HEAD final

```text
branch:  main
HEAD:    a86beb48fb63c9a4a05fdc319a5b7694e648071b
mensaje: feat: agregar "Mis campañas" al menú de cuenta
origin/main: igual a HEAD (0 ahead, 0 behind)
working tree: limpio (solo ?? .claude/, local, no se commitea)
```

Confirmado en producción: `https://rifex.pro` sirve este HEAD — el chunk JS
`326-56b9c0fa057e6e34.js` contiene el string `"Mis campañas"` (verificado
por `curl` + `grep` sobre el bundle real servido, no solo por fecha de
deploy).

## Estado de producción

Todo lo listado abajo está **desplegado y confirmado funcionando en
`rifex.pro`** con datos reales (no solo local):

- Creación de campañas (`/crear-colecta`), duración fija (15/30/60 días).
- Fotos de portada y galería: recorte + compresión automática en el
  navegador (canvas), y **re-encode server-side obligatorio** con `sharp`
  antes de guardar en Supabase Storage — nunca se persiste el buffer que
  manda el cliente. Probado con un archivo "polyglot" (jpeg real + ~500KB
  de basura pegada atrás, simulando payload adosado) y confirmado que el
  archivo final no contiene ese payload.
- Página pública (`/colectas/[id]`) — layout de dos columnas (una en
  mobile): historia + fotos a la izquierda, tarjeta de "Recaudado" y
  tarjeta de QR a la derecha.
- Meta de recaudación **opcional** (`goal_cents`, nullable) — sin meta,
  sigue siendo aporte libre puro, sin barra de progreso.
- Recaudado y cantidad de aportes expuestos públicamente, calculados en
  vivo (`SUM(amount_cents) WHERE status='approved'`), nunca cacheados.
- Checkout de Colecta separado de Rifa (`checkout/colecta.js`), con
  idempotencia (`idempotency_key`), fee 7% (`marketplace_fee_cents`).
- Webhook de Colecta separado de Rifa (`checkout/webhook-colecta.js`),
  con validación de firma y re-fetch obligatorio a la API de MP.
- Dashboard del creador "Mis campañas" (`/crear-colecta`, sección
  inferior) — estado por campaña, recaudado, banner si no tiene MP
  conectado, descarga de QR.
- QR: descargable desde el dashboard y **embebido directo en la página
  pública** (`/api/colectas/[id]/qr.png`), renderizado con `satori` +
  fuente Inter empaquetada — sin dependencia de fuentes del sistema
  (bug de producción encontrado y corregido esta sesión).
- Acceso "Mis campañas" agregado al menú de cuenta (desktop + mobile).
- Responsive verificado (grid a una columna bajo 900px).

## Endpoints y tablas principales

**Endpoints (todos en `src/pages/api/colectas/` y `src/pages/api/checkout/`):**

| Endpoint | Método | Qué hace |
|---|---|---|
| `/api/colectas` | POST | Crea campaña. Identidad siempre desde sesión. Acepta `duration_days` (15/30/60), `goal_cents` (opcional). |
| `/api/colectas/[id]` | GET | Vista pública. Devuelve `status` derivado (`deriveEffectiveStatus`), `raised_cents`, `contributor_count`, `goal_cents`. |
| `/api/colectas/mine` | GET | Dashboard del creador. Bearer-auth. `raised_cents` por campaña + `mp_connected`. |
| `/api/colectas/[id]/qr.png` | GET | Ficha QR (satori + sharp), pública, 404 si la campaña no es visible. |
| `/api/colectas/upload-photo` | POST | Sube foto (re-encode obligatorio, nunca guarda buffer crudo). |
| `/api/checkout/colecta` | POST | Crea preferencia MP para un aporte. Idempotente. |
| `/api/checkout/webhook-colecta` | POST | Confirma pago, re-fetch a MP, guarda `approved`/`rejected`. |

**Tablas (Supabase):**

- `colectas` — `id, creator_id, title, description, cover_image_url, gallery_urls, status, goal_cents, start_at, end_at, created_at, updated_at`. RLS: SELECT público solo si `status in ('active','closed')`; INSERT/UPDATE/DELETE solo owner.
- `colecta_contributions` — `id, colecta_id, amount_cents, contributor_email, contributor_name, status, mp_payment_id, mp_preference_id, mp_init_point, marketplace_fee_cents, idempotency_key, created_at, updated_at`. RLS: **sin políticas de cliente** — solo `service_role` lee/escribe. `colecta_id` es `ON DELETE RESTRICT` (protege registros financieros aprobados).

## Decisiones de arquitectura (por qué, no solo qué)

- **Sibling-file, nunca modificar Rifa**: cada pieza de Colecta es un
  archivo nuevo que copia el *patrón* de su equivalente en Rifa, nunca lo
  importa ni lo edita (`checkout/colecta.js` ≠ `checkout/mp.js`,
  `webhook-colecta.js` ≠ `webhook.js`).
- **`deriveEffectiveStatus`** (`src/lib/colectaStatus.js`) es la única
  autoridad de estado — una campaña `active` en DB cuyo `end_at` ya pasó
  se trata como `finished` en todos lados (pública, checkout, dashboard)
  sin depender de un job que actualice la columna.
- **Meta opcional, no obligatoria**: `goal_cents` nullable a propósito.
  Colecta se diseñó como "aporte libre, sin meta ni premio"; la meta es
  un dato visual opcional, no cambia la lógica de aceptación de aportes.
- **Nunca confiar en el buffer que sube el cliente para fotos**: el
  navegador recorta/comprime primero (evita el límite de body de Vercel
  ~4.5MB y da UX instantánea), pero el servidor **siempre** vuelve a
  decodificar y re-codificar con `sharp` antes de guardar — ese es el
  límite de seguridad real, no el paso del navegador.
- **QR con fuente empaquetada**: `satori` renderiza texto como `<path>`
  vectoriales usando `src/assets/fonts/Inter-*.woff` (SIL OFL,
  versionada en el repo), nunca `<text>`+`font-family` — el bug original
  era exactamente eso fallando en el entorno serverless de Vercel.
- **`notification_url` del webhook de Colecta está hardcodeado** a
  `/api/checkout/webhook-colecta`, nunca cae a `MP_WEBHOOK_URL` — evita
  que un pago de Colecta dispare el webhook de Rifa o viceversa (riesgo
  identificado en la auditoría de arquitectura original).

## Pruebas realizadas (con datos reales, no solo teoría)

- Cada fase (C1-C5, Dashboard, QR font-fix, hardening de fotos, meta
  pública) se probó contra la base de datos real de producción con
  cuentas de prueba desechables (creadas y borradas vía
  `admin.auth.admin`), nunca mocks.
- QR: decodificado programáticamente (`jsqr`) contra el PNG real
  descargado de `rifex.pro`, confirmando que apunta exactamente a
  `https://rifex.pro/colectas/[id]`.
- Fotos: probado con un archivo polyglot (jpeg + payload pegado) contra
  el endpoint real de producción — el archivo guardado no contiene el
  payload (re-encode confirmado, no solo asumido).
- Meta/recaudado/aportes: creadas campañas reales con y sin meta,
  aportes `approved`/`pending`/`rejected` inyectados directo en DB,
  confirmado que la API pública suma solo `approved` y que RLS sigue
  bloqueando lectura directa de `colecta_contributions` por un cliente
  anónimo.
- **No probado todavía**: un aporte real de punta a punta pasando por
  Mercado Pago (`pending → approved` vía webhook real). Ver pendientes.

## Commits relevantes de esta sesión (más reciente primero)

```text
a86beb4  feat: agregar "Mis campañas" al menú de cuenta
887d742  feat: página pública de Colecta con panel de Recaudado + QR embebido
84023be  feat: la vista previa de fotos de Colecta ya muestra el recorte final
9992c7b  feat: fotos de Colecta se recortan/comprimen siempre, nunca se rechazan por peso
aa103d0  fix: QR de Colecta ya no depende de fuentes del sistema en Vercel
1583623  feat: Colecta dashboard — duration, live revenue, MP status, QR card
7b1dc77  feat: Colecta V1 — free-contribution product alongside Rifa (C1-C5)
18138ae  ← v1.0-rifex-baseline (Rifa cerrada, protegida)
```

## Protected Baseline (Rifa) — verificado, intacto

```text
tag:    v1.0-rifex-baseline (anotado)
commit: 18138ae3f04319e43caa22dd881240cd65cb0dd0
```

`git diff v1.0-rifex-baseline -- <archivos protegidos>` = **0 líneas**
para: `checkout/mp.js`, `checkout/webhook.js`, `checkout/confirm.js`,
`admin/reconcile-payments.js`, `lib/drawWinner.js`, `api/mp/*`,
`api/rifas/*`, `api/raffles/*`, `panel/*`, `rifas/*` (páginas), y las
tablas `payments`, `purchases`, `raffles`/`rifas`, `tickets`,
`merchant_gateways`.

Único cambio dentro de esos directorios: **archivos nuevos** (no
modificaciones) — `checkout/colecta.js` y `checkout/webhook-colecta.js`,
que viven junto a sus pares de Rifa pero son 100% independientes
(sibling-file architecture, ver arriba).

### Qué NO debe tocarse al retomar

- Ninguno de los archivos/tablas listados arriba.
- El bug conocido de `fetchPayment()` en el webhook de Rifa (404 con
  token plataforma no cae al fallback de token del vendedor) —
  **NO corregir dentro del trabajo de Colecta**, ya está fuera de scope.
- `panel/bancos.js` — solo enlazado, nunca editado.

## Riesgos y deudas conocidas

1. **Webhook certificado de Rifa** tiene el comportamiento conocido
   descrito arriba (404 → no fallback). Documentado, no corregido,
   fuera de scope de Colecta a propósito.
2. **Colecta no tiene reconciliación todavía** — si el webhook de MP no
   llega o falla, hoy no hay mecanismo de respaldo para recuperar ese
   pago. Rifa sí lo tiene (`admin/reconcile-payments.js`); Colecta
   necesita su propio equivalente antes de considerarse financieramente
   resiliente (ver C5R abajo).
3. **Falta la prueba real end-to-end `pending → approved`** — todo el
   checkout/webhook de Colecta está probado con creación de preferencias
   reales y con la lógica de aprobación revisada línea por línea, pero
   nunca se completó un pago real de punta a punta. No se gastó dinero
   real sin autorización explícita, así que este es un hueco de
   cobertura aceptado y documentado, no un olvido.
4. **Admin real de Rifex** sigue pendiente para una etapa posterior, no
   relacionado con Colecta.

## Pendiente para la próxima sesión (en este orden)

### 1. C5R — Reconciliación de pagos de Colecta
Mecanismo de respaldo para recuperar pagos si el webhook no llega o
falla. Debe reutilizar los principios ya certificados en Rifa:
- Mercado Pago como fuente de verdad (nunca confiar en el cliente).
- Idempotencia (mismo criterio que `webhook-colecta.js`).
- Archivo nuevo, sibling de `admin/reconcile-payments.js` — **no tocar
  la reconciliación de Rifa**.

### 2. Primer aporte real controlado (después de C5R)
Aporte real mínimo, autorizado explícitamente antes de ejecutarlo.
Verificar: preferencia creada, dinero al MP correcto, 7% de fee Rifex,
webhook recibido, `pending → approved`, recaudado del dashboard,
contador público, y que la reconciliación lo detectaría como respaldo
si el webhook fallara.

### 3. C6 — Correos y notificaciones
Correo al aportante, aviso al creador, plantillas propias de Rifex —
**sin modificar las plantillas existentes de Rifa**.

### 4. Después — cierre de Colecta V1
Una vez certificado lo anterior: tag de cierre de Colecta V1, y recién
ahí empezar Evento. El QR de Evento será **transaccional** (distinto en
naturaleza al QR público/informativo de Colecta) — no reusar el mismo
diseño sin pensarlo de nuevo.

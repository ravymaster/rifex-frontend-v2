# Rifex Current Handover

Última actualización: 2026-08-18, cierre de QA final V1 (A3 + auditoría completa). Reemplaza por completo el handover anterior, que describía el estado previo a Country Onboarding/Gate y Admin — quedó obsoleto (por ejemplo, describía split payments como "NOT AVAILABLE"; hoy están certificados y en producción).

## Identidad

- Product: Rifex — plataforma de Rifas y Campañas de recaudación (Chile, V1).
- Repository: `/home/desktop/rifex-frontend-v2` (Linux).
- Remote: `https://github.com/ravymaster/rifex-frontend-v2.git`.
- Main branch: `main`.
- Production: `https://rifex.pro`, Vercel, auto-deploy on push a `main`.
- Stack: Next.js 14 Pages Router, React 18, Supabase, Mercado Pago SDK/REST, Resend, hCaptcha.

## HEAD final de esta sesión

```text
9b1b6d66b5b5f9a3d060c3a0f3ef0c7618f26979
feat(admin): centro operativo read-only completo (A2-B)
```

`origin/main` coincide con este HEAD. **Pendiente de push** (sin comitear todavía): A3 (`src/pages/api/admin/search.js`, `src/pages/api/admin/reconcile.js`, extensión de `src/pages/admin/index.jsx`) — implementado y probado en esta sesión, a la espera de autorización de push tras revisión de este informe.

Tags protegidos (Protected Baseline):
```text
v1.0-rifex-baseline          → 18138ae3f04319e43caa22dd881240cd65cb0dd0
v1.0-colectas-certified      → 6c756d52ffc27467832febe4b293c7b5ca0f79fa
```

## Production status

`https://rifex.pro` activo, `HTTP 200`. Rifas y Campañas certificadas con pagos reales, split 7% real, retry `rejected→approved` (C6F2), C5R, notificaciones C6, Country Gate y Admin Auth todos verificados en producción real (no solo local) en esta sesión.

## Country Gate (G1 + G2)

- **G1 — Country Onboarding**: `users_profile.country_code`, nullable, sin default. Onboarding obligatorio post-login (`/onboarding/pais`), enganchado en Google callback, login manual y bootstrap de `/panel`. Certificado con prueba manual del usuario en producción.
- **G2 — Country Gate operativo**: `src/lib/countryPolicy.js` (política central, capabilities `raffles`/`fundraising`/`mercadoPago` por país) + `src/lib/countryGate.js` (`assertCountryGate(userId, capability)`, autoridad única = DB, nunca el cliente). Protege 5 puntos: crear rifa, crear campaña, `mp/oauth/start`, checkout Rifa, checkout Campaña (evaluando el país del **creador**, no del comprador). `oauth/callback`, `mp/status`, `mp/disconnect`, webhooks, C5R y reconcile quedan explícitamente **fuera** del Gate.
- V1: solo `CL` habilitado (`raffles`, `fundraising`, `mercadoPago` = `true`). `AR/BR/MX/CO/PE/UY` modelados, deshabilitados.
- Verificado en esta sesión: navegación pública sin restricción, usuario sin país bloqueado (`needs_onboarding`), país deshabilitado bloqueado (`country_not_available`), falsificar `country_code` desde el cliente no tiene efecto, checkout directo por curl bloqueado por país del creador, OAuth start no crea `mp_oauth_state` cuando bloquea, webhooks/C5R/reconcile siguen funcionando idéntico sin importar la política de país.

## Admin (A1 + A2 + A2-B + A3)

- **A1 — Auth real**: `/admin` + `src/lib/adminAuth.js` (`resolveAdmin`) + `/api/admin/me`. Autoridad = `user.app_metadata.role === 'admin'`, leído siempre fresco vía `auth.getUser(token)` (revocación instantánea probada, sin re-login). Imposible de autoasignar (`app_metadata` no es escribible desde el cliente, solo vía Admin API + service role). Primer admin asignado manualmente: `rodrigo0878@gmail.com` (`020bb993-ea53-4169-aab0-067abf0cb939`).
- **A2 / A2-B — Dashboard read-only**: Total recaudado Chile, Ingresos Rifex Chile (con breakdown Rifas/Campañas), counts (usuarios totales, creadores con actividad, rifas/campañas activas, MP conectados, pagos por estado), actividad reciente, pagos recientes, alertas de salud, Country Status (lee `countryPolicy.js`), Feature Status (lee nuevo `src/lib/featureFlags.js`, config pura sin DB).
- **A3 — Operaciones admin** (implementado y probado esta sesión, **sin push todavía**): `src/pages/api/admin/search.js` (búsqueda por `payment_id`, UUID de rifa/campaña/contribution/purchase, email, título — solo datos operativos seguros, nunca `select('*')` sobre `merchant_gateways`, nunca headers de `webhook_events`) y `src/pages/api/admin/reconcile.js` (proxy server-side hacia los reconciliadores YA certificados — `reconcile-payments.js` para Rifas, `reconcile-colecta-payments.js` para Campañas — usando `ADMIN_API_TOKEN` leído server-side, nunca expuesto al navegador). Sin botones de edición manual de estado financiero, sin UPDATE desde UI.
- Todos los `/api/admin/*` nuevos exigen `resolveAdmin`; ninguno expone `access_token`/`refresh_token`/`service role`/`ADMIN_API_TOKEN`/secretos de MP o Resend — verificado con checks automáticos sobre las respuestas reales.

## Rifas

- Creación (`/crear-rifa` → `POST /api/rifas`), checkout (`POST /api/checkout/mp`), webhook (`checkout/webhook.js`), reconciliación de respaldo (`admin/reconcile-payments.js`), sorteo (`drawWinner`/`notifyWinnerDrawn`), notificaciones — todo certificado con pagos reales en sesiones previas de este mismo proyecto.
- **Bug reportado ("temática termina en 'mixto'")**: auditado exhaustivamente esta sesión — selector → payload → API → DB → lectura (tanto vía `service role` como vía el mismo cliente `anon` que usa la página pública) — probadas las 9 temáticas existentes contra producción real, **todas persisten y se leen correctamente**. No se pudo reproducir. Evidencia adicional: la rifa real "Prueba" (creada el 2026-08-17 por un usuario real) ya tiene `theme:"deportes"` correctamente guardado. No se aplicó ningún cambio de código especulativo — ver sección de riesgos conocidos.
- **Gap conocido**: `payments.mp_payment_id = 173008593553` (rifa "prueba real") es un pago `approved` real sin `marketplace_fee_cents` registrado (`null`). Documentado desde A2, visible en el dashboard admin como alerta, nunca estimado ni escondido.
- **Gap conocido**: `reconcile-payments.js` (Rifas) no escribe ninguna traza en `webhook_events`, a diferencia de Campañas (`colecta.reconcile`) — asimetría real de observabilidad, no de funcionalidad.
- **Gap observado en esta sesión**: al reconciliar un pago de rifa real ya resuelto vía el proxy nuevo de A3, `reconcile-payments.js` devolvió `fetch_failed` al intentar re-consultar ese pago contra Mercado Pago — su `fetchPayment()` no tiene el mismo fallback multi-token que ya tiene el de Campañas. No bloquea el flujo normal (el webhook ya lo había aprobado correctamente en su momento), pero es una debilidad real del camino de recuperación de respaldo para Rifas.

## Campañas

- Creación, duración (15/30/60 días), imágenes, meta opcional, página pública, dashboard, QR, checkout (`checkout/colecta.js`), retry `rejected→approved` (certificado en C6F2 con un caso real recuperado por C5R sin UPDATE manual), split 7%, recaudado, C5R, notificaciones (Resend, confirmado con IDs de entrega reales) — todo certificado con datos reales, sin necesidad de generar pagos nuevos en esta sesión (la evidencia existente ya alcanzaba).

## Pagos / 7% / Reconciliación / Notificaciones

- Fuente autoritativa de comisión Rifex: `payments.marketplace_fee_cents` (Rifas) y `colecta_contributions.marketplace_fee_cents` (Campañas) — ambas leídas del `application_fee` real que reporta Mercado Pago, nunca recalculadas localmente.
- Máquina de estados certificada: `approved` terminal; `rejected` no terminal frente a evidencia real de un `approved` posterior (retry); concurrencia probada (solo un escritor gana la transición).
- C5R (Campañas) y el reconciliador de Rifas siguen fuera del Country Gate por diseño — un pago que ya ocurrió se puede reconciliar sin importar la política de país vigente.

## Riesgos conocidos

1. `payments` `mp_payment_id 173008593553` sin `marketplace_fee_cents` — dato histórico, no corregido (instrucción explícita: no maquillar, no inventar el valor).
2. Asimetría de trazabilidad Rifas vs Campañas en `webhook_events` — Rifas no deja traza de reconciliación.
3. `reconcile-payments.js` (Rifas) sin fallback multi-token para re-consultar pagos de vendedores conectados — observado en vivo esta sesión.
4. `.env.local` local tiene `NEXT_PUBLIC_BASE_URL` apuntando a un túnel Cloudflare viejo que ya no resuelve — no afecta producción (Vercel tiene su propia variable), pero rompe pruebas locales de cualquier endpoint que use `resolveBaseUrl()` para llamadas server-to-server (`mp/oauth/start.js`, `checkout/mp.js`, `checkout/colecta.js`, el nuevo `admin/reconcile.js`) si se corre `npm run dev` sin sobreescribirla.
5. Dependencias: `npm audit` reporta 7 vulnerabilidades (2 moderate, 5 high) — la mayoría son advisories de Next.js sobre App Router/Server Actions/RSC/Middleware, features que Rifex **no usa** (Pages Router puro), por lo que su explotabilidad real es baja; una (`ws`) tiene fix seguro sin breaking changes vía `npm audit fix`, no aplicado en esta sesión (fuera de alcance sin autorización explícita).
6. `@supabase/auth-helpers-nextjs` sigue como dependencia sin uso real (deprecada en favor de `@supabase/ssr`, que también está presente) — limpieza pendiente, no urgente.
7. El bug de temática reportado no fue reproducible pese a auditoría exhaustiva — si vuelve a observarse, registrar el ID/título exacto de la rifa y el momento para poder investigar ese caso puntual (git blame, timing, browser).

## Orden futuro sugerido

1. `develop` — separar rama de desarrollo de `main`/producción antes de seguir agregando features, dado el volumen ya en producción real.
2. Nuevos países — requiere investigación individual por país (soporte Mercado Pago, split/marketplace, moneda, regulación de rifas y de recaudación, requisitos fiscales, tamaño de mercado) antes de flipear `enabled` en `countryPolicy.js`.
3. Rifas de alto valor — hoy modelado como `review/off` en `featureFlags.js`, sin diseño de reglas adicionales todavía.
4. Eventos — `off`, sin diseño todavía.
5. IA — `off`, sin diseño todavía.

## Prohibiciones de reanudación

- No modificar `checkout/mp.js`, `checkout/colecta.js`, `checkout/webhook.js`, `checkout/webhook-colecta.js`, `reconcile-payments.js`, `reconcile-colecta-payments.js`, `colectaReconcile.js`, `colectaMailer.js`, `mailer.js`, OAuth callback, sorteo, QR sin autorización explícita y diseño previo — Protected Baseline.
- No corregir el gap de `marketplace_fee_cents = null` con un UPDATE manual — si se corrige, debe ser vía el mecanismo de reconciliación autoritativo (C5R/reconcile-payments), no un parche de datos.
- No habilitar un país nuevo en `countryPolicy.js` sin la investigación individual correspondiente.
- No aplicar `npm audit fix --force` (rompe versiones) sin autorización y sin correr el suite de pruebas financieras completo después.
- No reabrir el bug de temática con un fix especulativo — si reaparece, reproducirlo primero con datos concretos.

# HANDOVER — Rifex 2.0 Certified Production Baseline

**Fecha de certificación:** 2026-08-23
**Commit main certificado:** `d1e4ef8`
**Tag de checkpoint pre-promoción:** `pre-rifex-2.0-final-92a82f9` (origin/main HEAD justo antes de la promoción)
**Deployment Vercel:** `dpl_Fr9ad1mejER1ZAi5djeaggPaGvX2` (`rifex-frontend-v2-8jxcbtxct-rifex.vercel.app`), aliaseado a `rifex.pro` y `www.rifex.pro`.

## Estado de certificación

- **P0 abiertos:** 0
- **P1 abiertos:** 0
- **Hard financial inconsistencies (invariant checker, PROD, read-only):** 0
- **Build:** PASS
- **Fixtures QA en PROD:** 0

## Cadena de sprints que llevó a esta certificación

1. **RIFEX 2.0 / PRE-LAUNCH — red team inicial:** encontró P0-1 (delete sin ownership), P0-2 (reserva de tickets con carrera + `tickets.payment_ref` inexistente), P1-1 (bypass en `/api/dev/test-email`), P1-2 (`legal_declarations` sin RLS), P1-3 (cero rate limiting). Veredicto: NO-GO.
2. **PRE-LAUNCH-FIX-1:** cerró los 5 hallazgos en `develop` (commit `c08c289`). Arquitectura de reserva atómica (`reserve_tickets_for_purchase`) + convergencia autoritativa por `purchase_id` (`converge_purchase_tickets_sold`) + módulo único `paymentReconcile.js` usado idénticamente por webhook/confirm/reconcile-payments.
3. **PRE-LAUNCH-2 — re-auditoría adversarial:** encontró 2 P1 nuevos: pago tardío tras reventa de ticket dejaba una purchase `approved` sin ticket real (P1-NEW-1), y `rate_limit_hits` sin RLS permitía bypass/griefing del propio rate limiter (P1-NEW-2). También reveló que DRAW/EXT-1 ya estaban promovidos a PROD (contradiciendo un informe anterior), y que los 5 hallazgos originales seguían abiertos en PROD porque nunca se habían promovido junto con DRAW.
4. **PRE-LAUNCH-FIX-2:** cerró P1-NEW-1 (estado explícito `approved_unfulfilled`, nunca silencioso, nunca roba ticket ya vendido) y P1-NEW-2 (RLS + revoke de EXECUTE en las RPCs nuevas) en `develop` (commit `9496d84`).
5. **RIFEX-2.0-PROD-FINAL (este documento):** promoción quirúrgica de exactamente los fixes certificados desde `develop` a `main`/PROD — nunca un merge completo (`develop` acumula Payment Engine multi-país, Argentina, tooling DEV que nunca formaron parte de esta certificación).

## Migraciones aplicadas a Supabase PROD (`wrdkdfuiwlujfxxijpao`) en esta promoción

- `2026-08-23_prelaunch_fix1_ticket_integrity.sql` — RPCs `reserve_tickets_for_purchase`/`converge_purchase_tickets_sold`, RLS en `legal_declarations`, tabla `rate_limit_hits` + RPC `rate_limit_hit`.
- `2026-08-23b_prelaunch_fix2_hardening.sql` — RLS en `rate_limit_hits`, `REVOKE EXECUTE`/`GRANT` en las 3 RPCs (solo `service_role`).

Ya estaban presentes en PROD desde un rollout previo (fuera de esta sesión): `2026-08-19_draw1_temporal_lifecycle.sql`, `2026-08-20_draw1b_atomic_rpcs.sql`, `2026-08-20b_draw1b_fix_prize_photos_null.sql`, `2026-08-22_draw1c_extension_max_days.sql`.

## Payment integrity (P0-2)

- Reserva de ticket: atómica todo-o-nada vía `reserve_tickets_for_purchase`. Ninguna reserva parcial es posible.
- Convergencia a `sold`: exclusivamente por `purchase_id` (`converge_purchase_tickets_sold`), nunca por `raffle_id+number` — un pago de una purchase jamás puede tocar el ticket de otra.
- Fuente única de verdad: `src/lib/paymentReconcile.js` (`applyMpPayment` + `convergePurchaseAndResolve`), usada idénticamente por `webhook.js`, `confirm.js` y `reconcile-payments.js`.
- **`approved_unfulfilled`:** si un pago llega approved después de que el hold expiró y el ticket ya fue revendido a otro comprador, la purchase original NUNCA le roba el ticket al nuevo dueño. Queda marcada `approved_unfulfilled` (pago real, `paid_at` preservado, cumplimiento incompleto) — visible, consultable, nunca silenciosa. No hay reembolso/reasignación automática; requiere revisión manual.
- El invariant checker distingue explícitamente HARD INCONSISTENCY (corrupción real — debe ser siempre 0) de `approved_unfulfilled` (estado conocido que requiere revisión, no corrupción).

## Rate limiting / RLS

- Endpoints protegidos: `checkout/mp` (20/60s por IP), `checkout/colecta` (20/60s por IP), `dev/test-email` (10/60s por IP), `rifas` create (10/60s por `user_id`), `colectas` create (10/60s por `user_id`).
- `rate_limit_hits`: RLS habilitada, sin políticas (default-deny para todo lo que no sea `service_role`).
- `rate_limit_hit`, `reserve_tickets_for_purchase`, `converge_purchase_tickets_sold`: `EXECUTE` revocado de `PUBLIC`/`anon`/`authenticated`, otorgado solo a `service_role`.
- Limitación conocida y aceptada: ventana fija — hasta ~2x el límite configurado en el borde de dos ventanas consecutivas. Barrera pre-lanzamiento, no anti-abuso de nivel enterprise.

## Webhook

- Firma MP: fail-closed cuando `MP_WEBHOOK_SECRET` está configurado (confirmado presente en PROD) — firma o `x-request-id` ausentes, o firma inválida, se rechazan con 401.
- El estado/monto real de un pago SIEMPRE se re-verifica contra la API real de Mercado Pago; nunca se confía en el body del webhook por sí solo.
- Sin rate limiting propio (decisión documentada: los emisores son infraestructura compartida de MP, no usuarios finales individuales por IP).

## DRAW

- Scheduler (`GitHub Actions`, `draw-scheduler-prod.yml`) activo, corridas recientes exitosas cada ~5 minutos.
- Exactamente un ganador por rifa garantizado por el PK de `raffle_results.raffle_id`.
- Rifas legacy con `draw_at=NULL` quedan excluidas del scheduler por construcción; solo el dueño puede sortearlas manualmente.

## EXT-1

- Cap de 15 días por extensión sigue vigente en `extend_raffle_draw` (migración `2026-08-22_draw1c_extension_max_days.sql`, ya presente en PROD desde antes de esta promoción).

## Legacy / integridad de datos

Confirmado sin alteración por esta promoción (migraciones puramente aditivas):

| | Antes de la promoción | Después |
|---|---|---|
| raffles | 2 | 2 |
| purchases | 2 | 2 |
| tickets | 60 | 60 |
| tickets sold | 2 | 2 |
| payments | 2 | 2 |
| colectas | 5 | 5 |
| raffle_results | 0 | 0 |

Las 2 rifas legacy (`venta de pasaje a la serena`, `prueba real`) conservan `draw_at=NULL`, `extension_limit=0`, sin backfill.

## Riesgos P2/P3 aceptados (no bloquean este GO)

- **P2:** latencia creciente de `applyMpPayment`/`convergePurchaseAndResolve` bajo concurrencia alta contra el mismo raffle (descubierto en PRE-LAUNCH-FIX-2, ~19s promedio a N=100 en DEV) — candidato a un sprint de performance futuro, fuera de alcance de esta certificación.
- **P2:** dependencias `next`/`postcss` con CVEs mayormente específicos de App Router/Server Components (Rifex usa Pages Router exclusivamente); `nanoid` con fix seguro no-mayor disponible pero no aplicado.
- **P3:** `uuid`/`mercadopago` (transitivo profundo, patrón de uso improbable), `ws` (sin superficie en runtime serverless de Vercel), `rate_limit_hits` sin mecanismo de limpieza/expiración (higiene operativa).

## Funcionalidades explícitamente NO incluidas en Rifex 2.0

Certificadas en `develop` para uso interno/DEV pero **deliberadamente excluidas** de esta promoción — permanecen fuera de `main`/PROD:

- Payment Engine multi-país (`src/lib/paymentEngine/**`).
- Habilitación de Argentina (`countryPolicy.js` AR1, OAuth country-aware AR2).
- Tooling exclusivo de DEV (`DevBanner.jsx`, `captchaGate.js`, relajaciones de RUT/hCaptcha en login/register).
- Eventos, Trust Engine, Social Rewards, `/tv` — nunca iniciados.

## Política de pentesting

Ver `docs/security/PENTEST_RIFEX.md`.

## Rollback

Código: `git revert` del commit `d1e4ef8` en `main`, o restaurar el tag `pre-rifex-2.0-final-92a82f9`. Las migraciones aplicadas son aditivas (nuevas tablas/columnas/RPCs/políticas RLS) — no se diseñó ni se requiere un rollback destructivo de base de datos.

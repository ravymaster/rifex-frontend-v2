# Rifex Current Handover

## Identidad

- Product: Rifex.
- Repository: `/home/desktop/rifex-frontend-v2` (Linux). Historical Windows path `C:\proyectos\rifexv1.1\rifex-frontend-main` is no longer current.
- Remote: `https://github.com/ravymaster/rifex-frontend-v2.git`.
- Main branch: `main`.
- Production: `https://rifex.pro`, hosted on Vercel, auto-deploys on push to `main` (confirmed — no committed CI config needed, Vercel's own GitHub integration handles it).
- Observable purpose: Next.js frontend and API surface for raffle creation, ticket selection, Mercado Pago checkout, payment confirmation, webhook handling, creator panel operations, seller Mercado Pago OAuth, email notifications and winner selection.
- Stack: Next.js 14 Pages Router, React 18, Supabase, Mercado Pago SDK/REST, Resend, hCaptcha, CSS Modules/local styles.

## Estado Oficial

```text
ALIGNMENT: CLOSED — GO
ARCHITECTURE AUDIT: CLOSED — GO
ARCHITECTURE DESIGN: CLOSED — GO
R4 SPRINT READINESS: GO
SPRINT R4: CLOSED — GO
DB RECOVERY: DONE — informal, incident-driven, 2026-08-14/15 (NOT a closed Sprint packet — see below)
MERCADO PAGO DIRECT CHECKOUT: CONFIRMED FUNCTIONAL IN PRODUCTION (2026-08-15)
MERCADO PAGO SPLIT PAYMENTS (1:N): NOT AVAILABLE — requires Mercado Pago commercial-team engagement, not a Sprint
NEXT ELIGIBLE / OPEN STAGE: ARCHITECTURE AUDIT — FRONTEND/LOGIC SEPARATION
ARCHITECTURE AUDIT — FRONTEND/LOGIC SEPARATION: OPEN - AUTHORIZED (2026-08-15)
OTHER SPRINTS (R1/R2/R3/Fees Policy): NOT AUTHORIZED
```

## Checkpoint Principal

```text
main:
1aa97cd43e63649d2d17255a42ee71600e631315

commit message:
fix: clear all credential fields on MP disconnect, not just half
```

`origin/main` matches local HEAD. Working tree at this HEAD: clean except the local-only `package.json`/`package-lock.json` `allowScripts` artifact (npm 11, explained, not meant to be committed) and `db/restore/001_schema_supabase_clean.sql` (untracked — should be committed, see DB Recovery section below).

Commits since the last handover (`7e96cda`), most recent first:

| HEAD | Mensaje | Qué hizo |
|---|---|---|
| `1aa97cd` | fix: clear all credential fields on MP disconnect, not just half | **HEAD actual.** `mp/disconnect.js` solo limpiaba 8 de 13 columnas de credenciales — dejaba `mp_refresh_token` real vivo tras "desconectar". Encontrado en vivo durante la prueba de OAuth (se conectó por accidente una cuenta MP real). Probado sembrando las 13 columnas y confirmando que ahora sí quedan todas en `null`. |
| `7e8e6b7` | fix: log Mercado Pago webhook events to webhook_events table | `webhook_events` existía con schema completo (índice único, RLS) pero nunca se insertaba nada — el `eventId` se calculaba y se devolvía en la respuesta pero jamás se guardaba. Agregado el insert, envuelto en try/catch para no bloquear el flujo de pago si falla. Confirmado en producción con un webhook real de Mercado Pago. |
| `448c1ed` | chore: remove second orphaned checkout return trio (api/checkout/*) | Segundo trío de páginas huérfanas bajo `/api/checkout/{success,pending,failure}.js` — mismo patrón fantasma que el primero, sin caller real. |
| `0287179` | chore: remove orphaned checkout return pages and legacy API | Primer trío huérfano (`src/pages/checkout/{success,pending,failure}.jsx`) + el endpoint legacy `POST /api/checkout`, superado por `api/checkout/mp.js`. |
| `4373375`, `7e96cda`, `af221e7`, `1fc064a` | reconciliación de documentación | Cadena de correcciones de citas de HEAD desactualizadas — ver handovers previos si hace falta el detalle exacto. |
| `bbaf8a0` | fix: restore checkout page build | Implementación de R4 (ya cerrado, no reabrir). |

## Recovery Preservado

```text
branch:
recovery/rifex-hardening-preserved

commit:
1c23702f401f8c501077ecfd265a213245e62a63

status:
PRESERVED — UNVERIFIED — NOT ADOPTED
```

**Corrección importante respecto a handovers anteriores:** este handover, y los anteriores, describían `src/lib/mailer.js`, `src/pages/api/admin/reconcile-payments.js` y `src/pages/api/checkout/webhook.js` como "diffs pendientes" del working tree. Eso ya era falso antes de que empezara esta sesión: `git diff --stat` contra HEAD para esos tres archivos está vacío — son archivos committeados normales en `main`, no un diff pendiente. Siguen preservados también en la branch de recovery, pero eso es un dato histórico aparte, no la causa de la confusión. No merges la branch de recovery sin autorización explícita — puede tener otras diferencias además de esos tres archivos que no se auditaron esta sesión.

## Backup

- File name: `db_cluster-10-11-2025@05-41-59.backup.gz`.
- Local state: present.
- Git state: ignored.
- Classification: sensitive.
- Baseline: outside Git.
- **Actualizado:** este backup corresponde al proyecto Supabase original (`huoepoxuqaodfgbtbalb`), que fue **borrado** por el usuario fuera de este repositorio (ver "Incidente De Producción" abajo). Es ahora la única evidencia sobreviviente de los datos históricos de ese proyecto — no fue restaurado (solo se extrajo el schema, no las filas).
- Rule: do not inspect, move or delete without a specific mission.

No backup content or data is included in this handover.

## Incidente De Producción Y Recuperación (2026-08-14/15)

Durante esta sesión, el usuario reveló que había borrado el proyecto Supabase original de producción (`huoepoxuqaodfgbtbalb`) directamente en Supabase, sin pasar por este repositorio. Se confirmó en vivo: `huoepoxuqaodfgbtbalb.supabase.co` dejó de resolver, y `rifex.pro/api/rifas` devolvía `{"ok":false,"error":"TypeError: fetch failed"}` — **producción estaba caída en ese momento**, sirviendo el shell estático de la página pero sin ninguna funcionalidad que tocara la base de datos.

Ya existía, de antes en la misma sesión, un proyecto Supabase nuevo (`wrdkdfuiwlujfxxijpao`) provisto para pruebas de sandbox local, usando `db/restore/001_schema_supabase_clean.sql` (schema extraído del backup del proyecto original — ver el header de ese archivo para el detalle completo de qué se excluyó: roles, grants, schemas `auth`/`storage`). La recuperación consistió en:

1. Purgar todas las filas de prueba de ese proyecto (rifas, tickets, purchases, payments, `webhook_events`, `merchant_gateways`, un usuario de prueba).
2. Actualizar en Vercel las variables `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` de producción, apuntando al proyecto nuevo.
3. Confirmar producción restaurada: `rifex.pro/api/rifas` → `{"ok":true,"items":[]}`, vacío genuino, sin datos legacy ni de sandbox.

**Esto se hizo de forma informal** — autorización explícita del usuario turno a turno en la conversación, no un packet de Sprint escrito de antemano. Se documenta como `DONE`, no como un Sprint cerrado en el sentido formal del WOP.

**Riesgo no resuelto:** producción y desarrollo local ahora comparten el mismo proyecto Supabase. No hay sandbox dedicado. Ya causó una contaminación cruzada (datos de prueba aparecieron en producción tras la recuperación; se limpiaron en la misma sesión). Pendiente para una futura Sprint/Architecture Audit.

`db/restore/001_schema_supabase_clean.sql` está sin trackear en git a HEAD `1aa97cd` — debería commitearse, ya no es un artefacto de sandbox descartable, es el registro de aprovisionamiento del schema que corre en producción hoy.

Las credenciales de Mercado Pago en Vercel se revisaron y **no** estaban afectadas por este incidente (nunca apuntaron a otra cosa que la cuenta real). No se tocaron.

## Validación De Producción (2026-08-15)

Después de la recuperación, se hizo una compra real de punta a punta en `rifex.pro`:

1. Cuenta real de Rifex creada (`javieraburgos2025@gmail.com`), confirmada por email.
2. Rifa real creada ("prueba real", `id: 372a033b-f3f7-486f-af1f-90147b43c7d3`, $500 el número) — **queda en la base de producción, no se limpió, es dato de prueba real pendiente de borrar**.
3. Cuenta real de Mercado Pago del usuario (`mp_user_id: 2501448870`) conectada como vendedor vía OAuth en `rifex.pro/panel/bancos` — sin mezcla de entornos, porque es producción real de punta a punta.
4. Una cuenta de Mercado Pago real **distinta** completó el pago desde otro lugar.

Resultado confirmado en la base real: ticket `sold`, purchase `approved` con `mp_payment_id` real, fila en `payments` con `status_detail: accredited` y `emailed_buyer`/`emailed_creator: true`, y — la pieza más importante — **un webhook real de Mercado Pago recibido y logueado correctamente** en `webhook_events` (firma `x-signature` válida, `User-Agent: MercadoPago WebHook v1.0 payment`), confirmando en producción el fix de `7e8e6b7`.

**Esto es la primera evidencia `CONFIRMED FUNCTIONAL` para el flujo de checkout de Mercado Pago en la historia documentada de este repositorio.**

## Hallazgos Sobre Mercado Pago (Marketplace / Split Payments)

Se investigó a fondo por qué el mismo flujo (vendedor conectado por OAuth) fallaba en sandbox con un error genérico ("Oh, no, algo anduvo mal") pero funcionó perfecto en producción real:

- **Causa confirmada del fallo en sandbox**: la app no tiene un Client ID/Secret de OAuth específico de sandbox. Cualquier conexión OAuth usa `MP_CLIENT_ID` (el de producción, `178099067269684`), así que el token resultante siempre viene en formato `APP_USR-` (producción), nunca `TEST-`, sin importar si el usuario que autoriza es una cuenta de prueba. Al pagar con un comprador de sandbox contra una preferencia en contexto de producción, Mercado Pago detecta la mezcla de entornos y bloquea el pago antes de mostrar tarjetas. Confirmado comparando el JSON completo de una preferencia exitosa (`client_id: 223465972567324`, contexto sandbox real) contra una fallida (`client_id: 178099067269684`, contexto producción) — único campo estructural distinto además del `collector_id`.
- **Conclusión práctica**: el flujo OAuth-vendedor-conectado **no se puede probar de punta a punta en sandbox** tal como está configurada la app hoy. Solo se verifica en producción real, con cuentas y (poca) plata real.
- **Sobre `marketplace_fee` / certificación**: el producto se llama oficialmente "Split de Pagos" en la documentación de Mercado Pago, con dos modelos — 1:1 (un vendedor) y 1:N (muchos vendedores, el caso de Rifex). El modelo 1:N **solo está disponible para vendedores de cartera en contacto directo con el equipo comercial de Mercado Pago** — no es una certificación online autoservicio. Contactar al equipo comercial de MP Chile es el único camino conocido para habilitarlo.
- **Buena noticia**: el modelo de cobro directo (vendedor conectado recibe el pago completo en su cuenta, sin `marketplace_fee`) **ya funciona hoy, confirmado en producción**, sin necesitar esa certificación. La comisión de Rifex necesitaría cobrarse aparte (suscripción/plan) — hay base ya en el código (`plan: free/pro`, texto "Plan Pro" en `panel/mercado-pago.js`) que nunca se terminó de conectar a un cobro real.

## Estado Tecnico

- General functionality: `PARTIAL` — Mercado Pago checkout (cobro directo) `CONFIRMED FUNCTIONAL` en producción; el resto de los flujos (mail fuera del contexto de una compra, OAuth de vendedor en sandbox, reconciliación admin, selección de ganador) siguen `UNVERIFIED`.
- Production readiness: `PARTIAL` — el flujo de compra central está evidenciado en vivo; rediseño de UI/UX y monetización (split payments o suscripción) siguen pendientes.
- DB reproducibility: `CONFIRMED` vía `db/restore/001_schema_supabase_clean.sql` — ya se usó dos veces (sandbox y luego recuperación de producción).
- Remote database state: `CONFIRMED` — proyecto `wrdkdfuiwlujfxxijpao`, compartido entre producción y desarrollo local (ver riesgo arriba).
- Build state: `CONFIRMED PASSING` a HEAD `1aa97cd` (heredado de R4, sin cambios de build desde entonces).
- Canonical states: la contradicción `raffles/tickets` vs `rifas/rifa_tickets` documentada contra el proyecto viejo no fue re-verificada contra el nuevo (mismo schema, presumiblemente la misma contradicción, pero no confirmado).
- Legacy: frozen behind compatibility boundaries (sin cambios).

## R4 — Cerrado (sin cambios respecto a handovers previos)

R4 (Build Baseline Recovery) permanece cerrado. Único archivo tocado: `src/pages/checkout/index.js`. No reabrir.

## Primer Proximo Paso

```text
ARCHITECTURE AUDIT — FRONTEND/LOGIC SEPARATION
```

- Autorizado explícitamente por el usuario el 2026-08-15, en preparación para un rediseño de UI/UX 2026 (frontend actual descrito por el usuario como construido "a mano", con ChatGPT sin memoria persistente hace ~1 año, y VSCode — probable código repetido, posible mezcla de lógica y presentación en algunos lugares).
- Objetivo: mapear, página por página y endpoint por endpoint, qué es lógica de negocio (debe preservarse) y qué es presentación (puede rediseñarse), **antes** de tocar una sola línea de CSS/JSX del rediseño.
- Ya hay una pista de que la separación es "razonablemente buena pero no perfecta": las API routes (`src/pages/api/*`) están mayormente separadas de las páginas, pero el bug original de R4 (código de API pegado directo en una página) es evidencia de que la mezcla sí ocurrió al menos una vez.
- El usuario mencionó explícitamente que `crear-rifa` y el home (nav bar con todos los links, hecha así por conveniencia de desarrollo) son casos conocidos de diseño feo a modernizar.
- **No implementar el rediseño todavía** — esta etapa es solo mapeo/auditoría, no Sprint de implementación.
- El usuario tomó vacaciones específicamente para este trabajo y quiere avanzar con continuidad — filosofía: mantener siempre la documentación (WOP + esta) al día en cada paso, no acumular deuda documental.

## Trabajo Pendiente / Limpieza Menor

- `db/restore/001_schema_supabase_clean.sql` sin commitear — commitear.
- Rifa de prueba "prueba real" (`372a033b-...`) y la cuenta `javieraburgos2025@gmail.com` siguen en la base de producción — considerar limpiar antes de que usuarios reales empiecen a usar el sitio.
- `reconcile-payments.js`: bug confirmado del filtro `since` roto (columna `payments.updated_at` no existe) — no arreglado, heredado de sesiones anteriores.
- Vercel tiene varias variables marcadas "Needs Attention" (`MP_CLIENT_SECRET`, `MP_WEBHOOK_SECRET`, `MP_ACCESS_TOKEN`, `ADMIN_API_TOKEN`, `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `REPLICATE_API_TOKEN`, `HCAPTCHA_SECRET`) — probablemente una sugerencia de Vercel para marcarlas como "Sensitive", no verificado, no es urgente.
- Variables `MP_FEE_FALLBACK_PCT`, `MP_FEE_MIN_CENTS`, `RIFEX_FEE_PCT`, `MP_FEE_PER_TICKET_CLP`, `MP_FEE_FIXED_CLP`, `RIFEX_PLAN_DEFAULT` siguen sin usarse en ningún lado del código — relevante para cuando se diseñe el modelo de monetización (suscripción vs. split).

## Entorno De Esta Maquina

- `gh` (GitHub CLI) instalado y autenticado como `ravymaster`. `git push`/`git fetch` a `origin` funcionan sin pasos adicionales.
- `git config --global user.name`/`user.email`: `ravysistem` / `rodrigo00787@hotmail.com`.
- Repositorio local en `/home/desktop/rifex-frontend-v2` (Linux Mint 22.2).
- `cloudflared` (binario, sin instalación de sistema) fue descargado a un directorio scratch para exponer `localhost:3000` públicamente durante pruebas de sandbox — no persistente, no asumas que sigue corriendo entre sesiones.

## Instrucciones Para Reanudar

The next AI must read, in this order:

1. `README.md`
2. `docs/WOP.md`
3. `docs/CURRENT_STATE.md`
4. `docs/handover/HANDOVER_RIFEX_CURRENT.md` (this file)

Then verify, against the real repo — not memory:

- branch `main`, HEAD (`git rev-parse HEAD`, do not assume it still equals `1aa97cd`);
- `origin/main`;
- working tree (`git status --short`);
- which Supabase project production actually points to (Vercel env vars) — do not assume it is still `wrdkdfuiwlujfxxijpao` without checking, since this project intentionally shares prod/dev today and could have been split apart by then;
- whether `db/restore/001_schema_supabase_clean.sql` was committed;
- whether the "prueba real" test raffle/account were cleaned from production.

R4 and DB Recovery are already closed/done. Do not reopen or re-implement either. The open stage is Architecture Audit — Frontend/Logic Separation; continue it or ask before opening anything else.

## Prohibiciones De Reanudacion

- Do not use conversational memory as source of truth.
- Do not mix the recovery branch with any Sprint.
- Do not open R1/R2/R3/Fees Policy without explicit authorization.
- Do not modify checkout APIs, mailer, webhook, or reconcile-payments without explicit authorization and design.
- Do not reopen or re-implement R4 or DB Recovery; both are closed/done.
- Do not attempt to enable Mercado Pago split payments (`marketplace_fee`) in code — it requires a commercial relationship with Mercado Pago, not a code change; do not send that field without explicit confirmation the commercial approval exists.
- Do not test the Mercado Pago OAuth-connected-seller flow in sandbox expecting it to work — it is confirmed blocked by environment mismatch as currently configured. Only test it in real production, with explicit user authorization, and never enter passwords/OAuth logins/payment details yourself — the user does that part.
- Do not touch the backup.
- Do not install dependencies before the corresponding gate.
- Do not run `git config`, `sudo`, or install system packages without the user doing it themselves or explicitly approving each command.
- Do not begin UI/UX redesign implementation before the Architecture Audit (Frontend/Logic Separation) is complete and the user explicitly authorizes an Architecture Design stage for it.

## Primer Prompt Sugerido

```text
Lee el handover y docs/CURRENT_STATE.md.
Reconstruye Git (branch, HEAD real, origin/main, working tree) y confirma
a qué proyecto Supabase apunta producción ahora mismo (Vercel).
No programes todavía.
Confirma el estado real contra lo documentado y reportá si algo no coincide,
antes de continuar la Architecture Audit — Frontend/Logic Separation.
```

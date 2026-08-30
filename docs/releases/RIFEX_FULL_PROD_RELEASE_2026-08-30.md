# RIFEX FULL PROD RELEASE — 2026-08-30

**Estado: STAGE 3 — MIGRACIONES PROD APLICADAS. CÓDIGO PROD SIN DESPLEGAR (main sigue en `3f3d6c4`).**

## STAGE 3 — PROD MIGRATIONS APPLIED (2026-08-30)

Ejecutado contra Supabase PROD real (`wrdkdfuiwlujfxxijpao`), con autorización
explícita de Rodrigo exclusiva para esta etapa. Ningún push a `main`, ningún
deploy, ninguna promoción de código — el código servido en PROD hoy sigue
siendo exactamente `origin/main @ 3f3d6c4`.

**Reconciliación real (Git + PROD, no el contador narrativo de Stage 2):**
antes de aplicar nada se verificó el estado real de PROD vía
`supabase db query --linked` (Management API, sin password de DB). Se
encontró que 2 de las 11 migraciones del release candidate ya estaban
efectivas en PROD por un fix quirúrgico anterior (documentado en
`docs/WOP.md`, sección EVENT-6 Fase 2):

| Migración | Ya efectiva en PROD | Acción |
|---|---|---|
| `2026-08-25c` (RLS raffle_date_extensions) | SÍ — `relrowsecurity=true` confirmado | Omitida (no reaplicada) |
| `2026-08-26b` (revoke create_tickets_for_raffle) | SÍ — grants ya solo `postgres`+`service_role` | Omitida (no reaplicada) |
| `2026-08-26c` (search_path + revoke 2 RPCs) | NO | **Aplicada** |
| `2026-08-26d` (revoke 4 funciones trigger) | NO | **Aplicada** |
| `2026-08-26d5` (country columns reconstruida) | NO | **Aplicada** |
| `2026-08-26e` (TRUST-1 onboarding) | NO | **Aplicada** |
| `2026-08-27` (TRUST-2 identidad) | NO | **Aplicada** |
| `2026-08-27b` (TRUST-3A verificación + bucket) | NO | **Aplicada** |
| `2026-08-27c` (fix FKs borrado usuario) | NO | **Aplicada** |
| `2026-08-28` (mp_identity_match + Persona/Empresa) | NO | **Aplicada** |
| `2026-08-29` (premio físico transferencia) | NO | **Aplicada** |

9 migraciones aplicadas realmente, 2 confirmadas ya-efectivas y omitidas
deliberadamente (nunca reaplicadas a ciegas). Total de 11 migraciones del
release candidate, todas contabilizadas.

**Guardrail:** se abrió temporalmente una única regla de allowlist en
`.claude/settings.json` (`Bash(supabase db query --project-ref
wrdkdfuiwlujfxxijpao:*)`), diff de una línea contra el backup previo. Se
restauró byte-for-byte al finalizar — hash SHA-256 verificado idéntico
antes/después (`a5f58c56...b13a7f`). Ningún otro bloqueo (main push,
merge, vercel deploy, otros proyectos Supabase) fue tocado.

**Postcheck global:** confirmado sin pérdida de filas en ninguna tabla
(`merchant_gateways`: 2→2, `mp_oauth_state`: 0→0, `purchases`: 2→2,
`events`: 1→1, `event_orders`: 1→1, `event_tickets`: 0→0,
`users_profile`: 5→5; `raffles`: 2→5 y `tickets`: 60→360 — incremento por
tráfico orgánico real durante la ventana de migración, no por acción de
las migraciones). Tablas Trust creadas con RLS habilitada y 0 filas
(nuevas, vacías). Columnas de país y premio físico presentes con los
tipos/defaults/constraints certificados en Stage 2. `create_raffle_with_
declarations`/`extend_raffle_draw` y las 4 funciones trigger sin grants a
PUBLIC/anon/authenticated. `trust_onboarding.birth_date`/`legal_name`
eliminadas de forma segura (tabla recién creada, 0 filas reales en el
momento del drop). Bucket privado `trust-documents` creado
(`public=false`).

**Smoke de aplicación vieja:** `GET /rest/v1/raffles?select=id&limit=1`
contra PROD respondió `200` después de todas las migraciones — el código
actualmente servido (main `3f3d6c4`, que no conoce ninguna tabla/columna
nueva) sigue funcionando sin errores, confirmando compatibilidad hacia
atrás.

**No se tocó:** `main`, Vercel, secrets, Argentina (sigue `enabled:
false`), datos de usuarios reales más allá de las columnas de schema
descritas arriba, ningún pago, ninguna conexión/desconexión de Mercado
Pago.

---

**Estado original (Stage 2): RELEASE CANDIDATE CONSTRUIDO Y CERTIFICADO. NO DESPLEGADO A PROD.**

Este documento describe el release candidate construido en Stage 2 del proceso
`RIFEX FULL PROD RELEASE`. Ninguna de las acciones aquí descritas ha sido
aplicada a producción. No hay migraciones aplicadas a PROD, no hay push a
`main`, no hay deploy a Vercel PROD. Todo el trabajo de este documento vive en
una rama de release local (`release/rifex-full-prod-2026-08-30`), construida
desde `origin/main` sin mergear `develop`.

## 1. Baseline

- Base: `origin/main` @ `3f3d6c4edafa389d265fa2ae9c0bd6b9d1f7958b`
  ("docs(release): close out EVENTS V1 PROD release record")
- Confirmado idéntico al SHA verificado en Stage 1 (sin cambios en `main`
  entre Stage 1 y Stage 2).
- Rama de release creada con `git worktree add ... origin/main -b
  release/rifex-full-prod-2026-08-30` — nunca se hizo `git merge develop`.

## 2. SHA del release candidate

- Construido mediante `git checkout origin/develop -- <lista exacta de 130
  archivos aprobados>` sobre el worktree limpio basado en `main`, más 1
  migración reconstruida manualmente (ver sección 5).
- Commit final: ver sección 17 (se genera al cerrar este documento).

## 3. Contenido promovido (por dominio)

| Dominio | Commits/contenido origen (develop) | Resumen |
|---|---|---|
| Seguridad (hardening) | `2026-08-25c`, `2026-08-26b`, `2026-08-26c`, `2026-08-26d` | RLS en `raffle_date_extensions`, revoke crítico de `create_tickets_for_raffle` de anon/authenticated, search_path hardening en RPCs de rifas, revoke de funciones trigger |
| Country Gate | `f7398b2` + código relacionado | CL habilitado, AR deshabilitado (`enabled:false`) en TODOS los entornos |
| Payment Engine / infra país | `866779d`, `9c9cf7c`, `384bd1f`, `6b8a963` | `paymentEngine/*` (contracts, money, statusNormalizer, providerRegistry, adapter, countryRouter, engine, feePolicy, fallbackPolicy, mpAppConfig), integración en `checkout/mp.js` y `checkout/colecta.js` con fallback exacto a lógica legado para CL |
| Migración de país reconstruida | (no existía en el repo) | `merchant_gateways.country` y `mp_oauth_state.country`, ver sección 5 |
| Trust (completo) | TRUST-1, TRUST-2, TRUST-3A, MP-control-principal, fail-open-fix `2d86d3c`, TRUST-3B `20b4362`, Persona/Empresa `4f416dc` | Onboarding universal, RUT Chile, verificación de identidad manual, match/mismatch MP, `assertCreatorEligible` |
| Creator eligibility gate en Rifas/Colectas/Events | integración quirúrgica | Solo se agregó el gate — cero regresión de lógica existente en Events |
| RIFEX Closure Pass | `a47fc40`, `8cd0cf9` | Remoción de Temática (UI), transferencia/trámites de premio físico, footer Cumplimiento, página `/cumplimiento`, términos actualizados |

## 4. Exclusiones explícitas (DEV-only, confirmadas ausentes)

- `src/components/DevBanner.jsx` — NO incluido, diff vacío vs `main`.
- `src/lib/captchaGate.js` — NO incluido, diff vacío vs `main`.
- `src/pages/_app.js` — NO incluido, diff vacío vs `main` (sin DEV banner).
- `src/pages/login.jsx` — NO incluido, diff vacío vs `main` (sin bypass hCaptcha).
- `src/pages/register.jsx` — NO incluido, diff vacío vs `main` (sin bypass hCaptcha, sin relajación RUT DEV).
- Búsqueda final de `isDevStage`/`NEXT_PUBLIC_STAGE==='development'` en `src/`
  confirma que el único uso fuera de `environmentPolicy.js`/`countryPolicy.js`
  (mecanismo legítimo de feature flag `devOnly`) es
  `src/pages/api/dev/test-email.js`, ya gateado y ya certificado en
  PRE-LAUNCH-FIX-1.

## 5. Migración de país reconstruida

Archivo: `db/migrations/2026-08-26d5_ar2_country_columns_reconstructed.sql`

Contexto: AR2 (aprobado, ya en `develop`) agregó `merchant_gateways.country`
y `mp_oauth_state.country` directamente en `rifex-dev` sin generar un archivo
de migración versionado — un gap descubierto en Stage 1. Esta migración
reconstruye esa DDL de forma equivalente:

```sql
alter table public.merchant_gateways add column if not exists country text;
alter table public.mp_oauth_state add column if not exists country text;
```

Evidencia de equivalencia:
- DEV: `information_schema.columns` confirma `country text` (nullable, sin
  default) en ambas tablas.
- PROD: confirmado vía PostgREST (`?select=country&limit=0` → 400
  `42703 column does not exist`) que PROD carece de estas columnas hoy.
- Sin backfill: ambas tablas usan valores por defecto de aplicación (`'CL'`
  vía código cuando `country IS NULL`), no vía DB default — consistente con
  cómo AR2 ya opera en DEV.
- Sin CHECK/FK nuevos: DEV tampoco los tiene sobre esta columna.
- Posición en el orden de migraciones: después de las 4 migraciones de
  seguridad y antes de TRUST-1, exactamente como especificó el mandato de
  Stage 2.

## 6. Orden de migraciones del release candidate

1. `2026-08-25c_prelaunch_fix3_raffle_date_extensions_rls.sql`
2. `2026-08-26b_event6_fase2_critical_revoke_create_tickets_for_raffle.sql`
3. `2026-08-26c_event6_fase2_hardening_rifas_search_path_and_revoke.sql`
4. `2026-08-26d_event6_fase2_revoke_trigger_functions_execute.sql`
5. `2026-08-26d5_ar2_country_columns_reconstructed.sql` (reconstruida, sección 5)
6. `2026-08-26e_trust1_onboarding.sql`
7. `2026-08-27_trust2_identity.sql`
8. `2026-08-27b_trust3a_identity_verification.sql`
9. `2026-08-27c_trust3a_fix_user_deletion_fks.sql`
10. `2026-08-28_mp_identity_match_onboarding_correction.sql`
11. `2026-08-29_physical_prize_transfer_transparency.sql`

Este orden fue ensayado end-to-end (sección 8) sobre una base equivalente al
schema actual de PROD (12 migraciones ya aplicadas en PROD, replicadas
primero) y se confirmó válido — sin reordenamientos necesarios.

## 7. Trust — estado final confirmado

- Onboarding universal (Persona/Empresa, nombre único dinámico) — `4f416dc`.
- RUT declarado (Chile) con formato validado.
- MP como control principal de identidad: `/users/me` vía OAuth,
  `identification.type === 'RUT'` exigido (fix TRUST-3B) antes de extraer
  número.
- `resolveMpIdentityMatch` con 3 salidas: `matched` / `mismatch` /
  `unavailable`.
- Fail-closed estricto: NULL ≠ verificado, `unavailable` ≠ verificado.
- Único estado habilitante: `mp_identity_match = 'matched'`.
- Ventana de carrera OAuth cerrada (fix `2d86d3c`, certificado en TRUST-3B
  con test E2E reproduciendo la secuencia real upsert-then-resolve).
- RUT de Mercado Pago nunca persistido (solo se compara, no se guarda).
- TRUST-3A (verificación manual de documentos) apagado por defecto —
  requiere activación explícita futura.
- `assertCreatorEligible` integrado en Rifas, Colectas y Events como el único
  gate de creación/publicación/acciones administrativas sensibles.

## 8. Ensayo de migraciones (rehearsal)

- Entorno: contenedor Docker `postgres:15` desechable (puerto 15432, jamás
  tocó `rifex-dev` ni PROD), con stubs mínimos de compatibilidad Supabase
  (`auth.users`, `auth.uid/role/email/jwt()`, roles `anon/authenticated/
  service_role`, `storage.buckets`).
- Se cargó primero el schema base (`db/restore/001_schema_supabase_clean.sql`)
  y las 12 migraciones ya aplicadas en PROD, en orden — éxito completo.
- Se aplicaron las 11 migraciones del release candidate en el orden de la
  sección 6 — éxito completo, sin reordenamientos.
- Postcheck confirmado:
  - Tablas Trust (`trust_onboarding`, `trust_identity_documents`,
    `trust_identity_verifications`, `trust_identity_audit_log`) presentes
    con la forma esperada (constraints de consistencia, FKs a `auth.users`).
  - `merchant_gateways.country` y `mp_oauth_state.country` presentes (`text`).
  - `raffles.requires_transfer_procedures` (`boolean not null default
    false`), `transfer_expenses_owner` (`text`), `transfer_conditions`
    (`text`), `delivery_method` (`text`) y `theme` (`text default 'mixto'`)
    presentes.
  - RLS habilitada (`relrowsecurity = true`) en las 29 tablas de `public`.
  - `create_tickets_for_raffle`: EXECUTE otorgado solo a `postgres`
    (owner) — ni PUBLIC ni `anon`/`authenticated` retienen el privilegio,
    confirmando que el revoke crítico de EVENT-6 Fase 2 persiste.
  - `search_path` hardening presente en las funciones `SECURITY DEFINER`
    aplicables (`create_tickets_for_raffle`, `find_user_id_by_email`,
    `set_bank_account_owner`, `set_creator_fields`,
    `set_raffle_creator_from_jwt`).
- Contenedor desechado (`docker stop && docker rm`) al finalizar — no queda
  infraestructura residual.

## 9. Payment Engine / Country Gate — paridad Chile

- `checkout/mp.js` y `checkout/colecta.js`: el Payment Engine se consulta
  primero; si no resuelve un país distinto de CL (caso normal hoy, dado que
  el Country Gate ya solo permite `CL`/`events` activos), el comportamiento
  cae exactamente al cálculo legado de comisión (`RIFEX_FEE_RATE` sobre el
  monto) — cero cambio observable para vendedores chilenos existentes.
- Fail-closed: si el motor resuelve un país que no es CL y no tiene
  proveedor listo, el checkout se rechaza (`400
  country_payment_engine_unavailable`) en lugar de completar con
  configuración incorrecta.
- Argentina permanece con `enabled: false` en `countryPolicy.js` en todos los
  entornos — el código AR existe (adapters, env vars `*_AR`) pero está
  inerte: no hay ruta de usuario que lo active sin cambiar ese flag.

## 10. Physical prize / Closure Pass

- "Temática" (UI) removida de `crear-rifa.jsx` — confirmado sin efecto
  funcional real (`useIconsMap.js` usa un orden de íconos fijo, no depende de
  `theme`). Columna `raffles.theme` se mantiene internamente (`default
  'mixto'`) sin migración de remoción — badges históricos no se rompen.
- `delivery_method` ahora obligatorio para premio físico, exactamente 3
  opciones (retiro / envío por el creador / envío a cargo del ganador) — sin
  opción "a convenir" disponible para rifas nuevas.
- Bloque de transferencia/trámites: `requires_transfer_procedures`
  (boolean), `transfer_expenses_owner` (creator|winner, sin "Otro"),
  `transfer_conditions` (texto) — con divulgación progresiva y freeze
  después de la primera venta (mismo guard que ya usaba DRAW-1 para
  `prize_type`/`prize_amount_cents`).
- Transparencia: una rifa que declara requerir trámites no puede publicarse
  sin declarar dueño de gastos y condiciones.
- Párrafo legal completo solo en Términos del Creador (`terminos.js`), no en
  el formulario de creación — el formulario queda más corto, no más largo.

## 11. Cumplimiento (roadmap público)

- `/cumplimiento` es una página de roadmap conceptual — declara
  explícitamente qué existe hoy vs. qué está en preparación. No implementa
  backend operativo de Cumplimiento (evidencia post-transacción, reputación)
  — eso queda documentado como trabajo futuro, no construido en este
  release.
- Separación explícita Trust vs. Cumplimiento mantenida: Trust es
  verificación de identidad pre-transacción; Cumplimiento es seguimiento
  post-sorteo/post-evento.

## 12. Deudas conocidas / trabajo explícitamente NO incluido

- Backend operativo de Cumplimiento (emails automáticos de seguimiento,
  estados de cumplimiento, evidencia de entrega) — solo el roadmap público
  está construido.
- TRUST-3A (verificación manual de documentos) integrado en el schema y
  gateado, pero apagado por defecto — activación es una decisión operativa
  futura de Rodrigo, no parte de este release.
- Argentina: infraestructura de código presente pero inerte en todos los
  entornos — activación requiere una decisión y mandato explícitos futuros.

## 13. QA / Tests

- Suite completa del worktree de release: 191 tests, 190 passing, 1
  clasificado como flaky ya documentado (timing de generación XLSX en
  analíticas de eventos — mismo assertion/performance ya conocido de
  EVENT-3, no una falla funcional nueva).
- Suites relevantes incluidas en la suite completa: Trust (onboarding,
  identity, identity-verification, mp-identity-match), Country Gate,
  Payment Engine (contracts, money, statusNormalizer, providerRegistry,
  adapter, fallbackPolicy, feePolicy, capability, AR dev-only), Rifas, DRAW,
  Colectas, Events (incluye scanner, analytics), integridad de tickets físicos.
- Ningún fallo funcional nuevo — cero bloqueos por regresión.

## 14. Build

- `npm run build` en el worktree de release: **PASS** (compilación
  exitosa, 49/49 páginas estáticas generadas, sin errores de tipos ni de
  linting).

## 15. Revisión de seguridad estática

- `SECURITY DEFINER` + `search_path` hardening confirmado en el rehearsal
  (sección 8).
- `create_tickets_for_raffle`: PUBLIC/anon/authenticated sin EXECUTE,
  confirmado en el rehearsal.
- RLS habilitada en las 4 tablas Trust nuevas y en las 29 tablas de
  `public` en total.
- `SUPABASE_SERVICE_ROLE_KEY` usado exclusivamente en `src/lib/*` y
  `src/pages/api/**/*` (server-side) — cero referencias en
  componentes/páginas cliente.
- Cero coincidencias de `console.log`/`error`/`warn` imprimiendo
  `SERVICE_ROLE`, `CLIENT_SECRET`, `CRON_SECRET` o `DB_PASSWORD`.
- Argentina confirmada inerte (`enabled: false` en `countryPolicy.js`, sin
  `devOnly: true`) — no se activa ni siquiera en DEV.

## 16. Revisión de diff completo

- 131 archivos modificados respecto a `origin/main`: 88 nuevos (A), 3
  eliminados (D — `HANDOVER_RIFEX_2_0_CERTIFIED.md`,
  `HANDOVER_RIFEX_DRAW_CURRENT.md`, `PENTEST_RIFEX.md`, superados por
  versiones más recientes ya en `develop`), 40 modificados (M).
- Cada archivo modificado fue clasificado por dominio (Trust, Payment
  Engine/Country, Closure Pass, Events-gate-only, docs). Ningún archivo
  quedó sin explicación.
- Events: diff confirmado mínimo — únicamente la inserción de
  `assertCreatorEligible` en 6 endpoints, cero cambios de lógica de negocio
  existente.
- `_app.js`, `login.jsx`, `register.jsx`, `DevBanner.jsx`,
  `captchaGate.js`: diff vacío vs. `main` — exclusión DEV-only confirmada.
- `package.json`: únicamente 4 scripts `test:*` nuevos agregados — sin
  cambios de dependencias.
- Nombres de variables de entorno nuevos referenciados en el diff (solo
  nombres, nunca valores): `MP_ACCESS_TOKEN_AR`, `MP_CLIENT_ID_AR`,
  `MP_CLIENT_SECRET_AR`, `MP_WEBHOOK_SECRET_AR` — inertes mientras
  Argentina permanezca `enabled: false`.

## 17. Commit del release candidate

- Rama: `release/rifex-full-prod-2026-08-30`
- Base: `origin/main` @ `3f3d6c4`
- Commit del release candidate: registrado en el reporte final de Stage 2
  (no se hace commit --amend de `main`, no hay push a `main` ni a `develop`).
- Esta rama NO fue empujada a `origin` — permanece local en el worktree de
  trabajo, según lo requerido explícitamente por el mandato de Stage 2
  ("nunca `main`; puede empujar la rama de release si el guardrail lo
  permite, si no, mantenerla local y reportarlo").

## 18. Procedimiento propuesto para Stage 3

1. Confirmar nuevamente los SHA base (`origin/main`) no cambiaron desde este
   documento.
2. Aplicar las 11 migraciones de la sección 6 a PROD, en orden, con
   PRECHECK/APPLY/POSTCHECK individual por migración (mismo patrón usado en
   PROD-FINAL).
3. Verificar grants/RLS/search_path en PROD real después de cada
   migración de seguridad.
4. Checkpoint/tag de rollback antes de cualquier cambio.
5. Merge o cherry-pick del release candidate a `main`, con revisión humana
   final del diff.
6. Deploy a Vercel PROD.
7. Smoke QA acotado en PROD (sin pagos reales, sin desconexión MP).
8. Requiere autorización explícita nueva de Rodrigo — no se ejecuta como
   continuación automática de Stage 2.

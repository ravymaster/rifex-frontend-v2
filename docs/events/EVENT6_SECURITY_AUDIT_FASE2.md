# EVENT-6 Fase 2 — Auditoría de los 16 WARN heredados + paquete de promoción (sin ejecutar)

Continuación de `docs/events/EVENT6_SECURITY_AUDIT.md` (Fase 1). Mismo criterio de evidencia: toda afirmación respaldada por una prueba real ejecutada contra `rifex-dev`, nunca supuesta.

**Estado: auditoría completa. 1 vulnerabilidad CRÍTICA real encontrada y corregida (`create_tickets_for_raffle`, minteo de tickets sin autenticación en cualquier rifa). 8 hallazgos confirmados como falsos positivos (funciones trigger genuinamente inalcanzables). 6 hallazgos de bajo riesgo corregidos como defensa en profundidad. 1 hallazgo administrativo (Auth) documentado como pendiente, no corregido. PROD NO tocado — pero probablemente comparte la misma vulnerabilidad crítica, ver "Riesgo urgente para PROD" más abajo.**

---

## ⚠️ HALLAZGO MÁS IMPORTANTE — leer primero

**`public.create_tickets_for_raffle(uuid, integer)`** permitía a **cualquier visitante anónimo**, sin sesión ni cuenta, mintear tickets reales en **cualquier rifa del sistema**, incluida una que no le pertenece — con una simple llamada HTTP a `POST /rest/v1/rpc/create_tickets_for_raffle` usando solo la clave pública `anon`. Confirmado y corregido en `rifex-dev` en esta sesión. **Esta función es anterior al fork DEV/PROD (no tiene migración versionada — vive en el schema base, `db/restore/001_schema_supabase_clean.sql`), por lo que es altamente probable que la misma vulnerabilidad exista HOY en Supabase PROD.** Esta sesión no tiene el CLI vinculado a PROD y esta misión prohíbe explícitamente escribir ahí — **se recomienda a Rodrigo verificar y corregir esto en PROD de forma urgente e independiente**, sin esperar a la decisión de promoción de Eventos. Ver sección "Riesgo urgente para PROD".

---

## Inventario exacto — los 16 WARN, uno por uno

| # | Código del Advisor | Objeto | Severidad Advisor | Clasificación real |
|---|---|---|---|---|
| 1 | `function_search_path_mutable` | `public.rate_limit_hit(text, timestamptz)` | WARN | Hardening recomendable — corregido |
| 2 | `function_search_path_mutable` | `public.create_raffle_with_declarations(jsonb, uuid, text[], text)` | WARN | Hardening recomendable — corregido |
| 3 | `function_search_path_mutable` | `public.extend_raffle_draw(uuid, uuid, timestamptz, timestamptz, text)` | WARN | Hardening recomendable — corregido |
| 4 | `function_search_path_mutable` | `public.reserve_tickets_for_purchase(uuid, integer[], uuid, timestamptz)` | WARN | Hardening recomendable — corregido |
| 5 | `function_search_path_mutable` | `public.converge_purchase_tickets_sold(uuid)` | WARN | Hardening recomendable — corregido |
| 6 | `anon_security_definer_function_executable` | `public.create_tickets_for_raffle(uuid, integer)` | WARN | **Vulnerabilidad explotable — CRÍTICA, demostrada y corregida** |
| 7 | `authenticated_security_definer_function_executable` | `public.create_tickets_for_raffle(uuid, integer)` | WARN | **Vulnerabilidad explotable — CRÍTICA, demostrada y corregida** |
| 8 | `anon_security_definer_function_executable` | `public.rifex_set_creator_defaults()` | WARN | Falso positivo (función trigger, inalcanzable por RPC) — grant cerrado igual, por higiene |
| 9 | `anon_security_definer_function_executable` | `public.set_bank_account_owner()` | WARN | Falso positivo (función trigger, inalcanzable por RPC) — grant cerrado igual, por higiene |
| 10 | `anon_security_definer_function_executable` | `public.set_creator_fields()` | WARN | Falso positivo (función trigger, inalcanzable por RPC) — grant cerrado igual, por higiene |
| 11 | `anon_security_definer_function_executable` | `public.set_raffle_creator_from_jwt()` | WARN | Falso positivo (función trigger, inalcanzable por RPC) — grant cerrado igual, por higiene |
| 12 | `authenticated_security_definer_function_executable` | `public.rifex_set_creator_defaults()` | WARN | Falso positivo — mismo caso que #8 |
| 13 | `authenticated_security_definer_function_executable` | `public.set_bank_account_owner()` | WARN | Falso positivo — mismo caso que #9 |
| 14 | `authenticated_security_definer_function_executable` | `public.set_creator_fields()` | WARN | Falso positivo — mismo caso que #10 |
| 15 | `authenticated_security_definer_function_executable` | `public.set_raffle_creator_from_jwt()` | WARN | Falso positivo — mismo caso que #11 |
| 16 | `auth_leaked_password_protection` | Configuración global de Supabase Auth | WARN | Configuración administrativa pendiente — NO corregida, requiere el dashboard |

## Evidencia detallada por hallazgo

### #6/#7 — `create_tickets_for_raffle` — CRÍTICO, vulnerabilidad real demostrada

**Código real** (`SELECT pg_get_functiondef`, verificado contra el estado vivo de `rifex-dev`, no un archivo desactualizado):
```sql
CREATE OR REPLACE FUNCTION public.create_tickets_for_raffle(p_raffle_id uuid, p_total integer)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  insert into tickets (raffle_id, number, status)
  select p_raffle_id, g, 'available' from generate_series(1, p_total) as g;
end;
$function$
```
`SECURITY DEFINER` (bypasa RLS por completo, corre con los privilegios del dueño) + **cero verificación de ownership sobre `p_raffle_id`** + `EXECUTE` otorgado a `PUBLIC` (heredado por `anon`/`authenticated`) además de a ambos roles explícitamente.

**Prueba adversarial real, fixture desechable**: se creó una rifa de prueba (`status: 'draft'`, dueño = usuario fixture A, sin relación con el atacante). Una request **completamente anónima** (solo `apikey`/`Authorization: Bearer <clave anon pública>`, sin ninguna sesión) llamó `POST /rest/v1/rpc/create_tickets_for_raffle` con el `id` real de esa rifa ajena y `p_total: 5` → **`204`, insertó 5 tickets reales**. Una segunda llamada con un usuario autenticado real (distinto, sin relación con la rifa) repitió el ataque → `409` por choque de `unique(raffle_id, number)` — prueba adicional de que el primer ataque anónimo ya había escrito filas reales, no una coincidencia.

**No usada por la app real**: `grep -r create_tickets_for_raffle src/` → cero resultados. No es parte del flujo actual de creación de rifas (ver `reserve_tickets_for_purchase`, la RPC real usada hoy, ya certificada en PRE-LAUNCH-FIX-1, sin este problema — nunca tuvo grants a `anon`/`authenticated`).

**Corrección**: `db/migrations/2026-08-26b_event6_fase2_critical_revoke_create_tickets_for_raffle.sql` — `revoke execute ... from public, anon, authenticated`. `service_role` conserva `EXECUTE`. Deliberadamente **no** se usó `drop function` (la corrección mínima es el `revoke`, no borrar código que podría tener un propósito futuro legítimo bajo `service_role`).

**Regresión post-fix, en vivo**: el mismo ataque anónimo repetido contra una rifa de prueba nueva → `401 permission denied for function create_tickets_for_raffle`, **0 tickets creados**. `service_role` sigue pudiendo llamarla sin error (verificado explícitamente).

### #8-15 — Las 4 funciones trigger — falsos positivos confirmados

`rifex_set_creator_defaults()`, `set_bank_account_owner()`, `set_creator_fields()`, `set_raffle_creator_from_jwt()` — las 4 son `RETURNS trigger`, `SECURITY DEFINER`, usadas por `trg_raffles_set_creator`/`trg_set_creator_fields`/`tr_set_bank_account_owner` (disparadores `BEFORE INSERT`/`UPDATE` reales sobre `raffles`/`bank_accounts`).

**Prueba adversarial real**: se intentó invocar las 4 directamente vía `POST /rest/v1/rpc/<nombre>` con la clave `anon` → **las 4 devolvieron `404 PGRST202`** ("Could not find the function ... in the schema cache"). PostgREST **nunca expone funciones con tipo de retorno `trigger` como endpoints RPC**, sin importar el `GRANT` — el hallazgo del Advisor es técnicamente correcto sobre el `GRANT` (existe), pero la ruta de invocación real (`/rest/v1/rpc/...`) no existe para este tipo de función. Adicionalmente, aunque alguien tuviera una conexión Postgres directa (fuera del alcance de PostgREST), Postgres mismo rechaza con `ERROR: trigger functions can only be called as triggers` cualquier intento de invocar una función trigger fuera de un disparador real — doble protección, independiente de cualquier `GRANT`.

**Corrección aplicada de todas formas, por higiene/consistencia** (no por haber encontrado un exploit — ya demostrado que no existe uno): `db/migrations/2026-08-26d_event6_fase2_revoke_trigger_functions_execute.sql` — revoca `EXECUTE` de `anon`/`authenticated`/`PUBLIC` en las 4. Revocar `EXECUTE` **no afecta el disparo real de los triggers**: Postgres invoca las funciones trigger internamente como parte del mecanismo de disparo (con los privilegios del dueño, al ser `SECURITY DEFINER`), sin pasar por el chequeo de `EXECUTE` que sí aplica a una llamada directa de función — confirmado por la regresión real (ver abajo: crear una rifa real sigue poblando `creator_id`/`creator_email` correctamente).

### #1-5 — `search_path` mutable en 5 RPCs de Rifas

Las 5 son `SECURITY INVOKER` (`prosecdef=false`, confirmado por consulta directa) — mismo perfil de riesgo bajo que las 6 RPCs de Eventos ya corregidas en Fase 1. `rate_limit_hit`, `reserve_tickets_for_purchase`, `converge_purchase_tickets_sold` **ya no tenían ningún `GRANT` a `anon`/`authenticated`/`PUBLIC`** (confirmado, sin cambios necesarios ahí más allá del `search_path`). `create_raffle_with_declarations`/`extend_raffle_draw` sí tenían `GRANT` — ver el análisis de riesgo real a continuación.

**Corrección**: `db/migrations/2026-08-26c_event6_fase2_hardening_rifas_search_path_and_revoke.sql` — `ALTER FUNCTION ... SET search_path = public` en las 5 (metadata-only, cero riesgo sobre la lógica real).

### `create_raffle_with_declarations` / `extend_raffle_draw` — riesgo real NO explotado (RLS ya protegía)

Ambas reciben `p_user_id uuid` como parámetro del llamador y lo usan internamente **sin verificarlo contra `auth.uid()`** dentro de la función — a primera vista, un patrón de IDOR: un atacante podría, en teoría, pasar el `uuid` real de otro usuario como `p_user_id` y suplantarlo.

**Prueba adversarial real** (fixture desechable: una víctima real dueña de una rifa real, un atacante real y distinto, con su propia sesión válida, llamando las RPCs **directo por REST, evadiendo por completo las rutas API del servidor**, con el `uuid` real de la víctima como `p_user_id`):
- `extend_raffle_draw` → `400 raffle_not_found`. La rifa SÍ existe — el `SELECT ... FOR UPDATE` interno de la función, al ser `SECURITY INVOKER`, corre bajo RLS **con la identidad real del atacante** (`auth.uid()` real, del JWT, nunca falsificable desde el cliente), y la política `raffles_select_own`/`raffles_update_own` exige `creator_id = auth.uid()` — no el parámetro. El atacante, con su propia identidad, no ve la fila.
- `create_raffle_with_declarations` → `403, "new row violates row-level security policy for table raffles"`. Mismo mecanismo: la política `raffles_insert_own` exige `creator_id = auth.uid()` (identidad real), y el `INSERT` fue rechazado por RLS pese a que la función intentaba insertar con `creator_id = p_user_id` (el uuid falsificado de la víctima).

**Conclusión real**: al ser `SECURITY INVOKER`, RLS nunca se bypasea — la identidad real del llamador (`auth.uid()`, del JWT verificado por PostgREST) es la autoridad efectiva, sin importar qué valor falso se pase como parámetro de la función. **No hay vulnerabilidad activa.** El `GRANT` a `anon`/`authenticated`/`PUBLIC` seguía siendo innecesario e inconsistente con el resto del código (la app real solo las llama vía `service_role` — `src/pages/api/rifas/index.js:9`, `src/pages/api/rifas/[id]/extend.js:11`, ambas confirmadas usando `SUPABASE_SERVICE_ROLE_KEY`) — se revocó como endurecimiento por consistencia, no como corrección de un exploit.

### #16 — `auth_leaked_password_protection` — administrativo, no corregido

Configuración global de Supabase Auth (verificación de contraseñas filtradas contra HaveIBeenPwned). **No es una tabla, función ni RLS** — es un toggle del dashboard de Supabase (Authentication → Policies → Password Security), fuera del alcance de una migración SQL versionada. Per las instrucciones explícitas de esta misión ("No corrijas avisos administrativos de Auth a ciegas... documéntalos como pendientes"), queda documentado como **acción pendiente para Rodrigo**, no corregido en esta sesión.

## Regresión real tras las correcciones

- Crear una rifa real vía `create_raffle_with_declarations` (`service_role`, mismo camino que la ruta API real) → sin error, `creator_id` poblado correctamente = el usuario real.
- Extender el sorteo de esa rifa vía `extend_raffle_draw` (`service_role`) → sin error.
- `npm run test:event-analytics` 31/31, `npm run test:scanner-controller` 4/4, `npm run build` limpio.
- Smoke real contra el deployment: `/rifas`, `/crear-rifa`, `/mis-iniciativas`, `/login`, `/register`, `/perfil`, `/eventos`, `/panel`, `/panel/bancos`, `/api/rifas`, `/api/events`, `/onboarding/pais` → todos `200`.
- Ningún cobro real de Mercado Pago, ningún correo real enviado (mismos usuarios desechables `email_confirm: true`, sin flujo de pago real ejercido).
- No se tocó `EVENT-1` a `EVENT-5` en código ni en RLS/grants — solo funciones de Rifas/rate-limit fueron modificadas esta fase.

## Security Advisor — antes / después

| Momento | WARN totales | Relacionados a Eventos | Relacionados a Rifas/Auth |
|---|---|---|---|
| Antes de EVENT-6 Fase 1 | 22 | 6 | 16 |
| Después de Fase 1 (EVENT-1..5 corregido) | 16 | 0 | 16 |
| Después de Fase 2 (esta sesión) | **1** | 0 | **1** (`auth_leaked_password_protection`, administrativo) |

**0 hallazgos ERROR en ningún momento.** Los 15 hallazgos WARN de Rifas resueltos en esta fase: 6 corregidos como riesgo real (1 crítico + 5 search_path bajo riesgo + 2 hardening RLS-ya-protegía, contados individualmente arriba), 8 falsos positivos con el grant cerrado igual por higiene, 1 administrativo dejado pendiente intencionalmente.

## Fixtures creados y eliminación confirmada

Todos desechables, `@example.com`, sin PII real, sin pagos ni correos reales:
- 1 rifa de prueba + 1 usuario dueño (prueba de `create_tickets_for_raffle`, primer intento) — tickets y rifa eliminados, verificado 0 residual.
- 1 rifa de prueba + 1 usuario dueño (verificación post-fix) — eliminados, verificado 0 residual.
- 1 rifa víctima + 1 usuario víctima + 1 usuario atacante (prueba IDOR `extend_raffle_draw`/`create_raffle_with_declarations`) — eliminados junto con cualquier declaración legal asociada, verificado.
- 1 rifa + 1 usuario (regresión post-fix del camino `service_role` legítimo) — eliminados.

Ningún fixture de esta fase quedó pendiente de limpieza — a diferencia de Fase 1 (EVENT-5 TEST), no había necesidad de conservar nada para revisión manual.

## Archivos y migraciones de esta fase

- `db/migrations/2026-08-26b_event6_fase2_critical_revoke_create_tickets_for_raffle.sql` — **crítico**.
- `db/migrations/2026-08-26c_event6_fase2_hardening_rifas_search_path_and_revoke.sql` — search_path (5 funciones) + revoke por consistencia (2 funciones).
- `db/migrations/2026-08-26d_event6_fase2_revoke_trigger_functions_execute.sql` — revoke por higiene (4 funciones trigger, falsos positivos).
- Este documento (`docs/events/EVENT6_SECURITY_AUDIT_FASE2.md`).
- Ningún archivo de `src/` fue modificado — todas las correcciones son a nivel de base de datos (grants/search_path), sin tocar lógica de aplicación.

## Riesgo urgente para PROD (fuera del alcance de escritura de esta sesión)

`create_tickets_for_raffle` no tiene migración versionada — existe desde el schema base (`db/restore/001_schema_supabase_clean.sql`), anterior a la separación DEV/PROD documentada en este proyecto. **Es razonable asumir que la misma función, con el mismo `GRANT` peligroso, existe hoy en Supabase PROD** (`wrdkdfuiwlujfxxijpao`), sirviendo rifas reales con dinero real. Esta sesión:
- No tiene el CLI de Supabase vinculado a PROD (solo a `rifex-dev`).
- Tiene prohibido explícitamente escribir en PROD bajo esta misión.
- No verificó (ni pudo verificar sin vincularse a PROD, una acción de mayor riesgo que esta sesión no está autorizada a tomar unilateralmente) si PROD realmente tiene el mismo `GRANT`.

**Recomendación urgente, independiente de la decisión de promoción de Eventos**: Rodrigo (o quien tenga acceso a PROD) debería verificar `select grantee, privilege_type from information_schema.role_routine_grants where routine_schema='public' and routine_name='create_tickets_for_raffle';` contra PROD, y si `anon`/`authenticated`/`PUBLIC` aparecen, aplicar el mismo `revoke` de `db/migrations/2026-08-26b_...sql` ahí — **esto no depende de si Eventos se promueve o no**, es una corrección de seguridad de Rifas, independiente, y potencialmente urgente.

---

## Paquete de promoción — preparado, NO ejecutado

### 1. Commits exactos entre `origin/main` (`c944bb3`) y `develop` actual

`git log --oneline c944bb3..HEAD` devuelve **34 commits**. Se separan por categoría — **esta clasificación es informativa, la decisión de qué promover es de Rodrigo**, no de esta auditoría:

**A. Específicos de Eventos (EVENT-1 a EVENT-6), candidatos directos de esta promoción:**
```
8356f58 feat(events): add Event V1 foundation
29eaf65 feat(events): add transactional checkout and orders
725c4f8 feat(events): add tickets and QR fulfillment
fa11531 docs(wop): checkpoint Events through EVENT-3 for notebook reentry
b0f2bdd docs(events): canonicalize EVENT-4 roadmap and reentry risks
a1093b6 feat(events): add staff scanner and atomic check-in
c32713e fix(events): stop scanner from auto-resuming and double-submitting
55494d2 docs(events): certify EVENT-4 manual acceptance
dae5344 feat(events): add EVENT-5 analytics dashboard and XLSX export
31e5ac1 fix(events): add missing autofilter and frozen header row to XLSX export
6dfb29b docs(events): certify EVENT-5 against real Vercel DEV and rifex-dev
0f9ab01 fix(events): correct XLSX visual defects found in independent audit
04e31aa docs(events): certify EVENT-5 — real manual acceptance + visual fix verified live
981eb58 fix(events): EVENT-6 Fase 1 — autonomous security audit, defense-in-depth hardening
(este commit, cierre de EVENT-6 Fase 2, aún no creado al momento de escribir este documento)
```

**B. Seguridad, no específico de Eventos pero de aplicación inmediata recomendada (independiente de si Eventos se promueve):**
```
c9720ae fix(security): enable RLS on raffle_date_extensions (PRE-LAUNCH-FIX-3)
```
Nota: este ya fue aplicado directamente en PROD vía dashboard SQL Editor en una sesión anterior (documentado en WOP.md, "PRE-LAUNCH-FIX-3") — el *commit* (código/documentación) todavía no está en `main`, pero el *schema* ya está corregido en PROD. Promoverlo a `main` es solo alinear el historial de código con lo que ya es cierto en la base de datos, no una migración pendiente de aplicar.

**C. Documentación operativa, sin efecto en schema/código de producto:**
```
9e30cd5 docs(prod): diagnose rifex.pro domain expiration (P0)
```

**D. Fuera del alcance de esta auditoría de Eventos — requieren su propia decisión de promoción, no evaluados aquí:**
```
9496d84 fix(security): close final Rifex 2.0 pre-launch gaps
c08c289 fix(security): close Rifex 2.0 pre-launch P0/P1 findings
92fd2ef feat(draw): limit raffle extensions to 15 days
c2e7c1f fix(ux): RAW-UX-FINAL-B
a86f955 feat(draw): DRAW-UX-FINAL
43d4113 feat(draw): UX aviso sorteo automático
c08643c fix(draw): DRAW-2C separación DEV/PROD
2cd7973 feat(draw): DRAW-2 FINAL scheduler automático
0353918 feat(draw): DRAW-1B hardening + DRAW-2 scheduler
48ddf72 feat(draw): DRAW-1 lifecycle temporal
ef93a60 feat(ux): UX/CRO-1
6b8a963 feat(payments): AR2 Argentina foundation
384bd1f feat(payments): AR1 Argentina DEV-only
9c9cf7c feat(payments): P2 Chile Payment Engine
866779d feat(payments): P1 Payment Engine armazón
88031ba feat(dev): bypass hCaptcha DEV-only (D5-FINAL)
1c903e1 feat(dev): política DEV mínima
ef25ece chore: trigger first Vercel DEV deployment
```
Estos 17 commits representan trabajo real de Rifas/DRAW/Payment Engine ya en `develop` desde antes de que empezara el trabajo de Eventos — **esta auditoría no los evaluó de punta a punta** (fuera del alcance explícito: "EVENT-1 a EVENT-5" y los 16 WARN heredados). Algunos están explícitamente auto-limitados a DEV en su propio código (`AR1`/`AR2` vía `devOnly: true` + `isDevStage()`, `D5-FINAL` hCaptcha bypass) — probablemente inertes si se promueven tal cual, pero **esta afirmación no ha sido verificada con el mismo rigor que el resto de esta auditoría** y no debe asumirse sin una revisión dedicada.

**Recomendación**: tratar la promoción de Eventos (Categoría A + B) como una decisión separada de "promover todo `develop`" (Categoría D). Rodrigo debe decidir la estrategia de release, no esta auditoría.

### 2. Migraciones SQL pendientes para PROD, en orden

PROD tiene 6 migraciones aplicadas, la más reciente `2026-08-23b_prelaunch_fix2_hardening.sql` (confirmado en `docs/WOP.md`). Pendientes, en orden:

| # | Migración | Ya aplicada en PROD (schema real) | Requiere aplicación |
|---|---|---|---|
| 1 | `2026-08-23c_event1_foundation.sql` | No | Sí |
| 2 | `2026-08-24_event2_checkout_orders.sql` | No | Sí |
| 3 | `2026-08-25_event3_tickets_qr.sql` | No | Sí |
| 4 | `2026-08-25b_event4_staff_scanner_checkin.sql` | No | Sí |
| 5 | `2026-08-25c_prelaunch_fix3_raffle_date_extensions_rls.sql` | **Sí** (aplicada manualmente en sesión anterior) | No — solo alinear el commit |
| 6 | `2026-08-26_event6_hardening_search_path_and_revoke.sql` | No | Sí (endurecimiento de Eventos) |
| 7 | `2026-08-26b_event6_fase2_critical_revoke_create_tickets_for_raffle.sql` | No | **Sí — urgente, independiente de Eventos, ver "Riesgo urgente para PROD"** |
| 8 | `2026-08-26c_event6_fase2_hardening_rifas_search_path_and_revoke.sql` | No | Sí — independiente de Eventos |
| 9 | `2026-08-26d_event6_fase2_revoke_trigger_functions_execute.sql` | No | Sí — independiente de Eventos |

Las 4 migraciones fuera de Eventos (`2026-08-23_prelaunch_fix1...`, `2026-08-23b_prelaunch_fix2...`) ya están en PROD — no listadas como pendientes.

**Ninguna migración de la Categoría D del punto 1 (DRAW/Payment Engine/AR) fue auditada en esta sesión** — no se incluye una recomendación de orden para esas, fuera del alcance explícito.

### 3. Variables de entorno requeridas — solo nombres

Ya documentadas íntegramente en `docs/WOP.md` (sección "Reentry Notebook Procedure", paso de configuración DEV) — los mismos nombres aplican para PROD, apuntando a los valores reales de PROD:

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_BASE_URL`, `MP_ACCESS_TOKEN`, `MP_CLIENT_ID`, `MP_CLIENT_SECRET`, `MP_PUBLIC_KEY`, `MP_REDIRECT_URI`, `MP_WEBHOOK_SECRET`, `ENABLE_EMAILS`, `RESEND_API_KEY`, `EMAIL_FROM`, `NEXT_PUBLIC_STAGE`, `HCAPTCHA_SECRET`, `NEXT_PUBLIC_HCAPTCHA_SITEKEY`, `ADMIN_API_TOKEN`, `DEV_TEST_EMAIL_TOKEN`, `CREATOR_FALLBACK_EMAIL`, `HOLD_MINUTES`.

Ninguna variable nueva fue introducida por Eventos o por esta auditoría — todo el código de EVENT-1..6 reutiliza exclusivamente `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`, ya existentes.

### 4. Verificaciones previas a cualquier promoción

1. Confirmar `origin/main` real (`git ls-remote origin main`) coincide con el checkpoint asumido (`c944bb3`) — si cambió, detener y reconciliar antes de continuar.
2. Confirmar el `project ref` real de PROD Supabase antes de cualquier operación (`wrdkdfuiwlujfxxijpao`, nunca `nwxrvwbzqbhznscyirbq`).
3. **Aplicar primero, e independientemente, el fix urgente de `create_tickets_for_raffle` en PROD** (ver "Riesgo urgente para PROD") — no debe esperar a la decisión de promoción de Eventos.
4. Decidir la estrategia de release (Eventos solo vs. todo `develop`) — decisión de Rodrigo, no técnica.
5. Backup/snapshot de PROD Supabase antes de aplicar cualquier migración (procedimiento estándar de Supabase, fuera del alcance de este repo).
6. Confirmar que el plan de Vercel real de `rifex-frontend-v2` soporta el `maxDuration` necesario para el export XLSX de EVENT-5 (pendiente desde la certificación de EVENT-5 — sin acceso no-interactivo al dashboard en ninguna sesión hasta ahora).
7. Confirmar la rotación de la contraseña de `rifex-dev` (pendiente, no bloqueante para promover a PROD ya que son proyectos Supabase distintos, pero pendiente de todas formas).

### 5. Plan de rollback

- **Migraciones SQL**: cada migración de Eventos es aditiva (crea tablas/columnas/funciones nuevas) excepto los `revoke`/`alter function ... set search_path` de EVENT-6, que son reversibles con un `grant`/`alter function ... reset search_path` inverso si algo se rompiera inesperadamente (no se espera, ya verificado en DEV).
- **Código**: revertir el merge a `main` (o el deploy de Vercel a la versión anterior vía `vercel rollback`/promover un deployment previo) es la vía estándar — Vercel conserva deployments anteriores.
- **Datos**: ninguna migración de Eventos borra ni transforma datos existentes de Rifas/Colectas — un rollback de código nunca deja datos de Eventos huérfanos de forma peligrosa (las tablas de Eventos son un dominio nuevo e independiente, ver EVENT-1 Fase 0).
- **Fix crítico de `create_tickets_for_raffle`**: el rollback (re-otorgar `EXECUTE`) NUNCA debería ejecutarse — es una corrección de seguridad pura, sin efecto en funcionalidad legítima alguna.

### 6. Pruebas posteriores a la promoción (a ejecutar contra PROD, con datos reales, cuando Rodrigo decida)

- Smoke de las mismas rutas verificadas en DEV esta sesión (`/rifas`, `/eventos`, `/panel`, `/api/rifas`, `/api/events`, etc.) contra `rifex.pro` real.
- Confirmar Security Advisor de PROD reporta 0 ERROR y verificar si los mismos 16 WARN heredados existen ahí (ver "Riesgo urgente para PROD" — alta probabilidad de que sí).
- Prueba manual real de un flujo de Eventos completo (crear evento, comprar entrada CON un pago real de Mercado Pago de bajo monto, check-in real) — análogo a la aceptación manual ya hecha en DEV por Rodrigo para EVENT-4/EVENT-5, pero contra PROD.
- Confirmar que Rifas/Colectas siguen funcionando exactamente igual (regresión, mismo criterio que esta sesión aplicó en DEV).

### 7. Operaciones que requerirán intervención directa de Rodrigo

- Decisión de negocio: promover Eventos a PROD (esta auditoría certifica el estado técnico, no autoriza el lanzamiento).
- Decisión de estrategia de release: ¿Eventos solo, o todo `develop` (incluyendo DRAW/Payment Engine/AR, no auditados aquí)?
- Verificar y corregir `create_tickets_for_raffle` en PROD — urgente, independiente de Eventos.
- Habilitar `auth_leaked_password_protection` en el dashboard de Supabase (DEV y/o PROD) — decisión de política de seguridad, no técnica.
- Rotación de la contraseña de `rifex-dev` (pendiente de sesiones anteriores).
- Confirmar el plan real de Vercel (Fluid Compute/`maxDuration`) para `rifex-frontend-v2` (PROD) antes de confiar en el export XLSX de EVENT-5 bajo carga real.
- Backup de Supabase PROD antes de cualquier migración.
- Ejecutar el propio merge/push a `main` y el deploy a PROD — explícitamente no ejecutado por esta sesión.

### 8. Riesgos aceptados y pendientes

- **Urgente, fuera de Eventos**: posible vulnerabilidad crítica activa en PROD (`create_tickets_for_raffle`) — ver arriba.
- 17 commits de Categoría D (DRAW/Payment Engine/AR/UX/dev-policy) sin auditar por esta sesión — cualquier decisión de incluirlos en la promoción debe pasar por su propia revisión.
- `auth_leaked_password_protection` deshabilitado — riesgo aceptado, pendiente de decisión administrativa.
- Rotación de contraseña de `rifex-dev` pendiente (no bloqueante para PROD, pero pendiente).
- Plan real de Vercel (Fluid Compute) sin confirmar para `rifex-frontend-v2`.

### 9. Confirmación — Eventos permanece separado de PROD

Ninguna migración de Eventos, ninguna corrección de esta Fase 2, ningún código de `src/` fue aplicado a PROD ni a `main` en esta sesión. `origin/main` permanece exactamente en `c944bb3`, verificado antes y después de todo el trabajo. Supabase PROD (`wrdkdfuiwlujfxxijpao`) no fue tocado, ni siquiera leído (sin vínculo de CLI activo hacia PROD en esta sesión). **Eventos continúa separado de PROD hasta que Rodrigo autorice explícitamente la promoción.**

---

## Veredicto

**GO** para EVENT-1 a EVENT-6 en su estado actual en DEV — la vulnerabilidad crítica real encontrada fue en código de **Rifas heredado**, no en Eventos, y ya fue corregida y verificada. El Security Advisor de `rifex-dev` pasó de 22 hallazgos WARN a 1 (puramente administrativo). **La decisión de promoción a PROD sigue siendo de Rodrigo** — el paquete de promoción queda preparado, no ejecutado.

**PROD confirmado intacto**: `origin/main` sin cambios (`c944bb3`), Supabase PROD no tocado en ningún momento.

**EVENT-7: NO AUTORIZADO.**

# Handover — Notebook (Antofagasta/Calama) → PC de Escritorio (Santiago)

Documento autocontenido. Escrito el 26 de agosto de 2026, al cierre de la misión autónoma de diseño de Rifex Trust. No requiere memoria de la sesión anterior — la autoridad es el repositorio (Git) y `docs/WOP.md`.

---

## 1. Repo, rama, HEAD

```text
Repo:            https://github.com/ravymaster/rifex-frontend-v2.git
Rama de trabajo: develop
HEAD real:       83397eb5d4ccb04b1320b33690f17628da7a8e17
                  "fix(security): EVENT-6 Fase 2 — critical anon RCE-equivalent ticket-minting fix + Rifas WARN audit"
origin/develop:  igual a HEAD (83397eb...) al momento de escribir este documento
origin/main:     c944bb386e5187b96bf5624f84719ee89da3a34c — SIN CAMBIOS durante toda esta sesión ni las anteriores de Eventos/Trust
working tree:    limpio salvo docs/trust/ (nueva, sin commitear todavía al momento de escribir este párrafo — se commitea al cierre de esta misma sesión)
```

Verificar siempre, al reingresar: `git fetch origin && git log -1 --oneline origin/develop` y `git ls-remote origin main` — si `origin/main` cambió de `c944bb3`, detente y reconcilia antes de continuar.

## 2. Commits recientes relevantes (más nuevo primero)

```text
83397eb fix(security): EVENT-6 Fase 2 — critical anon RCE-equivalent ticket-minting fix + Rifas WARN audit
981eb58 fix(events): EVENT-6 Fase 1 — autonomous security audit, defense-in-depth hardening
04e31aa docs(events): certify EVENT-5 — real manual acceptance + visual fix verified live
0f9ab01 fix(events): correct XLSX visual defects found in independent audit
6dfb29b docs(events): certify EVENT-5 against real Vercel DEV and rifex-dev
31e5ac1 fix(events): add missing autofilter and frozen header row to XLSX export
dae5344 feat(events): add EVENT-5 analytics dashboard and XLSX export
9e30cd5 docs(prod): diagnose rifex.pro domain expiration (P0)
c9720ae fix(security): enable RLS on raffle_date_extensions (PRE-LAUNCH-FIX-3)
55494d2 docs(events): certify EVENT-4 manual acceptance
c32713e fix(events): stop scanner from auto-resuming and double-submitting
a1093b6 feat(events): add staff scanner and atomic check-in
```

## 3. Estado real de EVENT-1 a EVENT-6

| Etapa | Estado | Evidencia |
|---|---|---|
| EVENT-1 | DONE | Foundation — eventos/tipos de entrada |
| EVENT-2 | DONE | Checkout/órdenes, `approved_unfulfilled` |
| EVENT-3 | DONE | Tickets/QR, exactly-once |
| EVENT-4 | **DONE — CERTIFICADO**, aceptación manual real 100/100 de Rodrigo en teléfono real | `docs/events/EVENT4_STAFF_SCANNER_CHECKIN.md` |
| EVENT-5 | **DONE — CERTIFICADO**, aceptación manual real de Rodrigo + defectos visuales del XLSX encontrados y corregidos con evidencia real | `docs/events/EVENT5_ANALYTICS_XLSX.md` |
| EVENT-6 Fase 1 | **DONE**, auditoría autónoma real de EVENT-1..5 contra Vercel DEV/rifex-dev reales, 30/31 pruebas PASS, 2 hallazgos de bajo riesgo corregidos, veredicto GO | `docs/events/EVENT6_SECURITY_AUDIT.md` |
| EVENT-6 Fase 2 | **DONE**, auditoría de los 16 WARN heredados de Rifas/Auth, **1 vulnerabilidad CRÍTICA real encontrada y corregida en DEV** (`create_tickets_for_raffle`), paquete de promoción a PROD preparado, no ejecutado | `docs/events/EVENT6_SECURITY_AUDIT_FASE2.md` |
| Diseño Rifex Trust | **DONE** (esta sesión) — 12 documentos de diseño + este handoff, cero código | `docs/trust/` |
| EVENT-7 | **NO AUTORIZADO** — no existe todavía, no fue scopeado por nadie |

## 4. Diseño Rifex Trust — resumen (detalle completo en `docs/trust/`)

Sistema transversal de onboarding, identidad, verificación, prevención de fraude, administración, denuncias, reputación basada en operaciones reales, y expansión futura — diseñado en su mayoría, **no implementado**, salvo TRUST-1 (ver nota abajo).

> **Actualización posterior a la fecha de este handoff**: TRUST-1 (onboarding universal) quedó **completo en código, migración local escrita y revisada, pruebas reales pasando — pero la migración NO se aplicó en `rifex-dev`**, pendiente de autorización explícita de Rodrigo (aplicar en DEV, fixtures si son indispensables, push, deploy). Ver `docs/trust/TRUST_IMPLEMENTATION_ROADMAP.md`, sección TRUST-1, y `docs/WOP.md`, "TRUST-1 checkpoint", para el detalle exacto. Si esto se retoma desde Santiago sin que esa autorización ya se haya dado, **no desplegar el código de TRUST-1 sin aplicar antes la migración `db/migrations/2026-08-26e_trust1_onboarding.sql`** — el código depende de que la tabla exista, y sin ella bloquea la creación/publicación para todos.

Documentos, en orden recomendado de lectura:

1. `docs/trust/RIFEX_TRUST_CANONICAL_DESIGN.md` — documento maestro (objetivo, documentos por producto, motor de riesgo, arquitectura, invariantes).
2. `docs/trust/TRUST_UNIFIED_ONBOARDING.md` — gap real de Google OAuth confirmado contra el código, flujo de estados.
3. `docs/trust/TRUST_AGE_IDENTITY_VERIFICATION.md` — comparación de 6 métodos de verificación, comparación OCR/KYC, advertencias explícitas sobre certificado de nacimiento y reconocimiento facial propio.
4. `docs/trust/TRUST_THREAT_MODEL.md` — 26 amenazas con probabilidad/impacto/prevención/detección/respuesta/responsable/riesgo residual.
5. `docs/trust/TRUST_LEGAL_PRIVACY_MATRIX_CHILE.md` — Ley 19.628/21.719 (fechas reales verificadas), y un **hallazgo material real**: las rifas/colectas de personas naturales existen en una zona gris bajo la Ley 10.262 (juegos de azar, en principio solo autorizables a personas jurídicas sin fines de lucro).
6. `docs/trust/TRUST_COUNTRY_COMPLIANCE_PACKS.md` — investigación comparativa AR/PE/CO/UY/BR, ningún país habilitado.
7. `docs/trust/TRUST_DATA_RETENTION_MATRIX.md` — qué se conserva, cuánto tiempo, y por qué.
8. `docs/trust/TRUST_ROLES_AUTHORIZATION.md` — roles (`trust_reviewer`/`trust_supervisor`/`support_readonly`/`security_auditor`), matriz de autorización.
9. `docs/trust/TRUST_POST_TRANSACTION_EVIDENCE.md` — flujo de entrega/confirmación/rendición para Rifas/Eventos/Colectas.
10. `docs/trust/TRUST_EMAIL_NOTIFICATION_MATRIX.md` — 4 categorías de correo, nunca convertir una compra en marketing implícito.
11. `docs/trust/TRUST_IMPLEMENTATION_ROADMAP.md` — TRUST-0 a TRUST-9, cada uno con alcance/exclusiones/riesgos/autorización necesaria.
12. `docs/trust/TRUST_DECISIONS_FOR_RODRIGO.md` — índice consolidado de todo lo que requiere su decisión, ordenado por prioridad.

**El hallazgo de mayor prioridad de todo el diseño de Trust no es técnico**: es el punto #1 de `TRUST_DECISIONS_FOR_RODRIGO.md` — el encaje legal real de Rifas/Colectas de personas naturales bajo la Ley 10.262 chilena. Ningún nivel de Trust técnico lo resuelve; requiere abogado.

## 5. ⚠️ PENDIENTE URGENTE — EJECUTAR EXCLUSIVAMENTE DESDE EL PC DE ESCRITORIO EN SANTIAGO

**`public.create_tickets_for_raffle(uuid, integer)` probablemente tiene la misma vulnerabilidad crítica en Supabase PROD (`wrdkdfuiwlujfxxijpao`) que ya fue demostrada y corregida en `rifex-dev`.**

- La función permite, sin corrección, que **cualquier visitante anónimo** (solo la clave pública `anon`, sin sesión) mintee tickets reales en cualquier rifa ajena — demostrado en vivo en `rifex-dev` durante EVENT-6 Fase 2 (`docs/events/EVENT6_SECURITY_AUDIT_FASE2.md`).
- La función es anterior al fork DEV/PROD (vive en `db/restore/001_schema_supabase_clean.sql`, sin migración versionada) — no hay razón para creer que PROD esté en mejor estado que DEV lo estaba antes de la corrección.
- **Este notebook nunca se vinculó al proyecto Supabase PROD y esta misión prohibió explícitamente escribir ahí** — por eso esto no se verificó ni se corrigió desde Antofagasta/Calama.
- **La migración ya está escrita, probada y verificada funcionando en DEV**: `db/migrations/2026-08-26b_event6_fase2_critical_revoke_create_tickets_for_raffle.sql`.

### Procedimiento seguro recomendado desde Santiago

1. Confirmar el `project ref` real de PROD antes de cualquier acción (`wrdkdfuiwlujfxxijpao` — nunca `nwxrvwbzqbhznscyirbq`, que es DEV).
2. Verificar primero, de forma puramente read-only, si el grant peligroso existe en PROD:
   ```sql
   select grantee, privilege_type from information_schema.role_routine_grants
   where routine_schema='public' and routine_name='create_tickets_for_raffle';
   ```
3. Si `anon`, `authenticated` o `PUBLIC` aparecen con `EXECUTE`: aplicar exactamente el mismo contenido de `db/migrations/2026-08-26b_event6_fase2_critical_revoke_create_tickets_for_raffle.sql` contra PROD — es un `revoke`, aditivo, sin riesgo de romper nada legítimo (verificado en DEV: `service_role` sigue funcionando sin cambios).
4. Verificar post-fix, igual que se hizo en DEV: un intento de llamada anónima real a la función debe devolver `401`, nunca `204`.
5. Nunca usar `supabase db dump --dry-run` (expone la contraseña en texto plano — incidente real ya ocurrido una vez en `rifex-dev`, documentado en `docs/WOP.md`). Usar `supabase db query --linked --project-ref wrdkdfuiwlujfxxijpao -f <archivo>` (vía Management API, no expone credenciales) para aplicar la migración, o el SQL Editor del dashboard de Supabase directamente.
6. Documentar el resultado en `docs/WOP.md` y `docs/CURRENT_STATE.md` tras aplicar — mismo criterio ya usado para PRE-LAUNCH-FIX-3 (aplicado a PROD manualmente en una sesión anterior, documentado ahí).

**No se debe intentar verificar ni corregir esto desde ningún PC que no sea el de escritorio en Santiago, salvo que Rodrigo autorice explícitamente vincular otra máquina a PROD.**

## 6. Otros riesgos pendientes (heredados, sin cambios en esta sesión)

- **Rotación de la contraseña de `rifex-dev`** — sigue pendiente. Expuesta en texto plano por un `--dry-run` el 2026-08-25. Nunca reutilizar esa credencial. Decisión explícita de posponerla, no un olvido.
- **`rifex.pro` — dominio vencido en el registrador (Hostinger)**. Causa raíz confirmada en una sesión anterior (`docs/WOP.md`, "P0 — rifex.pro domain expired"): el registro del dominio venció, nameservers reales apuntan a `dns-expired.com`. **No hay corrección posible desde código, deploy, base de datos ni Vercel** — requiere que Rodrigo (o quien tenga la cuenta de Hostinger) renueve el dominio directamente ahí. Sigue sin resolverse a la fecha de este handoff.
- **Confirmación del plan real de Vercel** (Fluid Compute/`maxDuration`) para `rifex-frontend-main`/`rifex-frontend-v2` — pendiente desde la certificación de EVENT-5, sin acceso no-interactivo al dashboard en ninguna sesión hasta ahora.

## 7. Security Advisor (estado real, `rifex-dev`, al cierre de EVENT-6 Fase 2)

22 hallazgos WARN → 16 (tras EVENT-6 Fase 1) → **1** (tras EVENT-6 Fase 2, puramente administrativo: `auth_leaked_password_protection`, un toggle del dashboard de Supabase Auth, no corregido a propósito, requiere decisión administrativa de Rodrigo). **0 hallazgos ERROR en ningún momento.** No se verificó el Security Advisor de PROD en ninguna sesión — se recomienda ejecutarlo desde Santiago junto con el punto 5.

## 8. Promoción de Eventos — pendiente

Paquete completo preparado, **no ejecutado**, en `docs/events/EVENT6_SECURITY_AUDIT_FASE2.md`: 34 commits entre `origin/main` y `develop`, de los cuales ~14 son específicos de Eventos y 17 más (DRAW/Payment Engine/Argentina/UX/dev-policy) nunca fueron auditados por ninguna sesión de Eventos — necesitan su propia revisión antes de cualquier promoción que los incluya. Migraciones SQL pendientes para PROD listadas en orden en ese mismo documento. **La decisión de promover Eventos a producción es de Rodrigo, no una conclusión técnica de esta u otra auditoría.**

## 9. Orden de reentrada recomendado

1. `git fetch origin && git log -1 --oneline origin/develop` y `git ls-remote origin main` — confirmar que nada cambió inesperadamente.
2. `git status` — confirmar working tree limpio antes de tocar nada.
3. Leer, en orden: `docs/WOP.md` (sección "RIFEX CURRENT STATE"), `docs/CURRENT_STATE.md`, este documento, `docs/events/EVENT6_SECURITY_AUDIT.md`, `docs/events/EVENT6_SECURITY_AUDIT_FASE2.md`, y los 12 documentos de `docs/trust/` en el orden listado en la sección 4.
4. Confirmar el vínculo real de Supabase CLI de la máquina de escritorio (`supabase status` o equivalente) — **debe confirmarse explícitamente si está vinculada a DEV, a PROD, o a ninguna**, antes de ejecutar cualquier comando.
5. Resolver primero el punto 5 de este documento (vulnerabilidad crítica en PROD) — es la única acción verdaderamente urgente heredada de esta sesión.
6. Solo después, según lo que Rodrigo decida, continuar con: revisión legal de `TRUST_DECISIONS_FOR_RODRIGO.md`, inicio de TRUST-1, o cualquier otro trabajo que Rodrigo autorice explícitamente.

## 10. Prohibiciones que siguen vigentes salvo nueva autorización explícita

- No promover Eventos a producción sin autorización explícita de Rodrigo.
- No iniciar EVENT-7 sin alcance ni autorización.
- No implementar Rifex Trust (ningún TRUST-1 en adelante) sin autorización explícita, y preferiblemente sin que Rodrigo haya revisado `TRUST_DECISIONS_FOR_RODRIGO.md` primero.
- No ejecutar `supabase migration repair`.
- No usar `supabase db dump --dry-run` bajo ninguna circunstancia (expone contraseñas).
- No tocar `rifex.pro`/DNS/Hostinger salvo que Rodrigo lo autorice y tenga las credenciales a mano.
- No cambiar comisiones, precios ni funcionalidades del producto sin autorización de negocio explícita.

---

## 11. Prompt final para la sesión de escritorio (Santiago) — copiar y pegar completo

```text
Estamos retomando Rifex desde el PC de escritorio en Santiago, sesión sin memoria conversacional previa.
No uses memoria de conversación como autoridad — la autoridad es el repo (Git) y docs/WOP.md.
Repo: https://github.com/ravymaster/rifex-frontend-v2.git, branch develop.
Lee completo, en este orden: docs/handover/HANDOVER_NOTEBOOK_TO_DESKTOP_2026-08.md, docs/WOP.md (sección RIFEX CURRENT STATE), docs/CURRENT_STATE.md, docs/events/EVENT6_SECURITY_AUDIT.md, docs/events/EVENT6_SECURITY_AUDIT_FASE2.md, y los 12 documentos de docs/trust/ en el orden listado en la sección 4 del handoff.
Verifica: git fetch, HEAD real de develop (debe ser 83397eb o un descendiente), origin/main (c944bb3 o su descendiente — si cambió, alerta antes de seguir), git status limpio.
Confirma explícitamente el vínculo real de Supabase CLI de esta máquina — a qué project ref está vinculada, si acaso alguno — antes de ejecutar cualquier comando de Supabase.
Reconstruye el estado real de EVENT-1 a EVENT-6 y del diseño de Rifex Trust a partir del repo, no de esta instrucción.
Tu primera tarea real, antes que cualquier otra cosa: resolver la sección 5 del handoff — verificar (read-only primero) y, si corresponde, corregir en Supabase PROD (wrdkdfuiwlujfxxijpao) la vulnerabilidad de create_tickets_for_raffle, usando exactamente la migración ya probada en DEV (db/migrations/2026-08-26b_event6_fase2_critical_revoke_create_tickets_for_raffle.sql) y el procedimiento seguro descrito en esa sección — nunca supabase db dump --dry-run, nunca migration repair, confirma el project ref de PROD antes de cada acción.
No implementes Rifex Trust todavía — eso requiere que Rodrigo revise docs/trust/TRUST_DECISIONS_FOR_RODRIGO.md primero.
No promuevas Eventos a producción sin autorización explícita.
No inicies EVENT-7.
Entrégame un REENTRY REPORT (branch, HEAD, origin/develop, origin/main, git status, vínculo Supabase real de esta máquina, resultado de la verificación/corrección de create_tickets_for_raffle en PROD, resumen de EVENT-1 a EVENT-6, resumen del diseño de Trust, riesgos pendientes, NEXT) y detente ahí.
```

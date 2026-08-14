# Rifex Current Handover

## Identidad

- Product: Rifex.
- Repository: `C:\proyectos\rifexv1.1\rifex-frontend-main`.
- Remote: `https://github.com/ravymaster/rifex-frontend-v2.git`.
- Main branch: `main`.
- Observable purpose: Next.js frontend and API surface for raffle creation, ticket selection, Mercado Pago checkout, payment confirmation, webhook handling, creator panel operations, seller Mercado Pago OAuth, email notifications and winner selection.
- Stack: Next.js 14 Pages Router, React 18, Supabase, Mercado Pago SDK/REST, Resend, hCaptcha, CSS Modules/local styles.

## Estado Oficial

```text
ALIGNMENT: CLOSED — GO
ARCHITECTURE AUDIT: CLOSED — GO
ARCHITECTURE DESIGN: CLOSED — GO
R4 SPRINT READINESS: GO
SPRINT R4: CLOSED — GO
NEXT ELIGIBLE STAGE: DB RECOVERY CONTRACT
DB RECOVERY CONTRACT: NOT AUTHORIZED
OTHER SPRINTS: NOT AUTHORIZED
```

## Checkpoint Principal

```text
main:
7e96cdadb66338cd2cf2dc879473f4e14944c871

commit message:
docs: track session resume prompt in docs/handover
```

`bbaf8a0` (`fix: restore checkout page build`) sigue siendo la implementación de R4: reescribió `src/pages/checkout/index.js` como página React válida (antes era código de API pegado en una ruta de página, causa confirmada del build roto). Fue el único archivo que tocó. `npm run build` pasa completo (25/25 páginas). No se tocaron las APIs de checkout, el webhook, el mailer, ni los 3 diffs de recovery. Ese commit ya no es HEAD — quedó como ancestro, ver tabla abajo.

Commits anteriores en esta cadena, por si hace falta ubicar el punto exacto de cada hito:

| HEAD | Mensaje | Qué cerró |
|---|---|---|
| `19e2899` | docs: close Rifex architecture design | Architecture Design |
| `48013ce` | docs: add Rifex resume handover | Handover documental previo |
| `bbaf8a0` | fix: restore checkout page build | R4 (implementación) |
| `1fc064a` | docs: close R4 and reconcile HEAD, execution audit, R2/R3 testimony | Cierre documental de R4 (ver nota de staleness abajo) |
| `af221e7` | docs: reconcile stale HEAD citation to 1fc064a | Reconciliación de cita de HEAD en README/WOP/CURRENT_STATE |
| `7e96cda` | docs: track session resume prompt in docs/handover | Tracking de `NUEVA_SESION_PROMPT.txt` — **actual HEAD** |

Nota de staleness: `1fc064a` cerró el lote de documentación pendiente (ver abajo) pero, en el mismo patrón ya documentado en `docs/audits/EXECUTION_ENVIRONMENT_AUDIT.md` (`STALE, NOT CORRUPTED`), no actualizó su propia cita de HEAD dentro de README/WOP/CURRENT_STATE/este handover. `af221e7` corrigió README/WOP/CURRENT_STATE; esta edición corrige este archivo con el mismo criterio.

## Recovery Preservado

```text
branch:
recovery/rifex-hardening-preserved

commit:
1c23702f401f8c501077ecfd265a213245e62a63

status:
PRESERVED — UNVERIFIED — NOT ADOPTED
```

Files preserved on the recovery branch:

- `src/lib/mailer.js`
- `src/pages/api/admin/reconcile-payments.js`
- `src/pages/api/checkout/webhook.js`

These changes are not in `main`. Do not mix them with R4. They must be recovered later as R1/R2/R3 work, through selective and certified adoption. Do not perform a general merge of `recovery/rifex-hardening-preserved`.

## Backup

- File name: `db_cluster-10-11-2025@05-41-59.backup.gz`.
- Local state: present.
- Git state: ignored.
- Classification: sensitive.
- Baseline: outside Git.
- Rule: do not inspect, move or delete without a specific mission.

No backup content or data is included in this handover.

## Estado Tecnico

- General functionality: `UNVERIFIED` (payments, mail, webhook, OAuth flows — not exercised against real services).
- Production readiness: not certified.
- DB reproducibility: `PARTIAL`.
- Remote database state: `UNKNOWN` from Git; a local Supabase backup (`db_cluster-10-11-2025@05-41-59.backup.gz`, outside Git, ignored) was inspected read-only for schema/RLS/row-count evidence only — see `docs/audits/EXECUTION_ENVIRONMENT_AUDIT.md` and `docs/recovery/R2_R3_MARKETPLACE_PAYMENT_TESTIMONY.md`.
- Build state: `CONFIRMED PASSING` as of HEAD `bbaf8a0`. `npm run build` succeeds, 25/25 pages, `/checkout` prerenders as a static page. This is a build-success confirmation only, not functional/payment verification.
- Previous build failure: `/checkout`, RESOLVED by R4.
- Confirmed original cause: API handler located as a `/checkout` Pages Router page route.
- Authorization risks: still open.
- Canonical states: contradictory across evidence sources (`public.raffles`/`tickets` vs legacy `public.rifas`/`rifa_tickets`, bridged by `raffles_compat`/`tickets_compat` views — confirmed from backup inspection).
- Legacy: frozen behind compatibility boundaries.

## R4 — Cerrado

R4 (Build Baseline Recovery) fue autorizado, implementado, verificado y cerrado en esta sesión:

- Único archivo tocado: `src/pages/checkout/index.js` (reescrito como página React válida, decisión A del packet).
- `npm run build`: PASS, 25/25 páginas.
- Callers/rutas verificados intactos: `/checkout/success`, `/checkout/pending`, `/checkout/failure`, `/api/checkout`, `/api/checkout/mp`, `/api/checkout/confirm`, `/api/checkout/webhook`.
- Los 3 diffs de recovery (`mailer.js`, `reconcile-payments.js`, `webhook.js`): intactos, sin tocar.
- Escaneo de secretos sobre el archivo cambiado: limpio.
- Commit `bbaf8a0` (`fix: restore checkout page build`), pusheado a `origin/main`.
- Detalle completo del Release Audit: ver historial de esta sesión; no hay un archivo de release audit separado todavía.

## Primer Proximo Paso

```text
DB RECOVERY CONTRACT
```

- Es la siguiente etapa elegible según la secuencia aprobada (`R4 -> DB Recovery Contract -> R1 -> R2 -> R3 Technical -> Fees Policy`).
- Diseño existente: `docs/database/DB_RECOVERY_CONTRACT.md`, sección "DB Recovery Contract" de `docs/recovery/RECOVERY_PLAN.md`.
- **NOT AUTHORIZED todavía.** Requiere autorización explícita del usuario antes de abrir.

## Lote De Documentación — Ya Commiteado

El lote de documentación que en una sesión anterior figuraba como pendiente ya fue commiteado y pusheado a `origin/main`, en tres commits:

- `1fc064a` (`docs: close R4 and reconcile HEAD, execution audit, R2/R3 testimony`): `README.md`, `docs/WOP.md`, `docs/CURRENT_STATE.md`, `docs/recovery/RECOVERY_PLAN.md` (modificados); `docs/audits/EXECUTION_ENVIRONMENT_AUDIT.md`, `docs/recovery/R2_R3_MARKETPLACE_PAYMENT_TESTIMONY.md` (nuevos).
- `af221e7` (`docs: reconcile stale HEAD citation to 1fc064a`): corrigió la cita de HEAD desactualizada que `1fc064a` había dejado en `README.md`/`docs/WOP.md`/`docs/CURRENT_STATE.md`.
- `7e96cda` (`docs: track session resume prompt in docs/handover`): trackeó `docs/handover/NUEVA_SESION_PROMPT.md`.

`package.json`/`package-lock.json` siguen con el diff local (`allowScripts` de npm 11 para `sharp`), explicado y sin impacto, no pensado para commitear — sigue vigente al HEAD actual.

## Entorno De Esta Maquina

- `gh` (GitHub CLI) instalado y autenticado como `ravymaster` (HTTPS, scopes incluyen `repo`). `git push`/`git fetch` a `origin` ya funcionan sin pasos adicionales.
- `git config --global user.name`/`user.email` configurados (`ravysistem` / `rodrigo00787@hotmail.com`), necesarios para poder commitear en esta máquina.
- Repositorio local en `/home/desktop/rifex-frontend-v2` (Linux Mint 22.2), no en la ruta Windows histórica citada en documentación vieja.

## Instrucciones Para Reanudar

The next AI must read, in this order:

1. `README.md`
2. `docs/WOP.md`
3. `docs/ENGINEERING_PROCESS.md`
4. `docs/CURRENT_STATE.md`
5. `docs/handover/HANDOVER_RIFEX_CURRENT.md`
6. `docs/audits/EXECUTION_ENVIRONMENT_AUDIT.md`
7. `docs/recovery/RECOVERY_PLAN.md`
8. `docs/recovery/R2_R3_MARKETPLACE_PAYMENT_TESTIMONY.md`
9. `docs/architecture/ARCHITECTURE_TARGET.md`
10. `docs/architecture/ARCHITECTURE_DECISIONS.md`

Then verify:

- branch `main`;
- HEAD (`git rev-parse HEAD`, do not assume it still equals `bbaf8a0` — confirm);
- `origin/main`;
- working tree (expect the pending documentation batch above unless someone already committed it — do not assume either way);
- recovery branch;
- ignored backup.

R4 is already closed. Do not reopen it. Only ask for authorization before opening DB Recovery Contract or any other new Sprint.

## Prohibiciones De Reanudacion

- Do not use conversational memory as source of truth.
- Do not mix recovery branch with any Sprint.
- Do not open DB/R1/R2/R3 without explicit authorization.
- Do not modify checkout APIs, mailer, webhook, or reconcile-payments without explicit authorization and design.
- Do not reopen or re-implement R4; it is closed.
- Do not open another Sprint without explicit authorization.
- Do not declare functionality (payments, mail, OAuth) verified — only R4's build success is confirmed.
- Do not touch the backup.
- Do not install dependencies before the corresponding gate.
- Do not run `git config`, `sudo`, or install system packages without the user doing it themselves or explicitly approving each command.

## Recovery Sequence

```text
R4
→ DB Recovery Contract
→ R1
→ R2
→ R3 Technical
→ Fees Policy
→ Release Audits
→ Separate Commits
```

## Primer Prompt Sugerido

```text
Lee el handover y docs/CURRENT_STATE.md.
Reconstruye Git (branch, HEAD real, origin/main, working tree).
No programes todavía.
Confirma el estado real contra lo documentado y reportá si algo no coincide,
antes de proponer cualquier próximo paso.
```
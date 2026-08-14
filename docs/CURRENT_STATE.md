# Rifex Current State

This document is the current documentation snapshot of observable repository state after Architecture Design AD4 documentation materialization.

## Repository

| Item | Value |
|---|---|
| Repository | `C:\proyectos\rifexv1.1\rifex-frontend-main` |
| Branch | `main` |
| HEAD | `1fc064a8517389873b7c8c57053cd7ed7f0440d2` |
| HEAD message | docs: close R4 and reconcile HEAD, execution audit, R2/R3 testimony |
| R4 implementation commit | `bbaf8a02d2ff3681186e8f84317ce1c7cdd064ee` (fix: restore checkout page build), ancestor of HEAD |
| Upstream | `origin/main` |
| Fetch executed in A2 | No |
| Functional certification | UNVERIFIED; Alignment A3 build failed at `/checkout`; no new functional validation during AA1-AA3 |

## Separated State Categories

### HEAD

HEAD `1fc064a8517389873b7c8c57053cd7ed7f0440d2` is the confirmed current checkpoint (`docs: close R4 and reconcile HEAD, execution audit, R2/R3 testimony`). `bbaf8a02d2ff3681186e8f84317ce1c7cdd064ee` (`fix: restore checkout page build`, the R4 implementation commit), the Architecture Design closing checkpoint (`19e2899`), and the prior resume-handover checkpoint (`48013ce`) all precede it; see `docs/audits/EXECUTION_ENVIRONMENT_AUDIT.md` and `docs/handover/HANDOVER_RIFEX_CURRENT.md` for the reconciliation trail.

### WORKING TREE FUNCTIONAL DIFFS

Pre-existing functional diffs:

- `src/lib/mailer.js`
- `src/pages/api/admin/reconcile-payments.js`
- `src/pages/api/checkout/webhook.js`

These diffs are a candidate recovery/hardening line and are `UNVERIFIED`.

### LOCAL PACKAGE MANAGER ARTIFACT

`package.json`/`package-lock.json` carry an undocumented diff adding `"allowScripts": {"sharp@0.34.3": true}`. `CONFIRMED EXPLAINED, NO IMPACT`: not present in any prior commit on any branch; produced by npm 11's native-postinstall-script approval gate when installing `sharp` for the first time on this machine. Full evidence in `docs/audits/EXECUTION_ENVIRONMENT_AUDIT.md`.

### DOCUMENTATION CHANGES

A2 created or updated baseline documentation. AA3 created Architecture Audit documentation and updated authoritative status documents.
AD2 materialized target Architecture Design documents. AD4 materializes the AD3 closing report and future R4 Sprint packet. These documents do not implement recovery units.

- `README.md`
- `docs/WOP.md`
- `docs/ENGINEERING_PROCESS.md`
- `docs/CURRENT_STATE.md`
- `docs/WHY.md`
- `docs/ROADMAP.md`
- `docs/architecture/ARCHITECTURE_CURRENT.md`
- `docs/domain/DOMAIN_MODEL.md`
- `docs/security/SECURITY_CURRENT.md`
- `docs/database/DATABASE_CURRENT.md`
- `docs/audits/ARCHITECTURE_AUDIT_REPORT.md`
- `docs/architecture/ENDPOINT_AUTHORITY_LEDGER.md`
- `docs/architecture/DATA_CONTRACT_LEDGER.md`
- `docs/architecture/ARCHITECTURE_DESIGN_INPUTS.md`
- `docs/audits/ARCHITECTURE_DESIGN_AD3_REPORT.md`
- `docs/sprints/R4_BUILD_BASELINE_SPRINT_PACKET.md`
- `docs/audits/EXECUTION_ENVIRONMENT_AUDIT.md`
- `docs/recovery/R2_R3_MARKETPLACE_PAYMENT_TESTIMONY.md`

### SENSITIVE UNTRACKED/IGNORED ARTIFACT

`db_cluster-10-11-2025@05-41-59.backup.gz` is a PostgreSQL gzip backup with schema and data evidence. It is sensitive evidence outside the Git baseline.

## Documentation State

| Gate | Status |
|---|---|
| PRE-ALIGNMENT AUDIT | GO |
| ALIGNMENT A1 | GO |
| ALIGNMENT A2 | GO |
| CHECKPOINT A2 | GO |
| ALIGNMENT A3 | GO |
| ALIGNMENT A4 | GO |
| ALIGNMENT A5 | GO |
| ALIGNMENT | CLOSED - GO |
| ARCHITECTURE AUDIT AA1 | GO |
| ARCHITECTURE AUDIT AA2 | GO |
| ARCHITECTURE AUDIT AA3 | GO |
| ARCHITECTURE AUDIT DOCUMENTATION READY | YES |
| ARCHITECTURE AUDIT | CLOSED - GO |
| ARCHITECTURE DESIGN AD1 | GO |
| ARCHITECTURE DESIGN AD1 ADVERSARIAL REVIEW | GO |
| ARCHITECTURE DESIGN AD1 CORRECTION | GO |
| ARCHITECTURE DESIGN AD2 | GO |
| ARCHITECTURE DESIGN AD3 | GO |
| ARCHITECTURE DESIGN CLOSING GATE | GO |
| ARCHITECTURE DESIGN DOCUMENTATION READY | YES |
| ARCHITECTURE DESIGN | CLOSED - GO |
| R4 SPRINT READINESS | GO |
| SPRINT R4 | CLOSED - GO |
| SPRINT | R4 CLOSED; OTHER SPRINTS NOT YET OPEN / NOT AUTHORIZED |


## Next Eligible Stage

```text
SPRINT R4: CLOSED — GO
NEXT ELIGIBLE STAGE: DB RECOVERY CONTRACT
DB RECOVERY CONTRACT: NOT AUTHORIZED
OTHER SPRINTS: NOT AUTHORIZED
```
## Recovery State

| Unit | Status |
|---|---|
| R4 Build Baseline | CLOSED - GO; implemented and pushed at `bbaf8a0`; `npm run build` passes, 25/25 pages, `/checkout` prerenders statically |
| DB Recovery Contract | DESIGNED; clean install reproducibility PARTIAL; implementation NOT AUTHORIZED |
| R1 Mailer | DESIGNED; certification PARTIAL; implementation NOT AUTHORIZED |
| R2 Webhook | DESIGNED; certification PARTIAL; implementation NOT AUTHORIZED |
| R3 Technical Reconciliation | DESIGNED; certification PARTIAL; implementation NOT AUTHORIZED |
| Fees Policy | SEPARATE; commercial policy UNKNOWN; implementation NOT AUTHORIZED |

Approved recovery sequence:

```text
R4 -> DB Recovery Contract -> R1 -> R2 -> R3 Technical -> Fees Policy -> Release Audits -> Separate Commits
```

Original build failure cause: CONFIRMED API handler located as `/checkout` page route, unrelated to the three recovery diffs. RESOLVED by R4 (`bbaf8a0`): `src/pages/checkout/index.js` is now a valid React page; the three recovery diffs and all checkout APIs were untouched.

## Implemented Flows

| Flow | Presence | Functional Verification |
|---|---|---|
| Authentication/registration | CONFIRMED | UNVERIFIED |
| Raffles CRUD/listing | CONFIRMED | UNVERIFIED |
| Ticket selection/reservation | CONFIRMED | UNVERIFIED |
| Mercado Pago checkout | CONFIRMED | UNVERIFIED |
| Confirmation/webhook | CONFIRMED | UNVERIFIED |
| Email notifications | CONFIRMED | UNVERIFIED |
| Creator panel | CONFIRMED | UNVERIFIED |
| Seller MP OAuth | CONFIRMED | UNVERIFIED |
| Admin reconciliation | CONFIRMED | UNVERIFIED |
| Winner selection | CONFIRMED | UNVERIFIED |

## Security State

| Area | Status |
|---|---|
| Supabase auth | CONFIRMED present |
| Service role usage | CONFIRMED |
| Temporary identity headers | CONFIRMED risk |
| Admin token route | CONFIRMED |
| Webhook HMAC strictness | CONFIRMED in working tree only |
| Live/sandbox separation | CONFIRMED in working tree only |
| Security certification | NOT EVIDENCED |

## Database State

| Area | Status |
|---|---|
| Core tables | CONFIRMED by docs/code/backup evidence |
| Legacy tables | CONFIRMED |
| `email_logs` | CONFIRMED in backup and working tree requirement |
| `webhook_events` | CONFIRMED in backup and working tree requirement |
| `payments.live_mode` | Required by working tree; baseline migration not demonstrated |
| DB remote state | UNKNOWN |
| Canonical states | CONTRADICTORY |

## Execution Environment Audit Findings

Full report: `docs/audits/EXECUTION_ENVIRONMENT_AUDIT.md`. Performed on a freshly cloned Linux copy of the repository; documentation only, no code modified, no Sprint opened.

| Finding | Status |
|---|---|
| `docs/dotenv.example` referenced by `.gitignore` and `scripts/run-dev.sh` but absent from repository | CONFIRMED; onboarding gap, `run-dev.sh` fails the copy silently (`\|\| true`) and starts `npm run dev` with no env configured |
| `.gitignore` has redundant/malformed `.env*` entries, including a stray non-functional `-e "\n.env*\n"` line | CONFIRMED; cosmetic, no functional impact |
| `scripts/kick.js` and `scripts/nop.js` are UTF-16LE/CRLF, unreferenced anywhere | CONFIRMED; dead artifacts, no functional impact |
| `/checkout` build/render failure | RECONFIRMED with fresh evidence on Linux; identical root cause already scoped by R4; not a Windows/Linux portability issue |
| No hardcoded Windows paths, `process.platform` checks, or source CRLF found under `src/` | CONFIRMED; no portability defect identified |

## R2/R3 Marketplace Payment Testimony

Full report: `docs/recovery/R2_R3_MARKETPLACE_PAYMENT_TESTIMONY.md`. A user testimony about a historical production payment failure (marketplace/OAuth seller flow) was compared against the three preserved recovery diffs. None of the three files address marketplace/`application_fee` transaction creation; a plausible (`INFERRED`, not `CONFIRMED`) root cause was found instead in already-merged `main` code (`src/pages/api/checkout/mp.js`, comment about `marketplace_fee` requiring Marketplace Partner certification). One concrete, `CONFIRMED` bug was found in `reconcile-payments.js`: a discarded `since` query filter referencing a nonexistent `payments.updated_at` column. Not fixed by this audit; input for a future R2/R3 Architecture Audit.

## Critical Risks

- Sensitive PostgreSQL backup present in repository directory.
- Authorization relies on temporary headers in some routes.
- DB model is contradictory across evidence sources.
- Working tree requires DB objects not consolidated in baseline docs.
- Architecture Design decisions are closed as documentation, but implementation is not authorized.
- Payment authority, idempotency, OAuth, mail, legacy, PII retention, fees and winner eligibility remain open or deferred until implementation/testing or explicit policy.

## Next Gates

| Gate | Status |
|---|---|
| Alignment closing gate | GO |
| Architecture Audit closing gate | GO |
| Architecture Audit documentation ready | YES |
| Architecture Design | CLOSED - GO |
| R4 Sprint Readiness | GO |
| Sprint R4 | CLOSED - GO |
| Sprint | R4 closed; others not yet open / not authorized |
## Resume Handover

| Item | Status |
|---|---|
| Main working tree | At HEAD `1fc064a8517389873b7c8c57053cd7ed7f0440d2`; the documentation batch previously pending here was committed and pushed as `1fc064a` (see below) |
| Recovery branch | `recovery/rifex-hardening-preserved` |
| Recovery commit | `1c23702f401f8c501077ecfd265a213245e62a63` |
| Recovery status | PRESERVED — UNVERIFIED — NOT ADOPTED |
| Recovery relation to main | outside `main`; no merge performed |
| R4 | CLOSED - GO; commit `bbaf8a0` pushed to `origin/main` |
| Next eligible stage | DB Recovery Contract; NOT AUTHORIZED |
| Handover | `docs/handover/HANDOVER_RIFEX_CURRENT.md` |

The documentation batch described above (`README.md`, `docs/WOP.md`, `docs/CURRENT_STATE.md`, `docs/recovery/RECOVERY_PLAN.md`, `docs/audits/EXECUTION_ENVIRONMENT_AUDIT.md`, `docs/recovery/R2_R3_MARKETPLACE_PAYMENT_TESTIMONY.md`) was committed and pushed to `origin/main` as `1fc064a`. `package.json`/`package-lock.json` still carry the local-only `allowScripts` artifact (see `LOCAL PACKAGE MANAGER ARTIFACT` above) and remain not intended to be committed.

The preserved recovery branch contains `src/lib/mailer.js`, `src/pages/api/admin/reconcile-payments.js` and `src/pages/api/checkout/webhook.js`. These changes must not be mixed with R4 and require future selective certification as R1/R2/R3 work.

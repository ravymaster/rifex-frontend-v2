# Rifex Current State

This document is the current documentation snapshot of observable repository state after Architecture Design AD4 documentation materialization.

## Repository

| Item | Value |
|---|---|
| Repository | `C:\proyectos\rifexv1.1\rifex-frontend-main` |
| Branch | `main` |
| HEAD | `b46ef9d424a89baedd56183a47d2a29741996160` |
| HEAD message | Architecture Design AD4 documentation checkpoint |
| Upstream | `origin/main` |
| Fetch executed in A2 | No |
| Functional certification | UNVERIFIED; Alignment A3 build failed at `/checkout`; no new functional validation during AA1-AA3 |

## Separated State Categories

### HEAD

HEAD `b46ef9d424a89baedd56183a47d2a29741996160` is the confirmed Architecture Design AD4 documentation checkpoint.

### WORKING TREE FUNCTIONAL DIFFS

Pre-existing functional diffs:

- `src/lib/mailer.js`
- `src/pages/api/admin/reconcile-payments.js`
- `src/pages/api/checkout/webhook.js`

These diffs are a candidate recovery/hardening line and are `UNVERIFIED`.

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
| SPRINT | NOT YET OPEN / NOT AUTHORIZED |


## Next Eligible Stage

```text
ARCHITECTURE DESIGN: CLOSED — GO
R4 SPRINT READINESS: GO
NEXT ELIGIBLE STAGE: SPRINT R4
SPRINT R4: NOT YET OPEN
OTHER SPRINTS: NOT AUTHORIZED
```
## Recovery State

| Unit | Status |
|---|---|
| R4 Build Baseline | READY - NOT YET OPEN; build failure at `/checkout` CONFIRMED; implementation NOT AUTHORIZED |
| DB Recovery Contract | DESIGNED; clean install reproducibility PARTIAL; implementation NOT AUTHORIZED |
| R1 Mailer | DESIGNED; certification PARTIAL; implementation NOT AUTHORIZED |
| R2 Webhook | DESIGNED; certification PARTIAL; implementation NOT AUTHORIZED |
| R3 Technical Reconciliation | DESIGNED; certification PARTIAL; implementation NOT AUTHORIZED |
| Fees Policy | SEPARATE; commercial policy UNKNOWN; implementation NOT AUTHORIZED |

Approved recovery sequence:

```text
R4 -> DB Recovery Contract -> R1 -> R2 -> R3 Technical -> Fees Policy -> Release Audits -> Separate Commits
```

Build failure cause: CONFIRMED API handler located as `/checkout` page route. This is unrelated to the three recovery diffs.

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
| Sprint | Not yet open / not authorized |

# Rifex Current State

This document is the A2 baseline snapshot of observable repository state.

## Repository

| Item | Value |
|---|---|
| Repository | `C:\proyectos\rifexv1.1\rifex-frontend-main` |
| Branch | `main` |
| HEAD | `6d0409b7f874adc1278be6808bc4c69753057758` |
| HEAD message | `docs: establish Rifex alignment baseline` |
| Upstream | `origin/main` |
| Fetch executed in A2 | No |
| Functional tests/build | Not executed |

## Separated State Categories

### HEAD

HEAD `6d0409b` is the confirmed documentation checkpoint after A2.

### WORKING TREE FUNCTIONAL DIFFS

Pre-existing functional diffs:

- `src/lib/mailer.js`
- `src/pages/api/admin/reconcile-payments.js`
- `src/pages/api/checkout/webhook.js`

These diffs are a candidate recovery/hardening line and are `UNVERIFIED`.

### A2 DOCUMENTATION CHANGES

A2 created or updated documentation only:

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
| NEXT ELIGIBLE STAGE | ARCHITECTURE AUDIT |
| ARCHITECTURE AUDIT | NOT YET OPEN |
| ARCHITECTURE DESIGN | NOT OPEN |
| SPRINT | NOT AUTHORIZED |

## Recovery State

| Unit | Status |
|---|---|
| R4 Build Baseline | PROPOSED; build failure at `/checkout` CONFIRMED |
| DB Recovery Contract | PROPOSED; clean install reproducibility PARTIAL |
| R1 Mailer | PROPOSED; certification PARTIAL |
| R2 Webhook | PROPOSED; certification PARTIAL |
| R3 Technical Reconciliation | PROPOSED; certification PARTIAL |
| Fees Policy | SEPARATE; commercial policy UNKNOWN |

Approved recovery sequence:

```text
R4 -> DB Recovery Contract -> R1 -> R2 -> R3 Technical -> Fees Policy
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

## Next Gates

| Gate | Status |
|---|---|
| Alignment closing gate | GO |
| Architecture Audit | Next eligible stage; not yet open |
| Architecture Design | Not authorized yet |
| Sprint | Not authorized |

# Rifex Frontend

Rifex is a Next.js frontend and API surface for raffle workflows. The repository contains observable flows for raffle creation, ticket selection, Mercado Pago checkout, payment confirmation, webhook handling, creator panel operations, seller Mercado Pago OAuth, email notifications, and winner selection.

This repository is the source of truth for Rifex. Documentation must distinguish confirmed facts from inferred or proposed work.

## Current Stage

| Item | Status |
|---|---|
| PRE-ALIGNMENT AUDIT | GO |
| ALIGNMENT A1 | GO |
| ALIGNMENT A2 | GO |
| CHECKPOINT A2 | GO |
| ALIGNMENT A3 | GO |
| ALIGNMENT A4 | GO |
| ALIGNMENT A5 | GO |
| ALIGNMENT | CLOSED - GO |
| Architecture Audit AA1 | GO |
| Architecture Audit AA2 | GO |
| Architecture Audit AA3 | GO |
| Architecture Audit Documentation Ready | YES |
| Architecture Audit | CLOSED - GO |
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
| DB RECOVERY | DONE — executed 2026-08-14/15 outside the formal Sprint packet process, in direct response to a live production incident (see Baseline and `docs/handover/HANDOVER_RIFEX_CURRENT.md`) |
| Mercado Pago direct-collection checkout | CONFIRMED FUNCTIONAL in production, real seller and real buyer, real webhook received |
| Mercado Pago split payments (1:N marketplace_fee) | NOT AVAILABLE; requires direct engagement with Mercado Pago's commercial team, not a self-service certification |
| ARCHITECTURE AUDIT — FRONTEND/LOGIC SEPARATION | OPEN - AUTHORIZED (2026-08-15); precedes any UI/UX redesign work |
| Functional verification | PARTIAL — Mercado Pago checkout end-to-end confirmed in production (see Baseline); other flows remain UNVERIFIED |
| Production readiness | PARTIAL — core purchase flow evidenced live; UI/UX redesign and split-payment monetization still pending |


## Next Eligible Stage

```text
SPRINT R4: CLOSED — GO
DB RECOVERY: DONE (informal, incident-driven — see Baseline)
MERCADO PAGO DIRECT CHECKOUT: CONFIRMED FUNCTIONAL IN PRODUCTION
NEXT ELIGIBLE STAGE: ARCHITECTURE AUDIT — FRONTEND/LOGIC SEPARATION
ARCHITECTURE AUDIT — FRONTEND/LOGIC SEPARATION: OPEN - AUTHORIZED
OTHER SPRINTS: NOT AUTHORIZED
```
## Baseline

| Layer | Meaning |
|---|---|
| HEAD `1aa97cd` | CONFIRMED current HEAD (fix: clear all credential fields on MP disconnect, not just half) |
| R4 implementation commit `bbaf8a0` | CONFIRMED ancestor of HEAD (fix: restore checkout page build) |
| `mailer.js` / `reconcile-payments.js` / `webhook.js` | CONFIRMED already part of HEAD as committed files; there is no outstanding working-tree diff for them (see correction below) |
| `webhook.js` `webhook_events` fix | CONFIRMED at `7e8e6b7`; verified live in production with a real Mercado Pago webhook (see Production Validation) |
| `mp/disconnect.js` field-clearing fix | CONFIRMED at `1aa97cd`; verified by seeding all 13 credential columns and confirming disconnect nulls all of them |
| Supabase project | CONFIRMED changed: the original production Supabase project (`huoepoxuqaodfgbtbalb`) was deleted by the user on 2026-08-14/15 (not by any action in this repository); a new project (`wrdkdfuiwlujfxxijpao`) is now the baseline for **both** production (Vercel env vars) and local development — this is a known architecture gap, not a target state (see Critical Risks in `docs/CURRENT_STATE.md`) |
| `db/restore/001_schema_supabase_clean.sql` | CONFIRMED present, untracked in git as of this writing; this file is the actual schema-provisioning record for the current production database, not just a sandbox artifact — should be committed |
| Production Validation | CONFIRMED 2026-08-15: real Rifex account, real raffle, real Mercado Pago seller (OAuth-connected) and a different real buyer completed a live purchase on `rifex.pro`; ticket sold, purchase approved, payment recorded, real webhook received and logged, emails sent. See `docs/handover/HANDOVER_RIFEX_CURRENT.md` for full evidence trail |
| Architecture Audit documentation | CONFIRMED current architecture audit materialization |
| Architecture Design AD2 documentation | GO; documentation materialized, no implementation |
| Architecture Design AD3 report | GO; closing evidence materialized by AD4 |
| R4 Sprint packet | CLOSED - GO; implemented at `bbaf8a0`, `npm run build` passes |
| PostgreSQL backup | CONFIRMED sensitive evidence outside Git baseline; corresponds to the now-deleted original Supabase project, not the current one |
| Recovery decision | B: split recovery into R1-R4 units; DB Recovery unit was ultimately executed informally (incident-driven), not via a packet |

Previous HEAD citations in this document and in `docs/WOP.md` (`b46ef9d`, then `48013ce`, then `bbaf8a0`, then `1fc064a`) each lagged the real HEAD because the commit that closed a gate did not bump its own self-citation — a recurring pattern in this repository, documented each time it recurs. See `docs/audits/EXECUTION_ENVIRONMENT_AUDIT.md` for the first reconciliation. This pass (HEAD `1aa97cd`) additionally corrects a separate stale claim: this document and `docs/WOP.md` / `docs/CURRENT_STATE.md` stated the working tree "currently includes three pre-existing functional diffs" (`mailer.js`, `reconcile-payments.js`, `webhook.js`). `git diff --stat` against HEAD for those three files is empty — they are ordinary committed files in `main`, not working-tree diffs. That claim was already stale before this session began; it is corrected here, not newly true.

## Stack Confirmed From Repository

- Next.js 14 Pages Router
- React 18
- Supabase client, SSR helpers, and service-role server clients
- Mercado Pago SDK and REST calls
- Resend
- hCaptcha
- Replicate dependency present
- CSS Modules / local styles

## Main Structure

| Path | Role |
|---|---|
| `src/pages` | Next.js pages and API routes |
| `src/pages/api` | Server-side API routes |
| `src/lib` | Shared clients and utilities |
| `docs` | Project documentation |
| `db` | Database snapshots and migrations |
| `sql` | Standalone SQL files |

## Observable Flows

| Flow | Status |
|---|---|
| Authentication and registration | CONFIRMED present; registration/login CONFIRMED functional (real account created and confirmed in production 2026-08-15) |
| Raffle creation/listing | CONFIRMED present; creation CONFIRMED functional in production |
| Ticket grid and selection | CONFIRMED present; CONFIRMED functional in production |
| Ticket reservation | CONFIRMED present; 3-minute hold and auto-release CONFIRMED functional (observed repeatedly in both sandbox and production) |
| Mercado Pago checkout | CONFIRMED present; direct-collection flow (no split payments) CONFIRMED functional end-to-end in production with a real seller and real buyer |
| Payment confirmation | CONFIRMED present; CONFIRMED functional via both the browser-return path and the real Mercado Pago webhook |
| Mercado Pago webhook | CONFIRMED present; CONFIRMED functional in production as of `7e8e6b7` (previously the receiving endpoint worked but never persisted to `webhook_events` — fixed and verified with a real webhook) |
| Buyer/creator email | CONFIRMED present; CONFIRMED functional (`emailed_buyer`/`emailed_creator` observed `true` after a real approved payment) |
| Creator panel | CONFIRMED present, UNVERIFIED beyond basic listing observed in production |
| Mercado Pago seller OAuth | CONFIRMED present; CONFIRMED functional in production (real account connected, correct `mp_user_id`, `live_mode: true`, no environment mismatch). Sandbox testing of this flow is NOT viable as currently configured — see Critical Risks in `docs/CURRENT_STATE.md` |
| Mercado Pago split payments (marketplace_fee, 1:N) | CONFIRMED NOT IMPLEMENTED; requires Mercado Pago commercial-team engagement, not a code change |
| Admin reconciliation | CONFIRMED present, UNVERIFIED; known bug in the `since` filter, not fixed (see `docs/recovery/R2_R3_MARKETPLACE_PAYMENT_TESTIMONY.md`) |
| Expired ticket release | CONFIRMED present, CONFIRMED functional (observed releasing held tickets after hold expiry in both sandbox and production) |
| Winner selection | CONFIRMED present, UNVERIFIED |

## Environment Variables

Variable names observed in repository code and docs. Values must never be committed.

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_BASE_URL
NEXT_PUBLIC_HCAPTCHA_SITEKEY
NEXT_PUBLIC_MP_REGION
NEXT_PUBLIC_STAGE
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_SERVICE_ROLE
MP_ACCESS_TOKEN
MP_PUBLIC_KEY
MP_CLIENT_ID
MP_CLIENT_SECRET
MP_WEBHOOK_SECRET
MP_REDIRECT_URI
MP_WEBHOOK_URL
RIFEX_ALLOW_PLATFORM_FALLBACK
HOLD_MINUTES
RESEND_API_KEY
ENABLE_EMAILS
EMAIL_FROM
DEV_FORCE_TO
DEV_BCC_EMAIL
DEV_TEST_EMAIL_TOKEN
CREATOR_FALLBACK_EMAIL
HCAPTCHA_SECRET
ADMIN_API_TOKEN
REPLICATE_API_TOKEN
EMAIL_DEDUP_WINDOW_MIN
RIFEX_FEE_PCT
MP_FEE_FALLBACK_PCT
MP_FEE_MIN_CENTS
RIFEX_PLAN_DEFAULT
```

`NEXT_PUBLIC_*` variables are expected to be exposed to the browser by design. No private secret exposure through that prefix has been evidenced.

## Installation Notes

The repository declares these scripts:

```bash
npm install
npm run dev
npm run build
npm start
```

Alignment and Architecture Audit did not certify functional behavior; that was a build-success confirmation only. Since then, direct functional testing was performed against a real (non-mocked) Mercado Pago sandbox and, on 2026-08-15, against real production: the core purchase flow (create raffle, connect seller via OAuth, buy a ticket, receive webhook, mark sold, send emails) is `CONFIRMED FUNCTIONAL` end-to-end in production. This does not certify every flow in the Observable Flows table above — see that table for per-flow status.

## Required Reading Before Programming

1. [WOP](docs/WOP.md)
2. [Engineering Process](docs/ENGINEERING_PROCESS.md)
3. [Current State](docs/CURRENT_STATE.md)
4. [Why](docs/WHY.md)
5. [Roadmap](docs/ROADMAP.md)
6. [Current Architecture](docs/architecture/ARCHITECTURE_CURRENT.md)
7. [Domain Model](docs/domain/DOMAIN_MODEL.md)
8. [Security Current](docs/security/SECURITY_CURRENT.md)
9. [Database Current](docs/database/DATABASE_CURRENT.md)
10. [Recovery Plan](docs/recovery/RECOVERY_PLAN.md)
11. [Alignment A3/A4 Report](docs/audits/ALIGNMENT_A3_A4_REPORT.md)
12. [Architecture Audit Report](docs/audits/ARCHITECTURE_AUDIT_REPORT.md)
13. [Endpoint Authority Ledger](docs/architecture/ENDPOINT_AUTHORITY_LEDGER.md)
14. [Data Contract Ledger](docs/architecture/DATA_CONTRACT_LEDGER.md)
15. [Architecture Design Inputs](docs/architecture/ARCHITECTURE_DESIGN_INPUTS.md)
16. [Target Architecture](docs/architecture/ARCHITECTURE_TARGET.md)
17. [Architecture Decisions](docs/architecture/ARCHITECTURE_DECISIONS.md)
18. [Target Flows](docs/architecture/TARGET_FLOWS.md)
19. [Transaction and Idempotency Design](docs/architecture/TRANSACTION_AND_IDEMPOTENCY_DESIGN.md)
20. [Identity and Authorization Design](docs/security/IDENTITY_AUTHORIZATION_DESIGN.md)
21. [DB Recovery Contract](docs/database/DB_RECOVERY_CONTRACT.md)
22. [Payment Provider Design](docs/integrations/PAYMENT_PROVIDER_DESIGN.md)
23. [Mail Design](docs/integrations/MAIL_DESIGN.md)
24. [Test Architecture](docs/testing/TEST_ARCHITECTURE.md)
25. [Architecture Design AD1 Report](docs/audits/ARCHITECTURE_DESIGN_AD1_REPORT.md)
26. [Architecture Design AD3 Report](docs/audits/ARCHITECTURE_DESIGN_AD3_REPORT.md)
27. [R4 Build Baseline Sprint Packet](docs/sprints/R4_BUILD_BASELINE_SPRINT_PACKET.md)
28. [Rifex Current Handover](docs/handover/HANDOVER_RIFEX_CURRENT.md)
29. [Execution Environment Audit](docs/audits/EXECUTION_ENVIRONMENT_AUDIT.md)

Older documents in `docs` and `db` can contain partial or contradictory information. They are evidence, not automatically final authority.

Architecture Audit is documented as closed with GO. Architecture Design is documented as closed with GO after AD3/AD4 materialization. Sprint is not yet open and remains not authorized. Recovery planning, target design and the R4 packet are documented but not implemented. The three recovery/hardening diffs remain uncommitted and functionally uncertified.

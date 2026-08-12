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
| SPRINT | NOT YET OPEN / NOT AUTHORIZED |
| Functional verification | UNVERIFIED |
| Production readiness | NOT EVIDENCED |


## Next Eligible Stage

```text
ARCHITECTURE DESIGN: CLOSED — GO
R4 SPRINT READINESS: GO
NEXT ELIGIBLE STAGE: SPRINT R4
SPRINT R4: NOT YET OPEN
OTHER SPRINTS: NOT AUTHORIZED
```
## Baseline

| Layer | Meaning |
|---|---|
| HEAD `b46ef9d` | CONFIRMED Architecture Design AD4 documentation checkpoint |
| Working tree functional diffs | CONFIRMED candidate recovery/hardening line, not certified |
| A2 documentation changes | CONFIRMED documentation baseline materialization |
| Architecture Audit documentation | CONFIRMED current architecture audit materialization |
| Architecture Design AD2 documentation | GO; documentation materialized, no implementation |
| Architecture Design AD3 report | GO; closing evidence materialized by AD4 |
| R4 Sprint packet | READY - NOT YET OPEN; executable contract for future Sprint |
| PostgreSQL backup | CONFIRMED sensitive evidence outside Git baseline |
| Recovery decision | B: split recovery into R1-R4 units |

The working tree currently includes three pre-existing functional diffs:

- `src/lib/mailer.js`
- `src/pages/api/admin/reconcile-payments.js`
- `src/pages/api/checkout/webhook.js`

They are not part of HEAD and are not certified as functional baseline.

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
| Authentication and registration | CONFIRMED present, UNVERIFIED |
| Raffle creation/listing | CONFIRMED present, UNVERIFIED |
| Ticket grid and selection | CONFIRMED present, UNVERIFIED |
| Ticket reservation | CONFIRMED present, UNVERIFIED |
| Mercado Pago checkout | CONFIRMED present, UNVERIFIED |
| Payment confirmation | CONFIRMED present, UNVERIFIED |
| Mercado Pago webhook | CONFIRMED present, UNVERIFIED |
| Buyer/creator email | CONFIRMED present, UNVERIFIED |
| Creator panel | CONFIRMED present, UNVERIFIED |
| Mercado Pago seller OAuth | CONFIRMED present, UNVERIFIED |
| Admin reconciliation | CONFIRMED present, UNVERIFIED |
| Expired ticket release | CONFIRMED present, UNVERIFIED |
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

Functional behavior remains `UNVERIFIED`. Alignment and Architecture Audit did not certify functional behavior. Alignment A3 performed static inspection and executed a build that failed at `/checkout`; AA1-AA3 performed static inspection and no new functional validation.

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

Older documents in `docs` and `db` can contain partial or contradictory information. They are evidence, not automatically final authority.

Architecture Audit is documented as closed with GO. Architecture Design is documented as closed with GO after AD3/AD4 materialization. Sprint is not yet open and remains not authorized. Recovery planning, target design and the R4 packet are documented but not implemented. The three recovery/hardening diffs remain uncommitted and functionally uncertified.

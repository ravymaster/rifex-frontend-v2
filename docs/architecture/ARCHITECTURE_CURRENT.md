# Current Architecture

```text
CURRENT ARCHITECTURE
NOT TARGET ARCHITECTURE
```

This document records observed architecture only. Architecture Audit is closed as documentation. Architecture Design AD2 adds target documentation separately. This file remains current-state evidence.

| Scope | Document |
|---|---|
| CURRENT ARCHITECTURE | `docs/architecture/ARCHITECTURE_CURRENT.md` |
| TARGET ARCHITECTURE | `docs/architecture/ARCHITECTURE_TARGET.md` |
| TARGET DECISIONS | `docs/architecture/ARCHITECTURE_DECISIONS.md` |
| TARGET FLOWS | `docs/architecture/TARGET_FLOWS.md` |
| TRANSACTION/IDEMPOTENCY TARGET | `docs/architecture/TRANSACTION_AND_IDEMPOTENCY_DESIGN.md` |

## Runtime Shape

| Layer | Evidence | Status |
|---|---|---|
| UI/pages | `src/pages` | CONFIRMED |
| API routes | `src/pages/api` | CONFIRMED |
| Shared libs | `src/lib` | CONFIRMED |
| Persistence | Supabase/Postgres queries | CONFIRMED |
| Payments | Mercado Pago SDK/REST | CONFIRMED |
| Email | Resend | CONFIRMED |
| Captcha | hCaptcha | CONFIRMED |
| Image/AI dependency | `replicate` package | CONFIRMED dependency, role UNVERIFIED |

## Main Dependencies

UI pages and API routes call Supabase directly. API routes also call Mercado Pago and Resend. Some business decisions are implemented directly in API routes and UI flows.

## API Areas

| Area | Example Paths |
|---|---|
| Checkout | `src/pages/api/checkout/*` |
| Raffles | `src/pages/api/rifas/*`, `src/pages/api/raffles/winner.js` |
| Tickets | `src/pages/api/tickets/release-expired.js` |
| Panel | `src/pages/api/panel/*` |
| Mercado Pago OAuth | `src/pages/api/mp/oauth/*` |
| Merchant MP | `src/pages/api/merchant/mp/*` |
| Admin | `src/pages/api/admin/reconcile-payments.js` |
| Dev diagnostics | `src/pages/api/dev/*` |

## Persistence Access

| Client | Role |
|---|---|
| `src/lib/supabaseClient.js` | Browser Supabase client |
| `src/lib/supabaseServer.js` | Server SSR client |
| `src/lib/supabaseAdmin.js` | Service role client |
| Inline API clients | Several routes create clients directly |

## Legacy Compatibility

The UI and docs evidence both modern tables (`raffles`, `tickets`) and legacy Spanish tables (`rifas`, `rifa_tickets`). Compatibility views such as `raffles_compat` and `tickets_compat` are queried by the raffle page. Their authoritative status is `UNVERIFIED`.

## Decoupling Quality

Current architecture is route-centric. Domain rules, provider integration, persistence, and orchestration are mixed inside UI/API route files. This is a current-state observation, not a target design.

## Limits And Risks

- Functional behavior remains UNVERIFIED. Alignment A3 build failed at `/checkout`; Architecture Audit used static inspection and AD2 is documentation only.
- Architecture Audit is documented in `docs/audits/ARCHITECTURE_AUDIT_REPORT.md`.
- Endpoint authority evidence is documented in `docs/architecture/ENDPOINT_AUTHORITY_LEDGER.md`.
- Data contracts are documented in `docs/architecture/DATA_CONTRACT_LEDGER.md`.
- Architecture Design inputs are documented in `docs/architecture/ARCHITECTURE_DESIGN_INPUTS.md`.
- Architecture Design is open for AD2 documentation materialization only.
- Future layering such as Domain/Application/Infrastructure is not imposed here because it is not currently evidenced as implemented.

## Alignment A5 Recovery Boundaries

R1-R4 are recovery boundaries, not target architecture.

| Boundary | Current Evidence |
|---|---|
| R1 Mailer | `src/lib/mailer.js` working tree diff |
| R2 Webhook | `src/pages/api/checkout/webhook.js` working tree diff |
| R3 Technical Reconciliation | `src/pages/api/admin/reconcile-payments.js` working tree diff |
| R4 Build Baseline | `/checkout` build failure |

`/checkout` currently has a page/API conflict: an API handler exists under a page route, causing prerender failure. This is a current architecture defect, not a future design.

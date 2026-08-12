# Current Architecture

```text
CURRENT ARCHITECTURE
NOT TARGET ARCHITECTURE
```

This document records observed architecture only. It does not open Architecture Audit and does not design a future architecture.

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

- No functional verification was executed in A2.
- Architecture Audit is not open.
- Future layering such as Domain/Application/Infrastructure is not imposed here because it is not currently evidenced as implemented.

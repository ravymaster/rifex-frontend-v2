# Architecture Audit — Frontend / Logic Separation

Status: `OPEN - IN PROGRESS`, authorized by the user 2026-08-15, in preparation for a 2026 UI/UX redesign. This document is a mapping/audit artifact — it does not implement anything and does not authorize the redesign itself. See `docs/WOP.md` and `docs/handover/HANDOVER_RIFEX_CURRENT.md` for the gate this belongs to.

## Purpose

Before any visual redesign work touches a page's JSX, this document identifies which pages/components carry real business logic (data mutations, validation, direct database access) mixed into presentation, versus which are safe to restyle without risk of silently breaking behavior.

## Methodology

A full-repository survey was performed (Explore agent, 2026-08-15) covering every file under `src/pages` (excluding `api/`), every file under `src/pages/api`, every file under `src/components`, and `src/hooks`. The agent's raw findings were spot-verified directly against the source for the highest-risk claims (the two items below marked `CONFIRMED` were read in full, not taken on the agent's word alone) before being recorded here.

## Finding 0 — Security issue found during this audit, already fixed

`src/pages/api/dev/test-upsert-mg.js` was a `GET` endpoint with **no authentication or authorization check of any kind**, running with the Supabase **service-role key** (bypasses RLS), that upserted arbitrary garbage into `merchant_gateways` for any `user_id` passed as a query parameter. `CONFIRMED` exploitable: `user_id`/`creator_id` values are not secret — they are returned directly by the public `/api/rifas` listing endpoint. Any unauthenticated visitor could have used a raffle's public `creator_id` to corrupt that seller's Mercado Pago connection. `CONFIRMED` live in production (`HTTP 200`) at the time this was found. Already flagged as `CRITICAL` risk classification in the pre-existing `docs/architecture/ENDPOINT_AUTHORITY_LEDGER.md` (row 13), but never remediated until now.

**Fix applied**: the file was deleted (commit — see git log for hash). Confirmed unused by any other code path (`grep` across `src/` and `docs/` shows only self-references and the ledger mention). No dev/debug functionality is lost — `whoami.js` and `test-email.js` cover the legitimate debug use cases and both have appropriate access control (`whoami.js` is self-scoped to the caller's own session; `test-email.js` requires `DEV_TEST_EMAIL_TOKEN`).

**Related, not fixed in this pass**: `src/pages/api/dev/env-check.js` has no token check either, but is read-only and only exposes booleans (whether certain env vars are set, not their values) — lower severity, flagged here for a future decision, not touched.

## Finding 1 — Pages with real business logic mixed into presentation (high risk for redesign)

Three pages write to or read from Supabase directly inside the React component, instead of going through an API route. These are the pages where touching JSX carries real risk of silently breaking data flow, and where a redesign should extract the logic into a hook or an API route *before* restyling.

| File | What it does directly | Risk if touched carelessly |
|---|---|---|
| `src/pages/rifas/[id].jsx` (660 lines) | Direct Supabase reads against `raffles`/`raffles_compat`/`rifas` and `tickets`/`tickets_compat`/`rifa_tickets`, plus a Realtime subscription (`postgres_changes`) on `tickets`. Contains `mapRaffleFromOld`/`mapTicketFromOld` — schema-compatibility mapping between the legacy (`rifas`) and current (`raffles`) data models. Contains the 3-way payment-confirmation logic (query flag, `collection_status`, and the `/api/checkout/confirm` response) that decides the final purchase state shown to the user. | The single largest, most business-critical page in the app — it is also the checkout entry point. A redesign here should extract data-fetching and payment-confirmation logic into a hook (e.g. `useRaffleData`, `usePaymentReturn`) before any JSX changes. |
| `src/pages/panel/bancos.js` (421 lines) | `getServerSideProps` reads `bank_accounts` server-side; the client `onSave` handler does `supabase.from("bank_accounts").upsert(row, {onConflict:"user_id"})` **directly from the browser**, relying on RLS ("user solo puede tocar su fila", per the code's own comment) rather than an API route to enforce the boundary. | Writes sensitive data (bank account holder, tax ID, account number) through a path with no server-side validation layer beyond RLS. Confirmed RLS is in place for `bank_accounts` in the current schema (`db/restore/001_schema_supabase_clean.sql`), so this is not an open vulnerability today, but it is an architecture smell: there is no single place to add validation, rate-limiting, or auditing for bank-account writes. |
| `src/pages/panel/index.js` (516 lines) | On mount, does `supabase.from('users_profile').upsert(...)` directly from the client (first-login profile bootstrap), plus `auth.exchangeCodeForSession`. Also computes KPIs (`revenueCents`, `participants`) via `reduce` over API data, and defines three modal sub-components (`EditModal`, `CloseDialog`, `DeleteDialog`) inline in the same file, each with their own fetch/validation logic. | Large surface area in one file; the direct `users_profile` upsert bypasses any API-level validation for profile creation. |

## Finding 2 — Pages with moderate logic (safe to redesign with care)

| File | What it has | Note |
|---|---|---|
| `src/pages/crear-rifa.jsx` (264 lines) | Price/prize calculations (`* 100` to cents), payload assembly, plan-based business rules (free plan locks theme/payout options) | No direct DB access — goes through `/api/rifas`. Logic is inline but contained; extractable into a form hook without much risk. |
| `src/pages/register.jsx` (228 lines) | Full Chilean RUT validator (check-digit algorithm) and a password-policy validator (sequences, reuse of email/name), both implemented entirely client-side | `UNKNOWN` (not verified in this pass) whether the backend/Supabase re-validates RUT or password policy — if not, a redesign that accidentally drops this client-side validation would remove the only enforcement. Flagged for a future check, not resolved here. |

## Finding 3 — Everything else in `src/pages` is presentation-only

20 of 23 non-API pages were classified `UI pura`: they either render static content, or fetch through an existing API route with no meaningful logic beyond formatting (currency, dates). Full per-file table is in the audit working notes (agent transcript, referenced in git history of this document's authoring session) — summarized list: `_app.js`, `_document.jsx`, `404.js`, `index.js`, `rifas.js`, `rifas/crear.jsx`, `login.jsx`, `reset-password.jsx`, `protegida.jsx`, `contacto.js`, `planes.js`, `perfil.js`, `terminos.js`, `icons.js`, `checkout/index.js`, `chat/[raffleId].js`, `blog/index.js`, `blog/[slug].js`, `panel/mercado-pago.js`. These are the lowest-risk redesign targets.

Two of these are worth a product decision, not a code fix: `contacto.js` and `perfil.js` (the password-change form) render forms with **no submit handler wired to any backend** — they are visually complete but functionally inert. Not a redesign risk, but worth knowing before assuming "the contact form" or "change password" already work.

## Finding 4 — API routes: mostly well-scoped, with two known issues

27 API routes were surveyed. Most are focused on a single responsibility. Two structural issues found, neither new:

- **Duplicated payment logic**: `src/pages/api/checkout/webhook.js` and `src/pages/api/admin/reconcile-payments.js` share close to 150 near-identical lines (`fetchPayment()`, the "payment approved → update tickets/purchases/emails" branch). Already implicitly known from `docs/recovery/R2_R3_MARKETPLACE_PAYMENT_TESTIMONY.md`. Candidate for extraction into `src/lib/payments.js` in a future Sprint — not done here.
- **`src/pages/api/mp/preference.js`**: the only route that queries the legacy `rifas` table instead of `raffles`. Its only caller, `src/components/Grid.js`, is itself unused by any page (see Finding 5). This route is effectively dead code with an inconsistent data model — a real risk only if someone reconnects `Grid.js` to a page without noticing it targets the wrong schema.

## Finding 5 — Orphaned components (not wired to any active page)

| Component | Why it matters |
|---|---|
| `src/components/Grid.js` | Contains a hardcoded 7% Rifex fee calculation and calls `/api/mp/preference` (the legacy-schema route from Finding 4). If reconnected without review, it would introduce a second, inconsistent checkout path alongside `api/checkout/mp.js`. |
| `src/components/RifaCard.jsx` | Not used — `rifas.js` builds its cards inline instead. |
| `src/components/auth/GoogleButton.jsx` | Not used — `login.jsx` and `register.jsx` each define their own local, duplicated `GoogleButton` instead of importing this one. |

None of these break anything today (dead code doesn't execute), but a redesign pass is exactly the moment someone might "clean up" by wiring an unused component back in without knowing why it was orphaned. Recommend an explicit decision (delete or consolidate) before the redesign Sprint, not during it.

## Finding 6 — The one well-separated example worth replicating

`src/hooks/useIconsMap.js` is the only file under `src/hooks/`. It is a clean example of logic extracted from JSX into a reusable hook, consumed by `rifas/[id].jsx`. The redesign should follow this pattern when extracting logic from Findings 1 and 2, rather than inventing a new convention.

## Summary — Redesign risk ranking

| Risk | Files |
|---|---|
| **High** — extract logic before touching JSX | `rifas/[id].jsx`, `panel/bancos.js`, `panel/index.js` |
| **Medium** — contained logic, redesign with care | `crear-rifa.jsx`, `register.jsx` |
| **Low** — presentation only | remaining 18 pages |
| **Decide before redesign, not during** | `Grid.js`, `RifaCard.jsx`, `auth/GoogleButton.jsx` (orphaned), `contacto.js`/`perfil.js` (inert forms) |

## Scope and Limits

This document does not implement any extraction, deletion, or redesign. It does not authorize an Architecture Design or Sprint for the redesign itself — that requires a separate, explicit user authorization per `docs/WOP.md`'s Stage Change Process. The Finding 0 security fix (deleting `test-upsert-mg.js`) was authorized separately, out-of-band, as an urgent exception to this audit's "no code changes" scope, because it was a live, unauthenticated, exploitable data-mutation endpoint in production.

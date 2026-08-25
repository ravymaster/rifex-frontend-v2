# Rifex WOP

WOP defines the working operating protocol for Rifex. Its purpose is to keep the repository as the source of truth and prevent future work from assuming a state that has not been evidenced.

---

## RIFEX CURRENT STATE (2026-08-24 — Santiago → Antofagasta notebook handoff)

**Everything below this line, down to "END CURRENT STATE", supersedes the legacy Alignment/Architecture-Audit/Sprint-R4 narrative further down in this file for anything about current branch state, HEAD, or Events work.** That older material (HEAD `1aa97cd`, Sprint R4, DB Recovery incident) is preserved unedited below as historical record — it predates everything described here and is no longer the frontier of the project. Do not resume work from the old section without first reading this one.

### Git baseline (confirmed via `git fetch` + `git log` + `git status`, this session)

| Item | Value |
|---|---|
| `origin/develop` HEAD | `725c4f8` — `feat(events): add tickets and QR fulfillment` |
| `origin/main` HEAD | `c944bb3` — `docs(release): certify Rifex 2.0 production baseline` |
| Local branch | `develop`, matches `origin/develop` exactly |
| Working tree | clean (one stray untracked `supabase/` ephemeral dir from migration tooling was removed; nothing else) |
| Remote | `origin` → `https://github.com/ravymaster/rifex-frontend-v2.git` |

### PROD (`rifex.pro`, Vercel project `rifex-frontend-v2`, Supabase `wrdkdfuiwlujfxxijpao`)

`main` at `c944bb3` — **Rifex 2.0 certified baseline**: raffles + colectas + DRAW-1/1B/2 automatic draw scheduler + PRE-LAUNCH-FIX-1/2 security hardening (atomic ticket reservation, `approved_unfulfilled` late-payment handling, rate limiting, RLS on `rate_limit_hits`/`legal_declarations`). **Events/Eventos has NOT been promoted to PROD in any form** — no `events`/`event_ticket_types`/`event_orders`/`event_order_items`/`event_tickets` tables, no Events code, exist on `main` or in PROD Supabase. PROD Supabase migration history: 6 migrations, most recent `20260823100000` (PRE-LAUNCH-FIX-2 hardening). PROD was **not touched** by any EVENT-1/2/3 session — confirmed read-only after every phase.

### DEV (Supabase project `rifex-dev` / `nwxrvwbzqbhznscyirbq`, Vercel project `rifex-frontend-main` → `rifex-frontend-main.vercel.app`)

`develop` at `725c4f8` — everything PROD has, **plus** the full Events V1 stack through ticket issuance:

| Stage | Status | Delivered |
|---|---|---|
| EVENT-0 | Architecture approved (discovery only, no code) | Domain model, lifecycle, QR design decision, staff model, 6-phase plan |
| EVENT-1 | **DONE** | Foundation — create/publish event, ticket types, public pages, `/mis-iniciativas`, `/panel/eventos` |
| EVENT-2 | **DONE** | Checkout + Orders + Mercado Pago — atomic reservation, TTL, webhook, reconciliation, `approved_unfulfilled`, guest access token, 7% commission via `platformFee.js` |
| EVENT-3 | **DONE** | Tickets + QR — exactly-once issuance, per-ticket QR, guest "my tickets" page, `/t/[token]` resolver |
| EVENT-4 | **NOT STARTED — NEXT** | Scanner + Staff + Check-in. Full spec now canonical at `docs/events/EVENT4_STAFF_SCANNER_CHECKIN.md` — no code exists yet (confirmed 2026-08-25: zero references to `used_at` anywhere in `src/`, no related branch on `origin`) |

Supabase `rifex-dev` migration history ends at `20260825120000_event3_tickets_qr.sql` (7 migrations after the shared PRE-LAUNCH baseline). DEV Vercel deploy target: `rifex-frontend-main` project, `--prod` alias (its own top-level environment, unrelated to real PROD — see Reentry Notebook Warnings below).

### EVENT-3 checkpoint (functional, not a documentation-only commit)

```text
develop:  725c4f8
commit:   feat(events): add tickets and QR fulfillment
Verdict:  GO EVENT-4
```

Evidence (live DEV, this session):
- 20/20 functional+security tests PASS (A–T battery: quantities, non-paid states never issue, idempotent repeat-issuance, unique `qr_token`/`ticket_number`, QR 404 on invalid token, 20× GET does not consume, guest-token isolation, organizer-ownership isolation, void auditable).
- **Exactly-once issuance under concurrency**: 20 simultaneous `issue_event_order_tickets` calls on one paid order (quantity=3) → exactly 3 tickets in the database, verified by direct count, not by RPC response alone.
- Replay test: mark-paid + 3 concurrent issuance calls → exactly 2 tickets (not 6).
- `approved_unfulfilled` orders verified to never issue tickets, even with a valid `mp_payment_id`.
- QR scan ≠ check-in verified live in a real browser: `used_at` stayed `null` and `status` stayed `valid` after visiting `/t/[token]`.
- `npm run build` PASS, clean.
- QA fixtures: **0 residual** — see "Cleanup incident and correction" below.
- PROD confirmed untouched before and after (`origin/main` unchanged, PROD Supabase migration count unchanged).

**Cleanup incident and correction (self-detected during this session, not by the user):** EVENT-2's automated concurrency test (20 simultaneous buyers) never added its winning orders to that script's own cleanup list, which silently blocked (via a foreign-key constraint whose error return was never checked) the deletion of 6 test events, their ticket types, and 20 orders — one of those events was left `published` and publicly visible on `/eventos`. Found while doing EVENT-3's own regression smoke, corrected in this session (deleted in the correct FK order: tickets → order_items → orders → ticket_types → events), and reverified with a full sweep showing 0 events/orders/tickets/test-users/fake-gateways remaining on `rifex-dev`. Lesson captured in Risks/Pending below.

### Architecture map — Events (EVENT-1/2/3), just enough to reorient without re-reading source

**EVENT-1 — catalog**
- `events` (draft/published/cancelled), `event_ticket_types` (active/hidden, `quantity_total`/`quantity_sold`).
- RLS: public SELECT only if `published`/`active`; all writes via service-role API routes, never client-direct.
- Key files: `src/pages/api/events/**`, `src/pages/eventos/**`, `src/pages/crear-evento.jsx`, `src/pages/panel/eventos/**`.

**EVENT-2 — checkout/orders**
- `event_orders` (`pending`/`paid`/`expired`/`cancelled`/`approved_unfulfilled`), `event_order_items` (price/name snapshot per line).
- Inventory: `event_ticket_types.quantity_reserved` added; available = `total - sold - reserved`, enforced by a DB `CHECK`.
- Atomic RPCs: `create_event_order` (reserve + snapshot + fee, all-or-nothing), `expire_event_order` (idempotent TTL release), `mark_event_order_paid` (reserved→sold, late-payment-safe).
- Guest checkout: no login; `event_orders.access_token` (opaque) is the only recovery credential.
- Commission: `src/lib/platformFee.js`, `PLATFORM_FEE_RATE = 0.07` — a **new, Events-only** source, deliberately not merged with the certified `RIFEX_FEE_RATE` in `checkout/mp.js`/`checkout/colecta.js` (touching those was judged higher-risk than the duplication).
- Webhook: `src/pages/api/checkout/webhook-events.js` — sibling file, never touches `webhook.js`/`webhook-colecta.js`.
- Key files: `src/pages/api/events/[id]/checkout.js`, `src/pages/api/checkout/webhook-events.js`, `src/pages/api/events/orders/[token].js`, `src/pages/eventos/pago/**`.

**EVENT-3 — tickets/QR**
- `event_tickets`: `ticket_number` (human, `RFX-EVT-XXXXXX`, never a credential), `qr_token` (opaque, the only real credential), `status` (`valid`/`void` only — no `used`, reserved for EVENT-4), snapshot of ticket-type name/price.
- `event_orders.tickets_issued_at` / `tickets_email_sent_at` — fulfillment state, deliberately separate from payment state.
- Atomic RPC: `issue_event_order_tickets(order_id)` — row-lock-serialized, exactly-once, `paid`-only. `void_event_ticket(ticket_id)` — backend-only invalidation primitive, no UI trigger yet, never deletes.
- Guest pages: `/eventos/orden/[token]` (persistent "my tickets", reuses EVENT-2's access_token), `/t/[token]` (public QR resolver, GET-only, no PII).
- QR image: `src/pages/api/events/tickets/[token]/qr.png.js`, reuses Colectas' satori+sharp+qrcode card-rendering *technique* only — no shared code, no shared domain.
- Key files: `src/lib/eventFulfillment.js` (the single "ensure issued + email" entry point, called from the webhook and lazily from the order-lookup endpoint), `src/lib/eventTicketMailer.js`.

### Invariants that must hold across any future Events work

- **PAYMENT STATE ≠ FULFILLMENT STATE.** `event_orders.status` (payment truth) and `tickets_issued_at`/`tickets_email_sent_at` (fulfillment truth) are separate columns, separate concerns. A fulfillment failure must never revert a payment; a payment failure must never be papered over by fulfillment succeeding.
- `paid` is the **only** order status that may issue tickets.
- `approved_unfulfilled` **never** issues tickets, even with a valid `mp_payment_id` — this is the direct consequence of the late-payment-after-resale protection designed in EVENT-2 (never steal stock from a buyer who purchased after the original reservation expired).
- Scanning/opening a ticket's QR is **not** check-in. `GET /t/[token]` never consumes, never mutates `status` or `used_at`. Only a future authenticated EVENT-4 operation may perform check-in.
- A ticket is never `DELETE`d for being used or voided — `void` is a status, history is preserved.
- EVENT-4 owns check-in authority entirely; nothing built through EVENT-3 assumes or performs it.

### Risks / pending (documented, not being worked now)

1. **EVENT-3**: ticket-ready email delivery was not verified end-to-end with a real send — `ENABLE_EMAILS`/`RESEND_API_KEY` activity in DEV was not confirmed this session. The idempotency design (`tickets_email_sent_at`) is fail-safe either way (a skipped/failed send leaves the flag unset and is retried lazily), but nobody has watched a real email land in an inbox.
2. **EVENT-2**: no certified/implemented Mercado Pago refund flow. Cancelling an event with `paid` orders only sets `refund_required = true` on those orders (informational) — no automatic MP refund call exists or was invented.
3. **EVENT-2**: some webhook adversarial cases (amount mismatch, currency mismatch, payment/order mismatch) were verified by code-equivalence to the already-certified Colecta webhook pattern and by direct RPC testing, not by a live Mercado Pago sandbox payment — no sandbox credentials were available in-session.
4. **EVENT-4**: scanner, staff accounts, and check-in do not exist in any form — not designed in code, only named conceptually in EVENT-0's discovery report.
5. **Test hygiene**: any future Supabase cleanup script must check `if (error) throw` (or equivalent) on every delete step, never assume success — see the Cleanup incident above, which happened specifically because an error return was silently ignored.
6. **This worktree's `.env.local` has `NEXT_PUBLIC_SUPABASE_URL` pointing at the PROD Supabase ref (`wrdkdfuiwlujfxxijpao`), not DEV.** This was flagged and deliberately avoided all session (DEV work used explicit `--project-ref nwxrvwbzqbhznscyirbq` on every Supabase CLI call, and the Vercel DEV project's own environment variables, never this local file). Do not `npm run dev` from this checkout without first fixing or overriding that value — see `SUPABASE_DEV_URL`/`SUPABASE_DEV_*` alternates already present in the same file.
7. **Live-schema introspection of `rifex-dev` is still PENDING, not done.** The comparison between the live database and the versioned SQL in `db/migrations/2026-08-23c_event1_foundation.sql` / `2026-08-24_event2_checkout_orders.sql` / `2026-08-25_event3_tickets_qr.sql` has not been performed — no `db diff`, no `information_schema` query, no `pg_dump` was completed. This must happen (read-only) before EVENT-4 is considered fully cleared, per `docs/events/EVENT4_STAFF_SCANNER_CHECKIN.md`.
8. **`rifex-dev`'s database password must be rotated before any direct PostgreSQL connection (`psql`, `pg_dump`, or equivalent) is attempted again.** A `supabase db dump --dry-run` run during a 2026-08-25 session printed the real DB password in plaintext into the agent's output. No dump was actually executed, no data was touched, and the password was not saved to any file — but it must be treated as compromised. **Do not reuse the exposed credential for anything, under any circumstance.** Rotate it from the Supabase dashboard (Project Settings → Database → Reset database password) before running `supabase db dump`, `psql`, or any other command that resolves and displays real Postgres credentials.

### NEXT (exact)

```text
NEXT: RIFEX EVENT-4 — STAFF + SCANNER + CHECK-IN
```

Conceptual objective (not designed yet): ticket QR → authorized scanner → authoritative validation → PASS/NO PASS → exactly-once check-in → prevent reuse → access audit trail. Nothing in this objective is implemented. Do not start it without a fresh governing prompt.

**Canonical spec**: `docs/events/EVENT4_STAFF_SCANNER_CHECKIN.md` — full EVENT-4 specification (staff/`door` role, `event_checkins`, `used_at` as consumption authority, atomic check-in RPC, scanner, tests A–T, Definition of Done). Read that document before implementing; this WOP section only points to it, it does not duplicate it.

### Reentry Notebook Procedure (Antofagasta)

Steps for a new machine, in order — stop and report if any step contradicts what's documented above rather than pushing forward:

1. Clone the repo if not already present: `https://github.com/ravymaster/rifex-frontend-v2.git`.
2. `cd` into the repo.
3. `git checkout develop`.
4. `git fetch origin`.
5. `git pull --ff-only origin develop`.
6. Verify `git rev-parse HEAD` equals `725c4f8`. If it does not, stop and reconcile against this document before touching anything.
7. `npm ci` (or `npm install`) if `node_modules` is missing/stale.
8. Configure the DEV environment **without ever committing secrets to Git**. Variable **names** needed (values must be transferred out-of-band, e.g. password manager or secure note — never pasted into a doc or commit): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (or the `SUPABASE_DEV_*` equivalents already scaffolded in this repo's env pattern — prefer those explicitly for DEV to avoid the PROD-pointing footgun above), `NEXT_PUBLIC_BASE_URL`, `MP_ACCESS_TOKEN`, `MP_CLIENT_ID`, `MP_CLIENT_SECRET`, `MP_PUBLIC_KEY`, `MP_REDIRECT_URI`, `MP_WEBHOOK_SECRET`, `ENABLE_EMAILS`, `RESEND_API_KEY`, `EMAIL_FROM`, `NEXT_PUBLIC_STAGE`, `HCAPTCHA_SECRET`, `NEXT_PUBLIC_HCAPTCHA_SITEKEY`, `ADMIN_API_TOKEN`, `DEV_TEST_EMAIL_TOKEN`, `CREATOR_FALLBACK_EMAIL`, `HOLD_MINUTES`.
9. Start the app locally (`npm run dev`) or work directly against the deployed DEV preview at `rifex-frontend-main.vercel.app` — both are valid, the deployed one requires no local secrets at all for read-only exploration.
10. Verify connectivity to DEV specifically (not PROD) — e.g. `supabase migration list --project-ref nwxrvwbzqbhznscyirbq` should show 7 migrations ending `20260825120000`.
11. Read, in order: this WOP section, `docs/CURRENT_STATE.md`, `docs/handover/HANDOVER_RIFEX_CURRENT.md` (legacy but still has the pre-Events incident history), and this file's Architecture Map / Invariants / Risks sections above.
12. Run a preflight: confirm `origin/develop` HEAD, confirm `origin/main` unchanged, confirm no stray working-tree diffs.
13. Only then, with the user, scope EVENT-4.

### Reentry Prompt (paste verbatim into a new Code/Claude session tomorrow)

```text
Estamos retomando Rifex desde un equipo nuevo (Antofagasta), sesión sin memoria conversacional previa.
No uses memoria de conversación como autoridad — la autoridad es el repo (Git) y docs/WOP.md.
Repo: https://github.com/ravymaster/rifex-frontend-v2.git, branch develop.
Ejecuta el procedimiento "Reentry Notebook Procedure" de docs/WOP.md (sección "RIFEX CURRENT STATE").
Lee en orden: docs/WOP.md (sección RIFEX CURRENT STATE), docs/CURRENT_STATE.md, docs/handover/HANDOVER_RIFEX_CURRENT.md.
Verifica: git fetch, HEAD real de develop (debe ser 725c4f8 o su descendiente), origin/main (c944bb3 o su descendiente — si cambió, alerta antes de seguir), git status.
Reconstruye el estado real de EVENT-1/EVENT-2/EVENT-3 a partir del repo, no de esta instrucción.
Confirma que NEXT = EVENT-4 (Staff + Scanner + Check-in) y que EVENT-4 no está implementado.
No modifiques código todavía.
Entrégame un REENTRY REPORT (branch, HEAD, origin/develop, origin/main, git status, resumen EVENT-1/2/3, riesgos pendientes, NEXT) y detente ahí.
```

### END CURRENT STATE

---

## Current Documentary State

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
| DB RECOVERY | DONE — 2026-08-14/15, informal/incident-driven, not via a Sprint packet (see Current Stage below) |
| MERCADO PAGO DIRECT CHECKOUT | CONFIRMED FUNCTIONAL IN PRODUCTION |
| ARCHITECTURE AUDIT — FRONTEND/LOGIC SEPARATION | OPEN - AUTHORIZED (2026-08-15) |


## Next Eligible Stage

```text
SPRINT R4: CLOSED — GO
DB RECOVERY: DONE (informal, incident-driven)
NEXT ELIGIBLE STAGE: ARCHITECTURE AUDIT — FRONTEND/LOGIC SEPARATION
ARCHITECTURE AUDIT — FRONTEND/LOGIC SEPARATION: OPEN - AUTHORIZED
OTHER SPRINTS: NOT AUTHORIZED
```
## Official Project States

| State | Meaning |
|---|---|
| BEGIN | New project initialization |
| ALIGNMENT | Reconstruction of an existing project before changing behavior |
| ARCHITECTURE AUDIT | Analysis of real architecture; no implementation |
| ARCHITECTURE DESIGN | Future architecture design; no implementation |
| SPRINT | Authorized implementation cycle |
| RELEASE AUDIT | Verification before commit/push |
| PAUSED | Work intentionally stopped |
| PRODUCTION | Production operation state |
| MAINTENANCE | Controlled maintenance |
| LEGACY | Legacy state or component |

## Current Stage

Rifex has closed `ALIGNMENT`, `ARCHITECTURE AUDIT` and `ARCHITECTURE DESIGN`. Architecture Design AD3 is documented with `GO`, Architecture Design Closing Gate is `GO`, R4 Sprint Readiness is `GO`, and Sprint R4 (Build Baseline Recovery) is `CLOSED - GO`: implemented, Release Audit confirmed GO, committed and pushed at HEAD `bbaf8a0` (`fix: restore checkout page build`).

**DB Recovery — done, but not through the formal Sprint packet process.** On 2026-08-14/15, the user disclosed that the original production Supabase project (`huoepoxuqaodfgbtbalb`) had been deleted directly in Supabase (not through this repository). This was discovered mid-session, confirmed live (`rifex.pro/api/rifas` returning `TypeError: fetch failed`), and constituted an active production incident, not a planned Sprint. Recovery was executed through direct, explicitly authorized, turn-by-turn user instruction rather than a pre-written packet: Vercel's production `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` were repointed to a new Supabase project (`wrdkdfuiwlujfxxijpao`, already provisioned earlier the same session for local sandbox testing via `db/restore/001_schema_supabase_clean.sql`), all sandbox/test rows were purged from it first, and production was confirmed restored to a genuinely empty, functional state. This is recorded as `DONE`, not as a closed Sprint — the WOP's Git Rules and Stage Change Process were not fully followed (no packet, no isolated Sprint commit boundary) because incident response took priority over ceremony. See `docs/handover/HANDOVER_RIFEX_CURRENT.md` for the full evidence trail.

Two code fixes were also implemented and pushed the same session, each independently verified against real data before commit: `webhook_events` was never written to despite the table, its unique index and its `event_id` builder already existing (`7e8e6b7`); `mp/disconnect.js` only cleared 8 of 13 credential columns, leaving a live `mp_refresh_token` behind after "disconnecting" (`1aa97cd`). Both were found live, not from static review.

**Production Validation, 2026-08-15.** After DB recovery, a real end-to-end purchase was completed on `rifex.pro`: a newly registered real Rifex account created a real raffle, the user's own real Mercado Pago account was connected as the seller via OAuth (no environment mismatch — this only reproduces cleanly in real production, not in sandbox, see Critical Risks), and a different real Mercado Pago account completed payment. Ticket sold, purchase approved, payment recorded, a real Mercado Pago webhook was received and logged, buyer/creator emails sent. This is the first `CONFIRMED FUNCTIONAL` evidence for the Mercado Pago checkout flow in this repository's documented history.

This does not certify every flow, does not adopt the three preserved recovery/hardening diffs (which, correction: are already part of `main` at HEAD — see Baseline Decision below), does not implement Mercado Pago split payments (requires direct engagement with Mercado Pago's commercial team, not a code or certification path — see `docs/handover/HANDOVER_RIFEX_CURRENT.md`), and does not by itself authorize the newly opened Architecture Audit beyond its stated scope (frontend/logic separation, in preparation for a UI/UX redesign — explicitly authorized by the user on 2026-08-15).

## Baseline Decision

```text
PROPOSED BASELINE DECISION: C
```

Decision C is the documentary baseline decision approved during Alignment A1 and carried forward through the A2 checkpoint. HEAD `1aa97cd43e63649d2d17255a42ee71600e631315` is the current confirmed HEAD (`fix: clear all credential fields on MP disconnect, not just half`). `bbaf8a02d2ff3681186e8f84317ce1c7cdd064ee` (`fix: restore checkout page build`), the R4 implementation commit, is an ancestor of HEAD. Previous citations (`b46ef9d`, `48013ce`, `bbaf8a0`, `1fc064a`) each lagged the real HEAD because the commit that closed a gate did not bump its own self-citation — a recurring pattern in this repository; see `docs/audits/EXECUTION_ENVIRONMENT_AUDIT.md` for the first reconciliation (`STALE, NOT CORRUPTED`, no diverged history). Correction to a separate stale claim: `mailer.js`, `reconcile-payments.js` and `webhook.js` are **not** an outstanding working-tree diff — `git diff --stat` against HEAD for those three files is empty; they are ordinary committed files in `main`. That claim was already stale before this session began. The PostgreSQL backup corresponds to the original Supabase project, which has since been deleted (see Current Stage) — it is now the only surviving evidence of that project's data, and remains sensitive evidence outside the Git baseline. R4 build-success is confirmed; beyond that, the Mercado Pago checkout flow is now `CONFIRMED FUNCTIONAL` in production (see Current Stage, Production Validation) — a materially stronger claim than "build-success only," scoped specifically to that flow.

| Layer | Status |
|---|---|
| HEAD `1aa97cd` | CONFIRMED current HEAD (fix: clear all credential fields on MP disconnect, not just half) |
| R4 implementation commit `bbaf8a0` | CONFIRMED ancestor of HEAD (fix: restore checkout page build) |
| `webhook_events` fix `7e8e6b7` | CONFIRMED; verified live with a real Mercado Pago webhook in production |
| `mp/disconnect.js` fix `1aa97cd` | CONFIRMED; verified by seeding all 13 credential columns and confirming full clear |
| Supabase project | CONFIRMED changed: original (`huoepoxuqaodfgbtbalb`) deleted by the user outside this repo; current baseline is `wrdkdfuiwlujfxxijpao`, used by **both** production and local dev — architecture gap, not target state |
| PostgreSQL backup | CONFIRMED sensitive evidence outside Git baseline; corresponds to the deleted project, not the current one |
| A2 documents | CONFIRMED documentation materialization |
| Architecture Audit documents | CONFIRMED documentation materialization |
| Architecture Design AD3 report | CONFIRMED documentation materialization |
| R4 Sprint packet | CLOSED - GO; implemented at `bbaf8a0`, `npm run build` passes |
| Production Validation | CONFIRMED 2026-08-15; real seller, real buyer, real webhook — see Current Stage |
| Recovery decision | B: split recovery into R4, DB, R1, R2, R3 Technical and Fees Policy; DB unit executed informally (incident-driven), R1/R2/R3/Fees Policy still not authorized |

## Recovery Sequence

```text
R4 -> DB Recovery Contract -> R1 -> R2 -> R3 Technical -> Fees Policy -> Release Audits -> Separate Commits
```

This sequence is approved as a recovery plan, not as implementation. Recovery changes must not be implemented before Architecture Design and an explicitly authorized Sprint.

## Alignment Closing Criteria

Alignment may close when product identity, Git baseline, working tree ownership, current architecture, domain, database, security, known risks and recovery plan are documented with no unresolved integrity uncertainty.

Condition to open Architecture Design: Architecture Audit must be closed with `GO`, the current dirty working tree must remain explained, and the user must explicitly authorize Architecture Design.

## Known Working Tree

`src/lib/mailer.js`, `src/pages/api/admin/reconcile-payments.js` and `src/pages/api/checkout/webhook.js` were previously described here as "pre-existing functional diffs." Correction: they are ordinary committed files in `main` at HEAD, with no working-tree diff (`git diff --stat` against HEAD is empty). That description was already stale before this session began.

Sensitive artifact:

- `db_cluster-10-11-2025@05-41-59.backup.gz` — corresponds to the original Supabase project (`huoepoxuqaodfgbtbalb`), deleted 2026-08-14/15. It is now the only surviving evidence of that project's data. Still outside the Git baseline; do not inspect, move or delete without a specific mission.

New untracked artifact:

- `db/restore/001_schema_supabase_clean.sql` — the schema-provisioning script actually used to build the current Supabase project (`wrdkdfuiwlujfxxijpao`), now serving both production and local dev. Untracked as of HEAD `1aa97cd`; should be committed, since it is no longer just a sandbox artifact.

## Blockers And Limits

| Item | Classification |
|---|---|
| Functional verification | PARTIAL — Mercado Pago direct-collection checkout CONFIRMED FUNCTIONAL in production (2026-08-15); other flows remain UNVERIFIED |
| DB remote state | CONFIRMED (new project `wrdkdfuiwlujfxxijpao`, schema applied, empty of legacy data, currently serving both production and local dev) |
| Canonical ticket/purchase/payment states | CONTRADICTORY claim inherited from prior audits of the now-deleted original project; not re-verified against the new project's data model, which was restored from the same schema and is presumed to carry the same contradiction until checked |
| Mercado Pago split payments (1:N) | NOT AVAILABLE; requires direct engagement with Mercado Pago's commercial team, not a code change or self-service certification |
| Sandbox testing of Mercado Pago OAuth-connected-seller flow | BLOCKED as currently configured — the app has no sandbox-specific OAuth Client ID/Secret, so any OAuth-connected token comes back tied to the production Client ID (`APP_USR-` prefix, not `TEST-`), causing an environment mismatch when paired with a sandbox buyer. Only verified working in real production |
| Architecture Audit | CLOSED - GO |
| Architecture Design | CLOSED - GO |
| R4 Sprint Readiness | GO |
| Sprint R4 | CLOSED - GO |
| DB Recovery | DONE — informal, incident-driven, 2026-08-14/15 |
| Architecture Audit — Frontend/Logic Separation | OPEN - AUTHORIZED (2026-08-15) |
| Sprint | R4 CLOSED; OTHERS NOT YET OPEN / NOT AUTHORIZED |

## Rules For AI Agents

- Use the repository as source of truth.
- Distinguish facts, inferences, and proposals.
- Use `CONFIRMED`, `INFERRED`, `PROPOSED`, `UNKNOWN`, `UNVERIFIED`, `NOT IMPLEMENTED`, `NOT EVIDENCED`, `CONTRADICTORY`, and `BLOCKED`.
- Do not present code presence as functional verification.
- Do not mix HEAD with working tree diffs.
- Do not treat the backup as Git baseline.
- Do not expose secrets, personal data, or backup rows.
- Preserve user and previous-agent work unless explicitly authorized.

## Gate Values

| Gate | Meaning |
|---|---|
| GO | Evidence satisfies the stated gate |
| PARTIAL | Most work is complete but documented gaps remain |
| NO GO | Integrity, scope, or evidence failed |

## Git Rules

- No Sprint is complete without Release Audit.
- Closed work requires commit, push, HEAD verified, and clean working tree.
- Dirty working trees must be explained by category.
- Do not use destructive Git commands without explicit authorization.
- Do not stage, commit, or push during Architecture Design documentation materialization unless explicitly authorized.

## Stage Change Process

A later stage can open only when the current gate is reported and the user authorizes the next stage. Sprint R4 was explicitly authorized, implemented, release-audited GO, committed and pushed. DB Recovery was subsequently executed informally — not through this process — in direct response to a production incident (see Current Stage); it is `DONE`, not `CLOSED - GO` in the packet sense, and that distinction is preserved deliberately rather than retrofitted. The user has since explicitly authorized the next formal stage: `ARCHITECTURE AUDIT — FRONTEND/LOGIC SEPARATION` (2026-08-15), scoped to mapping business logic vs. presentation ahead of a UI/UX redesign — no redesign implementation is authorized yet.

## Resume Handover

| Item | Status |
|---|---|
| Recovery preservation | GO |
| Recovery branch | `recovery/rifex-hardening-preserved` |
| Recovery commit | `1c23702f401f8c501077ecfd265a213245e62a63` |
| Handover | `docs/handover/HANDOVER_RIFEX_CURRENT.md` |
| R4 | CLOSED - GO at ancestor `bbaf8a0` |
| DB Recovery | DONE (informal, incident-driven, 2026-08-14/15) |
| Production Validation | CONFIRMED 2026-08-15 — see Current Stage |
| Next eligible / open stage | Architecture Audit — Frontend/Logic Separation; OPEN - AUTHORIZED |

Recovery preservation keeps the R1/R2/R3 hardening work on its own branch, recoverable without adopting it into `main` — that decision is unaffected by today's events, since the branch's three files are already present in `main` at HEAD regardless (see Baseline Decision correction). DB Recovery is done, but through incident response rather than the packet process; R1/R2/R3/Fees Policy remain `NOT AUTHORIZED`. The currently open stage is the Architecture Audit into frontend/logic separation, authorized 2026-08-15, in preparation for — but not itself authorizing — a UI/UX redesign. See `docs/handover/HANDOVER_RIFEX_CURRENT.md` for the full narrative.

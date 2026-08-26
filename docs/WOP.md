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
| EVENT-4 | **DONE — CERTIFIED (100/100 manual acceptance, real phone, Rodrigo)** | Staff (`door` role) + scanner + atomic check-in. Spec at `docs/events/EVENT4_STAFF_SCANNER_CHECKIN.md`. See "EVENT-4 checkpoint" and "final manual acceptance" below |

Supabase `rifex-dev` migration history: `db/migrations/2026-08-25b_event4_staff_scanner_checkin.sql` applied 2026-08-25 (manually, via the Supabase SQL Editor — see "EVENT-4 checkpoint" below for why). DEV Vercel deploy target: `rifex-frontend-main` project, `--prod` alias (its own top-level environment, unrelated to real PROD — see Reentry Notebook Warnings below).

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

### EVENT-4 checkpoint (functional, applied to `rifex-dev` 2026-08-25)

```text
develop:  (this commit)
Verdict:  GO EVENT-4
```

**Migration application mechanism (resolves the open question EVENT-3 left about how SQL reaches `rifex-dev`):** `supabase db push`/`db pull` both refuse to operate — the 9 pre-EVENT-4 migrations were never recorded in the CLI's own `supabase_migrations.schema_migrations` bookkeeping table (`LegacyDbPushMissingLocalError`/`LegacyDbPullMigrationConflictError`), and the only CLI-offered fix, `supabase migration repair`, was explicitly withheld this session. `db/migrations/2026-08-25b_event4_staff_scanner_checkin.sql` was instead applied by pasting the full file into the Supabase Dashboard's SQL Editor for `rifex-dev` and executing it directly (`Success. No rows returned.`) — confirmed applied via read-only verification immediately after (see Evidence below), never via `psql`/`pg_dump`/any direct Postgres connection. Future Events migrations should expect to use the same manual SQL Editor path unless someone deliberately backfills the CLI's migration history first.

Evidence (live DEV, this session):
- Read-only structural verification immediately after the manual apply: `event_staff`/`event_checkins` tables exist; RLS genuinely blocks `anon` (`permission denied`, not just an empty result — confirms `revoke all` took effect, not only a missing SELECT policy); both new RPCs (`check_in_event_ticket`, `find_user_id_by_email`) return `permission denied` (`42501`) for `anon` and succeed for `service_role`; all 5 EVENT-1/2/3 tables still queryable; `event_tickets.used_at` column present.
- **36/36 functional+security tests PASS**, run twice against the real HTTP API (not just the RPC in isolation) with real Supabase-authenticated test users, real events, and real tickets issued via the actual EVENT-3 `issue_event_order_tickets` RPC (not fabricated rows) — organizer/door-active/door-revoked/random/anon authorization; ticket void; ticket from a different event (`ticket_wrong_event`, verified unconsumed after); staff authorized only for a different event; cancelled event; QR malformed → `invalid_token`; nonexistent ticket → 404; `GET /t/[token]` before **and** after check-in never mutates `used_at`, across repeated calls; `event_checkins` gets exactly one row with the correct `checked_in_by`; staff management (owner adds/revokes, non-owner/`door` rejected on both); manual fallback (`ticket_number`) staff-only, same atomic authority as QR; public read endpoints (`/api/events`, `/api/events/[id]`) unaffected.
- **Exactly-once check-in under concurrency**: 20 simultaneous `POST /api/events/[id]/check-in` calls against the real HTTP server, same `qr_token` → exactly 1 `pass`, exactly 19 `already_used`, `used_at` set once, exactly 1 `event_checkins` row — verified by direct DB count, not by response inspection alone. Ran twice (once per test pass) with identical results.
- `npm run build` PASS, clean, after a full `.next` cache wipe (a `.next` corruption from running `build` concurrently with a live `dev` server mid-session was found and fixed — see Risks/pending).
- QA fixtures: **0 residual** — 6 test events, 26 test tickets/orders, 14 test users created across two test passes, all deleted with `if (error) throw` on every step, final sweep confirmed `0`/`0`.
- PROD confirmed untouched: `origin/main` unchanged, no Supabase CLI command targeted `wrdkdfuiwlujfxxijpao`, no `rifex.pro` request made.
- ~~Camera capture/visual overlay not verified in a real browser~~ — **RESOLVED**, see "First manual acceptance test" below. The automated Browser pane limitation noted earlier this session (never reaching a visible/composited state) turned out not to matter: Rodrigo tested on his own real phone instead.

### First manual acceptance test on a real phone (2026-08-25) — bug found and fixed

Rodrigo confirmed on a real device: camera opened correctly, DEV clearly identifiable, mobile-first layout correct, second scan correctly showed "NO PASA — YA UTILIZADA" with the right check-in hour. **But** the first scan's green "PASA" appeared and disappeared too fast to screenshot.

**Root cause, confirmed by code review, not guessed:** `scanner.jsx` had a `RESULT_AUTO_RESET_MS = 2800` timer that automatically cleared the visible result and resumed the camera decode loop 2.8 seconds after *any* result, regardless of whether the phone was still pointed at the same QR. Rodrigo was still aiming at the screen to take a photo when the timer fired, the decode loop resumed, immediately re-detected the same (now-consumed) QR, and fired a second real `POST /api/events/[id]/check-in` — which correctly returned `already_used` and overwrote the visible `pass` result before he could react. **Not a race in the atomic check-in itself** (the DB-level exactly-once guarantee held — only one `event_checkins` row was ever created for that ticket) — the bug was purely in the client's decision to keep scanning after a result, contradicting the spec's own "queda listo rápidamente para el siguiente escaneo" *never* meaning "automatically, without the door person's input."

**Fix**: removed the auto-reset timer entirely. All detection-gating logic was extracted into `src/lib/scannerController.js` — a `locked` flag that a detection sets *synchronously*, before any `await`, and that only `reset()` (wired exclusively to the "Siguiente escaneo" button) can clear. The camera's `requestAnimationFrame` decode loop is now explicitly stopped (`cancelAnimationFrame`) the instant a detection is accepted, not just gated by a flag inside the loop, and only restarted on `reset()`. The manual `ticket_number` fallback and the "Siguiente escaneo" button itself route through the same lock, guarding against double-tap. `tests/scannerController.test.mjs` (`npm run test:scanner-controller`, Node's built-in `node --test`, no new dependency) reproduces the exact failure mode — 5 consecutive detections of the same QR fired synchronously before the first response resolves — and asserts exactly 1 underlying request fires; 4 tests total, all PASS. Re-ran the full 36-test HTTP suite plus the 20-concurrent check-in test after the fix: unaffected (6/6 spot-check + concurrency PASS again), since the fix is entirely client-side.

A second, unconsumed ticket was issued on the same `EVENT-4 TEST` fixture event for Rodrigo to repeat the manual test against the fixed scanner.

### EVENT-4 — final manual acceptance, confirmed (2026-08-25)

Fix committed at `c32713e` (`fix(events): stop scanner from auto-resuming and double-submitting`), deployed to `rifex-frontend-main`, re-tested by Rodrigo on a real phone against a fresh, previously-unconsumed ticket on the same `EVENT-4 TEST` fixture event. Confirmed:

- real browser camera opened and read a real QR off a screen;
- first scan → `PASA`, and it **stayed visible** — no automatic disappearance;
- the camera did **not** resume scanning on its own; resumption only happened when Rodrigo tapped "Siguiente escaneo";
- second scan of the same (now-consumed) QR → `NO PASA — YA UTILIZADA`, with the real check-in hour shown;
- mobile-first layout held up on a real device; manual fallback visible; DEV clearly identifiable as DEV.

```text
develop:  c32713e (fix), on top of a1093b6 (feat)
Verdict:  EVENT-4 — ACEPTADO 100/100 (Rodrigo, real-phone manual test)
```

All EVENT-4 TEST fixture data (1 event, 3 orders/tickets/checkins, 1 ticket type, 1 dedicated test account) was deleted from `rifex-dev` after acceptance, identified and removed by exact ID (not by pattern/prefix) — confirmed `rifex-dev` had exactly this one event and one user in the entire database both before and after, so nothing else could have been or was affected. `origin/main`/PROD untouched throughout.

### Architecture map — Events (EVENT-1/2/3/4), just enough to reorient without re-reading source

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

**EVENT-4 — staff/scanner/check-in**
- `event_staff` (`role`: only `door`; `status`: `active`/`revoked`; unique per `event_id`+`user_id`; `user_email_snapshot` for display only, never authoritative). `event_checkins` (audit trail, one row per successful check-in, `unique(ticket_id)` as defense-in-depth).
- `event_tickets.used_at` (left nullable/unwritten since EVENT-3) is now the consumption authority: `NULL` → consumable, non-`NULL` → `already_used`. Never a `status` change — `status` stays `valid`/`void`, untouched by check-in.
- Atomic RPC: `check_in_event_ticket(qr_token, actor_user_id, event_id)` — locks the `event_tickets` row (`FOR UPDATE`), same concurrency pattern as EVENT-3's `issue_event_order_tickets`, just one level down (ticket instead of order). Validates ticket exists → belongs to the given event (cross-event check, before authorization) → actor is organizer or `door`+`active` staff of that event → event not `cancelled` → ticket not `void` → `used_at IS NULL`, then writes `used_at` and inserts `event_checkins` in the same transaction. No `SECURITY DEFINER` (same reasoning as `create_event_order`/`issue_event_order_tickets`: already runs as `service_role`, which already has the privileges it needs).
- `find_user_id_by_email(email)` — the one function in this migration that **does** use `SECURITY DEFINER` (with `search_path` pinned to `public, auth`) because resolving "does a user with this email exist" requires reading `auth.users`, not exposed via PostgREST otherwise. Never a public search — accepts exactly one email, returns one id or `null`, `service_role`-only.
- HTTP surface: `GET/POST /api/events/[id]/staff` (owner-only), `PATCH /api/events/[id]/staff/[staffId]` (owner-only, revoke/reactivate, never `DELETE`), `GET/POST /api/events/[id]/check-in` (`GET` = authorization ping for the UI, `POST` = the real check-in, accepts `qr_token` or staff-only `ticket_number` fallback — both paths converge on the same RPC).
- Scanner: `/panel/eventos/[id]/scanner`, mobile-first, camera via `jsqr` (new dependency — pure decode function, no camera/UI bundled, chosen specifically so the app owns 100% of the capture loop and the strict parsing, never a third-party navigation/URL-handling layer). Parsing lives in `src/lib/parseEventQr.js`: accepts a bare 32-hex token or a `/t/<token>` URL whose **origin must match the scanner's own** — anything else, including a same-shape URL on a foreign host, is "malformado," never navigated to.
- Key files: `db/migrations/2026-08-25b_event4_staff_scanner_checkin.sql`, `src/lib/eventStaffAuth.js`, `src/lib/parseEventQr.js`, `src/lib/scannerController.js` (detection-gating state machine, added after the first manual test found the auto-reset bug — see below), `src/pages/api/events/[id]/check-in.js`, `src/pages/api/events/[id]/staff/*`, `src/pages/panel/eventos/[id]/scanner.jsx`, `src/pages/panel/eventos/[id].jsx` (extended: staff section, "Abrir scanner" CTA, "Ingresaron" count), `src/pages/api/events/[id]/orders-summary.js` (extended additively: `tickets.checked_in`), `tests/scannerController.test.mjs` (`npm run test:scanner-controller`).

### Invariants that must hold across any future Events work

- **PAYMENT STATE ≠ FULFILLMENT STATE.** `event_orders.status` (payment truth) and `tickets_issued_at`/`tickets_email_sent_at` (fulfillment truth) are separate columns, separate concerns. A fulfillment failure must never revert a payment; a payment failure must never be papered over by fulfillment succeeding.
- `paid` is the **only** order status that may issue tickets.
- `approved_unfulfilled` **never** issues tickets, even with a valid `mp_payment_id` — this is the direct consequence of the late-payment-after-resale protection designed in EVENT-2 (never steal stock from a buyer who purchased after the original reservation expired).
- Scanning/opening a ticket's QR is **not** check-in. `GET /t/[token]` never consumes, never mutates `status` or `used_at` — verified again after EVENT-4 shipped: repeated `GET` calls before **and** after a real check-in leave `used_at` unchanged.
- A ticket is never `DELETE`d for being used or voided — `void` is a status, history is preserved. `event_staff` follows the same rule: revoking never deletes the row.
- EVENT-4 owns check-in authority entirely, exclusively via `check_in_event_ticket` — no other code path writes `event_tickets.used_at` or inserts into `event_checkins`.
- **Three separate truths, never merged**: `event_orders.status` (payment), `tickets_issued_at`/`tickets_email_sent_at` (fulfillment), `event_tickets.used_at`/`event_checkins` (access). A check-in never touches payment or inventory columns; verified — `check_in_event_ticket` never references `event_orders` at all.

### Risks / pending (documented, not being worked now)

1. **EVENT-3**: ticket-ready email delivery was not verified end-to-end with a real send — `ENABLE_EMAILS`/`RESEND_API_KEY` activity in DEV was not confirmed this session. The idempotency design (`tickets_email_sent_at`) is fail-safe either way (a skipped/failed send leaves the flag unset and is retried lazily), but nobody has watched a real email land in an inbox.
2. **EVENT-2**: no certified/implemented Mercado Pago refund flow. Cancelling an event with `paid` orders only sets `refund_required = true` on those orders (informational) — no automatic MP refund call exists or was invented.
3. **EVENT-2**: some webhook adversarial cases (amount mismatch, currency mismatch, payment/order mismatch) were verified by code-equivalence to the already-certified Colecta webhook pattern and by direct RPC testing, not by a live Mercado Pago sandbox payment — no sandbox credentials were available in-session.
4. ~~EVENT-4: scanner, staff accounts, and check-in do not exist~~ — **RESOLVED 2026-08-25**, see "EVENT-4 checkpoint" above.
5. **Test hygiene**: any future Supabase cleanup script must check `if (error) throw` (or equivalent) on every delete step, never assume success — see the Cleanup incident above, which happened specifically because an error return was silently ignored.
6. **This worktree's `.env.local` has `NEXT_PUBLIC_SUPABASE_URL` pointing at the PROD Supabase ref (`wrdkdfuiwlujfxxijpao`), not DEV.** This was flagged and deliberately avoided all session (DEV work used explicit `--project-ref nwxrvwbzqbhznscyirbq` on every Supabase CLI call, and the Vercel DEV project's own environment variables, never this local file). Do not `npm run dev` from this checkout without first fixing or overriding that value — see `SUPABASE_DEV_URL`/`SUPABASE_DEV_*` alternates already present in the same file.
7. ~~Live-schema introspection of `rifex-dev` is PENDING~~ — **RESOLVED 2026-08-25**, functionally (not via raw catalog dump — `db pull`/`db dump` remained blocked by the same CLI history-bookkeeping issue described in the EVENT-4 checkpoint above). Verified instead by exercising the real tables/RLS/RPCs directly: all EVENT-1/2/3 tables queryable, `event_staff`/`event_checkins` exist with RLS genuinely enforced, both new RPCs behave and are permission-scoped correctly. A byte-level `information_schema`/`pg_dump` comparison against the versioned SQL was still not done — low residual risk, since every constraint/RLS/grant the migration declares was independently exercised and confirmed behaviorally.
8. **`rifex-dev`'s database password must still be rotated before any direct PostgreSQL connection (`psql`, `pg_dump`, or equivalent) is attempted.** A `supabase db dump --dry-run` run during a 2026-08-25 session printed the real DB password in plaintext into the agent's output. No dump was actually executed, no data was touched, and the password was not saved to any file — but it must be treated as compromised. The user explicitly deferred rotation to the next session ("se realizará mañana") rather than blocking EVENT-4 on it — **rotation is still outstanding as of this checkpoint**, tracked here so it isn't forgotten. **Do not reuse the exposed credential for anything, under any circumstance.**
9. **Supabase CLI (`db push`/`db pull`) cannot be used for this project as-is** — the pre-EVENT-4 migration history was never recorded in the CLI's own bookkeeping table, and the only fix the CLI offers (`supabase migration repair`) has been withheld twice this session by explicit user instruction. Until someone deliberately authorizes a repair/backfill, every future Events migration will need the same manual SQL-Editor-paste path used for EVENT-4 — plan for it, don't assume `db push` will work.
10. ~~Camera/visual scanner UI not verified live~~ — **RESOLVED 2026-08-25**. First real-phone test by Rodrigo found a real bug (auto-reset timer racing the camera loop, overwriting `PASA` with `already_used`); fixed (`src/lib/scannerController.js`, commit `c32713e`); **second real-phone test confirmed the fix** — `PASA` stays visible, camera never resumes on its own, only "Siguiente escaneo" does. EVENT-4 manual acceptance: **100/100, CONFIRMED**, not outstanding anymore.
11. **`.next` build cache corruption from running `npm run build` while `npm run dev` was live** — caused a real `Cannot find module './chunks/vendor-chunks/next.js'` 500 error mid-session. Fixed by stopping `dev`, `rm -rf .next`, restarting. Not a code defect; a reminder not to run `build` and `dev` concurrently against the same checkout.

### PRE-LAUNCH-FIX-3 — `raffle_date_extensions` RLS incident (2026-08-25)

**Real Supabase Security Advisor alert** (email, "Action required: security vulnerabilities detected in your projects", `rls_disabled_in_public`, level ERROR, dated 2026-08-23) for both `rifex-dev` (`nwxrvwbzqbhznscyirbq`) and PROD (`wrdkdfuiwlujfxxijpao`). Not related to Events/EVENT-4.

**Root cause, confirmed by code review**: `public.raffle_date_extensions` (created in `2026-08-19_draw1_temporal_lifecycle.sql`, alongside `legal_declarations`) never received the RLS hardening that `legal_declarations` got in PRE-LAUNCH-FIX-1 (`2026-08-23_prelaunch_fix1_ticket_integrity.sql`, "P1-2") — an omission, not a design choice. No code under `src/` reads or writes this table directly (confirmed by grep); the only real writer is `extend_raffle_draw()`, an RPC that runs under `service_role` and bypasses RLS by design, same as `legal_declarations`'s writer.

**Exposure demonstrated, not assumed** (`rifex-dev`, before the fix): `relrowsecurity = false` at the catalog level (`pg_class`, confirmed via `supabase db query --linked`, the Management-API-based SQL runner — no `psql`, no `--dry-run`, no password involved). An `anon`-key `INSERT` succeeded with **zero error**, matching the alert's own wording ("anyone with your project URL can read, edit, and delete all data in this table") — the test row was immediately deleted via `service_role`, scoped by its own id.

**Fix**: `db/migrations/2026-08-25c_prelaunch_fix3_raffle_date_extensions_rls.sql` — a single `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, no new policies, identical pattern to the already-certified `legal_declarations` fix. Applied to `rifex-dev` via `supabase db query --linked -f <file>` (Management API, bypasses the same migration-history bookkeeping gap noted for EVENT-4 — this command is independent of `db push`/`pull` and was not blocked by it).

**DEV verification, all real, all this session**:
- Catalog re-check: `relrowsecurity = true`.
- Same `anon` `INSERT` now fails with `42501 new row violates row-level security policy`.
- Full security matrix (`anon`/authenticated owner/authenticated non-owner/`service_role` × SELECT/INSERT/UPDATE/DELETE against a real row) — **14/14 PASS**. Notably: even the raffle's own owner cannot read/write this table directly now — by design, matching `legal_declarations` exactly; the real flow goes through `extend_raffle_draw` (`service_role`), never direct table access.
- `extend_raffle_draw` exercised end-to-end (real raffle, real RPC call, real resulting row) — unaffected by the fix, confirms the one real write path still works.
- EVENT-4 check-in exercised end-to-end again (unrelated table, sanity-checked anyway per the mission's regression requirement) — unaffected.
- Full route smoke (`/`, `/login`, `/register`, `/rifas`, `/crear-rifa`, `/crear-colecta`, `/eventos`, `/mis-iniciativas`, `/panel`, `/api/rifas`, `/api/events`) — all 200.
- `npm run build` — PASS.
- Attempted to break the fix: confirmed via full-migration-history grep that `extend_raffle_draw` is the *only* function anywhere that ever writes to this table — no alternate write path exists to bypass.
- All QA fixtures created for this investigation (test users, a test raffle, test rows) deleted, verified `0` residual after each script.

**PROD — RESOLVED**: same `rls_disabled_in_public` finding confirmed via `supabase db advisors --linked --project-ref wrdkdfuiwlujfxxijpao` (ref confirmed explicitly, the persisted `rifex-dev` link was verified unchanged before and after) — PROD's advisor output also confirmed, independently, that **no Events tables or functions exist there** (a strict subset of DEV's findings), consistent with everything already documented. Applying the identical one-line fix to PROD via the agent was **blocked by the harness's own safety classifier** (recognized as a production-database-affecting command) — a deliberate environment safeguard, not worked around. **The user applied the fix manually** in the PROD SQL Editor, same file, same single statement. Verified read-only immediately after: `pg_class.relrowsecurity = true` for `public.raffle_date_extensions` in PROD, and a full `db advisors --type security --level error` re-scan of PROD returned **"No issues found"** — the CRITICAL finding is gone. PROD's `.env`/deploy/`main` branch/`rifex-frontend-v2` code were never touched — this was a database-only change, applied directly, no Git involvement, no deploy.

**PROD functional health, separately confirmed**: the live Vercel deployment behind `rifex-frontend-v2` responds (app and DB both healthy after the fix) when hit directly by its `*.vercel.app` URL. **A separate, unrelated domain incident was flagged here and fully diagnosed afterward — see "P0 — rifex.pro domain expired" immediately below.**

**Other advisor findings, not acted on this session** (lower severity, out of scope for this incident): `function_search_path_mutable` WARNs on several pre-existing functions and on some of EVENT-2/3/4's own RPCs (`create_event_order`, `expire_event_order`, `mark_event_order_paid`, `issue_event_order_tickets`, `void_event_ticket`, `check_in_event_ticket` — flagged regardless of `SECURITY DEFINER` status, a general best-practice warning); `anon`/`authenticated_security_definer_function_executable` WARNs on legacy raffle functions (`create_tickets_for_raffle`, `rifex_set_creator_defaults`, `set_bank_account_owner`, `set_creator_fields`, `set_raffle_creator_from_jwt`); `auth_leaked_password_protection` WARN (PROD only, HaveIBeenPwned check disabled). None are the CRITICAL/ERROR-level issue the email reported.

### P0 — `rifex.pro` domain expired at the registrar (2026-08-26)

**Not a code, deploy, or RLS-fix issue.** Rodrigo confirmed `https://rifex.pro` failing with `ERR_SSL_PROTOCOL_ERROR` from a second device/browser, right after the RLS-fix session above. Diagnosed read-only, no changes made anywhere.

**Root cause, confirmed with direct evidence, not inferred:**
- `vercel domains inspect rifex.pro` shows the domain correctly assigned to `rifex-frontend-v2` (`rifex.pro`, `www.rifex.pro`) — the Vercel-side project/domain assignment was never wrong. Vercel's own "Intended Nameservers" check (`ns1/ns2.vercel-dns.com`, shown with a checkmark) is **stale/no longer true** — it does not reflect what is live today.
- Real, live DNS — cross-checked via two independent public resolvers (Cloudflare `1.1.1.1` and Google `8.8.8.8` DNS-over-HTTPS, not just the local/hotel resolver) — shows the **actual authoritative nameservers are `ns1.dns-expired.com` / `ns2.dns-expired.com`**, not Vercel's. Both the apex (`rifex.pro`) and `www.rifex.pro` resolve to `2.57.91.92`, not any Vercel edge IP.
- `dns-expired.com`'s own SOA record names its authority as `hostinger.mars.orderbox-dns.com` / `business-domains.hostinger.com` — **Hostinger** (confirmed as the registrar; Vercel's own domain inspector already listed the registrar as "Third Party").
- A plain HTTP request to `2.57.91.92` with `Host: rifex.pro` returns Hostinger's own parking page, with the literal page title **"Your domain is expired."**

**Conclusion**: the `rifex.pro` domain **registration itself has lapsed at Hostinger** (not a DNS misconfiguration, not a Vercel certificate problem, not a CAA record, not a proxy). Hostinger's registrar-level expiration handling overrides the nameservers to its own parking service the moment a domain lapses — this is why Vercel still shows a "correct" project assignment and once-correct nameservers, while live DNS today points somewhere Vercel has no control over. **No fix exists inside Vercel** for this — setting an A record, re-adding the domain, or any Vercel-side action cannot restore a domain whose registration has expired at its registrar.

**Corrective action — outside this agent's reach, requires the domain owner:**
1. Log into Hostinger (the registrar for `rifex.pro`) and **renew the domain registration** — this is a billing/account action, not a technical one.
2. Once renewed, confirm Hostinger's nameservers are set back to `ns1.vercel-dns.com` / `ns2.vercel-dns.com` (Vercel's own recommendation, already correctly configured on the Vercel side and requiring no further Vercel changes) — **or**, if Vercel's DNS challenge re-appears after renewal, follow whatever it recommends at that point (do not assume today's exact instructions still apply after a renewal, since Hostinger's post-expiration state may differ).
3. Propagation after a registrar-level renewal + nameserver fix can take from minutes to a few hours depending on Hostinger/Vercel's caching.

**Verified, unaffected by this incident**: the live Vercel deployment (`rifex-frontend-v2`, hit directly by its Vercel-issued URL, bypassing the broken domain) is healthy. `rifex-dev` (DEV Supabase), the local `develop` git branch, and the PRE-LAUNCH-FIX-3 RLS correction from earlier this session are all confirmed untouched by this domain incident and by this investigation.

**No corrective action was applied by the agent** — confirmed there was nothing safe/unambiguous to change inside Vercel (the Vercel-side configuration was already correct), and registrar access was never available to this session. This matches the mission's own stop condition ("necesitas acceso al proveedor DNS externo").

### NEXT (exact)

```text
NEXT: EVENT-5 (not scoped, not authorized) — see docs/events/EVENT4_STAFF_SCANNER_CHECKIN.md, "Definition of Done"
```

EVENT-4 is `DONE` (see checkpoint above). Nothing beyond it is scoped or authorized — do not start EVENT-5 (analytics/CSV, per the canonical spec's explicit exclusions) without a fresh governing prompt. Before any further Events work: rotate the `rifex-dev` DB password (risk 8 above) and do a real-device scanner smoke test (risk 10 above).

**Canonical spec**: `docs/events/EVENT4_STAFF_SCANNER_CHECKIN.md` — full EVENT-4 specification (staff/`door` role, `event_checkins`, `used_at` as consumption authority, atomic check-in RPC, scanner, tests A–T, Definition of Done) — now implemented and certified against it, see checkpoint above.

### Reentry Notebook Procedure (Antofagasta)

Steps for a new machine, in order — stop and report if any step contradicts what's documented above rather than pushing forward:

1. Clone the repo if not already present: `https://github.com/ravymaster/rifex-frontend-v2.git`.
2. `cd` into the repo.
3. `git checkout develop`.
4. `git fetch origin`.
5. `git pull --ff-only origin develop`.
6. Verify `git rev-parse HEAD` is the EVENT-4 commit (`docs(events)`/`feat(events): add staff scanner and atomic check-in` on top of `725c4f8`) or a descendant. If it does not match, stop and reconcile against this document before touching anything.
7. `npm ci` (or `npm install`) if `node_modules` is missing/stale.
8. Configure the DEV environment **without ever committing secrets to Git**. Variable **names** needed (values must be transferred out-of-band, e.g. password manager or secure note — never pasted into a doc or commit): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (or the `SUPABASE_DEV_*` equivalents already scaffolded in this repo's env pattern — prefer those explicitly for DEV to avoid the PROD-pointing footgun above), `NEXT_PUBLIC_BASE_URL`, `MP_ACCESS_TOKEN`, `MP_CLIENT_ID`, `MP_CLIENT_SECRET`, `MP_PUBLIC_KEY`, `MP_REDIRECT_URI`, `MP_WEBHOOK_SECRET`, `ENABLE_EMAILS`, `RESEND_API_KEY`, `EMAIL_FROM`, `NEXT_PUBLIC_STAGE`, `HCAPTCHA_SECRET`, `NEXT_PUBLIC_HCAPTCHA_SITEKEY`, `ADMIN_API_TOKEN`, `DEV_TEST_EMAIL_TOKEN`, `CREATOR_FALLBACK_EMAIL`, `HOLD_MINUTES`.
9. Start the app locally (`npm run dev`) or work directly against the deployed DEV preview at `rifex-frontend-main.vercel.app` — both are valid, the deployed one requires no local secrets at all for read-only exploration.
10. Verify connectivity to DEV specifically (not PROD) — e.g. `supabase migration list --project-ref nwxrvwbzqbhznscyirbq` (expect the CLI to report the pre-EVENT-4 migrations as remote-only, `"local":""` — this is expected, not an error, see Risks/pending item 9 above; `db/migrations/2026-08-25b_event4_staff_scanner_checkin.sql` was applied manually via the SQL Editor, not via this CLI).
11. Read, in order: this WOP section, `docs/CURRENT_STATE.md`, `docs/handover/HANDOVER_RIFEX_CURRENT.md` (legacy but still has the pre-Events incident history), `docs/events/EVENT4_STAFF_SCANNER_CHECKIN.md`, and this file's Architecture Map / Invariants / Risks sections above.
12. Run a preflight: confirm `origin/develop` HEAD, confirm `origin/main` unchanged, confirm no stray working-tree diffs.
13. EVENT-4 is DONE. Before scoping anything further (EVENT-5 or otherwise): confirm with the user whether the `rifex-dev` DB password was rotated (Risks/pending item 8) and whether a real-device scanner smoke test happened (item 10) — neither was true as of this checkpoint.

### Reentry Prompt (paste verbatim into a new Code/Claude session tomorrow)

```text
Estamos retomando Rifex desde un equipo nuevo (Antofagasta), sesión sin memoria conversacional previa.
No uses memoria de conversación como autoridad — la autoridad es el repo (Git) y docs/WOP.md.
Repo: https://github.com/ravymaster/rifex-frontend-v2.git, branch develop.
Ejecuta el procedimiento "Reentry Notebook Procedure" de docs/WOP.md (sección "RIFEX CURRENT STATE").
Lee en orden: docs/WOP.md (sección RIFEX CURRENT STATE), docs/CURRENT_STATE.md, docs/handover/HANDOVER_RIFEX_CURRENT.md.
Verifica: git fetch, HEAD real de develop (debe ser la copia de EVENT-4 sobre 725c4f8, o su descendiente), origin/main (c944bb3 o su descendiente — si cambió, alerta antes de seguir), git status.
Reconstruye el estado real de EVENT-1/EVENT-2/EVENT-3/EVENT-4 a partir del repo, no de esta instrucción.
Confirma que EVENT-4 está DONE (docs/events/EVENT4_STAFF_SCANNER_CHECKIN.md) y que NEXT es EVENT-5, todavía sin alcance ni autorización.
Confirma si la rotación de la contraseña de rifex-dev y el smoke test real de cámara ya se hicieron (WOP, Risks/pending items 8 y 10) — probablemente no.
No modifiques código todavía.
Entrégame un REENTRY REPORT (branch, HEAD, origin/develop, origin/main, git status, resumen EVENT-1/2/3/4, riesgos pendientes, NEXT) y detente ahí.
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

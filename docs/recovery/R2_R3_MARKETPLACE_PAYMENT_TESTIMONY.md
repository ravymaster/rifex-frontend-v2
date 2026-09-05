# R2/R3 Marketplace Payment Testimony And Code Evidence

This document records a user testimony about a historical production payment failure, and compares it against the actual content of the three preserved recovery/hardening diffs. It does not implement anything, does not adopt the recovery branch, and does not certify R2 or R3. Status of every claim below is `UNVERIFIED` unless explicitly marked otherwise.

## Testimony Of The User — UNVERIFIED

The user reports the following, from memory of prior production use, not from new evidence gathered in this audit:

- Rifex processed real (non-sandbox) payments through the user's own Mercado Pago account.
- Mercado Pago blocked self-purchase (the same admin/owner account could not buy numbers from its own raffle). Using a second, different real MP account, the purchase succeeded: the number was marked as paid and a confirmation email was sent.
- The seller connection flow ("Conectar tu MP") worked through the authentication step: OAuth redirected to MP, the user logged in, returned to the backend, and the button changed to "Conectado"; the raffle was created under that seller user.
- When a different buyer account attempted to pay for a number of that seller-connected raffle, the payment failed with an error resembling "no se puede transaccionar el pago" (cannot process/transact the payment).
- The user reports that, after that failure, multiple ad-hoc changes were made to payment-related code trying to fix it, and suspects the code may have been left in an inconsistent or broken state as a result ("le metimos mucha mano... quizás dejamos como se dice la caga").
- Winner notification worked via email: at purchase time, the buyer filled a form with name and email, and the system associated that data with the purchased numbers and the raffle ID, intended to allow notifying the winner later.

## Code Evidence Reviewed

Source: `git show origin/recovery/rifex-hardening-preserved:<path>`, read-only, no checkout, no merge, `main` untouched.

- `src/lib/mailer.js` (414 lines)
- `src/pages/api/admin/reconcile-payments.js` (393 lines)
- `src/pages/api/checkout/webhook.js` (429 lines)

## Finding A: None Of The 3 Preserved Files Touch Marketplace/OAuth Transaction Creation

`grep` across all three files for `application_fee`, `marketplace`, `collector_id`-based rejection handling, `scope`, `same account`/self-payment guards, and MP error codes returns no matches beyond a `collector_id` read used only as a hint for which seller token to try when *fetching* an existing payment (`fetchPayment()` in both `webhook.js` and `reconcile-payments.js`). None of the three files *create* a Mercado Pago preference or set `application_fee`/`marketplace_fee`.

`CONFIRMED`: the testimony's described failure point (a transaction rejected during payment/preference creation on a seller-connected marketplace raffle) is not addressed by any code in these three files. If the testimony is accurate, the relevant code lives elsewhere.

## Finding B: `application_fee`/`marketplace_fee` Logic Lives In `src/pages/api/checkout/mp.js` (Already In `main`, Outside This Diff Set)

Read-only observation of already-merged `main` code, made while tracing where marketplace fee logic actually lives (not a recovery-branch file, so unaffected by any recovery-adoption decision):

`src/pages/api/checkout/mp.js:180` contains:

```js
// ❌ NO enviar marketplace_fee aquí (solo para cuentas Marketplace Partner)
```

`CONFIRMED` by direct reading: the currently active preference-creation endpoint deliberately does **not** send `marketplace_fee`, with a comment stating it is only valid for Mercado Pago "Marketplace Partner" certified accounts. This is consistent with the testimony's described symptom: Mercado Pago rejects `application_fee`/`marketplace_fee` usage from accounts not certified as a Marketplace application, which produces exactly the class of error described ("no se puede transaccionar el pago"). The old, superseded `src/pages/api/checkout/index.js` content that ended up copy-pasted into the currently broken `/checkout` page (see `docs/audits/EXECUTION_ENVIRONMENT_AUDIT.md`, Finding 6) did include `application_fee: rifexFee` unconditionally, without any Marketplace Partner certification check.

`INFERRED, NOT CONFIRMED`: this is a plausible root cause matching the testimony, but it was not reproduced against live Mercado Pago in this audit and is not the code path assigned to R4. Full certification of this hypothesis is out of scope for R2/R3 as currently defined and would need explicit design work.

## Finding C: A Concrete, Reproducible Bug In `reconcile-payments.js` — Supports The "Quedó A Medio Terminar" Suspicion

`src/pages/api/admin/reconcile-payments.js`, handler, `since` filter path:

```js
const q = supabase
  .from("payments")
  .select("mp_payment_id")
  .in("status", ["pending", "in_process"])
  .order("mp_payment_id", { ascending: false })
  .limit(Math.min(200, Number(limit) || 20));
if (since) q.gte("updated_at", since);
const { data } = await q;
```

Two independent, `CONFIRMED` problems:

1. `q.gte("updated_at", since)` returns a new query-builder object that is never reassigned back to `q` (`q = q.gte(...)` was not written). The `since` filter is silently discarded regardless of whether it is provided; `await q` always executes the query without it.
2. Even if reassigned correctly, `public.payments` has no `updated_at` column (`CONFIRMED` against the real schema recovered from the Supabase backup — see prior audit turn in this session; columns are `id, mp_payment_id, status, collector_id, external_reference, preference_id, amount, currency, payer_email, raw, created_at, purchase_id, status_detail, emailed_buyer, emailed_creator, raffle_id, buyer_email, buyer_name, amount_cents, numbers, live_mode, via`). The filter would fail against the real database even if it were wired correctly.

This is concrete, code-level evidence of an unfinished/inconsistent edit — it matches the user's own suspicion that ad-hoc changes left something broken, though narrowly: it only affects the optional `since` parameter of the admin reconciliation endpoint, not the core approve/upsert/email flow, which reads as internally consistent.

## Finding D: Winner-Notification Email Function Not Present In These 3 Files

`src/lib/mailer.js` exports `sendEmail`, `sendBuyerApprovedEmail` (purchase confirmation to buyer), and `sendCreatorSaleEmail` (sale notification to creator). No `sendWinnerEmail`/equivalent exists in this file. The testimony's described data-capture step (buyer name/email tied to purchased numbers and raffle ID) is consistent with the `public.raffle_results` table and `purchases.buyer_name`/`buyer_email` columns already confirmed present in the database schema (prior audit turn). Whether winner-notification sending code exists somewhere else in the repository (outside these 3 files) was not checked here — `UNKNOWN`, not `NOT IMPLEMENTED`.

## Summary Table

| Testimony Element | Code Evidence In The 3 Preserved Diffs |
|---|---|
| Self-purchase blocked by MP | Not addressed in these 3 files (would be an MP platform-side rule, not app code) |
| Seller OAuth connect worked to "Conectado" | Not in scope of these 3 files (lives in `src/pages/api/mp/oauth/*`, already in `main`, not reviewed here) |
| Buyer payment on seller-connected raffle failed ("no se puede transaccionar el pago") | Not addressed by these 3 files; plausible root cause found in already-merged `main` code (`mp.js` marketplace_fee comment), `INFERRED` not `CONFIRMED` |
| "Le metimos mucha mano... quizás quedó la caga" | `CONFIRMED` one concrete broken/discarded filter in `reconcile-payments.js` (Finding C); rest of the 3 files reads as internally consistent |
| Winner notification via buyer-submitted name/email | Data model consistent (DB schema); sending function not found within these 3 files, `UNKNOWN` beyond that |

## Scope And Limits

This document does not authorize adopting `recovery/rifex-hardening-preserved` into `main`, does not certify R2 (Webhook) or R3 (Technical Reconciliation), and does not fix Finding C. It is input evidence for a future, explicitly authorized R2/R3 Architecture Audit and Sprint, per `docs/recovery/RECOVERY_PLAN.md`.

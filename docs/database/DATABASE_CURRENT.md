# Database Current State

This document consolidates evidence from repository docs, snapshots, migrations, SQL, code queries, HEAD, working tree diffs, and safe backup inspection.

It does not expose backup rows, personal data, or secret values. It does not make the backup part of Git baseline.

## Evidence Sources

| Source | Status |
|---|---|
| `docs/DB_SCHEMA.md` | CONFIRMED, partially contradictory |
| `docs/STATUS.md` | CONFIRMED, partially contradictory |
| `db/README_DB.md` | CONFIRMED, partial |
| `db/db/schema_snapshot.json` | CONFIRMED file present |
| `db/migrations/2025-09-18_rls_trigger_emails.sql` | CONFIRMED |
| `db/db/migrations/20250911-1200-payments-link-purchases.sql` | CONFIRMED |
| `sql/001_raffle_results.sql` | CONFIRMED |
| Code Supabase queries | CONFIRMED |
| PostgreSQL backup | CONFIRMED sensitive evidence |
| Remote DB | UNKNOWN |

## Confirmed Tables And Objects

| Object | Evidence | Status |
|---|---|---|
| `raffles` | Docs/code/backup | CONFIRMED |
| `tickets` | Docs/code/backup | CONFIRMED |
| `purchases` | Docs/code/backup | CONFIRMED |
| `payments` | Docs/code/backup | CONFIRMED |
| `merchant_gateways` | Docs/code/backup | CONFIRMED |
| `mp_accounts` | Code/backup | CONFIRMED |
| `mp_oauth_state` | Code/backup | CONFIRMED |
| `bank_accounts` | Code/backup | CONFIRMED |
| `users_profile` | Code/backup | CONFIRMED |
| `raffle_results` | SQL/code/backup | CONFIRMED |
| `email_logs` | Working tree/backup | CONFIRMED |
| `webhook_events` | Working tree/backup | CONFIRMED |
| `rifas`, `rifa_tickets` | Docs/code/backup | CONFIRMED legacy |
| `raffles_compat`, `tickets_compat` | Code queries | UNVERIFIED |

## Working Tree Requirements

| Requirement | Source | Baseline Status |
|---|---|---|
| `email_logs` table | `src/lib/mailer.js` | Not demonstrated by HEAD docs |
| `webhook_events` table | webhook/reconcile diffs | Not demonstrated by HEAD docs |
| `payments.live_mode` | webhook/reconcile diffs | Migration not demonstrated in baseline |
| Fee metadata | reconcile/mailer diffs | Contract not consolidated |

## RLS, Triggers, Functions

Migration and backup evidence show RLS policies, triggers, and functions including creator defaults and ownership-related rules. Effectiveness against the running DB is `UNVERIFIED`.

## Contradictions

| Area | Contradiction |
|---|---|
| Ticket status | `available/pending/sold` vs `available/reserved/paid` |
| Purchase status | Multiple incompatible status sets across docs/code |
| Payment linkage | `payments` relation to `purchases` differs by document/migration |
| `mp_payment_id` | Type differs across evidence |
| Legacy model | `raffles/tickets` and `rifas/rifa_tickets` coexist |

## Backup Classification

| Property | Classification |
|---|---|
| Type | PostgreSQL gzip dump |
| Contains schema | CONFIRMED |
| Contains data | CONFIRMED by `COPY` presence |
| Sensitive | CONFIRMED |
| Git baseline | Not included |
| Authority | Evidence source, not absolute authority |

## Limitations

- No Supabase remote connection was made.
- No migrations were executed.
- No SQL was changed.
- No backup data rows were printed.
- No functional verification was performed.

## Alignment A5 Recovery Contract

Clean install DB reproducibility for the recovery line is `PARTIAL`.

| Object | Status |
|---|---|
| `email_logs` | Required by R1; migration not evidenced |
| `webhook_events` | Shared by R2/R3; migration not evidenced |
| `payments.live_mode` | Required by R2/R3; migration not evidenced |
| `payments.mp_payment_id` | Partially covered by versioned migrations |
| `purchase_id` | Partially covered by versioned migrations |
| states | CONTRADICTORY |

The backup can guide reconstruction but does not replace reproducible migrations.

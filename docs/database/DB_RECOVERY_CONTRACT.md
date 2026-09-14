# DB Recovery Contract

This document defines the target database recovery contract conceptually. It contains no SQL, executes no migration and does not inspect or expose backup data.

## Recovery Principles

- Migrations are versioned and reproducible.
- Clean install must create required objects without relying on local backup.
- Compatibility boundaries preserve legacy data while canonical contracts are introduced.
- Backfills are explicit and reversible where possible.
- Rollback is documented per migration or recovery unit.
- Validation includes schema, constraints, seed/fixture behavior and application contract tests.
- The backup is sensitive evidence, not authority and not a migration.

## Required Objects And Contracts

| Item | Objective Requirement | HEAD Evidence | Working Tree Evidence | Backup Evidence | Unknown | Implementation Pending |
|---|---|---|---|---|---|---|
| email_logs | audit/dedup support for mail | not demonstrated in HEAD mailer | required by mailer diff | confirmed existence | exact current remote schema | yes |
| webhook_events | validated event/outcome log | not demonstrated in HEAD webhook | required by webhook/reconcile diffs | confirmed existence | exact constraints | yes |
| payments.live_mode | separate live/sandbox evidence | not consolidated | required by diffs | confirmed/indicated by evidence | remote status | yes |
| payments.mp_payment_id | provider payment identity | partial migration evidence | used by payment flows | confirmed/indicated | type consistency | yes |
| purchase_id | link payment/purchase/ticket state | partial migration evidence | used by diffs | confirmed/indicated | nullability/fks | yes |
| raffle_results | one winner per raffle | SQL file present | winner route uses it | confirmed | exact production constraints | yes |
| canonical states | raffle/ticket/purchase/payment normalized | contradictory | diffs use pending/sold/approved | contradictory/legacy evidence | remote values | yes |
| constraints | uniqueness, ownership, valid transitions | partial | required for certification | partial evidence | exact set | yes |
| legacy aliases | explicit mappers only | present in UI/docs | present in recovery flows | present | production dependence | yes |

## Migration Gate

A future DB Recovery Sprint must prove clean install, migration ordering, rollback plan, constraints, canonical state mapping, compatibility behavior and no secret/PII exposure in docs or logs.

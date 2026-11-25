# Data Contract Ledger

This ledger records observed contracts from HEAD, current working tree recovery/hardening diffs, database docs, migrations, SQL and classified backup evidence. It does not expose backup data.

## Contract Summary

| Contract | Evidence Layer | Classification |
|---|---|---|
| raffle | HEAD, docs, backup evidence | CONTRADICTORY |
| ticket | HEAD, docs, backup evidence | CONTRADICTORY |
| purchase | HEAD, docs, backup evidence | CONTRADICTORY |
| payment | HEAD, migrations, working tree | PARTIAL |
| merchant gateway | HEAD, snapshot, OAuth routes | FRAGMENTED |
| OAuth state | HEAD | PARTIAL |
| email log | working tree and backup evidence | NOT REPRODUCIBLE |
| webhook event | working tree and backup evidence | NOT REPRODUCIBLE |
| winner | HEAD SQL/code | PARTIAL |

## Raffle

| Field | Evidence |
|---|---|
| Sources | `src/pages/api/rifas/*`, `src/pages/rifas/[id].jsx`, `db/db/schema_snapshot.json`, docs, backup classification |
| Observed fields | `id`, `title`, `price_cents`, `total_numbers`, `creator_id`, `creator_email`, `status`, `plan`, `theme`, `prize_type`, `prize_amount_cents`, `payout_method`, `delivery_method`, `prize_photos`, `start_date`, `end_date`, `created_at` |
| Types | `id` uuid; `title` text; `price_cents` integer; `total_numbers` integer; other types partially evidenced |
| Known nullability | snapshot requires `id`, `title`, `price_cents`, `total_numbers`; others UNKNOWN |
| States | `draft`, `active`, `closed`, `deleted`; legacy `activa` observed |
| IDs | raffle id used by tickets, purchases, payments, winner |
| Relations | tickets by `raffle_id`; purchases by `raffle_id`; winner by `raffle_id`; merchant via creator |
| Timestamps | `created_at`, `start_date`, `end_date` |
| Money units | `price_cents`, `prize_amount_cents` |
| Legacy aliases | `rifas`, `raffles_compat`, Spanish field names in UI mapper |
| Writers | `POST /api/rifas`, `PATCH /api/rifas/[id]`, `POST /api/rifas/delete` |
| Readers | public list/detail, panel, checkout, winner, webhook/reconcile |
| Input shape | create body plus optional client identity headers; patch limited fields |
| Output shape | `{ok,data}`, `{ok,id,data}`, list items |
| Contradictions | English/Spanish model, status names, owner source |
| Reproducibility | PARTIAL |

## Ticket

| Field | Evidence |
|---|---|
| Sources | checkout, release, confirm, webhook, winner, `rifas/[id]`, DB docs |
| Observed fields | `id`, `raffle_id`, `number`, `status`, `purchase_id`, `hold_until`, `payment_ref`, `created_at` |
| Types | `raffle_id` uuid; `number` integer; `status` text; other types partially evidenced |
| Known nullability | UNKNOWN except status/number usage requirements |
| States | `available`, `free`, `pending`, `sold`, legacy `reserved`, `paid` |
| IDs | ticket row id, raffle id, purchase id |
| Relations | belongs to raffle; may reference purchase |
| Timestamps | `hold_until`, `created_at` |
| Money units | none |
| Legacy aliases | `rifa_tickets`, `tickets_compat`, `num` |
| Writers | checkout reservation, confirm, webhook, reconcile, release, delete |
| Readers | detail page, panel, winner, ticket endpoint |
| Input shape | numbers array from buyer/client |
| Output shape | ticket arrays |
| Contradictions | status aliases and old/new table coexistence |
| Reproducibility | PARTIAL |

## Purchase

| Field | Evidence |
|---|---|
| Sources | checkout, confirm, release, webhook/reconcile, snapshot |
| Observed fields | `id`, `raffle_id`, `buyer_email`, `buyer_name`, `mp_payment_id`, `mp_preference_id`, `status`, `numbers`, `holds_until`, `paid_at`, `accepted_terms`, `terms_version`, `accepted_terms_at`, `created_at` |
| Types | `id` uuid; `numbers` integer array; `status` text; other types partially evidenced |
| Known nullability | snapshot requires `id`, `status`, `numbers`; others partially nullable |
| States | `initiated`, `pending_payment`, `approved`, `paid`, `failed`, `expired` |
| IDs | purchase id, raffle id, MP IDs |
| Relations | belongs to raffle; linked by tickets and payments |
| Timestamps | `created_at`, `holds_until`, `paid_at`, `accepted_terms_at` |
| Money units | none directly |
| Legacy aliases | none confirmed |
| Writers | checkout, confirm, release, webhook, reconcile |
| Readers | webhook/reconcile, winner |
| Input shape | buyer form and MP fallback |
| Output shape | purchase id and status |
| Contradictions | state set varies across routes and docs |
| Reproducibility | PARTIAL |

## Payment

| Field | Evidence |
|---|---|
| Sources | confirm, webhook, reconcile, migrations, snapshot, docs |
| Observed fields | `id`, `mp_payment_id`, `status`, `status_detail`, `purchase_id`, `raffle_id`, `buyer_email`, `buyer_name`, `numbers`, `amount_cents`, `live_mode`, `via`, `emailed_buyer`, `emailed_creator`, `created_at`, older `amount`, `currency`, `payer_email`, `raw` |
| Types | `mp_payment_id` bigint in old snapshot, text in migrations/working tree; `amount_cents` integer; `live_mode` boolean required by recovery |
| Known nullability | partially evidenced |
| States | MP statuses such as `approved`, `pending`, `in_process`, `rejected` |
| IDs | MP payment id, purchase id, raffle id |
| Relations | purchase relation migration partially evidenced |
| Timestamps | `created_at`, updated timestamp referenced in queries but baseline status UNKNOWN |
| Money units | cents for recovery fields; old `amount` numeric |
| Legacy aliases | old raw payment shape |
| Writers | confirm, webhook, reconcile |
| Readers | reconcile, email idempotency |
| Input shape | MP API response and internal references |
| Output shape | status/result |
| Contradictions | `mp_payment_id` type drift; `live_mode` migration not demonstrated |
| Reproducibility | PARTIAL |

## Merchant Gateway

| Field | Evidence |
|---|---|
| Sources | merchant MP routes, OAuth routes, status/disconnect, snapshot |
| Observed fields | `id`, `user_id`, `provider`, `public_key`, `access_token`, `mp_access_token`, `mp_refresh_token`, `mp_user_id`, `linked_email`, `mp_public_key`, `webhook_secret`, `live_mode`, `status`, `scope`, `expires_at`, `revoked_at`, `created_at`, `updated_at` |
| Types | `id` uuid; `user_id` uuid; token/status fields text; booleans/timestamps partially evidenced |
| Known nullability | snapshot requires `id`, `provider`, `status`; many credential fields nullable |
| States | `not_started`, `in_progress`, `connected`, `not_connected` |
| IDs | user id and provider unique pair |
| Relations | user/creator owns gateway |
| Timestamps | `created_at`, `updated_at`, `expires_at`, `revoked_at` |
| Money units | none |
| Legacy aliases | `mp_accounts` parallel source |
| Writers | merchant save, OAuth callback, disconnect, dev upsert |
| Readers | checkout, status, webhook, reconcile |
| Input shape | OAuth token response or manual public/access token |
| Output shape | gateway row/status |
| Contradictions | `access_token` and `mp_access_token`; `mp_accounts` parallel |
| Reproducibility | PARTIAL |

## OAuth State

| Field | Evidence |
|---|---|
| Sources | `mp/oauth/start`, `mp/oauth/callback` |
| Observed fields | `id`, `code_verifier`, `creator_email`, `uid`, `created_at` |
| Types | text and timestamp inferred from usage |
| Known nullability | UNKNOWN |
| States | active until callback or cleanup |
| IDs | state id |
| Relations | uid should bind creator |
| Timestamps | `created_at` |
| Money units | none |
| Legacy aliases | none |
| Writers | OAuth start, callback cleanup |
| Readers | callback |
| Input shape | query `uid,email`; MP `code,state` |
| Output shape | redirect |
| Contradictions | uid source is query-controlled |
| Reproducibility | PARTIAL |

## Email Log

| Field | Evidence |
|---|---|
| Sources | working tree `src/lib/mailer.js`, classified backup evidence |
| Observed fields | `provider`, `status`, `message_key`, `resend_id`, `to_list`, `bcc_list`, `subject`, `html`, `text`, `headers`, `meta`, `error`, `created_at` implied by dedup |
| Types | UNKNOWN for DB; arrays/json/text inferred from insert |
| Known nullability | UNKNOWN |
| States | `attempt`, `sent`, `error`, `skipped` |
| IDs | `message_key`, `resend_id` |
| Relations | payment metadata only |
| Timestamps | `created_at` expected |
| Money units | none |
| Legacy aliases | none |
| Writers | working tree mailer |
| Readers | working tree dedup |
| Input shape | mailer send params |
| Output shape | audit rows |
| Contradictions | stores html/text while minimization is still proposed |
| Reproducibility | NOT DEMONSTRATED BY BASELINE MIGRATION |

## Webhook Event

| Field | Evidence |
|---|---|
| Sources | working tree webhook/reconcile, classified backup evidence |
| Observed fields | `provider`, `event_type`, `payment_id`, `live_mode`, `payload`, `headers` |
| Types | UNKNOWN for DB; JSON/text inferred from insert |
| Known nullability | UNKNOWN |
| States | provider event types and reconcile statuses |
| IDs | no unique event id demonstrated |
| Relations | payment id |
| Timestamps | reconcile writes timestamp inside headers; table timestamp UNKNOWN |
| Money units | none |
| Legacy aliases | none |
| Writers | working tree webhook and reconcile |
| Readers | UNKNOWN |
| Input shape | MP webhook or reconcile result |
| Output shape | event rows |
| Contradictions | payload logging before/after validation not finalized |
| Reproducibility | NOT DEMONSTRATED BY BASELINE MIGRATION |

## Winner

| Field | Evidence |
|---|---|
| Sources | `sql/001_raffle_results.sql`, `api/raffles/winner.js` |
| Observed fields | `raffle_id`, `number`, `buyer_email`, `buyer_name`, `purchase_id`, `created_at` |
| Types | `raffle_id` uuid; `number` int; buyer fields text; purchase id uuid; timestamp |
| Known nullability | `raffle_id` primary key; `number` not null |
| States | result absent or present |
| IDs | raffle id primary key, purchase id |
| Relations | raffle and purchase logical relation |
| Timestamps | `created_at` default now |
| Money units | none |
| Legacy aliases | none |
| Writers | winner route when `ensure=1` |
| Readers | raffle detail |
| Input shape | query `rid`, `ensure` |
| Output shape | `{ok,winner,ensured}` |
| Contradictions | public writer; random/audit policy undefined |
| Reproducibility | PARTIAL |

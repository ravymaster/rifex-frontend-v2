# Domain Model

This document describes the observable domain. It does not silently resolve contradictions.

## Actors

| Actor | Status | Evidence |
|---|---|---|
| Buyer | CONFIRMED | `buyer_email`, `buyer_name`, purchases, checkout |
| Creator/seller | CONFIRMED | raffle ownership, panel, MP OAuth |
| Admin/operator | CONFIRMED | reconciliation endpoint |
| Mercado Pago | CONFIRMED | checkout/payment/webhook/OAuth |
| Supabase | CONFIRMED | auth and DB |
| Resend | CONFIRMED | mailer |

## Entities

| Entity | Status | Notes |
|---|---|---|
| `raffles` | CONFIRMED | Main raffle table |
| `tickets` | CONFIRMED | Numbered units per raffle |
| `purchases` | CONFIRMED | Buyer/payment attempts |
| `payments` | CONFIRMED | Payment audit/reconciliation |
| `merchant_gateways` | CONFIRMED | Seller MP credentials |
| `mp_accounts` | CONFIRMED in code query | Relationship to `merchant_gateways` requires consolidation |
| `mp_oauth_state` | CONFIRMED | OAuth state/PKCE support |
| `raffle_results` | CONFIRMED | Winner storage |
| `email_logs` | CONFIRMED in backup/working tree | Not part of HEAD mailer |
| `webhook_events` | CONFIRMED in backup/working tree | Not part of HEAD webhook |
| `rifas`, `rifa_tickets` | CONFIRMED legacy | Compatibility/fallback |

## Relationships

- A raffle has many tickets.
- A purchase belongs to a raffle.
- Tickets can reference a purchase.
- Payments can reference purchases in newer migration evidence.
- Merchant gateway records belong to a seller/user.
- Raffle results belong to a raffle.

## Present Rules

| Rule | Evidence | Status |
|---|---|---|
| Tickets are generated 1..N when creating raffle | API code | CONFIRMED present, UNVERIFIED |
| Tickets are held during checkout | API code | CONFIRMED present, UNVERIFIED |
| Expired holds can be released | API code | CONFIRMED present, UNVERIFIED |
| Approved payment sells tickets | Confirm/webhook code | CONFIRMED present, UNVERIFIED |
| Failed payment releases tickets | Confirm/webhook code | CONFIRMED present, UNVERIFIED |
| Winner requires no available/pending tickets | Winner API | CONFIRMED present, UNVERIFIED |

## State Contradictions

| Area | Evidence A | Evidence B | Classification |
|---|---|---|---|
| Tickets | `available`, `pending`, `sold` in code/status doc | `available`, `reserved`, `paid` in DB schema doc | CONTRADICTORY |
| Purchases | `pending_payment`, `failed`, `expired` in code | `initiated`, `pending`, `approved`, `rejected`, `failure`, `cancelled` in docs | CONTRADICTORY |
| Payments | `mp_payment_id` type and linkage vary | Migrations and docs differ | CONTRADICTORY |

## HEAD vs Working Tree Rules

| Rule | HEAD | Working Tree |
|---|---|---|
| Email auditing/dedup | NOT IMPLEMENTED | CONFIRMED present, UNVERIFIED |
| `email_logs` dependency | NOT IMPLEMENTED in mailer | CONFIRMED required |
| Webhook strict HMAC | NOT IMPLEMENTED | CONFIRMED present, UNVERIFIED |
| `webhook_events` logging | NOT IMPLEMENTED | CONFIRMED required |
| Live/sandbox separation | NOT EVIDENCED as strict | CONFIRMED present, UNVERIFIED |
| Fee breakdown in creator email | NOT IMPLEMENTED | CONFIRMED present, UNVERIFIED |

Canonical target states are decided by Architecture Design AD2, but they are not migrated or implemented.

## Target States From Architecture Design

| Entity | Target States | Current/Legacy Evidence | Implementation Status |
|---|---|---|---|
| Raffles | `draft`, `active`, `closed`, `deleted` as soft-delete marker if supported | current evidence is partial and route-local | NOT IMPLEMENTED |
| Tickets | `available`, `held`, `sold` | current/legacy aliases include `free`, `pending`, `reserved`, `paid` | NOT IMPLEMENTED |
| Purchases | `created`, `pending_payment`, `approved`, `rejected`, `expired`, `cancelled` | current docs/code contain incompatible aliases | NOT IMPLEMENTED |
| Payments | provider state, evidence state, internal persisted state and processing outcome separated | `reconciled` and `ignored_sandbox` are technical outcomes, not target financial states | NOT IMPLEMENTED |
| Winner | one persisted result per raffle | current winner route can create on `ensure=1` | NOT IMPLEMENTED |

Target deferrals: raffle `archived/cancelled/reopened`, close-early policy, sold-out requirement, manual close, winner replacement/void and exact randomness policy.

## Ticket Release Target Rule

Durable ticket states:

```text
available
held
sold
```

`release` is not a state. It is the transition:

```text
held -> available
```

Release requires:

- expired hold;
- purchase without valid approval;
- expected ticket-to-purchase association;
- conditional update so a concurrently sold ticket is not released.

Legacy aliases:

| Legacy Alias | Target State |
|---|---|
| `free` | `available` |
| `pending` | `held` |
| `reserved` | `held` |
| `paid` | `sold` |

## Alignment A5 Domain Notes

Ticket, purchase and payment states remain `CONTRADICTORY` until a future design resolves them.

Fees are separated from technical reconciliation. Current fee defaults are experimental implementation evidence only; commercial fee policy is `UNKNOWN`.

## Architecture Audit Domain Notes

The Architecture Audit records domain authority as fragmented and state authority as critical. Canonical domain decisions are not selected here.

| Evidence | Document |
|---|---|
| Endpoint authority | `docs/architecture/ENDPOINT_AUTHORITY_LEDGER.md` |
| Data contracts | `docs/architecture/DATA_CONTRACT_LEDGER.md` |
| Design input AD-01 | `docs/architecture/ARCHITECTURE_DESIGN_INPUTS.md` |
| Design input AD-02 | `docs/architecture/ARCHITECTURE_DESIGN_INPUTS.md` |
| Target decisions AD-01 to AD-19 | `docs/architecture/ARCHITECTURE_DECISIONS.md` |

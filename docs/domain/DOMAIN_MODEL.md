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

Canonical states are not decided in A2.

## Alignment A5 Domain Notes

Ticket, purchase and payment states remain `CONTRADICTORY` until a future design resolves them.

Fees are separated from technical reconciliation. Current fee defaults are experimental implementation evidence only; commercial fee policy is `UNKNOWN`.

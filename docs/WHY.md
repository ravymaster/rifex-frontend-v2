# Why Rifex Exists

This document uses only repository evidence.

## Observable Problem

Rifex supports digital raffle workflows: creating raffles, assigning numbered tickets, reserving selected numbers, collecting payment through Mercado Pago, confirming payment, notifying participants, and selecting winners.

## Confirmed Actors

| Actor | Evidence |
|---|---|
| Buyer | Checkout, purchases, buyer email fields |
| Creator/seller | Panel, raffle ownership, seller Mercado Pago OAuth |
| Admin/operator | Admin reconciliation endpoint |
| Payment provider | Mercado Pago routes and SDK |
| Email provider | Resend mailer |
| Database/auth provider | Supabase clients and queries |

## Why Core Concepts Exist

| Concept | Observable Role |
|---|---|
| Raffles | Container for prize, price, ticket count, status, and ownership |
| Tickets | Numbered units selected and sold |
| Reservations | Temporary protection while checkout is in progress |
| Purchases | Buyer/payment attempt record |
| Payments | Mercado Pago reconciliation/audit record |
| Confirmations | Transition tickets and purchases after payment evidence |
| Webhooks | Provider-driven payment updates |
| Emails | Buyer/creator notification after payment events |

## Provider Roles

| Provider | Observable Role |
|---|---|
| Mercado Pago | Checkout preference, payment lookup, webhook, seller OAuth |
| Supabase | Auth, Postgres persistence, RLS-related objects |
| Resend | Email delivery |
| hCaptcha | Human verification in auth-related UI/API |

## Limits

Business strategy, markets, future pricing, future commissions, and commercial positioning are `UNKNOWN` unless documented in the repository. Working tree fee variables are implementation evidence, not a complete business plan.

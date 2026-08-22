# Transaction And Idempotency Design

This document defines guarantee-level design only. It contains no SQL and no implementation.

LOGICAL EFFECTIVELY-ONCE TRANSITIONS

## Operation Guarantees

| Operation | Transaction/RPC | Constraint | Conditional Update | Row Lock | Unique Key | Idempotency Record | Compensation | Retry |
|---|---|---|---|---|---|---|---|---|
| raffle + tickets | required or equivalent | raffle id + ticket number | optional | optional | required | optional | delete/abort partial unit | safe only before publish |
| purchase + holds | required or equivalent | ticket status and purchase link | required | recommended | purchase id; ticket occupancy | recommended | release holds if preference fails | safe with same intent key |
| apply payment | required | payment identity and ticket ownership | required | recommended | provider/live/payment id | required | retry/reconcile; no partial sale | required and safe |
| release holds | optional batch transaction | status/hold_until | required | optional | none beyond ticket id | optional | re-run batch | safe |
| winner | required | one result per raffle | required | recommended | raffle_id | required by unique result | return existing winner | safe |
| merchant disconnect | recommended | user/provider gateway | required | optional | user_id/provider | optional | restore previous active state only if recorded | controlled |
| reconciliation | required around apply command | payment identity | required | recommended | provider/live/payment id | required | retry with same evidence | safe |

## Identities

| Identity | Key |
|---|---|
| Payment identity | provider + live_mode + provider_payment_id |
| Event identity | provider + live_mode + provider_event_id, or documented fallback after provider contract review |
| Command identity | payment identity + target normalized status/version |
| Email identity | template + business object + recipient + purpose |
| Winner identity | raffle_id |

## Rules

- Payment identity is not event identity.
- Event identity is not command identity.
- Email sending is a side effect and must not be coupled to payment atomicity.
- Duplicate events can be acknowledged without repeating side effects.
- Replays that advance state, such as pending to approved, require a new valid command identity.
- Malicious replays fail closed or return duplicate outcome.
- Physical exactly-once is not promised.

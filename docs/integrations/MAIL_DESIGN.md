# Mail Design

BEST-EFFORT DELIVERY WITH DURABLE DEDUPLICATION WHEN AVAILABLE

MAIL CONTENT STORAGE:
MINIMIZE

This document defines target mail design. It does not certify the current mailer or working tree diff.

## Components

| Component | Responsibility |
|---|---|
| MailPort | provider-neutral send contract |
| Resend adapter | implements MailPort for Resend |
| NotificationService | selects template, identity, recipient and retry behavior |
| Templates | render approved messages without business authority |
| Audit store | records message identity, status, safe metadata and provider id |

## Message Identity

Email identity is: template + business object + recipient + purpose.

## States

| State | Meaning |
|---|---|
| pending | intent created but not accepted |
| sent | provider accepted or confirmed send |
| failed_retryable | timeout or transient error |
| failed_terminal | invalid recipient/template/provider rejection |
| skipped_duplicate | durable dedup found prior equivalent |

## Failure Cases

| Case | Behavior |
|---|---|
| provider accepted but response lost | retry risk is controlled by durable dedup/provider id when available |
| DB audit failed | degrade according to future policy; do not claim exactly-once |
| provider timeout | bounded retry |
| concurrent retry | message identity prevents duplicate logical side effect when audit works |
| duplicate email | audit as duplicate outcome |
| email not sent | visible failure state and retryability |

## PII And Tests

PII is minimized. Full HTML/text is not stored by default. Provider IDs may be stored when safe. Test gate requires template tests, Resend fake, dedup, retry, timeout, concurrency and degraded-mode cases.

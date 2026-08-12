# Security Current State

This document records observed security posture. It does not certify security.

## Authentication

Supabase authentication is present in UI and server flows. Some server routes validate Supabase bearer tokens. Other routes use temporary identity headers.

## Authorization And Ownership

| Area | Evidence | Status |
|---|---|---|
| Panel raffles | Supabase bearer token lookup | CONFIRMED |
| Raffle creation | `x-user-id` / `x-user-email` headers | CONFIRMED risk |
| MP disconnect | Temporary `x-user-id` header | CONFIRMED risk |
| Admin reconcile | `ADMIN_API_TOKEN` | CONFIRMED |
| RLS | Migration/backup evidence | CONFIRMED present, effectiveness UNVERIFIED |

## Service Role And Anon Key

Server routes use service-role keys for privileged Supabase operations. Browser clients use `NEXT_PUBLIC_SUPABASE_*`.

`NEXT_PUBLIC_*` exposure is expected by design.
No private secret exposure was evidenced.

## Mercado Pago

| Surface | HEAD | Working Tree |
|---|---|---|
| Checkout | CONFIRMED present | CONFIRMED present |
| Confirmation | CONFIRMED present | CONFIRMED present |
| Webhook signature | Flexible/warning behavior | Strict HMAC required |
| Live/sandbox separation | Not strict/evidenced | Strict separation present |
| OAuth seller flow | CONFIRMED | CONFIRMED |

Working tree HMAC and live/sandbox rules are not functionally verified.

## Environment Variables

Variable names are documented in README without values. Secrets must remain in ignored env files or deployment secret stores.

## Critical Risks

- Temporary identity headers can create authorization risk.
- Service-role use requires strict server-only control.
- Webhook behavior differs between HEAD and working tree.
- Backup is sensitive and must not enter Git baseline.
- Mutating endpoints require Architecture Design authority decisions before certification.

## Unverified

- Effective RLS coverage.
- End-to-end auth enforcement.
- Webhook delivery behavior.
- Secret configuration correctness.
- Production security readiness.

## Alignment A5 Security Notes

| Item | Status |
|---|---|
| Working tree HMAC | UNVERIFIED |
| Payload logging | PROPOSED treatment: MOVE_AFTER_VALIDATION |
| Email content storage | PROPOSED treatment: MINIMIZE |
| Admin token | Present, not security-certified |

Webhook payload logging before signature validation must be redesigned before certification. Email audit storage must avoid unnecessary full HTML/text persistence unless explicitly approved.

## Architecture Audit Security Notes

Architecture Audit closes with security posture still uncertified. Authorization, ownership, webhook validity, PII/logging and service-role boundaries are documented as design inputs, not as resolved implementation.

| Evidence | Document |
|---|---|
| Endpoint authorization ledger | `docs/architecture/ENDPOINT_AUTHORITY_LEDGER.md` |
| Architecture audit report | `docs/audits/ARCHITECTURE_AUDIT_REPORT.md` |
| Design inputs AD-03, AD-04, AD-05, AD-10, AD-13 | `docs/architecture/ARCHITECTURE_DESIGN_INPUTS.md` |

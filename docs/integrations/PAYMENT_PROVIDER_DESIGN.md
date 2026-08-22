# Payment Provider Design

This document defines the target payment provider boundary. It is design only.

## Authority

- Mercado Pago is the external source of payment evidence.
- Webhook is the primary evidence entrypoint.
- Reconciliation is repair/recovery entrypoint.
- Confirm is query/read-only or an entrypoint without its own sale rules.
- ApplyPaymentEvidence is the single internal payment authority.

## PaymentProviderPort

| Capability | Contract |
|---|---|
| create preference | normalized purchase/merchant DTO to preference result |
| lookup payment | provider payment id to normalized payment evidence |
| verify webhook | raw body/headers to verified event or fail-closed error |
| OAuth URL | create provider auth URL with state/PKCE |
| exchange code | code/verifier to token DTO |
| refresh/revoke | supported if provider contract confirms it |
| timeout | explicit per provider operation |
| retry | bounded and safe for idempotent operations |
| normalized errors | validation, provider, retryable, auth, mismatch |
| DTO mapping | provider raw fields stay outside domain rules |
| live/sandbox | carried in evidence and identity keys |
| token handling | redacted; storage/cipher detail DEFERRED |
| redaction | no tokens, secrets or raw sensitive payloads in logs |

## Scenarios

| Scenario | Target Behavior |
|---|---|
| webhook absent | reconciliation can lookup and apply valid evidence |
| reconcile first | ApplyPaymentEvidence applies once |
| webhook posterior | duplicate or state-advance handled idempotently |
| duplicate | no repeated side effects |
| pending -> approved | valid new command version advances state |
| payment/purchase mismatch | conflict; no reassignment silently |
| DB failure | atomic write prevents partial sale or records retryable outcome |
| mail failure | payment remains applied; notification retry/audit handles side effect |

Token storage/cifrado queda DEFERRED.

## Fees Boundary

```text
TECHNICAL PAYMENT RECONCILIATION
!=
COMMERCIAL FEES POLICY
```

- Reconciliation does not invent or apply a Rifex fee.
- Provider fee is technical observation.
- Plan is resolved server-side.
- Amounts use integer minor units.
- Percentages and rounding are DEFERRED.
- Experimental defaults are not authority.
- Emails do not show experimental fee calculations.
- Without approved commercial policy, a Rifex fee cannot be applied.

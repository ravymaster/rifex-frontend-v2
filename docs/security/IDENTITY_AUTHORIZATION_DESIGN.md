# Identity And Authorization Design

This is target security design. It is not implemented and does not certify current security.

## Authorities

| Subject | Target Authority |
|---|---|
| usuario/creator | Supabase session or JWT validated server-side |
| buyer publico | contact identity only; no privileged ownership |
| admin | server-side role contract; final role model DEFERRED |
| Mercado Pago | verified webhook signature or provider lookup evidence |
| OAuth callback | server-side state, single-use, TTL, PKCE and user binding |
| service role | allowed only after application auth/authz succeeds |
| RLS | defense in depth, not a replacement for application checks |

Never authoritative:

```text
x-user-id
x-user-email
uid por query
email por query
sellerUid por body/query
```

## Trust Boundaries

- Public input is untrusted until parsed and validated.
- Browser-visible identifiers do not grant ownership.
- Service-role clients are server-only and must be hidden behind use cases.
- Fail-closed is required when identity, ownership or provider validity cannot be established.

## Endpoint Mutation Policy

| Endpoint Class | Identity | Authorization | Ownership | Notes |
|---|---|---|---|---|
| crear rifa | Supabase session/JWT | authenticated creator | creator from server identity | no x-user headers as authority |
| editar rifa | Supabase session/JWT | creator or admin | raffle owner | service role only after guard |
| eliminar rifa | Supabase session/JWT | creator or admin | raffle owner | hard delete policy deferred |
| checkout | public buyer contact | raffle must be active | merchant from raffle | buyer not privileged owner |
| webhook | Mercado Pago evidence | valid signature/lookup | payment-purchase match | no user session required |
| reconcile | admin server-side | admin role/token contract | repair scope only | final admin role deferred |
| OAuth start | Supabase session/JWT | authenticated creator | user id stored in state | query uid/email not authority |
| OAuth callback | valid state | state single-use | stored user id | callback need not trust active session |
| OAuth disconnect | Supabase session/JWT | authenticated creator/admin | merchant gateway owner | conditional update |
| merchant save | Supabase session/JWT | authenticated creator | gateway owner | manual token handling sensitive |
| winner create | Supabase session/JWT | creator/admin | raffle owner | public ensure is not target |
| dev endpoints | disabled or admin-only | explicit environment guard | n/a | no production mutation without admin |

Admin role definitivo queda DEFERRED.

# Endpoint Authority Ledger

This ledger materializes Architecture Audit AA2. It records observed endpoints under `src/pages/api`. It does not certify security or functionality.

## Totals

| Metric | Total |
|---|---:|
| Endpoint files found | 31 |
| Read-only / validation / render-only | 12 |
| Mutating or mixed mutating | 19 |
| Dev endpoints | 4 |
| Legacy/misplaced/compat endpoints | 6 |
| CRITICAL risk | 15 |
| UNKNOWN risk | 3 |

## Ledger

| # | Method | Route | File | Type | Actor | Input / Output | Auth / Authorization / Ownership | Supabase / Service Role | Tables | Provider | Side effects | Idempotency | Caller | State | Risk |
|---:|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | POST | `/api/verify-captcha` | `src/pages/api/verify-captcha.js` | read-only validation | browser auth UI | token / `{ok}` | Local none; hCaptcha validates | No Supabase | none | hCaptcha | external validation | N/A | login/register/reset | HEAD | LOW |
| 2 | POST | `/api/admin/reconcile-payments` | `src/pages/api/admin/reconcile-payments.js` | mutating | admin/operator | body purchase/since/limit / results | `x-admin-token`; ownership N/A | inline client; service-role fallback | payments, tickets, purchases, raffles, merchant_gateways, webhook_events | Mercado Pago, Resend via mailer | DB updates, email, logs | PARTIAL via `mp_payment_id` | admin/manual | working tree | CRITICAL |
| 3 | ANY | `/api/auth/me` | `src/pages/api/auth/me.js` | read-only | user | cookies / user | Supabase cookie session | server client; no service role | auth | Supabase | cookie refresh possible | N/A | UI | HEAD | LOW |
| 4 | GET/POST | `/api/checkout/confirm` | `src/pages/api/checkout/confirm.js` | mutating | buyer return/UI | payment id / status | payment id plus MP lookup; no user ownership | inline client; service-role or anon | purchases, tickets | Mercado Pago | status and ticket updates | WEAK | checkout return, raffle detail | HEAD | CRITICAL |
| 5 | UNKNOWN | `/api/checkout/failure` | `src/pages/api/checkout/failure.js` | misplaced page | buyer | none / React page | UNKNOWN | none | none | none | render only | N/A | browser route maybe | HEAD | UNKNOWN |
| 6 | POST | `/api/checkout` | `src/pages/api/checkout/index.js` | mutating legacy | buyer | raffleId,numbers,buyerEmail / init_point | none | inline client; service role | raffles, purchases, tickets | Mercado Pago | purchase, reserve, preference | WEAK | legacy/UNKNOWN | HEAD | CRITICAL |
| 7 | POST | `/api/checkout/mp` | `src/pages/api/checkout/mp.js` | mutating | buyer | raffle_id,numbers,buyer data / init_point | public buyer; merchant resolved from raffle | inline client; service-role or anon | raffles, tickets, purchases, mp_accounts, merchant_gateways | Mercado Pago | purchase, hold, preference | WEAK | `src/pages/rifas/[id].jsx` | HEAD | CRITICAL |
| 8 | UNKNOWN | `/api/checkout/pending` | `src/pages/api/checkout/pending.js` | misplaced page | buyer | none / React page | UNKNOWN | none | none | none | render only | N/A | browser route maybe | HEAD | UNKNOWN |
| 9 | UNKNOWN | `/api/checkout/success` | `src/pages/api/checkout/success.js` | misplaced page + client confirm | buyer | URL params / React page | client calls confirm | none direct | none | indirect MP | triggers confirm from browser | WEAK | browser | HEAD | UNKNOWN |
| 10 | POST | `/api/checkout/webhook` | `src/pages/api/checkout/webhook.js` | mutating | Mercado Pago | raw webhook / `{ok,eventId}` | HMAC in working tree; no user | inline client; service-role or anon | webhook_events, merchant_gateways, purchases, payments, tickets, raffles | Mercado Pago, Resend | log, upsert, sale, emails | PARTIAL | MP webhook | working tree | CRITICAL |
| 11 | ANY | `/api/dev/env-check` | `src/pages/api/dev/env-check.js` | read-only dev | dev | none / env booleans | none | none | none | none | exposes config presence | N/A | dev | HEAD | MODERATE |
| 12 | GET | `/api/dev/test-email` | `src/pages/api/dev/test-email.js` | mutating dev | dev | token,to,type / send result | `DEV_TEST_EMAIL_TOKEN` | via mailer only in working tree | email_logs via working tree mailer | Resend | sends email | WEAK | dev | HEAD plus mailer working tree | MODERATE |
| 13 | GET | `/api/dev/test-upsert-mg` | `src/pages/api/dev/test-upsert-mg.js` | mutating dev | dev | uid query / upsert result | none beyond uid | inline service-role client | merchant_gateways | none | writes fake gateway | upsert | dev | HEAD | CRITICAL |
| 14 | ANY | `/api/dev/whoami` | `src/pages/api/dev/whoami.js` | read-only dev | dev/user | cookies / user,cookies_seen | Supabase cookies | server client | auth | Supabase | cookie observation | N/A | dev | HEAD | LOW |
| 15 | POST | `/api/email/confirm` | `src/pages/api/email/confirm.js` | mutating | UNKNOWN/dev | to,numbers,ids / ok | none | none | none | Resend | sends email | WEAK | UNKNOWN | HEAD | CRITICAL |
| 16 | ANY | `/api/merchant/mp/get` | `src/pages/api/merchant/mp/get.js` | read-only | authenticated creator | cookies / gateway | Supabase user owns own row | server anon client | merchant_gateways | Supabase | none | N/A | panel MP | HEAD | LOW |
| 17 | POST | `/api/merchant/mp/save` | `src/pages/api/merchant/mp/save.js` | mutating | authenticated creator | public_key,access_token / row | Supabase user owns own row | server anon client | merchant_gateways | Supabase | stores MP credentials | upsert | panel MP | HEAD | MODERATE |
| 18 | POST | `/api/mp/disconnect` | `src/pages/api/mp/disconnect.js` | mutating | creator | `x-user-id` / updated count | client header | inline service-role client | merchant_gateways | none | clears MP creds | repeatable | panel bancos | HEAD | CRITICAL |
| 19 | POST | `/api/mp/preference` | `src/pages/api/mp/preference.js` | mutating legacy | buyer/UNKNOWN | raffleId/sellerUid/amount / redirect | sellerUid body or legacy rifa owner | inline service-role client | rifas, merchant_gateways | Mercado Pago | creates preference | WEAK | UNKNOWN | HEAD | CRITICAL |
| 20 | GET | `/api/mp/status` | `src/pages/api/mp/status.js` | read-only | creator/panel | uid query / connected | uid query only | inline service-role or anon | merchant_gateways | none | none | N/A | panel bancos | HEAD | MODERATE |
| 21 | GET | `/api/mp/oauth/callback` | `src/pages/api/mp/oauth/callback.js` | mutating | MP redirect | code,state / redirect | state lookup | inline service-role or anon | mp_oauth_state, merchant_gateways | Mercado Pago | token exchange, upsert, cleanup | PARTIAL | MP OAuth | HEAD | MODERATE |
| 22 | GET | `/api/mp/oauth/start` | `src/pages/api/mp/oauth/start.js` | mutating | creator | uid,email query / redirect | uid/email query | inline service-role or anon | mp_oauth_state | Mercado Pago | state insert, cookie, redirect | PARTIAL | panel bancos | HEAD | CRITICAL |
| 23 | ANY | `/api/panel/ping` | `src/pages/api/panel/ping.js` | read-only | any | none / now | none | none | none | none | none | N/A | diagnostics | HEAD | LOW |
| 24 | GET | `/api/panel/raffles` | `src/pages/api/panel/raffles.js` | read-only | creator | bearer,status,q / items | bearer JWT and owner filter | inline service-role client | raffles, tickets | Supabase auth | none | N/A | panel | HEAD | LOW |
| 25 | ANY | `/api/profile/me` | `src/pages/api/profile/me.js` | read-only | user | cookies / profile | Supabase cookies | server client | users_profile | Supabase | none | N/A | UI | HEAD | LOW |
| 26 | GET | `/api/raffles/winner` | `src/pages/api/raffles/winner.js` | mutating when `ensure=1` | public/UNKNOWN | rid,ensure / winner | none | admin service-role client | raffle_results, tickets, purchases | none | creates winner | PARTIAL via PK | raffle detail | HEAD | CRITICAL |
| 27 | POST | `/api/rifas/delete` | `src/pages/api/rifas/delete.js` | mutating | creator/UNKNOWN | id,force / mode | none evidenced | inline service-role or anon | tickets, raffles | none | delete/update | WEAK | panel | HEAD | CRITICAL |
| 28 | GET/POST | `/api/rifas` | `src/pages/api/rifas/index.js` | mixed mutating | public/creator | query/body + x headers / items/id | POST trusts `x-user-*` | inline service-role or anon | raffles, tickets | none | create raffle and tickets | WEAK | rifas, crear-rifa | HEAD | CRITICAL |
| 29 | GET/PATCH | `/api/rifas/[id]` | `src/pages/api/rifas/[id]/index.js` | mixed mutating | public/creator | id/body / row | PATCH ownership not evidenced | inline service-role or anon | raffles | none | update raffle | WEAK | panel | HEAD | CRITICAL |
| 30 | GET | `/api/rifas/[id]/tickets` | `src/pages/api/rifas/[id]/tickets.js` | read-only | public | id / tickets | none | inline service-role client | tickets | none | none | N/A | UNKNOWN | HEAD | MODERATE |
| 31 | GET/POST | `/api/tickets/release-expired` | `src/pages/api/tickets/release-expired.js` | mutating | public/cron UNKNOWN | rid/body/query / counts | none | inline service-role or anon | purchases, tickets | none | releases holds | repeatable-ish | raffle detail/cron | HEAD | CRITICAL |

## Gate Notes

This ledger is sufficient for Architecture Design input. It does not authorize remediation.

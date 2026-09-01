# RIFEX BLOG PRIVATE — PROD PROMOTION (2026-09-01)

## Summary

`origin/main`/PROD advanced `b9a9798` → `2c39587`, a clean fast-forward push (no merge, no force). This promotes exactly one thing: the Blog feature stops being a public surface. Nothing else moved — no V4 Public Trust metadata infrastructure (`robots.txt`, `sitemap.xml`, `publicMetadata.js`, canonical/OG plumbing in `Layout.jsx`), no Identity/Policies work, no payment, webhook, Trust, Events, Campañas, or commission logic.

## Why a manual rebuild, not a cherry-pick

Blog Private was originally implemented on `develop` as commit `bf5745b`, on top of the already-merged V4 Public Trust A+B work (canonical/OG metadata plumbing, `robots.txt`/`sitemap.xml`, footer rewrite). PROD's `main` never received V4 A+B — it was intentionally kept DEV-only. A literal `git cherry-pick bf5745b` would have failed or applied nonsensically, since its diff context (e.g. `Layout.jsx`'s footer/Head block) assumes V4's rewritten file, which PROD doesn't have.

Instead, each of PROD's actual current files was diffed against `develop`'s pre-Blog-Private state to confirm zero unrelated drift (Blog's own files — `blog/index.js`, `blog/[slug].js`, `blog/compartir.js`, `blog/nueva.js`, `api/blog/index.js`, `api/blog/[slug]/index.js` — were byte-identical to `develop`'s pre-patch base, since the Blog feature itself predates V4 and was never touched by it). The same functional patch `bf5745b` applied to `develop` was then manually re-applied to PROD's real files. `Layout.jsx` required special care: only the single footer line (`<Link href="/blog">Blog</Link>`) was removed — none of V4's canonical/OG/`disableAutoMeta` additions, which don't exist on `main` and were never in scope for this promotion.

## Files changed (commit `2c39587`)

| File | Change |
|---|---|
| `src/components/Layout.jsx` | Removed 1 line: the footer `Blog` link. Nothing else touched. |
| `src/pages/blog/index.js` | Redirect anonymous visitors to `/login?next=/blog`; list fetch now sends `Authorization: Bearer <token>`; added `noindex, nofollow, noarchive`. |
| `src/pages/blog/[slug].js` | Redirect anonymous visitors to `/login?next=<path>`; detail fetch now sends the real session token; added `noindex, nofollow, noarchive`. |
| `src/pages/blog/compartir.js` | Added `noindex, nofollow, noarchive` (redirect-if-no-session logic already existed correctly). |
| `src/pages/blog/nueva.js` | Added `noindex, nofollow, noarchive` (redirect-if-no-session logic already existed correctly). |
| `src/pages/api/blog/index.js` | Now requires `Authorization: Bearer <token>` — `401 missing_auth` / `401 invalid_auth` without it. Was previously public. |
| `src/pages/api/blog/[slug]/index.js` | Same Bearer requirement added at the top; the previously-optional reaction-lookup branch was simplified since a valid viewer is now guaranteed by the auth gate. |
| `tests/blogPrivateProd.test.mjs` | New — 14 static-inspection tests scoped only to this promotion (no V4/A7 references). |

Nothing was deleted. All Blog pages and API routes continue to exist and function for authenticated users.

## Target state achieved (verified against Rodrigo's checklist)

- Blog fuera del footer público — confirmed, `Layout.jsx` diff is a single-line removal.
- Blog fuera de navbar pública — was already true (Blog was never in `navItems`).
- Blog fuera del menú autenticado — was already true (Blog was never added to PROD's `accountItems`; that experiment only ever existed on `develop`, in commit `202889a`, and was reverted there before this promotion).
- Blog fuera de sitemap — N/A: PROD has no `sitemap.xml` (a V4 A+B artifact, out of scope), so there's nothing that could list it.
- `noindex, nofollow, noarchive` — present on all 4 Blog pages, verified live in the raw HTML.
- APIs de Blog protegidas contra acceso anónimo — verified live: `GET /api/blog` and `GET /api/blog/:slug` both return `401 {"ok":false,"error":"missing_auth"}` anonymously.
- URL directa anónima redirige a login — client-side redirect confirmed present in source for all 4 pages (`router.push('/login?next=...')`).
- URL directa autenticada puede seguir funcionando — unchanged code path, same session-token mechanism already proven on `develop`.
- No eliminar páginas, APIs ni contenido — confirmed, nothing removed.

## Verification performed

- **Tests**: `tests/blogPrivateProd.test.mjs` — 14/14 pass.
- **Regression**: `node --test tests/*.test.mjs` — 440/441 pass. Sole failure: the pre-existing, previously-documented XLSX `writeBuffer` timing flake under maximum stress load (`tests/eventAnalyticsWorkbook.test.mjs`), unrelated to this change, not a regression.
- **Build**: `npm run build` — clean, no errors.
- **Scope self-audit**: `git diff --stat origin/main` on the promotion branch showed exactly the 8 files listed above; a targeted grep for `webhook|payment|mercadopago|mp_|comision|comisión|7%|trust_level|RIFEX_FEE` across the full diff returned zero matches.
- **PROD smoke (non-destructive, post-deploy)**:
  - `https://rifex.pro/` → `200`, footer HTML contains no `href="/blog"`.
  - `https://rifex.pro/blog` → `200` (SSR shell; client redirects), raw HTML contains `noindex, nofollow, noarchive`.
  - `https://rifex.pro/api/blog` → `401 {"ok":false,"error":"missing_auth"}`.
  - `https://rifex.pro/api/blog/test-slug` → `401 {"ok":false,"error":"missing_auth"}`.
  - `https://rifex.pro/eventos`, `/crear-colecta`, `/crear-evento`, `/login`, `/terminos`, `/planes` → all `200`, general site unaffected.
  - `POST`-only `https://rifex.pro/api/checkout/webhook` still rejects `GET` with `405` — sanity check that payment/webhook code is untouched.

## Deployment

- Vercel project `rifex-frontend-v2`, deployment `dpl_927Ng5m27YrPtP9deEhrLehLGXLV`, target Production, aliased to `rifex.pro` / `www.rifex.pro`.
- Deployed via the existing GitHub → Vercel auto-deploy integration on push to `main` — no manual `vercel deploy`.
- No PROD database migration was applied (none was needed — this is a code-only change).
- No real payment, webhook invocation, real email, or manual cron was performed during verification.

## Explicitly excluded from this promotion (remain `develop`-only)

- V4 Public Trust A+B in full (`robots.txt`, `sitemap.xml`, `publicMetadata.js`, canonical/OG metadata plumbing, `TrustBadge`/`TrustPopup`, the `/rifas` catalog-elimination decision, corporate policy pages, `/contacto`/`/reportar` functional forms).
- ETAPA 2 — Identidad Pública + Políticas (authorized to begin on `develop` immediately after this promotion, per Rodrigo's combined authorization — see `docs/WOP.md`).
- Argentina activation, MP Quality work, C6/reputation, Comunidad Rifex, onboarding progresivo — none in scope, none touched.

## Tag

`v2.3-rifex-prod-blog-private` on `main` at `2c39587`.

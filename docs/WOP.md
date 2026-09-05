# Rifex WOP

WOP defines the working operating protocol for Rifex. Its purpose is to keep the repository as the source of truth and prevent future work from assuming a state that has not been evidenced.

---

## RIFEX FINAL PUBLIC SURFACE CLOSURE (2026-09-05) — DEV only, autonomous mission

`origin/develop` advances from the RIFEX PRODUCT LANDINGS V1 commit (same day, later mission). Final closure of Rifex's public surface: consolidates `/eventos` as the single, definitive Eventos URL, retires Rifas from every unauthorized nav surface, closes the historical `client_redirect` auth-boundary debt on `/admin` and `/panel/eventos/*`, gives Inscripciones real weight on Home, and adds real social-media links to the footer — without touching Payment Engine, Mercado Pago, webhooks, commission, RLS, Supabase, or any product's business logic.

**`/eventos` consolidation + a real mid-mission product decision**: `/eventos` absorbs the full landing content that lived at `/soluciones/eventos` (hero/features/steps/use-cases/operational/security/FAQ/final-CTA — same audited content, nothing invented); `/soluciones/eventos` becomes a `308` permanent redirect to `/eventos` (`X-Robots-Tag: noindex, nofollow`), reclassified `LEGACY_REMOVED` — `308` instead of `307` because, unlike `/rifas`, a genuinely equivalent 1:1 content replacement exists. **Rodrigo explicitly requested, live during this mission, that the real published-events catalog** (`GET /api/events`, built in EVENT-1) that was originally going to sit below the landing with an elegant empty-state be **removed from the page** — his stated reason: no events are published yet and an empty-state adds no value today; re-integration is deferred to a future mission when real events exist to list. The `/api/events` endpoint and its data logic were not touched — only this page stopped consuming it. `/eventos` is now a purely static page (no `fetch`, no `useEffect`/`useState`), never near-empty: it always renders the complete landing.

**Rifas retired from unauthorized navigation**: removed from `accountItems` (authenticated account menu); a conditional "Cómo funcionan las Rifas" link was added to the authenticated footer only (`{user && <Link href="/soluciones/rifas">...}`), never visible to anonymous users, and its destination still gates via `ssr_redirect` regardless. Public navbar reduced to exactly `Eventos · Campañas · Inscripciones` — "Cómo funciona" removed (desktop + mobile). Rifas never appears in navbar, sitemap, or JSON-LD.

**`/wizard` — evidence-based decision, not assumption**: an Explore-agent audit of every real inbound reference across `src/` and `docs/` found the ONLY live link was `Layout.jsx`'s own navbar entry — everything else was doc/comment prose. Decision: keep the page alive (no delete, no redirect, no dangling internal links), remove it from the navbar, reclassify `PUBLIC_INDEXABLE` → `PUBLIC_NOINDEX` (`noindex`, out of `sitemap.xml`, `Disallow: /wizard` added to `robots.txt`).

**`/reglas-iniciativas-premio` privatized**: `PUBLIC_NOINDEX` → `PRIVATE_AUTHENTICATED`, `ssr_redirect` (new `getServerSideProps`, `getSupabaseServer`+`s.auth.getUser()`, redirect to `/login?next=/reglas-iniciativas-premio` for anonymous), `Layout` gains `noarchive`, `Disallow: /reglas-iniciativas-premio` added to `robots.txt`, removed from `sitemap.xml`. Content preserved verbatim for authenticated users — nothing deleted. The one public link that pointed there, in `/reembolsos.js`, was replaced with neutral non-linked copy — zero dead link, zero invented legal term. `/terminos-rifas.js`'s own separate historical link was deliberately left untouched, out of scope.

**`/admin` SSR authorization hardening**: previously client-side-only ("Verificando acceso…", a `useEffect` calling `/api/admin/me` with a Bearer token after Next.js already served the shell). New `getServerSideProps` reads session via `getSupabaseServer(ctx.req, ctx.res).auth.getUser()` (cookie-based, SSR-appropriate) and checks the exact same authority field already used by `resolveAdmin` (`src/lib/adminAuth.js`) — `user.app_metadata?.role !== "admin"` — deliberately never a second role system. Anonymous → `/login?next=/admin`; authenticated non-admin → `/` (safe denial); real admin → panel intact. The existing client-side Bearer-based re-validation stays untouched as the real per-action authority.

**`/panel/eventos/*` — closing historical `client_redirect` debt**: `/panel/eventos`, `/panel/eventos/[id]`, `/panel/eventos/[id]/scanner` — debt documented since original PSCG (2026-09-04) and reaffirmed out-of-scope in the INSCRIPCIONES SSR HARDENING addendum — now use the exact certified `ssr_redirect` pattern from `/panel/inscripciones/*`, with the two dynamic routes building `next` from a fixed literal prefix through `sanitizeNextPath`+`encodeURIComponent`. Zero changes to Events business logic (check-in, QR, staff, analytics) — only the SSR gate was added on top; every private fetch still sends its own `Authorization: Bearer` as the real ownership authority.

**Home**: hero eyebrow updated to "Eventos · Entradas digitales · Campañas · Inscripciones"; a 5th capability card ("Inscripciones y cupos", factual copy, "Gratis · QR" badge) added, linking to `/inscripciones` via `next/link` — the only clickable card in the grid, without disturbing the 4 existing ones.

**Footer — real social links**: new `src/lib/socialLinks.js` (`{ facebook, instagram, tiktok, whatsapp: <real URLs>, youtube: null, x: null }`) — `Layout.jsx` renders an icon `<a>` only when its value is truthy, structurally guaranteeing zero `href="#"`/fake placeholders; YouTube/X render nothing at all while `null`, extensible later without touching `Layout.jsx`. 4 inline-SVG circular icons (36×36, `aria-label`, `target="_blank" rel="noopener noreferrer"` on the 3 social networks, direct `wa.me` for WhatsApp), zero new npm dependency. Live-verified: exactly the 4 real URLs from the addendum, no YouTube/X icon rendered, zero horizontal overflow at 320/375/768/desktop (column layout below 640px, row above).

**Multi-UA no-cloaking (real server, port 3031, 5 User-Agents)**: the 3 public landings return `200` with byte-identical MD5; `/soluciones/eventos` returns an identical `308`; `/soluciones/rifas`, `/reglas-iniciativas-premio`, `/admin`, `/panel/eventos`, `/panel/eventos/[id]`, `/panel/eventos/[id]/scanner` all return an identical real `307` to `/login?next=...` with minimal bodies (18-79 bytes) — zero private-HTML leakage, zero cloaking in either direction, verified across every route touched by this mission.

**Tests**: `tests/finalPublicSurfaceClosure.test.mjs` (28 tests covering the mandate's 30 minimum scenarios, several combined). 5 pre-existing test files updated (not weakened) to reflect intentional product changes, each annotated citing this mission: `publicAudit.test.mjs`, `publicSurfaceFinalCleanup.test.mjs`, `authUxCrawler.test.mjs`, `inscripcionesSsrAuthBoundary.test.mjs`, `productLandingsV1.test.mjs`.

**Validation**: full regression `node --test 'tests/*.test.mjs'` — only the same pre-existing `eventAnalyticsWorkbook.test.mjs` XLSX timing flake tolerated, identical signature to every prior mission. Clean `npm run build` — `/eventos`, `/campanas`, `/inscripciones` compile static (`○`); every SSR-hardened/redirect route compiles dynamic (`ƒ`), compiler-level proof each `getServerSideProps` is real. Visual QA at 320/375/768/desktop (accessibility tree + text extraction + programmatic `scrollWidth`/overflow checks, since browser screenshots didn't composite in this session — same technique already documented in prior missions) found zero horizontal overflow anywhere touched.

**Status: DEV ONLY.** No PROD, no `main`, no migrations, no Supabase changes, no Payment Engine, no Trust backend, no business-logic change to any product. CSP left untouched (pending, documented, explicitly out of scope); performance not re-measured (explicitly out of scope). Full detail: `docs/public-surface/FINAL_PUBLIC_SURFACE_CLOSURE.md`, `docs/public-surface/PUBLIC_SURFACE_CLASSIFICATION_GUARD.md` (addendum), `docs/public-surface/PRODUCT_LANDINGS_V1.md` (superseded-note addendum). **Next step: eventual controlled PROD promotion, subject to explicit authorization — not yet started. Left certified in DEV for Rodrigo's visual review, per explicit instruction.**

---

## RIFEX PRODUCT LANDINGS V1 (2026-09-05) — DEV only, autonomous mission

`origin/develop` advances from `4a30814` ("RIFEX INSCRIPCIONES V1 FREE + FUTURE BILLING FOUNDATION — PROD PROMOTION" docs, `origin/main` unaffected — this mission never touches `main`, confirmed via fresh `git fetch` before writing any code). Fully autonomous DEV-only mission building four coherent product landings — Eventos, Campañas, Inscripciones (all `PUBLIC_INDEXABLE`), and Rifas (`PRIVATE_AUTHENTICATED`) — sharing one visual language (2026 clean/premium, white cards, soft borders, discrete shadows, numbered steps) without touching Payment Engine, Trust, webhooks, commission, or any product's business logic.

**Route audit before any code (per explicit instruction)**: confirmed via `find`/`grep` that `/eventos` is the real published-events catalog (`src/pages/eventos/index.jsx`) and must stay untouched; `/campanas` did not exist anywhere in the repo; `/inscripciones` already existed as a real `PUBLIC_INDEXABLE` landing from INSCRIPCIONES V1 and needed evolving in place, never duplicating; `/rifas` is the certified `LEGACY_REMOVED` redirect (old public catalog, `src/pages/rifas.js`) and stays untouched — a brand-new, differently-named route (`/soluciones/rifas`) was used for the private Rifas landing to avoid any conflict. Final URLs: `/soluciones/eventos` (new), `/campanas` (new), `/inscripciones` (evolved in place), `/soluciones/rifas` (new, private).

**Shared visual architecture**: `src/styles/productLanding.module.css` (one stylesheet, `--pl-accent` custom property set per page — turquoise/Eventos, green/Campañas, blue/Inscripciones, amber/Rifas, the one private product) + `src/components/product/ProductSections.jsx` (8 pure presentational components: Hero/FeatureGrid/Steps/UseCases/Operational/Security/Faq/FinalCta, zero business logic, zero fetch). `src/lib/productJsonLd.js` builds `Service`+`FAQPage` JSON-LD for the 3 public landings only — deliberately never on Rifas.

**Content audited against real code, nothing invented**: an Explore pass read the actual creation/checkout/panel/analytics source for Rifas, Eventos, and Campañas (ticket types, capacity enforcement, `event_staff` real per-event staff scanning via `eventStaffAuth.js`, the 5-sheet XLSX export, Colecta's suggested/free amounts and real downloadable QR, Rifa's automatic/manual draw and date-extension limits) before writing a single word of landing copy — every claimed feature traces to a real file/line. Inscripciones' landing was evolved (same route, same `PUBLIC_INDEXABLE` classification) to the same hero/features/steps/use-cases/operational/security/FAQ/final-CTA anatomy as the other two, still never mentioning Plus/Gold/future pricing (verified by a dedicated test that excludes code comments, since the file's own header comment documents that rule and would otherwise false-positive on itself).

**Rifas private landing — `ssr_redirect` from its first commit**: `src/pages/soluciones/rifas.jsx`'s `getServerSideProps` uses the exact certified pattern (`getSupabaseServer` + `s.auth.getUser()`, literal fixed redirect destination, never `ctx.query`) already used by `mis-iniciativas.jsx`/`difusion.jsx`. Live-verified against a real `next start` server on port 3021 with 5 User-Agents (default, browser, Googlebot, `facebookexternalhit`, TikTokBot): all 5 return an identical real `307`, 29-byte body, MD5-identical — zero cloaking, zero private-HTML leak (grepped the body for "Crear una rifa"/"Configura tu rifa"/"Extensión de fecha" — zero matches). The 3 public landings returned identical `200`s and byte-identical MD5 across the same 5 User-Agents. `npm run build` output shows `soluciones/rifas` as `ƒ` (dynamic) — compiler-level proof the SSR boundary is real, same as every prior SSR-hardening mission.

**Navigation**: `navItems` gains "Inscripciones" (new) and "Campañas" now points to `/campanas` (was `/wizard?modo=colecta`) — "Eventos" stays pointed at the real catalog, unchanged. Public footer's "Producto" column renamed "Soluciones", now linking the 3 landings (replacing the direct "Crear evento/campaña/inscripción" links — the create CTA lives inside each landing itself). `accountItems` (authenticated dropdown) gains "Rifas" → `/soluciones/rifas`. `/wizard` gains a third mode ("Quiero recibir inscripciones", real steps, CTA to `/crear-inscripcion`) — Rifas deliberately never added there.

**Real bug found and fixed during browser QA**: the hero stat-chips grid (`minmax(140px, 1fr)`) overflowed at 375px/320px viewports — 3 chips at 140px minimum plus gaps exceed the available width, and the global `overflow-x: hidden` clips instead of reflowing the content. Found programmatically (comparing individual elements' `scrollWidth` against `document.documentElement.clientWidth` — real screenshots didn't composite in this session, so QA relied on the accessibility tree, text extraction, and DOM overflow checks instead of visual inspection) — fixed to `minmax(96px, 1fr)`, re-verified at 320px/375px/768px/desktop across the 3 public landings, zero overflow.

**Environment note (not a code defect)**: the fresh git worktree's symlinked `node_modules` (pointing at the main repo's, sharing an identical lockfile) broke mid-mission when the main repo's own `node_modules/next` was externally emptied by an unrelated concurrent process outside this session — resolved by switching to a fully self-contained `npm ci` inside the mission's own worktree, independent of the main repo from that point on.

**Tests**: `tests/productLandingsV1.test.mjs` (41 new tests) covering the 25 required scenarios and more — PSCG classification of all 4 routes, absence of any auth boundary on the 3 public pages, the private page's real SSR redirect (checked against the function body only, since the file's own header comment documents "never `ctx.query`" and would otherwise false-positive), sitemap/robots correctness, metadata/canonical, exactly one `<h1>` per page (proved via `ProductHero` being the sole `<h1>`-rendering component in the shared module, plus exactly one `<ProductHero>` usage per page), valid Service+FAQPage JSON-LD with the FAQ genuinely rendered in HTML, footer/account-menu/wizard content, zero new 404 targets, a structural no-cloaking guard (no `User-Agent` branching in any of the 4 new/changed pages), zero Plus/Gold in Inscripciones, "Personal de acceso" backed by the real `eventStaffAuth.js`, and zero references to Payment Engine/Trust/webhooks/commission in any new file. Two pre-existing tests in `tests/publicSurfaceFinalCleanup.test.mjs` were updated (not weakened) to reflect the intentional, documented change of "Campañas"'s nav target from `/wizard?modo=colecta` to its own new landing.

**Validation**: 41/41 new tests + full regression `node --test 'tests/*.test.mjs'` → 834/835 (the same pre-existing `eventAnalyticsWorkbook.test.mjs` XLSX `writeBuffer` timing flake, identical signature, unrelated). Clean `npm run build` — `/soluciones/eventos`, `/campanas`, `/inscripciones` compile static (`○`); `/soluciones/rifas` compiles dynamic (`ƒ`). `origin/main` never referenced throughout.

**Status: DEV ONLY.** No PROD, no `main`, no migrations, no Supabase changes, no Payment Engine, no Trust backend, no business-logic change to any of the four products — presentation, navigation, and SEO only. Full detail: `docs/public-surface/PRODUCT_LANDINGS_V1.md`, `docs/public-surface/PUBLIC_SURFACE_CLASSIFICATION_GUARD.md` (addendum). **Next step: eventual controlled PROD promotion, subject to explicit authorization — not yet started.**

---

## RIFEX INSCRIPCIONES V1 — PRIVATE SSR AUTH BOUNDARY HARDENING (2026-09-04) — DEV only, surgical blocker fix

`origin/develop` advances from `5d17f8a` ("RIFEX INSCRIPCIONES V1 FREE + FUTURE BILLING FOUNDATION"). The prior mission's final report flagged one real blocker before PROD authorization: `/panel/inscripciones`, `/panel/inscripciones/[id]`, and `/panel/inscripciones/[id]/scanner` — all three classified `PRIVATE_AUTHENTICATED` — inherited the client-side-only auth boundary pattern from `/panel/eventos` (a `useEffect` that redirects anonymous users only *after* Next.js already served the private panel shell). Since Inscripciones is a brand-new module classified `PRIVATE_AUTHENTICATED` from its first commit, that historical debt should never have propagated into it.

**Fix**: all three pages now export `getServerSideProps` using the exact pattern already certified in `mis-iniciativas.jsx`/`crear-inscripcion.jsx` — `getSupabaseServer` + `s.auth.getUser()`, returning `{ redirect }` to `/login?next=...` for anonymous requests before the component ever renders. The two dynamic routes build `next` from a fixed literal prefix (`/panel/inscripciones/`) plus the route's `id`, run through `sanitizeNextPath` (`src/lib/countryPolicy.js`, the existing URL-based/origin-comparison sanitizer) and `encodeURIComponent` — structurally incapable of producing an off-origin redirect regardless of what `id` contains. `/crear-inscripcion` already had the correct boundary (session + `assertOnboardingComplete`, never `assertCreatorEligible`/`resolveCreationGate`) and was left untouched.

**Live adversarial evidence** (real Next.js dev server, `curl` with 5 User-Agents: default, browser, Googlebot, `facebookexternalhit`, TikTokBot): all 4 pages return a real `307`, 30–85 byte body, zero private markers (`Scanner`, `Descargar Excel`, `Asistieron`, `Pendientes`, `Editar`, `Inscritos`), byte-identical across every User-Agent — zero cloaking. Adversarial `id` values tested live: `..` gets normalized by Next.js's own router before reaching the page (redirects to `/panel`, the Inscripciones `getServerSideProps` never runs); a double-encoded `%2f%2fevil.com` still resolves to a `Location` starting literally with `/panel/inscripciones/` (never leaves the origin); a `%0d%0a` header-injection attempt is stripped by `sanitizeNextPath`'s existing control-character check, falling back to `/panel/inscripciones` with no `Set-Cookie` injected anywhere in the real response.

Authorization was never touched: ownership of an activity is still decided exclusively, server-side, by each `/api/inscripciones/[id]/*` endpoint (`organizer_id` comparison) and by `check_in_registration_participant` for check-in — this SSR boundary only proves a session exists. `/panel/eventos/*` deliberately kept its historical `client_redirect` pattern — out of scope for this mission by explicit instruction, documented, not fixed.

Diff is 4 files (103 insertions, 13 deletions) + 1 new test file (23 tests, all pass). Full regression: 788 tests, 787 pass; the sole failure is the same pre-existing XLSX stress-test timing flake, identical signature. Clean build — the 3 fixed pages flip from static (`○`) to dynamic (`ƒ`) in the build output, the compiler-level proof that `getServerSideProps` is now real. `origin/main` (PROD) not referenced. Full detail: `docs/inscripciones/INSCRIPCIONES_V1_ARCHITECTURE.md` ("Addendum — PRIVATE SSR AUTH BOUNDARY HARDENING"), `docs/public-surface/PUBLIC_SURFACE_CLASSIFICATION_GUARD.md`. **Next step**: eventual controlled PROD promotion, subject to explicit authorization — not yet started.

---

## RIFEX INSCRIPCIONES V1 FREE + FUTURE BILLING FOUNDATION (2026-09-04) — DEV only, autonomous mission

`origin/develop` advances from `4681770` ("RIFEX DIFUSIÓN V1.1 MULTIPRODUCTO", PROD `origin/main` unaffected). New native vertical, independent of Events/Rifas/Colectas: free-only activities (workshops, courses, community sessions) with public registration, individual QR confirmation, check-in scanner, organizer panel, and Excel export.

**Categorical product rule**: Inscripciones never charges the participant — never uses the organizer's Mercado Pago, `marketplace_fee`, commission, or Payment Engine. A case needing to charge a participant belongs to Eventos, never a paid variant of this.

**Critical onboarding rule**: lives outside progressive financial onboarding — uses only `assertOnboardingComplete` (TRUST-1), never `assertCreatorEligible`/`resolveCreationGate` (which require RUT/MP). Verified live against `rifex-dev`: an organizer with no Mercado Pago connected can create and operate an activity.

**Events-reuse audit completed before implementing**: QR generation/scanner/rate-limit/mailer/XLSX helpers classified REUSE DIRECT or ADAPT; Country Gate, `event_staff`, and ticket-type capacity triggers classified DO NOT REUSE, each with a documented reason (see `docs/inscripciones/INSCRIPCIONES_V1_ARCHITECTURE.md`).

**Schema**: `registration_activities`/`registration_participants`/`registration_checkins`/`registration_free_usage`, three atomic RPCs (`create_free_registration_activity` never accepts `plan`/`capacity` as parameters — hardcoded `'free'`/`50`; `register_for_activity` uses `for update` as the capacity-race authority; `check_in_registration_participant` is owner-only in V1). Monthly FREE quota (1 per calendar month per account, never rolling-30-days) enforced by an insert-only ledger whose `UNIQUE(organizer_id, period_key)` constraint is itself the concurrency authority.

**Live adversarial proof against `rifex-dev`** (not simulated): two simultaneous FREE-activity creations for the same organizer+month → exactly one succeeds; two simultaneous registrations for the last open slot of a `capacity=1` activity → exactly one succeeds, never overbooking; duplicate email (case-insensitive), nonexistent/draft activity, QR `UNIQUE` constraint, valid check-in, double check-in, cross-activity QR, and non-owner check-in attempt all verified against the real RPCs. All test fixtures created and cleaned up in the same session — zero residue confirmed.

**PLUS/GOLD (200/2000 capacity)** modeled in `src/lib/registrationPlans.js` but structurally impossible to activate — no endpoint reads `plan`/`capacity` from a client body, and the only activity-creating RPC has no such parameters in its signature. Documented without implementing in `docs/inscripciones/INSCRIPCIONES_FUTURE_BILLING.md`.

**PSCG**: `/inscripciones` → `PUBLIC_INDEXABLE`; `/inscripcion/[id]`, `/i/[token]` → `PUBLIC_NOINDEX`; `/crear-inscripcion`, `/panel/inscripciones/*` → `PRIVATE_AUTHENTICATED`. Difusión V1.1 updated: Inscripciones stops saying "Próximamente" (the only line of that mission touched here).

**Validation**: 26 new committed unit tests + the live adversarial battery above. Full regression suite: 762 tests, 759 pass directly; 2 failures were stale Difusión expectations (updated to match the now-real product, 22/22 after fix); 1 is the pre-existing XLSX stress-test timing flake, reproduced in isolation with the identical signature, unrelated to this mission. Clean `npm run build`. Migration applied only to `rifex-dev` (`nwxrvwbzqbhznscyirbq`) via `scripts/dev-supabase.sh`; `origin/main` (PROD) never referenced. Full detail: `docs/inscripciones/INSCRIPCIONES_V1_PRODUCT.md`, `docs/inscripciones/INSCRIPCIONES_V1_ARCHITECTURE.md`, `docs/inscripciones/INSCRIPCIONES_FUTURE_BILLING.md`. **Next step**: eventual controlled PROD promotion, subject to explicit authorization — not yet started.

---

## RIFEX DIFUSIÓN V1.1 MULTIPRODUCTO (2026-09-04) — DEV only, autonomous mission

`origin/develop` advances from `8ec5787` ("RIFEX PSCG + DIFUSION V1 DEV CERTIFIED", PROD `origin/main` unaffected). Fully autonomous DEV-only mission converting `/difusion` from a Rifas-oriented guide into a multiproduct guide covering Rifas, Campañas, Eventos, and Inscripciones (the last marked "Próximamente" — not a real product yet) — without touching PSCG architecture, auth boundary, classification, or metadata, all of which were already certified in the prior mission and remain explicitly frozen here.

**What did not change (verified, not assumed)**: `/difusion`'s PSCG classification (`PRIVATE_AUTHENTICATED`), its boundary (`ssr_redirect` — the `getServerSideProps` block is byte-identical to V1), its route (still the single `/difusion`, no per-product routes created), its `title`/`description`/`robots` metadata, its presence only in `Layout.jsx`'s `accountItems` (never public nav/footer), and `robots.txt`/`sitemap.xml` (already correct from V1, no further changes needed). `tests/pscg.test.mjs` required zero modification — its `/difusion` registry entry stayed valid unchanged.

**What changed — content only**: new `src/lib/difusionGuides.js`, pure data (no JSX, no network, no AI) exporting `DIFFUSION_PRODUCTS` (the 4 products) and `DIFFUSION_GUIDES` (full per-product content: intro, do/avoid lists, a copyable example, an ad note). `src/pages/difusion.jsx` rewritten to render a segmented-control selector (`role="tablist"`, 4 buttons, inline-styled consistent with the page's existing convention) plus the active guide's content — `useState`-driven, 100% client-side product switching, no navigation, no round-trip, no session loss.

**Selector default**: "Eventos" is selected on load. The mission explicitly required not assuming a default without justification — Eventos was chosen as the most neutral option among the 3 implemented products (it's the current public identity of Rifex: first navbar item, main public catalog at `/eventos`); no documentation anywhere in the repo indicates a preference for Rifas.

**Rifas — "Precauciones especiales"**: keeps and reorganizes V1's content — platform restrictions, the organic-vs-paid distinction, "changing words doesn't change the policy," and the sensitive-words note (now Rifas-specific, since the other 3 guides don't revolve around those words). Verified via a dedicated test to teach zero bypass/evasion/algorithm-gaming/cloaking/deliberate-substitution.

**Campañas — "Comparte tu causa con claridad"**: new content — explain the cause, identify the organizer, describe fund use, avoid exaggerated promises/guaranteed-results/"easy money"/deceptive pressure/unoffered considerations.

**Eventos — "Guía de difusión"**: new content — name/date/time/place/activity type/ticket availability, optional mention of digital tickets/QR. Deliberately avoids "approved by Meta"/"guaranteed"/"risk-free" language — a normal diffusion guide, not a policy certification.

**Inscripciones — "Próximamente"**: `available: false` in the registry. Shows an informational preview and the future example text, but the "Copiar ejemplo" button is not rendered — `ExampleBlock` shows a "Vista previa" badge instead when `copyable` is false — so no functionality is simulated for a product that doesn't exist yet. No new route, no backend, no form, no table.

**Tests**: `tests/difusion.test.mjs` fully rewritten for V1.1 (22 tests) — the 4 products present with correct labels, Inscripciones marked "Próximamente" without a functional CTA, per-product content genuinely distinct (JSON-diffed), Rifas' special-caution content free of evasion-teaching language, Campañas' specific recommendations, Eventos' guide free of approval-guarantee language, each implemented product's example text distinct and correctly wired to its own copy button, zero new per-product routes/backend, zero social APIs/auto-generation, selector confirmed state-only (no `router.push`/`window.location`), and the PSCG boundary confirmed unchanged. One self-inflicted false positive found during validation (an explanatory comment in `difusion.jsx` used the literal word the "no AI/auto-generation" test asserts absent) — reworded, same pattern as prior missions' self-audit false positives.

**Validation**: `difusion.test.mjs` (22) + `pscg.test.mjs` (81, unmodified) + `authUxCrawler.test.mjs` + `publicAudit.test.mjs` + `publicSurfaceFinalCleanup.test.mjs` → 271/271. Full regression `node --test 'tests/*.test.mjs'` → **724/725** (the same pre-existing `eventAnalyticsWorkbook.test.mjs:93` XLSX `writeBuffer` timing flake, identical signature — ~49.0s against a 20s budget, reproduced, not new). `npm run build` → clean, zero errors; `/difusion` confirmed `ƒ` (dynamic) in the manifest.

**Self-audit grep** across the full diff for `User-Agent|Googlebot|facebookexternalhit|TikTokBot|bypass|dangerously|payment|webhook|marketplace_fee|argentina|service_role|migration|Trust write|openai|warp|gpt|oauth`: zero real matches.

**Live pre-certification smoke** (built app, local `next start`, port 3054): anonymous `GET /difusion` → real `307` to `/login?next=/difusion`, body **21 bytes**. The anonymous response body was grepped for `rifa|sorteo|premio|campaña|evento|TikTok|Facebook|"ejemplo de publicaci"` — **zero matches**, confirming the private multiproduct content (which does contain those words in the source) never reaches an unauthenticated request. Multi-UA check identical across default/Googlebot/Meta/TikTok (307/21 bytes each). `sitemap.xml` served live: zero `difusion` occurrences. `robots.txt` served live: `Disallow: /difusion` present, unchanged from V1. Public regression spot-check: `/`, `/eventos`, `/wizard`, `/planes`, `/preguntas-frecuentes`, `/terminos`, `/seguridad`, `/confianza`, `/contacto` all `200`; "Difusión" confirmed absent from Home's rendered HTML.

**Status: DEV ONLY.** No PROD, no `main`, no migrations, no Supabase changes, no Payment Engine, no Trust backend, no AI/auto-generation, no social APIs/OAuth, no new backend routes. `origin/main` never referenced.

---

## RIFEX PUBLIC SURFACE CLASSIFICATION GUARD (PSCG) + DIFUSIÓN V1 (2026-09-04) — DEV only, autonomous mission

`origin/develop` advances from `b996893` (PROD `origin/main` unaffected — this mission never touches `main`). Fully autonomous DEV-only mission establishing PSCG as a transversal rule for how every route in Rifex declares its public exposure, then implementing Difusión V1 as the first feature built under that rule from its first commit.

**PSCG — audit before build**: read `Layout.jsx`, `publicMetadata.js`, `robots.txt`, `sitemap.xml`, the real SSR auth patterns across every private page, and `authUxCrawler.test.mjs`/`publicAudit.test.mjs`/`publicSurfaceFinalCleanup.test.mjs` before writing anything. Confirmed the four categories requested (`PUBLIC_INDEXABLE`, `PUBLIC_NOINDEX`, `PRIVATE_AUTHENTICATED`, `LEGACY_REMOVED`) map cleanly onto real, already-certified repo state — no new mechanism was needed, only a registry making the classification explicit and testable.

**Design — minimal, no framework**: new `src/lib/publicSurfaceClassification.js` exports `PSCG_CATEGORY` (the 4 enum values), `PSCG_BOUNDARY` (5 real auth-boundary subtypes found during audit — `ssr_redirect`, `ssr_gate_redirect`, `ssr_hydrate_client_gate`, `client_redirect`, `client_redirect_api_auth`), and `PSCG_REGISTRY` (the audited baseline: 17 `PUBLIC_INDEXABLE` entries matching `sitemap.xml` exactly, 4 `PUBLIC_NOINDEX`, 11 `PRIVATE_AUTHENTICATED` including the new `/difusion`, 1 `LEGACY_REMOVED` — `/rifas`). No new table, no runtime enforcement layer, no build-time linter — just a single source-of-truth module plus tests that check it against real files.

**Real historical debt found and documented, not silently fixed**: `/panel/bancos` has `getServerSideProps` but doesn't redirect there (redirect + render-gate live client-side); `/trust/verificar`, `/registro/continuar`, `/perfil` have no SSR boundary at all (client-only, though none leak private data — they render `null`/a generic loading state until the session check resolves); `/trust/verificar` and `/perfil` additionally lack any entry in `robots.txt`. None of this was touched — fixing it would be its own scoped mission with its own risk budget; PSCG's job here was to make the gap visible and testable (`boundary`/`robotsDisallow`/`notes` fields in the registry), not to retroactively harden every historical page in the same commit that introduces the rule.

**Small reusable addition**: `Layout.jsx` gained an optional `noarchive` prop (default `false`) — when `noindex` is set, it now emits `noindex, nofollow${noarchive ? ', noarchive' : ''}`. Every existing caller that only passes `noindex` gets byte-identical output to before; `/difusion` is the first caller to pass both, getting the full `noindex, nofollow, noarchive` triad the mission requires for `PRIVATE_AUTHENTICATED` pages that may expose sensitive content even cached.

**DIFUSIÓN V1**: new `src/pages/difusion.jsx`, classified `PRIVATE_AUTHENTICATED` with the strongest boundary (`ssr_redirect`) from its first commit — `getServerSideProps` reads the session via `getSupabaseServer` and returns `{ redirect: { destination: '/login?next=/difusion' } }` directly for anonymous requests, matching `mis-iniciativas.jsx`'s pattern exactly, not `panel/bancos.js`'s weaker one. Static educational content only: "Qué debes saber" (platform restrictions on rifa/sorteo/premio content, hedged — never claims a post "will always" be rejected), "Antes de publicar" (7 recommendations), "Palabras sensibles" (explains review triggers without teaching bypass/evasion/cloaking), a copyable example post with placeholders and a "Copiar ejemplo" button (`navigator.clipboard.writeText`, same pattern as `colectas/[id].jsx`'s share button — zero API calls), and "Publicidad pagada". V1 explicitly excludes AI, Warp AI, social OAuth/APIs, auto-posting, scheduling, analytics, and copy generation — verified by a dedicated test asserting none of those terms appear in the page source.

**Navigation**: "Difusión" added to `Layout.jsx`'s `accountItems` (the authenticated dropdown), between "Mis iniciativas" and "Bancos & Pagos" — never added to `navItems` (public navbar), the footer, Home, or `/wizard`.

**Metadata**: `title="Difusión — Rifex"`, `description="Guía para compartir tus iniciativas de Rifex en redes sociales de forma clara y responsable."` — exact strings from the mission. `robots: noindex, nofollow, noarchive`. No commercial OG (uses `Layout`'s generic OG, same as every other private page — never disabled via `disableAutoMeta`). No JSON-LD entry — the only `Organization`+`WebSite` block remains exclusively on Home. The forbidden metadata words (rifa/sorteo/premio/azar) are absent from title/description; they do appear inside the private educational body content, where the mission explicitly authorizes them.

**Sitemap/robots**: `/difusion` absent from `sitemap.xml`; `public/robots.txt` gains one new line, `Disallow: /difusion` — the dominant pattern among `PRIVATE_AUTHENTICATED` routes with a real SSR/gate boundary (`/panel`, `/crear-rifa`, `/crear-colecta`, `/crear-evento`, `/mis-iniciativas`, `/registro`, `/blog`). No existing `robots.txt` entry touched, no change to the file's overall strategy.

**Tests**: `tests/pscg.test.mjs` (81 tests) — validates every `PSCG_REGISTRY` entry has a valid category and no duplicate paths; every `PRIVATE_AUTHENTICATED` entry is absent from `sitemap.xml`; every `ssr_redirect`/`ssr_gate_redirect` entry has the literal SSR pattern in its source; every `PUBLIC_INDEXABLE` entry is present in `sitemap.xml` and absent from `robots.txt`'s `Disallow`; every `PUBLIC_NOINDEX` entry's documented `robotsDisallow` matches the real file; `/rifas` classified `LEGACY_REMOVED` with a real redirect; `/difusion` explicitly classified `PRIVATE_AUTHENTICATED` with `ssr_redirect` (both required checks from the mission). `tests/difusion.test.mjs` (13 tests) — the anon-307/next-correct/robots-triad/sitemap-absence/navbar-absence/account-menu-presence/content/example/copy-button/zero-AI-social-Payment-Trust-commission checks the mission requires. One self-inflicted false positive found and fixed during validation: an early draft of `difusion.jsx`'s own explanatory comment used the literal word the "no client-only redirect" test asserts absent — reworded the comment, same pattern as prior missions' self-audit false positives.

**Validation**: `pscg.test.mjs` (81) + `difusion.test.mjs` (13) + `authUxCrawler.test.mjs` + `publicAudit.test.mjs` + `publicSurfaceFinalCleanup.test.mjs` → 263/263 (confirmed `tests/blogPrivateProd.test.mjs` still does not exist on `develop`, main-exclusive, unaffected). Full regression `node --test 'tests/*.test.mjs'` → **716/717** (the same pre-existing `eventAnalyticsWorkbook.test.mjs:93` XLSX `writeBuffer` timing flake, identical signature — ~50.1s against a 20s budget, reproduced, not new). `npm run build` → clean, zero errors; `/difusion` confirmed `ƒ` (dynamic/server-rendered) in the manifest.

**Self-audit grep** across the full diff (`src/`, `public/`, `tests/`, `docs/`) for `User-Agent|Googlebot|facebookexternalhit|TikTokBot|bypass|dangerously|payment|webhook|marketplace_fee|argentina|service_role|migration|Trust write`: zero real matches in code — the only hits are in this WOP.md entry's own prose, documenting what was *not* introduced (e.g. "sin enseñar bypass", "cero Payment Engine").

**Live pre-certification smoke** (built app, local `next start`, port 3053): anonymous `GET /difusion` → real `307` to `/login?next=/difusion`, body **21 bytes** — zero form/content leakage. Multi-UA check on `/difusion` (anon): identical `307`/21-byte response across default UA, `Googlebot/2.1`, `facebookexternalhit/1.1`, `TikTokBot`. Home MD5-identical across the same 4 UAs — zero cloaking, confirmed empirically. `sitemap.xml` served live: zero `difusion` occurrences. `robots.txt` served live: `Disallow: /difusion` present. Home's rendered HTML contains exactly `Eventos`/`Campañas`/`Cómo funciona` in its public nav — zero `Difusión` leak into public markup. Regression spot-check on the same running build: `/mis-iniciativas` and `/crear-rifa` still real `307`s (anon), `/eventos` and `/login` still `200` — no collateral regression from the `Layout.jsx`/`robots.txt` changes.

**Status: DEV ONLY.** No PROD, no `main`, no migrations, no Supabase changes, no Payment Engine, no Trust backend, no AI, no Warp AI, no social APIs. `origin/main` never referenced.

---

## RIFEX PROGRESSIVE ONBOARDING — CREACIÓN DE INICIATIVAS (2026-09-03) — DEV only, autonomous mission

`origin/develop` advances from `4a363e7` (PROD `origin/main` unaffected — this mission never touches `main`, confirmed via fresh `git fetch` before writing this entry). Fully autonomous mission (per explicit governing-prompt authorization, no per-step confirmation requested) implementing progressive onboarding: a user can register/login/browse Rifex without completing full Trust/payment setup, but attempting to **create** a Rifa, Campaña, or Evento passes through one coherent eligibility gate. Executed by Claude Code following this repository's existing AI-authorship convention.

**Baseline audit (before any code change)**: read `docs/WOP.md`, `docs/CURRENT_STATE.md`, `docs/handover/NUEVA_SESION_PROMPT.md`, all `docs/trust/*.md`, then read in full `src/lib/trustIdentityGate.js`, `src/lib/trustIdentityVerificationPolicy.js`, `src/lib/trustOnboardingClient.js`, `src/pages/api/onboarding/trust/status.js`, and the relevant sections of `src/lib/countryPolicy.js`, `src/pages/registro/continuar.jsx`, `src/pages/panel/bancos.js`, `src/pages/crear-rifa.jsx`, `src/pages/crear-colecta.jsx`, `src/pages/crear-evento.jsx`, `src/pages/rifas/crear.jsx`. Confirmed the mission's premise before writing any code: **Rifex already has every piece this mission needs** — a single authoritative eligibility function (`assertCreatorEligible`, TRUST-2), a single certified safe-internal-redirect sanitizer (`sanitizeNextPath`, reused at 5+ call sites), a fully working `/registro/continuar` → `/panel/bancos` progressive chain that already re-detects what's missing on each visit and forwards `next` onward. No new state machine, no new table, no new onboarding UI was needed.

**Real gap found**: the 3 creation pages (`crear-rifa.jsx`, `crear-colecta.jsx`, `crear-evento.jsx`) already had a real, correct SSR **session** boundary (from the prior AUTH UX 2026 mission — `getServerSideProps` + `getSupabaseServer`), but had **no eligibility check** — an authenticated-but-not-yet-eligible user (onboarding incomplete, no Mercado Pago connected, Trust mismatch/pending) hit the full creation form directly, with only a client-side `useEffect` (`resolveTrustOnboardingRedirect`, fail-open by design, "esto solo mejora la UX") running *after* the form had already mounted. This was the one real leak the mission needed to close — not a missing system, a missing wire.

**Fix — one thin shared gate, zero new eligibility logic**: new `src/lib/creationGate.js` exports `resolveCreationGate(ctx, destinationPath)`, called from each creation page's `getServerSideProps` with a fixed literal destination (`resolveCreationGate(ctx, "/crear-rifa")` etc. — never `ctx.query`, so it cannot be used as an open-redirect vector). It does exactly two things: (1) checks the real session via `getSupabaseServer(req, res).auth.getUser()`, redirecting to `/login?next=<destino>` if absent; (2) calls `assertCreatorEligible(user.id)` — the same TRUST-2 authority already used by `api/rifas`, `api/colectas`, `api/events` — and maps its `reason` onto the existing step that resolves it:

| `assertCreatorEligible` reason | routed to |
|---|---|
| `onboarding_incomplete`, `onboarding_check_failed`, `identity_incomplete`, `identity_check_failed` | `/registro/continuar` |
| `mp_not_connected`, `mp_identity_mismatch`, `mp_check_pending` | `/panel/bancos` |
| `identity_verification_required` | `/trust/verificar` (mapped for completeness; TRUST-3A stays dormant — `isIdentityVerificationRequiredForCreators()` is still hardcoded `false`, not touched) |

Eligible users get `{ props: {} }` — same form, same as before, zero extra friction. The client-side `useEffect` + `resolveTrustOnboardingRedirect` calls in all 3 pages were removed (dead weight now that the real boundary is server-side and runs before any markup is sent); the unrelated data-fetch logic each page's `useEffect` also did (`setToken`, `loadMine` for Mis Campañas) was left untouched.

**Why this is provably sufficient for every entry point (section 7 of the mission)**: Next.js Pages Router runs `getServerSideProps` on every request to a page — client `<Link>` navigation, nav CTAs, Home CTAs, the wizard, panel CTAs, and direct URL access all resolve through the same server-side data path. Gating only the 3 destination pages therefore covers every real entry point without touching a single button/CTA component. `src/pages/rifas/crear.jsx` was confirmed (read in full) to be a plain client-side alias to `/crear-rifa`, not a second entry point.

**`/trust/verificar` — minimal, honest plumbing added, not a new gate**: added `sanitizeNextPath`-based `next` preservation (same technique, same function, no second implementation) and a "Continuar" button shown only in the `status === 'approved'` branch, so the mapping above is not silently broken if TRUST-3A is ever activated by a future, separately-authorized decision. Also hardened the pre-existing session-check `useEffect` to guard on `router.isReady` (needed for `router.query.next` to be reliably populated) and to preserve the real requested path on the login redirect instead of a hardcoded self-reference — a small correctness fix, not new scope.

**Authoritative gate untouched (section 5)**: confirmed via `git diff --stat origin/develop -- src/pages/api/` (zero output) that `api/rifas/index.js`, `api/colectas/index.js`, `api/events/index.js` — all still calling `assertCreatorEligible` on the actual mutating request — are completely unmodified. The new gate is UX-only; the real authority never moved.

**No mega-onboarding, no duplicated state (section 8)**: no new table, no new onboarding wizard, no second definition of "eligible", no Trust/Bancos/profile duplication. `resolveCreationGate` is ~25 lines of orchestration that reads `assertCreatorEligible`'s existing result and reuses `sanitizeNextPath`'s existing implementation — it does not reimplement fail-closed semantics or the `matched`-only rule anywhere.

**Security (section 13)**: open redirect — `destinationPath` is always a fixed literal the page itself passes, never user input; verified by a dedicated test asserting the call site never references `ctx.query`. Redirect loop — an eligible user reaching a creation page gets `{ props: {} }`, not another redirect; a user stuck at `/registro/continuar`/`/panel/bancos` is resolved by those pages' own existing re-detection logic on every visit, not by this gate looping. Bypass via direct URL — covered by the Pages Router architectural guarantee above, verified live. Frontend/backend discrepancy — none: the gate reads the exact same `assertCreatorEligible` result the mutating APIs already enforce. Trust states — every non-`matched` MP state (`mismatch`, `unavailable`, `unknown`, `pending`, `checking`, `not_connected`) routes to `/panel/bancos`, never treated as eligible; verified per-state in tests. No Trust internal data (raw `mp_identity_match` value, internal reason codes) is exposed to the user — only the pre-built Spanish `USER_MESSAGE` strings `assertCreatorEligible` already produces are ever surfaced by the pages downstream of this gate, unchanged by this mission.

**Tests**: new `tests/creationGate.test.mjs` (27 tests) — real functional tests against `resolveCreationGate`, mocking `@supabase/supabase-js`'s client prototype (`ClientProto.from`, `AuthProto.getUser`) the same way `tests/trustIdentityGate.test.mjs` already does, confirmed architecturally sound because `@supabase/ssr`'s `createServerClient` wraps `@supabase/supabase-js`'s `createClient` internally. Covers all 20 scenarios required by section 12: anonymous → login for each vertical; authenticated-incomplete for each vertical; no-payment-connection; every real Trust/MP state (`pending`, `unknown`/`checking`, `mismatch`, `unavailable`, `matched`); eligible-direct-access; destination preserved per vertical; malicious `next` has no effect (the gate never reads `ctx.query`); direct-URL access doesn't evade the gate; no loop for already-eligible users; `identity_verification_required` mapping present in source. `tests/authUxCrawler.test.mjs` updated (not weakened): its old single `PROTECTED_PAGES` loop, which asserted the literal `getSupabaseServer`/`s.auth.getUser()` pattern on all 5 SSR-boundary pages, was split into `DIRECT_BOUNDARY_PAGES` (`panel/index.js`, `mis-iniciativas.jsx` — unchanged, still checks the exact original literals) and `GATED_CREATION_PAGES` (the 3 refactored pages — new assertions checking `import { resolveCreationGate } from '@/lib/creationGate'` and the exact literal call `resolveCreationGate(ctx, '<path>')`), because the underlying auth-boundary invariant moved into the shared function and is now *strengthened* with eligibility, not because it was relaxed.

**Validation**: `creationGate.test.mjs` + `authUxCrawler.test.mjs` + `publicAudit.test.mjs` + `trustIdentityGate.test.mjs` + `sanitizeNextPath.test.mjs` + `onboardingBancosUx.test.mjs` + `publicSurfaceFinalCleanup.test.mjs` → 268/268. Full regression `node --test 'tests/*.test.mjs'` → 635/636 (the same pre-existing `eventAnalyticsWorkbook.test.mjs` XLSX `writeBuffer` timing flake, re-checked against this run's own signature — identical ~33-34s-against-20s-budget pattern, not a new failure). `npm run build` → clean. Self-audit grep across the full diff and new files (`payment|webhook|marketplace_fee|argentina|migration|service_role|mp_identity_match\s*=|RIFEX_FEE_RATE`) → zero real matches. Live DEV smoke test (post-build, dev server on port 3051): anonymous requests to all 3 gated pages returned real `307`s with minimal (25-28 byte) bodies — no form leakage; `/trust/verificar`, `/registro/continuar`, `/panel/bancos` still `200` and functional, including with a `?next=` query param present; no server errors logged.

**Post-implementation self-audit (section 14)**: attempted to skip onboarding (blocked — `getServerSideProps` runs before any client JS), open a creation form directly via URL (blocked, same mechanism), forge `next` to an external host (rejected by `sanitizeNextPath`'s origin comparison — this gate doesn't even read `ctx.query` for its own redirects, so there is no forgeable input on this code path at all), produce a redirect loop (none found — each state has exactly one deterministic next step), get an `unknown`/`pending`/`unavailable` MP state to pass as `matched` (impossible — `assertCreatorEligible`'s fail-closed check is untouched and this gate only reads its boolean `ok`), create via API without eligibility (blocked — APIs independently call `assertCreatorEligible`, confirmed untouched by diff), lose the destination across the `/registro/continuar` → `/panel/bancos` → Mercado Pago OAuth round-trip (verified intact — that chain's own `next`-forwarding and `sessionStorage` OAuth-survival logic, both pre-existing, were not modified), affect an already-eligible creator (verified — eligible path is a single `{ props: {} }`, identical UX to before). No flaw found requiring a fix.

**Files changed**: new `src/lib/creationGate.js`, new `tests/creationGate.test.mjs`; modified `src/pages/crear-rifa.jsx`, `src/pages/crear-colecta.jsx`, `src/pages/crear-evento.jsx`, `src/pages/trust/verificar.jsx`, `tests/authUxCrawler.test.mjs`.

**Deuda restante / riesgos**: `identity_verification_required` → `/trust/verificar` routing is wired but structurally unreachable today (TRUST-3A dormant by policy) — no functional risk, flagged for whoever eventually flips that policy flag to re-verify the mapping still holds. No other new debt introduced.

**Status: DEV ONLY.** No migrations, no PROD writes, no real payments, no real emails, no secret changes, no relaxed guardrail, no Argentina activation, no change to Payment Engine/webhooks/`marketplace_fee`/7% commission, no second eligibility definition, no mega-onboarding. `origin/main` unaffected throughout — never referenced by this branch.

---

## RIFEX PUBLIC SURFACE FINAL CLEANUP (2026-09-03) — DEV only, autonomous mission

`origin/develop` advances from `add98ec` (PROD `origin/main` confirmed unchanged at `39b47f5`, tag `v2.5-rifex-prod-auth-crawler`, throughout — see confirmation at the end of this entry). Fully autonomous mission (no per-step confirmation requested, per explicit governing-prompt authorization) closing public/legal/crawler-surface defects left after AUTH UX 2026 + CRAWLER CLEANUP, targeting a conservative "84% → higher" public-readiness bar without attempting to game any external audit's score. Executed by Claude Code following this repository's existing AI-authorship convention.

**Baseline audit** (before any code change): read `docs/WOP.md`, `docs/CURRENT_STATE.md`, `docs/handover/NUEVA_SESION_PROMPT.md`, `docs/legal/RIFEX_REVISION_LEGAL_PENDIENTE.txt`, all `docs/trust/*.md`, `tests/authUxCrawler.test.mjs`, `tests/publicAudit.test.mjs`, `public/robots.txt`, `public/sitemap.xml`, `src/components/Layout.jsx`, and every public surface listed in the governing prompt. Grepped the full public-page tree for `PENDIENTE|TODO|FIXME|abogado|revisión jurídica|antes de PROD|zona gris|identidad legal.*pendiente|rifa(s)?|sorteo(s)?|premio(s)?|ganador(es)?|azar|apuesta|casino|lotería`, then classified every hit by context (PUBLIC CORPORATE / PUBLIC LEGAL NECESSARY / AUTHENTICATED PRODUCT / PRIVATE-INTERNAL / TEST-DOCS / LEGACY DEAD CODE) before touching anything.

**P0 — real internal-warning leaks found and fixed** (3 confirmed, all previously undetected as a set):
- `src/pages/reglas-iniciativas-premio.js`: the visible banner "PENDIENTE DE REVISIÓN POR ABOGADO CHILENO ANTES DE PROD... zona gris respecto de la Ley 10.262/1952..." was still rendered on this public (noindex) page. Removed the rendered banner; the underlying legal debt was already tracked in `docs/legal/RIFEX_REVISION_LEGAL_PENDIENTE.txt` (point 6) — nothing was "resolved" by the removal, only the public exposure of an internal dev note.
- `src/pages/contacto.js`: removed the visible placeholder `"Identidad legal completa del operador: pendiente de confirmación."` — this page is public, indexable, and in `sitemap.xml` (`canonicalPath="/contacto"`, no noindex), so the placeholder was reaching Google. No identity was invented to replace it; the rest of the card (email, hours, links to Seguridad/Privacidad/Términos/Reportar) already gave real, neutral contact information. The underlying gap ("Identidad legal del operador") was already tracked in the same legal-debt file, untouched.
- `src/pages/terminos-rifas.js`: **found the identical banner text here too, but did NOT remove it — reverted an initial edit after finding a material contradiction with a certified requirement.** `tests/publicAudit.test.mjs` contains two tests (`"STAGE 2 REPAIR: /terminos (corporativo público) ya no muestra el aviso... /terminos-rifas sí lo conserva (nunca se declara aprobado sin revisión real)"` and `"terminos-rifas.js: conserva verbatim las condiciones históricas..."`) that explicitly assert the banner **must** remain on this specific page — a deliberate STAGE2-REPAIR decision, reasoned in the file's own comments, to avoid implying that the substantive, financially-binding Términos del Creador (comisión, entrega del premio, fraude/chargebacks) have received a legal review they have not received. This governing prompt's general instruction ("eliminate all such banners") only named `reglas-iniciativas-premio.js` by concrete evidence; finding the same string elsewhere via the broader mandated grep does not override an already-certified, reasoned, tested product decision. File restored byte-identical to baseline (confirmed via `git diff`); flagged here as the one open item requiring Rodrigo's explicit decision before it can be touched (see "Deuda restante" below).

**P1 — `/rifas`: kept the existing product decision (Rodrigo, 2026-08-31, redirect-to-/login, not 410), but closed a real technical gap.** The redirect was client-side only (`useEffect` + `router.replace`) — a curl request or any client without JS received `200` with an essentially blank page, not a real redirect; only the `X-Robots-Tag: noindex, nofollow` header was real. Converted to a real `getServerSideProps` returning `{ redirect: { destination, permanent: false } }`, preserving the exact same `next`-sanitization logic (`raw.startsWith('/') ? raw : '/panel'`) and the `X-Robots-Tag` header. Verified live: `curl` (no JS) now receives a real `307` with `Location: /login?next=...` and the noindex header, for both a bare request and one with a malicious/absolute `next` (falls back to `/panel`). External "implement a 410" recommendation was explicitly not applied — no evidence found that `/rifas` lost all legitimate function; it still serves a real compatibility purpose (soft landing for old bookmarks/backlinks instead of a dead end).

**P1 — public link graph to the Rifas annex**: traced every path from navbar/footer/Home/Términos/Reembolsos/FAQ/sitemap/canonical into `/reglas-iniciativas-premio` and `/terminos-rifas`. Found exactly one PUBLIC_INDEXABLE entry point: `/reembolsos` → "anexo de iniciativas con premio" (a legitimate, already-audited explanatory link for users with a refund question about a rifa) — the annex itself is `noindex`, out of `sitemap.xml`, and not `Disallow`'d (so Google can see and honor the noindex tag). No accidental promotion of Rifas identity found on Home, navbar, footer, or `/wizard`. No change needed or made to this graph.

**P1 — robots.txt / noindex classification, URL by URL**: classified every route into PUBLIC_INDEXABLE (16 pages incl. `/confianza`, all correctly in `sitemap.xml`, none `Disallow`'d), PUBLIC_NOINDEX (`/reglas-iniciativas-premio`, `/terminos-rifas` — correctly `noindex` + crawlable + out of sitemap, matching Google's own guidance against combining `Disallow` with `noindex`), PRIVATE_AUTHENTICATED (`/login`, `/register`, the 5 auth-boundary pages — `Disallow`'d **and** `noindex`), LEGACY_REMOVED (`/rifas` — `noindex` via a real header on a real redirect, not `Disallow`'d, same pattern as the annex). **One nuance found and deliberately left unchanged**: applying Google's stricter guidance (don't `Disallow` a page whose only purpose is to expose a `noindex` signal or a redirect to one) to the PRIVATE_AUTHENTICATED set would mean removing their `Disallow` entries — but `tests/authUxCrawler.test.mjs` has a certified test (`"robots.txt sigue bloqueando /crear-rifa, /crear-evento, /crear-colecta, /mis-iniciativas, /panel, /login, /register"`) that locks in the current behavior. Rather than silently invalidate a certified test for an optional SEO refinement, left `robots.txt` unchanged and recorded this as an optional finding, not a defect, in "Deuda restante."

**P1 — auth boundary regression + no-cloaking**: re-verified live (local DEV server) that all 5 protected routes still return real `307`s to `/login?next=<path>` with minimal (18-28 byte) redirect bodies — no leaked form/dashboard HTML. Multi-UA check on the homepage: identical MD5 for a default UA, `Googlebot/2.1`, `facebookexternalhit/1.1`, and `TikTokBot` — zero cloaking, confirmed empirically, not just by absence of `User-Agent` branching in the diff.

**P1 — Trust/security claims audit**: `/seguridad` (already corrected 2026-08-27) uses the approved, hedged formulation ("Rifex aplica controles de registro, validación de identidad y titularidad de cuentas antes de habilitar determinadas operaciones") and avoids all listed absolute terms — verified, not just trusted. `/confianza` (a real public, indexed page not previously covered by that correction pass) used stronger, unconditional language ("Rifex verifica la identidad del organizador, contrasta la titularidad...") — tightened to match `/seguridad`'s exact certified phrasing. No backend Trust logic touched; `assertCreatorEligible`/`trustIdentityGate.js` untouched. `cumplimiento.js`'s "✅ Controles activos" badge and `trust/verificar.jsx`'s per-user "Identidad verificada" status (shown only to the authenticated user checking their own document-review result) were both reviewed and found accurate to real, tested backend behavior — left unchanged.

**P2 — `/campanas` (external audit reported 404)**: traced the real cause — the navbar's "Campañas" item pointed directly at `/crear-colecta`, one of the 5 auth-boundary pages; an anonymous visitor exploring the site got an unexplained login wall, not a 404, but the practical effect (no public explanation of what a campaign is) matched the audit's underlying complaint. Found that `/wizard` already contains a complete, already-certified campaign explainer (step-by-step + real CTA to `/crear-colecta`, reachable via a "Quiero crear una campaña" toggle) — no new landing page was built, which would have duplicated certified content. Instead: `wizard.js` now reads `?modo=evento|colecta` on mount to preselect that view, and `Layout.jsx`'s "Campañas" navItem now points to `/wizard?modo=colecta`. Verified live: clicking "Campañas" now lands directly on the campaign explainer instead of a login wall.

**P2 — structured data (JSON-LD)**: none existed. Added `Organization` + `WebSite` JSON-LD to Home only (the canonical entity, not repeated per page), containing exclusively verifiable facts already in this repository: `name: "Rifex"`, `url` from the existing `SITE_URL` constant, `logo` pointing at the real `public/rifex-logo.png`. Explicitly did not add `aggregateRating`, `review`, `address`, `sameAs`, `foundingDate`, or any unverified `legalName` — verified via a dedicated test that the JSON-LD objects contain none of these. Verified live that it renders correctly alongside Layout's own `<Head>` (title/canonical/OG) with no collision, using explicit `key` props on the `<script>` tags — the same precaution the earlier `/planes`/`/wizard` dual-`<Head>` bug (Next 14.2.32) taught this repository to take.

**P2 — security headers**: `next.config.mjs` had zero application-level security headers (Vercel's edge already adds HSTS for the custom domain, confirmed separately). Added, via `headers()`, only low-risk headers verified against real feature usage first: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: SAMEORIGIN`, and a `Permissions-Policy` that explicitly allows `camera=(self)` (real `getUserMedia` use in `panel/eventos/[id]/scanner.jsx`'s QR scanner) and `clipboard-write=(self)` (real `navigator.clipboard.writeText` use in `colectas/[id].jsx`'s share-link button), disabling everything else not in use (`microphone`, `geolocation`, `payment`, `usb`). **Content-Security-Policy was explicitly not touched** — inventorying every legitimate origin (Supabase Auth, Google OAuth, Mercado Pago, Meta Pixel, hCaptcha) correctly and safely is out of scope for this mission's risk budget. Verified live after restarting the DEV server: all four headers present on every route, `/login` and `/register` still render their hCaptcha `<div class="h-captcha">`, `/crear-rifa` and the scanner page still load `200`/`307` as before.

**P2 — transversal consistency pass**: grepped all public pages for commission-rate consistency (uniformly `7%`), leftover "Iniciar sesión" (zero — already fixed), plan/mensualidad/suscripción leftovers (only negated mentions — "sin mensualidad" — accurate to the real $0-to-publish/7%-only model), Argentina/ARS references (zero on public surfaces), and custody-of-funds claims (every mention correctly negates custody, consistent with the real Mercado Pago `application_fee` split architecture). Extracted every internal `href="/..."` from all public pages and the navbar/footer and confirmed each resolves to a real page file — zero dead links. Confirmed no public page's `description` metadata contains rifa/sorteo/premio terminology.

**No cloaking, anywhere, by construction**: none of the touched files (`rifas.js`, `Layout.jsx`, `wizard.js`, any public page) branch on `User-Agent`, `navigator.userAgent`, or bot-identification strings — verified both by source grep and by the live multi-UA MD5 comparison above.

**Test suite**: new `tests/publicSurfaceFinalCleanup.test.mjs` (38 tests) covers all 20 required invariants — absence of internal warnings (with the deliberate `terminos-rifas.js` exception excluded, not silently broken), the `/contacto` placeholder fix, sitemap/robots classification coherence, the `/rifas` real server-side redirect, no-cloaking (no `User-Agent`/bot-name references in source), Home's Rifas-free identity, Login/Register/Blog re-certification, the public link graph boundary, Trust-claim wording, canonical-domain consistency, the JSON-LD fact set, the new security headers (including the exact `Permissions-Policy` allowlist), the `/campanas` → `/wizard?modo=colecta` fix, and commission/Argentina/custody consistency. Two self-inflicted false positives were found and fixed **in the new test file only** during its own validation (both caused by the test's own explanatory comments containing the very phrases/keys it was asserting the *absence* of, e.g. `seguridad.js`'s own top-comment listing the banned phrases it avoids) — no product code was affected by that correction.

**Validation**: `publicSurfaceFinalCleanup.test.mjs` 38/38, combined with `authUxCrawler.test.mjs` + `publicAudit.test.mjs` 180/180. `tests/blogPrivateProd.test.mjs` does not exist on `develop` (it is a `main`-exclusive artifact from an earlier PROD-only Blog-Private promotion); Blog privacy on `develop` is certified via `authUxCrawler.test.mjs`'s Blog test instead — noted here rather than silently treated as a pass. Full regression `node --test 'tests/*.test.mjs'` → **606/607** (the same pre-existing `eventAnalyticsWorkbook.test.mjs:93` XLSX `writeBuffer` timing flake, identical failure signature: ~37-38s against a 20s budget at maximum simulated load — reproduced, not a new failure). `npm run build` → clean, zero errors; `/rifas` now correctly listed as `ƒ` (dynamic/server-rendered) instead of static. Self-audit grep across the full diff for `payment|webhook|marketplace_fee|RIFEX_FEE_RATE|argentina|migration|service_role|Trust writes|googlebot|facebookexternalhit|bytespider`: two hits, both benign false positives (the browser Permissions-Policy `payment=()` directive disabling that unrelated Web API, and the new test's own assertion text checking for the *absence* of "Argentina") — zero real matches.

**Deuda restante (real, not resolved by this mission)**:
- `terminos-rifas.js`'s internal-review banner: found identical to the one removed from `reglas-iniciativas-premio.js`, but left in place because removing it would silently contradict two certified STAGE2-REPAIR tests and a deliberate, reasoned product decision. **Requires Rodrigo's explicit decision**: either (a) confirm the STAGE2-REPAIR reasoning still holds and this stays as-is, or (b) explicitly authorize removing it (and update the two certified tests accordingly) now that the substantive legal debt is separately tracked in `docs/legal/RIFEX_REVISION_LEGAL_PENDIENTE.txt`.
- `robots.txt`'s `Disallow` entries for `/login`, `/register`, and the 5 auth-boundary pages could, per Google's stricter guidance, be removed in favor of letting Google see the honest `noindex`/redirect-to-noindex signal directly — technically preferable, but conflicts with a certified `authUxCrawler.test.mjs` assertion locking in the current behavior. Left unchanged; flagged as an optional future refinement, not a defect.
- Content-Security-Policy remains unset at the application level — explicitly out of this mission's risk budget; Vercel's default headers (HSTS) still apply.
- The underlying legal-review debt itself (RUT/titularidad language, the Ley 10.262/1952 zona-gris question, cookie consent classification under Ley 19.628/21.719, the operator's legal identity) is unchanged and still fully tracked in `docs/legal/RIFEX_REVISION_LEGAL_PENDIENTE.txt` — this mission never resolved or declared compliance on any of it, only stopped it from leaking onto public pages.

**Acciones manuales post-PROD (Search Console/Meta), a ejecutar por Rodrigo, no desde este repositorio**: once (and only if/when) this work reaches PROD — request a Google Search Console re-crawl for `/rifas` and, if historically indexed, for the old public rifas-catalog URLs, to let the real `noindex`/redirect signals propagate and clear any stale cached snippet; no repository-side hack was used to accelerate this. Refresh `/`, `/contacto`, `/confianza`, and `/wizard` in the Meta Sharing Debugger if their OG previews look stale after deployment. None of these operations were executed from DEV.

**Blocker resuelto (2026-09-03, follow-up en el mismo día)**: Rodrigo autorizó explícitamente la opción (b) — retirar también de `terminos-rifas.js` el banner interno de revisión legal pendiente que STAGE 2 REPAIR había dejado ahí a propósito. Ejecutado exactamente según las reglas dadas: se eliminó únicamente el párrafo del banner (nada más de la página fue reescrito); no se declaró que los Términos del Creador fueron revisados por un abogado ni que cumplen jurídicamente; ninguna obligación sustantiva, condición financiera (comisión 7%, entrega del premio, fraude/chargebacks) ni regla de producto cambió — verificado con asserts dedicados comparando el texto exacto antes/después. La deuda de revisión real (`docs/legal/RIFEX_REVISION_LEGAL_PENDIENTE.txt`, punto 3) se actualizó para reflejar que el banner ya no está público, sin declarar el punto resuelto. Los dos tests certificados de `publicAudit.test.mjs` que exigían el banner se actualizaron para exigir su ausencia (mismo patrón usado en `reglas-iniciativas-premio.js`) más la presencia intacta de las condiciones sustantivas; `publicSurfaceFinalCleanup.test.mjs` se amplió con un test dedicado a esta invariante. Re-ejecutado todo: suite específica 40/40 (+2 vs la pasada anterior), authUxCrawler 21/21, publicAudit 121/121 (182/182 combinado), regresión completa 608/609 (mismo flake XLSX histórico, misma firma), build limpio, self-audit sin coincidencias reales, re-auditoría directa de `/terminos-rifas` y `/reglas-iniciativas-premio` confirmando ausencia del banner en ambas.

**Status: DEV ONLY.** No migrations, no PROD writes, no real payments, no real emails, no secret changes, no commission-rate change, no Argentina activation, no Trust/Cumplimiento/Events business-logic change, no Home redesign, no Rifas functionality removed. `origin/main` confirmed unchanged at `39b47f5` throughout (re-verified via fresh `git fetch` immediately before this entry was written and again before the follow-up commit).

---

## RIFEX AUTH UX 2026 + CRAWLER SURFACE CLEANUP (2026-09-02) — DEV only

`origin/develop` advances from `9875ef0` (PROD `origin/main` confirmed unchanged at `15d7d35` throughout — see confirmation at the end of this entry). Autonomous DEV mission covering Login/Register visual modernization, removal of legacy Rifas identity from Auth, and closing real public/crawler surface leaks — without touching Auth logic, Payment Engine, webhooks, Trust backend, commission, or Argentina.

**Etapa 1 audit (anonymous, against live DEV) found two real, previously-undetected content leaks**, both now fixed:
- `/crear-rifa`, and by the same pattern `/crear-colecta` (the real destination of the public "Campañas" navbar link) and `/crear-evento`, rendered their **complete creation forms** (all inputs, legal checkboxes) in the server-rendered HTML for any anonymous visitor or crawler — the only guard was a client-side `useEffect` that redirected *after* hydration. A crawler, or any client with JS disabled, received the full form.
- `/panel` rendered its full internal dashboard shell (KPIs, "Crear rifa", "Rifas activas", etc.) unconditionally before its `useEffect` auth check ran.
- `/mis-iniciativas` was already safe from content leakage (`if (checking) return null` gated its render), but was still relying exclusively on client JS, not a server boundary.

**Fix**: added `export async function getServerSideProps` to all five pages (`crear-rifa.jsx`, `crear-colecta.jsx`, `crear-evento.jsx`, `panel/index.js`, `mis-iniciativas.jsx`), reusing `getSupabaseServer` from `src/lib/supabaseServer.js` — the same real, already-established SSR-session-reading infra `panel/bancos.js` uses — to check `auth.getUser()` server-side and return `{ redirect: { destination: '/login?next=<path>', permanent: false } }` when there's no session. Verified live: all five now return a real HTTP `307` to `/login?next=...` for anonymous requests — confirmed via `.next/server/pages/*.js` (dynamic bundles, not `.html`) and live curl. Authenticated users are completely unaffected: no client-side logic was removed, `crear-rifa.jsx`'s form/`POST /api/rifas` flow is untouched, `crear-colecta.jsx`/`crear-evento.jsx` untouched beyond the new boundary. `crear-colecta.jsx` and `crear-evento.jsx` were not explicitly named in the governing prompt's Etapa 6 (only `/crear-rifa` was) but share the identical bug and, in `crear-colecta.jsx`'s case, are the literal target of a public nav link — fixing only `/crear-rifa` while leaving the public nav's actual destination wide open would have been incoherent with the mission's own stated goal.

**Etapa 2 — navbar**: `Layout.jsx`'s `navItems` already read Eventos/Campañas/Cómo funciona (from Stage 2). Removed `"Crear una iniciativa"` (both desktop and mobile), renamed `"Iniciar sesión"` → `"Ingresar"` (same, both surfaces). Desktop centering: `.rf-header-inner` switches to `display: grid; grid-template-columns: 1fr auto 1fr` at `min-width: 901px` (the same breakpoint where `.rf-nav-desktop` becomes visible) — this centers the middle nav column against the true container width regardless of the asymmetric widths of the logo and the (now single-button) actions area, instead of the previous flex `space-between` which only centered it in the leftover space. Mobile layout (`≤900px`) untouched — still the original flex rule, unaffected by the new `@media (min-width: 901px)` block.

**Etapa 3-5 — Login/Register 2026 + shared AuthShell**: new `src/components/auth/AuthShell.jsx` + `src/styles/authShell.module.css` extract the brand-panel/card shell (previously byte-identical, duplicated between `login.module.css` and `register.module.css`) into one shared, presentation-only component — it imports nothing from `supabase` and holds no session/OAuth/captcha logic; each page keeps its own `<form>`, its own `onSubmit`, its own Google button. Copy updated: Login title "Ingresar" (was "Iniciar sesión"), subtitle references eventos/entradas/campañas (was "Accede para crear y administrar tus rifas"), brand panel copy neutral (was "Crea rifas en minutos..."); Register title "Crear cuenta" unchanged, subtitle/brand copy updated similarly, removed the old "Regístrate para crear y administrar tus rifas". Both pages gained a footer cross-link (Login → "¿Aún no tienes cuenta? Crear cuenta", Register → "¿Ya tienes cuenta? Ingresar"). **Zero changes to Auth logic**: Supabase calls, hCaptcha (`verifyCaptchaOrDevBypass`/`captchaGate.js` — already used by both pages on `develop` before this mission, not newly introduced), RUT validation, password policy, `next` handling, and `/reset-password` link are byte-identical to before, only their surrounding JSX/CSS moved.

**Register bug check (mandated before restyling)**: traced UI → handler → captcha → `signUp` → redirect. No real bug found — `rutRequired`/`isDevStage()`, password policy, and the `signUp` call with `emailRedirectTo` are all structurally correct. No fix was needed or applied; documenting this explicitly per the mission's own instruction not to silently skip the check.

**Etapa 8 — `/rifas`**: audited before assuming anything. It's not a raw leak or a 404 — it's an already-resolved product decision (Rodrigo, 2026-08-31, per the file's own header comment): a `getServerSideProps` sets `X-Robots-Tag: noindex, nofollow` and the client redirects to `/login?next=...` (preserving `next`), while Rifas creation/panel/`/rifas/[id]` remain fully intact. Not touched — already correct.

**Etapa 9 — Blog**: re-confirmed private (unchanged `noindex, nofollow, noarchive`, no public link, no sitemap entry). One trivial, authenticated-only copy line ("...historias reales de creadores que ya cerraron su rifa") neutralized to "...historias reales de organizadores de nuestra comunidad" for coherence — not a crawler fix (the text was never publicly reachable), Blog itself was not reopened.

**Etapa 10 — `/reglas-iniciativas-premio`**: already `noindex`, out of sitemap (Stage 2). Left untouched — the legal/product boundary was already resolved, not reopened here.

**Etapa 11 — "Campañas" navbar link**: the real destination is `/crear-colecta` (confirmed via `Layout.jsx`'s `navItems`), not a 404 — `/campanas` (no such literal route) was never actually linked from anywhere; testing it during the audit was checking a URL that was never real. No navigation fix was needed; `/crear-colecta` itself was the real gap, closed via the Etapa 6-pattern boundary above.

**Etapa 12/13 — robots/sitemap/Auth metadata**: no mass changes. `robots.txt` already `Disallow`s `/crear-rifa`, `/crear-evento`, `/crear-colecta`, `/panel`, `/mis-iniciativas`, `/login`, `/register`; `sitemap.xml` already lists none of them. Login/Register already carry `noindex` via `Layout`'s prop and resolve canonical to `rifex.pro` through the existing `publicMetadata.js` infra — certified, not modified.

**No cloaking, anywhere**: nothing in this diff branches on `User-Agent`, `navigator.userAgent`, or any bot-identification string — confirmed by self-audit grep across the full diff (see below). Anonymous humans and crawlers receive byte-identical responses everywhere touched by this mission.

**Tests**: new `tests/authUxCrawler.test.mjs` (21 tests) covering navbar copy/structure, Login/Register copy + untouched-Auth-logic invariants, the 5 SSR boundary pages (source-level `getServerSideProps`+`getSupabaseServer`+exact redirect target), `/rifas`'s legitimate redirect-with-noindex, sitemap/robots coherence with the boundary, Blog copy, and `reglas-iniciativas-premio` noindex. Combined with `publicAudit.test.mjs`: 142/142 PASS. Full regression: 568/569 (the same pre-existing XLSX `writeBuffer` timing flake, identical signature). `npm run build`: clean.

**Self-audit** (grep across the full diff for `payment|webhook|marketplace_fee|RIFEX_FEE_RATE|argentina|migration|service_role|Trust writes|User-Agent|googlebot|facebookexternalhit|bytespider`): the only match is the *title string* of one of this mission's own tests, documenting (not introducing) the pre-existing `captchaGate` usage — zero real matches. Confirmed: no Payment Engine changes, no webhook changes, no Trust backend changes, no commission changes, no Argentina activation, no C6, no Stage 3/progressive-onboarding work, no PROD writes, no migrations, no real payments.

**Files changed**: `src/components/Layout.jsx`, `src/pages/{crear-rifa,crear-colecta,crear-evento,login,register,mis-iniciativas,blog/index}.jsx`, `src/pages/panel/index.js`, `src/styles/{login,register}.module.css`, new `src/components/auth/AuthShell.jsx`, new `src/styles/authShell.module.css`, new `tests/authUxCrawler.test.mjs`.

**Status: DEV only.** `origin/main` re-confirmed at `15d7d35` immediately before this commit — completely untouched throughout this mission. Next step (not started here): a future controlled PROD promotion of this work, pending its own explicit authorization — same pattern as every prior PROD release in this project.

---

## RIFEX STAGE 2 — ÚLTIMO BLOQUEO PRE-PROD: /wizard (2026-09-01)

`origin/develop` advanced `d4fd396` → `0244d7b`, DEV only — `main`/PROD confirmed untouched. The final human review of STAGE 2 FINAL found one real remaining public-identity blocker, already flagged as an unresolved finding in that mission's report rather than silently left unnoticed: `/wizard` ("Cómo funciona") still rendered a full public Rifas flow (`"Quiero crear una rifa"`, `"Así funciona una rifa en Rifex"`, número/sorteo/premio/ganador copy, CTA `"Crear mi rifa"` → `/crear-rifa`).

**Fix**: `/wizard`'s public content rebuilt to represent exclusively Eventos + Campañas. The two selectable flows are now `"Quiero crear un evento"` (steps grounded in real existing capabilities: ticket types + cupos, QR issuance, scanner/check-in — CTA → the real `/crear-evento` route) and `"Quiero crear una campaña"` (CTA → the real `/crear-colecta` route). Metadata (`title`/`description`/`canonicalPath`) carried over from the earlier metadata-certification fix, description no longer mentions "rifa" in any form.

**Rifas explicitly preserved**: nothing in Rifas' authenticated architecture was touched — `crear-rifa.jsx`, the Rifas panel, `/mis-iniciativas` (still lists Rifas/Campañas/Eventos), APIs, and data all remain exactly as they were. This mission only changed what the public, unauthenticated `/wizard` page renders.

5 new tests in `tests/publicAudit.test.mjs` (121 total in that file, 548 in the full suite): wizard.js contains no rifa/rifas/sorteo/sorteos/premio/premios in rendered content (code comments explicitly excluded, same convention as the existing "C6"-in-comment exception), offers both real flows with CTAs to the real routes, metadata stays canonical-correct with no leaked terms, sitemap/robots unaffected, and `/mis-iniciativas` + `crear-rifa.jsx` confirmed intact. Full regression: 547/548 (same pre-existing XLSX `writeBuffer` timing flake, identical signature). `npm run build`: clean. Self-audit of the diff (2 files: `wizard.js`, `publicAudit.test.mjs`) found zero references to webhooks, Payment Engine, fee calculation, Trust backend logic, migrations, commission, or Argentina.

**Status: STAGE 2 now has zero known public-identity blockers.** PROD (`main`) still not touched. Next step remains a controlled PROD promotion, pending Rodrigo/Doris's explicit GO.

---

## RIFEX STAGE 2 FINAL — CIERRE ETAPA 2 / PRE-PROD (2026-09-01)

`origin/develop` advanced `1cf81fb` → `e00da51` (3 commits: `0ece82e`, `42987a3`, `e00da51`), DEV only — `main`/PROD confirmed untouched throughout (`rifex.pro` still serves the pre-Stage2 `/terminos` content, e.g. "Términos del Comprador"). This closes out ETAPA 2 with the specific defects Rodrigo + Doris found in their human review of the prior two missions (ETAPA 2, STAGE 2 REPAIR) — not a new audit, not new scope.

**`/terminos` — two final corrections:**
1. Removed the duplicated Privacidad/Cookies summary sections (`id="privacidad"`/`id="cookies"`) — the page now links to the real `/privacidad` and `/cookies` pages instead of maintaining a second, potentially-diverging legal summary inline. `ConsentBanner.jsx` and `registro/continuar.jsx`, which previously linked to `/terminos#cookies`/`/terminos#privacidad`, were repointed to the real pages directly.
2. Removed the specific liability cap "comisiones pagadas a Rifex en los últimos 3 meses" — a specific monetary/time limit shouldn't be published without professional legal review. Replaced with the general, prudent formulation Rodrigo specified: "En la medida permitida por la normativa aplicable, Rifex no será responsable por daños indirectos o lucro cesante."

**`/seguridad` microcopy**: "proteger a compradores y creadores" → "proteger a usuarios y organizadores" (transversal terminology, no logic change).

**`/preguntas-frecuentes` payments alignment**: removed the absolute claim "Rifex nunca los intermedia," replaced with the same prudent operational description already used in `/seguridad`: "Rifex aplica su comisión de servicio mediante la integración con el proveedor."

**Metadata/SEO certification** — audited every public Etapa 2 surface against the real code rather than assuming correctness, and found two real, previously-undetected defects:
- `/planes` and `/wizard` each had their own `<Head>` rendered in parallel with Layout's (without `disableAutoMeta`) — the exact same real Next 14.2.32 key-collision bug already fixed elsewhere in this codebase (Layout's own `<Head>` renders first; on a shared `key`, Next keeps the first occurrence, not the last). Both migrated to Layout's `title`/`description`/`canonicalPath` props, the pattern already used by every other certified page.
- `/wizard`'s meta description literally said "Crear una rifa o iniciar una campaña" — corrected to neutral corporate language. The page **body** (a step-by-step guide with a toggleable "rifa" mode using Rifas-specific terminology) was intentionally **not** touched — that's a content/redesign change outside today's metadata-certification scope, and is flagged below as an unresolved finding.
- `/reglas-iniciativas-premio` (the Rifas-specific annex) was indexed and listed in the sitemap, with "(rifas)" literally in its meta description — given the same product-vs-corporate-identity boundary already established for `/terminos-rifas`, it received the same treatment: `noindex`, removed from `sitemap.xml`, description reworded without "(rifas)". Nothing was deleted — still reachable via direct link from `/terminos-rifas` and `/reembolsos`.
- `index.js` and `eventos/index.jsx` gained explicit `canonicalPath` props for certainty and consistency (their implicit `asPath`-based fallback was already resolving correctly to `rifex.pro`, since `SITE_URL` in `publicMetadata.js` is centralized and hardcoded to `https://rifex.pro` — confirmed, not assumed).

Confirmed live and via source: canonical always resolves to `https://rifex.pro` (never the Vercel DEV domain) across every certified page; no sitemap entry contradicts its own `noindex`; `robots.txt` doesn't contradict `sitemap.xml`; Blog re-certified as fully private (`noindex, nofollow, noarchive`, out of sitemap, out of every navigation surface).

19 new tests in `tests/publicAudit.test.mjs` (116 total in that file, 543 in the full suite). Full regression: 542/543 (the same pre-existing, unrelated XLSX `writeBuffer` timing flake, identical signature). `npm run build`: clean (62/62 pages). Self-audit of the diff against `origin/develop` (12 files) found zero references to webhooks, Payment Engine, fee calculation, Trust backend logic, migrations, or Argentina. Deployed to DEV via the existing auto-deploy integration; live smoke confirmed every fix plus canonical correctness across all certified pages.

**Unresolved finding, explicitly flagged rather than fixed (out of today's scope):** `/wizard`'s page body includes a "rifa" mode with a full step-by-step Rifa-creation walkthrough — this is real Rifas-specific content still reachable from the public, indexed "Cómo funciona" navbar link. Only its metadata was corrected today. Redesigning the wizard's content/toggle structure needs an explicit decision from Rodrigo before PROD promotion, not a silent fix bundled into a metadata pass. Also noted but not touched (not part of today's certification list, and their Head-collision-risk pattern doesn't affect indexing since neither is confirmed public/indexed): `chat/[raffleId].js` and `trust/verificar.jsx` share the same `<Head>`-in-parallel code smell as the two pages fixed today.

**Status: ETAPA 2 functionally closed in DEV, human review completed, metadata certified. PROD not yet touched.** Next step: controlled promotion to PROD, pending Rodrigo/Doris's explicit GO — not yet authorized.

---

## RIFEX STAGE 2 REPAIR (2026-09-01) — ETAPA 2 identity/policy defects fixed in DEV, technically repaired, still pending human review

`origin/develop` advanced `f13cc90` → `74b0aff` (3 commits: `26d0c56`, `c2d9b0d`, `74b0aff`), DEV only — `main`/PROD confirmed untouched throughout (`rifex.pro` still serves the pre-repair copy, e.g. `/terminos` there still shows "Términos del Comprador"). This is a surgical repair mission following defects Rodrigo + Doris found in human review of the earlier ETAPA 2 work — not a new audit, not a new phase, purely copy/surface-separation/tests.

**`/terminos` — the priority fix**: the page had grown a corporate Eventos/Campañas section while still publicly exposing the historical Rifas-specific Comprador/Creador/Condiciones-de-Rifex sections, the "Anexo iniciativas con premio" link, and a visible lawyer-pending banner. Fixed by moving that Rifas content **verbatim** (same text, same anchor ids) to a new `/terminos-rifas` page (noindex) — and updating the 3 real references that depend on those anchors for actual contractual acceptance (`crear-rifa.jsx`'s 3 checkboxes, `rifas/[id].jsx`'s and `BuyerForm.jsx`'s "Términos de la rifa" links) so nothing broke. `/terminos` itself was rewritten as a genuinely corporate document: qué es Rifex, cuentas, Eventos/entradas/Campañas, pagos y comisión (7%, untouched), responsabilidades, reembolsos, suspensión, contacto, modificaciones — linking out to the dedicated policy pages rather than duplicating them.

**Other repairs, each verified against the real code before changing copy** (no evidence was invented; where a claim could be demonstrated true, it was kept as-is):
- `/privacidad`: removed the visible lawyer-pending banner and the operator-identity TODO; "rifas creadas" → "operaciones realizadas mediante la plataforma"; neutral finalidades wording; added a policy-update sentence.
- `/cookies`: "consentimiento de marketing" → "preferencia de medición y publicidad"; the 3 public Meta Pixel claims (never initializes without consent, Reject as accessible as Accept, no PII in any event) were checked against `_app.js`/`ConsentBanner.jsx`/`metaPixel.js` and confirmed true — kept unchanged, not rewritten speculatively.
- `/uso-aceptable`: "Premios o compensaciones inexistentes..." → neutral iniciativas/bienes/servicios wording.
- `/seguridad`: removed "Documentación según riesgo" (excepción de carnet/biometría) entirely; simplified verification section to the certified neutral core sentence; resolved contradictory payment language ("nunca los intermedia" vs. "nunca retiene más allá de su comisión") into one prudent operational description; generalized post-transaction evidence and data-protection language.
- `/cumplimiento`: removed "Reputación futura" entirely — no public announcement of an unimplemented feature (C6 stays undated, unpromised); reworded the Seguridad/Cumplimiento comparison neutrally.
- `/planes`: removed "Rifas y campañas ilimitadas, sin suscripción" from the public commission card; 7% / $0 por publicar / $0 mensualidad untouched, no Payment Engine or calculation change.
- `/reembolsos`, `/politica-eventos`, `/politica-campanas`: same lawyer-pending-banner removal (found during the transversal sweep, same category of defect as the pages above) — technical/factual content preserved as-is.
- Footer: added a discreet "Conoce más productos de Rifex siendo parte de la comunidad" line in the Producto column (no product names listed, links to `/register`).
- Authenticated account dropdown: removed the duplicate "Mis campañas" entry — `/mis-iniciativas` remains the single entry point with its Rifas/Campañas/Eventos cards untouched.

**Legal debt discipline**: every banner removed from a public page was consolidated (not deleted) into `docs/legal/RIFEX_REVISION_LEGAL_PENDIENTE.txt`, which still opens with the same explicit disclaimer that nothing here presupposes legal compliance. No page anywhere declares "reviewed," "approved," or "legally compliant."

12 new/rewritten tests added to `tests/publicAudit.test.mjs` (105 total in that file) covering the A–J checklist from the repair mission, plus the account-dropdown fix. Full regression: 531/532 (the same pre-existing, unrelated XLSX `writeBuffer` timing flake). `npm run build`: clean (62/62 pages). Self-audit of the 3-commit diff against `origin/develop` (17 files) found zero references to webhooks, Payment Engine, fee calculation, Trust backend logic, migrations, or Argentina anywhere in the change. Deployed to DEV via the existing auto-deploy integration; live smoke confirmed every fix (`/terminos` clean, `/terminos-rifas` preserves the historical content and banner, all removed banners/phrases absent, footer line and 7%/$0/$0 present) with every touched page returning `200`.

**Status: technically repaired in DEV, not yet promoted, not legally reviewed.** No PROD write of any kind was made. Nothing here should be read as "legal approved," "production certified," or "PROD approved" — the professional legal review remains pending exactly as before, now tracked more accurately in the consolidated document.

---

## RIFEX ETAPA 2 — IDENTIDAD PÚBLICA + POLÍTICAS (2026-09-01) — DEV ONLY, no promocionada

`origin/develop` advanced `645c42a` on top of the Blog-hide/Blog-private-PROD-promotion chain (`c8363c6` → `0075749` → `ee94054` → `645c42a`), DEV only — `main`/PROD untouched (confirmed live: `rifex.pro` still shows the pre-ETAPA-2 navbar with Precios/Seguridad/Ayuda). Autonomous mission following an explicit combined authorization from Rodrigo covering both a PROD promotion (Blog Private) and, immediately after, this DEV-only identity/policies work with no further permission needed between subtasks.

A gap audit against the mission's scope found most of the required corporate identity already correct (footer already neutral of Blog/rifas, Términos/Cumplimiento already had honest disclaimers, Reembolsos/Políticas de Eventos/Campañas already existed from V4 A+B) — implementation was limited to the real gaps found:

- **Navegación pública**: `navItems` reduced from 6 to exactly `Eventos / Campañas / Cómo funciona` — Precios, Seguridad and Ayuda dropped from the top-level nav (still reachable via footer/internal links, nothing deleted).
- **Footer**: "Precios" → "Comisión" (same `/planes` route; page title/H1 renamed to match, commission content and 7% figure untouched).
- **Seguridad + Privacidad**: the exact RUT↔Mercado Pago comparison mechanic was replaced, in both public pages, with the neutral phrase Rodrigo specified ("Rifex aplica controles de registro, validación de identidad y titularidad de cuentas antes de habilitar determinadas operaciones"); Privacidad gained a new "Verificación y seguridad de la cuenta" section with the exact required text. The real mechanism (`assertCreatorEligible`, `trustIdentityGate.js`) was not touched — only its public description.
- **Cumplimiento**: the day-by-day operational timeline, the exact per-recipient email content, and the internal decision table/states were removed from the public page — that detail lives in the backend (`fulfillmentTimeline.js`) and is not a public communication. The honesty disclaimers already certified (no reemplaza tribunales, no garantiza materialmente, no arbitra, "Hoy no existe ningún puntaje...") were preserved verbatim.
- **Términos**: a new "Eventos, entradas digitales y Campañas de recaudación" section was added, covering the current public product line — the historical/already-accepted Comprador/Creador/Rifex sections for rifas were audited line-by-line before writing and are byte-identical to before (confirmed via `git diff`, only additions).
- **Reportar**: Rifas-specific placeholders (`/rifas/...`, "premio no entregado") neutralized.
- **Uso Aceptable + Cookies**: the visible legal-pending banners were removed from these two public pages specifically (per Rodrigo's explicit instruction) — the underlying legal questions were not resolved, only consolidated into a new internal tracking document (see below). Uso Aceptable gained the required "Rifex actualiza periódicamente..." sentence.
- **Preguntas frecuentes**: fully rewritten around Eventos/entradas/QR-check-in/Campañas/comisión/pagos/reportes — the previous page's Rifas-specific creation flow (publicly indexable) was replaced rather than left alongside the new content.
- **New**: `docs/legal/RIFEX_REVISION_LEGAL_PENDIENTE.txt` — consolidates 10 legal-review points (the two removed banners, both Términos sections, Privacidad, the Rifas annex, Campañas/Eventos/Reembolsos policies, the identity-verification language, and the operator's legal identity) with the required Estado/Observación del abogado/Redacción recomendada/Norma o fundamento structure per point, opening with the exact required disclaimer sentence.

13 new tests added to `tests/publicAudit.test.mjs` (93 total in that file), plus `seguridad.js`/`cumplimiento.js` added to the `CORPORATE_GLOBAL_SURFACES` neutral-language check for future regression detection. Full regression: 519/520 (the pre-existing, unrelated XLSX `writeBuffer` timing flake — same signature as every prior session). `npm run build`: clean. Self-audit confirmed the diff touches only navigation/footer/policy-page files and the new test/doc files — zero references to payments, webhooks, Trust backend logic, commission calculation, or Argentina anywhere in the diff. Deployed to DEV via the existing auto-deploy integration (`rifex-frontend-main`, aliased `rifex-frontend-main.vercel.app`); live smoke confirmed the new navbar, the "Comisión" footer label, the absence of both removed banners, and the absence of the RUT/MP mechanic and day-by-day timeline text, across all touched pages returning `200`.

**Explicitly not done in this mission** (all correctly out of scope): no PROD write of any kind, no Payment Engine change, no commission-rate change, no webhook change, no Trust backend logic change, no Argentina activation, no onboarding progresivo, no Comunidad Rifex, no MP Quality, no C6. This mission does not promote to PROD — that remains a separate, future decision.

---

## ONBOARDING + BANCOS/MP (2026-08-30) — onboarding neutral + revalidación de MP legacy (DEV only)

Baseline reconfirmado: `origin/main = e7311c1`, `origin/develop` incluía
`bee778f`/`ad0b792`/`8cd116b`/`f904c95`/`2f48227` (C1-C5). Nueva rama
`mp-onboarding` desde `origin/develop`.

**Onboarding neutral**: el paso de cierre de `/registro/continuar`
("Un último paso") dejó de mencionar Mercado Pago por completo —
copy genérica ("conecta tu medio de pago") + un único CTA hacia
`/panel/bancos?next=<ruta preservada>`, en vez de los dos botones
anteriores ("Conectar Mercado Pago" / "Ya conecté, verificar") con
texto específico de matched/mismatch/unavailable. Toda esa experiencia
de proveedor vive ahora exclusivamente en `/panel/bancos`.

**`sanitizeNextPath` endurecido** (`src/lib/countryPolicy.js`, único
punto compartido por los 5 call sites existentes): pasó de un chequeo
de prefijo por string a resolver con `new URL()` y comparar `origin`
contra un origen interno de referencia — la técnica recomendada por
OWASP para "safe redirect", cubre backslash-trick, protocol-relative,
esquemas peligrosos y caracteres de control sin enumerar patrones de
memoria.

**`/panel/bancos` — estados A-E explícitos** (nunca solo color):
desconectado, conectado-pendiente-de-validar, validado, inconsistencia
(mismatch), temporalmente no disponible — más un sexto estado
("necesitamos que vuelvas a conectar") para tokens expirados/revocados,
distinguido de mismatch. Botón "Verificar cuenta" nuevo (idempotente,
guarda de doble click) junto al histórico "Conectar"/"Desconectar".
Bloque "¿No tienes cuenta de Mercado Pago?" con el enlace oficial real
de alta (`mercadopago.cl/hub/registration/landing`, verificado en vivo
contra el sitio real), deliberadamente distinto del botón de conectar.
Tarjeta Stripe agregada como catálogo puramente visual
("No disponible en tu país" / "Próximamente", deshabilitado) — cero
integración real. El `next` recibido desde el onboarding sobrevive el
viaje redondo a Mercado Pago vía `sessionStorage` (el callback de OAuth
no se tocó) y ofrece un CTA "Continuar" una vez que
`onboarding_complete_for_creators` es real (confirmado server-side).

**Bug de revalidación legacy corregido**: `src/lib/mpRevalidate.js`
(nuevo) + `POST /api/mp/revalidate` — reutiliza el `access_token` ya
guardado en `merchant_gateways` para volver a consultar `/users/me` y
aplica **exactamente** la regla TRUST-3B ya certificada
(`resolveMpIdentityMatch`, sin cambios) — nunca desconecta, nunca
vuelve a OAuth, nunca crea una segunda fila. Un token muerto (401/403
de Mercado Pago) se distingue de un mismatch real: marca `revoked_at` +
`status='not_connected'` para que `/api/mp/status` refleje
correctamente "necesita reconectar", sin inventar un flujo de refresh
token nuevo.

**Trust/creator eligibility**: `assertCreatorEligible` y la regla
matched-only NO se tocaron. `NULL`/`unavailable`/`mismatch`/solo-
`connected` siguen sin habilitar; solo `matched` real habilita.

**Sin migración**: toda la misión se resolvió con código +
`merchant_gateways`/Trust/Country Gate ya existentes — cero columnas
nuevas, cero políticas RLS nuevas.

**Hallazgo reportado, no corregido** (fuera de alcance explícito — "NO
modificar RLS"): `merchant_gateways` tiene GRANT de tabla completo
(SELECT/INSERT/UPDATE/DELETE) para el rol `anon`, aunque las políticas
RLS (`auth.uid() = user_id`) bloquean correctamente cualquier acceso
real sin sesión — confirmado en vivo, `curl` anónimo devuelve `200 []`
nunca datos reales. No es una fuga de datos hoy, pero es una superficie
más amplia de la necesaria (defensa en profundidad). Documentado para
una futura misión que sí tenga autorización de tocar RLS/grants.

Tests nuevos: 56 (`sanitizeNextPath.test.mjs`, `mpRevalidate.test.mjs`,
`onboardingBancosUx.test.mjs`, cubren los 40 escenarios requeridos).
Regresión completa: 381 tests, 380 pasan (1 flaky de timing XLSX ya
documentado, no relacionado). Ver
`docs/trust/ONBOARDING_BANCOS_MP_NEUTRAL.md` para el detalle completo.

Próximo paso: ningún trabajo adicional autorizado sin nueva instrucción
de Rodrigo (explícitamente NO se comienza Events sin nueva
autorización).

---

## CUMPLIMIENTO-5 (2026-08-30) — mesa de revisión administrativa dentro de /admin (DEV only)

Baseline reconfirmado: `origin/main = e7311c1`, `origin/develop` incluía
`bee778f`/`ad0b792`/`8cd116b`/`f904c95` (C1-C4). Nueva rama
`cumplimiento-5` desde `origin/develop`.

Autoauditoría previa confirmó que Rifex ya tiene un `/admin` real,
protegido por `src/lib/adminAuth.js#resolveAdmin` (Bearer token +
`auth.getUser()` + `app_metadata.role==='admin'`) — **ese mismo
mecanismo se reutilizó sin cambios**; no se creó ningún panel admin
nuevo, ni segundo login, ni segunda autoridad. La sección "Cumplimiento"
se agregó directamente a `/admin` (resumen con 4 KPIs + enlace) y la
gestión detallada vive en la subruta `/admin/cumplimiento` +
`/admin/cumplimiento/[id]` — dentro del mismo panel, no un sistema
separado.

Otro hallazgo clave de la autoauditoría: `raffle_fulfillment_events`
(C1) ya tenía `actor_type` con `'admin'` permitido en su CHECK desde el
día uno, y `event_type` es texto libre. Iniciar revisión, agregar una
nota interna, y resolver una revisión se implementaron como nuevos
`event_type` sobre esa MISMA tabla append-only — **no se creó ninguna
tabla nueva de notas/revisión**. Solo se agregaron 3 columnas nullable
(`admin_review_status`, `admin_reviewed_by`, `admin_reviewed_at`) a
`raffle_fulfillment_cases` como resumen mutable de lectura rápida
(mismo patrón exacto que `creator_response`/`winner_response` desde
CUMPLIMIENTO-1).

La resolución administrativa es una capa estrictamente posterior:
`resolveAdminReview` nunca toca `winner_response`, `creator_response`,
`closed_at`, `escalation_reason` ni ningún evento histórico — solo
agrega un evento nuevo y actualiza el resumen de revisión. Estados de
revisión: `null` (pendiente), `in_review`, `resolved`,
`closed_without_determination` — deliberadamente sin `fraud`/`guilty`/
`criminal`; el sistema nunca determina delitos.

Se corrigió voseo argentino remanente en las superficies de
Cumplimiento tocadas por C3/C4 (`tenés`→`tienes`, `podés`→`puedes`,
`Contanos`→`Cuéntanos`, `Coordiná`→`Coordina`, `Respondé`→`Responde`,
`vos`→`tú`, etc.) en `mailer.js` y las páginas de
`/cumplimiento`/`/panel/cumplimiento`.

29 tests nuevos (`tests/adminFulfillmentReview.test.mjs`, cubren los 40
escenarios requeridos), certificados también en vivo contra
`rifex-dev` reutilizando el fixture residual de C2/C3/C4 (ya escalado
por la propia QA de C4): listado+resumen, expediente sin exponer el
token del ganador, iniciar revisión, agregar nota, resolver, reintento
idempotente, y verificación explícita de que nada automático se alteró.
325 tests totales en la suite completa (324 pasan, 1 flaky de timing
XLSX ya documentado, no relacionado). Ver
`docs/cumplimiento/CUMPLIMIENTO_5_ADMIN_REVIEW.md` para el detalle
completo, incluida la limitación conocida: no se hizo un click-through
en navegador real de las nuevas páginas `/admin/cumplimiento*` (solo
QA a nivel de librería + forma de API contra datos reales de DEV) —
recomendado antes de un uso más amplio.

Próximo paso: ningún trabajo adicional autorizado sin nueva instrucción
de Rodrigo (explícitamente NO se comienza CUMPLIMIENTO-6).

---

## CUMPLIMIENTO-4 (2026-08-30) — respuestas + Día 10/15/20 + escalamiento interno (DEV only)

Baseline reconfirmado: `origin/main = e7311c1`, `origin/develop` incluía
`bee778f` (C1), `ad0b792` (C2), `8cd116b` (C3). Nueva rama
`cumplimiento-4` desde `origin/develop`. No se duplicó ninguna tabla —
C1/C2/C3 ya dejaban estructura suficiente; solo se agregaron 3 columnas
(`closed_at`, `escalated_at`, `escalation_reason`) a
`raffle_fulfillment_cases`.

Activó las respuestas del ganador (token seguro, sin cuenta) y del
creador (sesión + ownership), extendió `evaluateFulfillmentStatus` con
`determineEscalationReason` (distingue `winner_denied_receipt` de
`winner_no_response`), y construyó `processFulfillmentTimeline(now)`
(`src/lib/fulfillmentTimeline.js`) — orquestador puro en su lógica
temporal (nunca lee el reloj, siempre recibe `now` explícito) que aplica
Día 10 (pregunta), Día 15 (recordatorio solo a quien no respondió) y
Día 20 (cierre automático + escalamiento interno + avisos de revisión),
todo idempotente vía el ledger de comunicaciones de C3 + la guarda
`closed_at is null`. Nuevo endpoint cron
`src/pages/api/cron/fulfillment-scheduler.js` (mismo patrón
`CRON_SECRET` que `draw-scheduler.js`) — **no activado en PROD**. UI
mínima activada en `/cumplimiento/caso/[token].jsx` (respuestas del
ganador) y nuevas `/panel/cumplimiento/{index,[id]}.jsx` (respuestas del
creador). `/cumplimiento` público sigue "Próximamente".

QA temporal certificada contra `rifex-dev` real (`processFulfillmentTimeline`
con `now` explícito = `winner_determined_at + {10,15,20} días`, nunca
esperas reales, nunca se tocó el reloj) reutilizando el fixture residual
de C2/C3 en vez de crear uno nuevo permanente. 41 tests nuevos
(`tests/fulfillmentTimeline.test.mjs`, cubren los 35 escenarios
requeridos + adversariales), 296 tests totales en la suite completa
(295 pasan, 1 flaky de timing XLSX ya documentado, no relacionado). Ver
`docs/cumplimiento/CUMPLIMIENTO_4_RESPONSES_AND_TIMELINE.md` para el
detalle completo.

---

## CUMPLIMIENTO-3 (2026-08-30) — comunicaciones Día 0 + acceso seguro del ganador (DEV only)

Baseline reconfirmado: `origin/main = e7311c1`, `origin/develop` incluía
`bee778f` (CUMPLIMIENTO-1) y `ad0b792` (CUMPLIMIENTO-2). Nueva rama
`cumplimiento-3` desde `origin/develop`.

Auditado el flujo real de emails antes de codificar:
`notifyWinnerDrawn` ya mandaba `sendWinnerEmail`/`sendCreatorWinnerEmail`
sin información de premio/entrega/transferencia ni link de acceso. Se
**enriquecieron esos mismos dos correos** (nunca se creó un tercero) —
ahora incluyen la modalidad de entrega, gastos/condiciones de
transferencia (del snapshot congelado del caso, nunca de la rifa
actual), y, para el ganador, un link seguro a su caso.

`notifyWinnerDrawn` ahora delega a `sendDay0Communications`
(`src/lib/fulfillmentCommunications.js`) después de asegurar el caso
(CUMPLIMIENTO-2, sin cambios) — con fallback a los correos planos sin
enriquecer si el caso no se pudo asegurar, para que Cumplimiento nunca
reduzca la confiabilidad de la notificación ya existente. `drawWinner()`
no se tocó.

Migración aditiva
`db/migrations/2026-08-30_cumplimiento3_communications_and_winner_access.sql`:
`raffle_fulfillment_communications` (ledger idempotente,
`UNIQUE(case_id, communication_type, recipient_role)` como autoridad
real de intención exactly-once — un reintento siempre actualiza la
misma fila, nunca inserta una segunda) + `winner_access_token_hash`/
`winner_access_token_created_at` en `raffle_fulfillment_cases`. RLS
default-deny total en el ledger — verificado en vivo contra `rifex-dev`
real (`401`/`42501`).

Token del ganador: `crypto.randomBytes(32)` (256 bits), **nunca
persistido en texto plano** — solo su SHA-256 se guarda. Se auditó el
patrón existente de `event_orders.access_token` (texto plano) y se
decidió deliberadamente no copiarlo, por instrucción explícita del
mandato. El token nunca expira por tiempo y solo rota mientras el envío
al ganador no esté confirmado (`status='sent'`) — una vez confirmado,
queda estable para todo el ciclo de vida futuro del caso.

Nueva ruta pública `GET /api/cumplimiento/caso/[token]` (rate-limited,
mismo patrón que `/api/events/orders/[token]`) + página
`/cumplimiento/caso/[token]` — solo lectura, sin acciones de respuesta
todavía, expone estrictamente lo necesario (nunca PII de terceros, ni
el propio token). El creador sigue usando su sesión Rifex autenticada
— sin token guest nuevo para él.

44 pruebas nuevas (evaluación de comunicaciones + token + exposición de
datos) + QA en vivo contra `rifex-dev` reutilizando el caso residual ya
documentado de CUMPLIMIENTO-2 (sin fixture nuevo, sin emails reales) +
regresión completa: 255 tests totales, 254 pass, 1 flaky ya documentado
(mismo timing XLSX de EVENT-3) — cero fallos funcionales nuevos.
`npm run build` PASS. PROD, `main` y `/cumplimiento` (que sigue diciendo
"Próximamente") sin tocar. Detalle completo en
`docs/cumplimiento/CUMPLIMIENTO_3_COMMUNICATIONS.md`.
**CUMPLIMIENTO-4 (respuestas creador/ganador) remains NOT AUTHORIZED.**

---

## CUMPLIMIENTO-2 (2026-08-30) — integración DRAW → fulfillment case (DEV only)

Baseline reconfirmado: `origin/main = e7311c1`, `origin/develop` incluía
`bee778f` (CUMPLIMIENTO-1). Nueva rama `cumplimiento-2` desde
`origin/develop`.

Conecta el resultado autoritativo de DRAW (`raffle_results`, PK
`raffle_id`) con `ensureFulfillmentCaseForRaffle` de CUMPLIMIENTO-1: se
agregó una llamada a esa función al inicio de
`notifyWinnerDrawn(raffleId, winner)` en `src/lib/drawWinner.js`, en su
propio `try/catch` — nunca depende del éxito del email ni bloquea su
envío, y viceversa. `notifyWinnerDrawn` ya se invocaba exactamente una
vez por sorteo real (guardado por `isNew:true` de `drawWinner()`) desde
los 3 call sites existentes — ningún call site fue tocado, ningún
cambio al algoritmo de sorteo, elegibilidad de tickets, ni la
protección exactly-once ya certificada de `raffle_results`.

17 pruebas nuevas (`tests/drawFulfillmentIntegration.test.mjs`) contra
un almacén en memoria con la lógica REAL de `drawWinner`/
`notifyWinnerDrawn`/`ensureFulfillmentCaseForRaffle` cubren los 18
escenarios requeridos: exactly-once bajo retry secuencial y
concurrente, snapshot inmutable ante ediciones posteriores de la rifa y
la compra, ausencia total de backfill para resultados históricos,
independencia caso↔notificación en ambos sentidos, recovery idempotente,
y ausencia estructural de cualquier endpoint público que exponga la
recuperación. Además, una prueba de integración real contra
`rifex-dev` (fixture desechable, `ENABLE_EMAILS=false`) confirmó el
flujo completo en vivo.

**Hallazgo real durante la limpieza del fixture de la prueba en vivo**:
el trigger append-only de `raffle_fulfillment_events` (CUMPLIMIENTO-1)
bloquea correctamente el `DELETE` en cascada del caso una vez que tiene
al menos un evento — lo cual es el comportamiento deseado, no un bug.
No se intentó deshabilitar el trigger para forzar la limpieza. Quedó un
residuo permanente en `rifex-dev` (1 fila en `raffles`/`purchases`/
`raffle_fulfillment_cases`/`raffle_fulfillment_events`, sin PII real,
título "CUMPLIMIENTO-2 DEV integration fixture") — implicación real:
todo caso de cumplimiento, una vez creado, es permanente por diseño.
Detalle completo, incluyendo el análisis previo de `drawWinner()`, en
`docs/cumplimiento/CUMPLIMIENTO_2_DRAW_INTEGRATION.md`.

Regresión completa: 235 tests totales, 234 pass, 1 flaky ya documentado
(mismo timing XLSX de EVENT-3) — cero fallos funcionales nuevos.
`npm run build` PASS. Sin migración nueva — CUMPLIMIENTO-1 ya proveía
el schema necesario. PROD, `main` y `/cumplimiento` (que sigue diciendo
"Próximamente") sin tocar. **CUMPLIMIENTO-3 (respuestas creador/ganador)
remains NOT AUTHORIZED.**

---

## CUMPLIMIENTO-1 (2026-08-30) — fundación técnica de Rifex Cumplimiento (DEV only)

Baseline reconfirmado antes de trabajar: `origin/main = e7311c1` (tag
`v2.1-rifex-full-prod`), sin drift. Nueva rama `cumplimiento-1` desde
`origin/develop` (`8cd0cf9`).

Migración aditiva `db/migrations/2026-08-30_cumplimiento1_foundation.sql`
crea `raffle_fulfillment_cases` (`raffle_id` como PRIMARY KEY —
imposible duplicar caso por rifa a nivel de base de datos, mismo patrón
que `raffle_results`) y `raffle_fulfillment_events` (log append-only,
mismo patrón exacto que `trust_identity_audit_log` de TRUST-3A: trigger
rechaza UPDATE/DELETE). RLS default-deny total en ambas — cero
políticas, todo acceso vía `service_role` + ownership filtrado en la
query de la API (mismo criterio que `trust_onboarding`/`event_orders`).
Verificado en vivo contra `rifex-dev` real: la clave `anon` recibe
`401`/`42501 permission denied` en ambas tablas.

Dominio puro `src/lib/fulfillmentEvaluation.js`
(`evaluateFulfillmentStatus`) codifica los 6 estados ya publicados en
`/cumplimiento` desde RIFEX CLOSURE PASS — sin scheduler, sin
`Date.now()` escondido, `afterDeadline` como parámetro explícito que
nadie invoca todavía. `src/lib/fulfillmentCaseService.js` expone
`ensureFulfillmentCaseForRaffle` (idempotente por colisión de PK real,
certificado con 5 llamadas concurrentes vía `Promise.all` → exactamente
un caso creado), `recordCreatorResponse`/`recordWinnerResponse` (cada
respuesta se audita antes de sobreescribir el estado actual) y
`getCreatorCases`/`getCreatorCaseDetail` (ownership aplicado en la
query). 2 endpoints mínimos, ambos GET, ambos exigen Bearer token real:
`GET /api/panel/cumplimiento` y `GET /api/panel/cumplimiento/[id]`.

`drawWinner()`/`notifyWinnerDrawn()` **no fueron modificados** — el
punto de integración para que CUMPLIMIENTO-2 cree el caso
automáticamente al determinar un ganador quedó auditado y documentado
(nunca conectado) en
`docs/cumplimiento/CUMPLIMIENTO_1_FOUNDATION.md`, sección 13.

27 pruebas nuevas (14 evaluación pura + 13 servicio con mock en
memoria, mismo patrón de `tests/trust3bE2EFlow.test.mjs`) + regresión
completa: 218 tests totales, 217 pass, 1 flaky ya documentado (mismo
timing XLSX de EVENT-3) — cero fallos funcionales nuevos. `npm run
build` PASS. Migración aplicada solo a `rifex-dev` — PROD, main y
`/cumplimiento` (que sigue diciendo "Próximamente") sin tocar. Detalle
completo en `docs/cumplimiento/CUMPLIMIENTO_1_FOUNDATION.md`.
**CUMPLIMIENTO-2 (cron/scheduler/emails/ciclo temporal) remains NOT AUTHORIZED.**

---

## RIFEX CLOSURE PASS (2026-08-30) — physical prize transparency + Crear Rifa refresh + Rifex Cumplimiento roadmap (DEV only)

Product closure pass before the next PROD release. Removed the "Temática" selector from Crear Rifa — audited and confirmed it never controlled the ticket-number icon set (`useIconsMap.js` uses a fixed global order, independent of `theme`) and had no other functional effect; new raffles are created with `theme='mixto'` fixed, historical raffles/badges untouched, no data migration. "A convenir" is no longer offered as a delivery option for **new** raffles (only Retiro/Envío pagado por el creador/Envío pagado por el ganador) — historical raffles with `delivery_method='a_convenir'` keep working unchanged.

New transparency contract for physical prizes that require transfer/procedures (e.g. vehicles, property): additive migration (`db/migrations/2026-08-29_physical_prize_transfer_transparency.sql`) adds `requires_transfer_procedures boolean default false`, `transfer_expenses_owner text` (constrained to `creator|winner`), `transfer_conditions text` to `raffles`, applied to `rifex-dev` only. The same migration redefines `create_raffle_with_declarations` (the atomic creation RPC) to include the 3 new columns — its INSERT uses an explicit column list, so without this redefine the new fields would have been silently dropped on every creation. Server-side validation in `POST /api/rifas` and `PATCH /api/rifas/[id]` is fail-closed: money raffles force all delivery/transfer fields to null/false regardless of payload; physical-without-transfer forces owner/conditions to null; physical-with-transfer requires a valid owner and non-empty trimmed conditions. `delivery_method` and the 3 transfer fields are frozen (409 `fields_locked_after_first_sale`) once `tickets.status='sold'` exists for the raffle — same authoritative indicator DRAW-1 already used for `prize_type`/`prize_amount_cents`, extended without redesign.

Public `/rifas/[id]` now shows a single "Información del premio" block (amber when the winner bears a cost, green when the creator includes it, neutral otherwise) before purchase, plus a compact cost-disclosure line in the BuyerForm summary immediately before payment. Términos del Creador gained a paragraph on transfer/delivery disclosure obligations — the "PENDIENTE DE REVISIÓN POR ABOGADO CHILENO ANTES DE PROD" banner is untouched. Footer gained a "Rifex Cumplimiento" link. New public page `/cumplimiento` documents the post-raffle compliance-tracking roadmap (flow, emails, day 0/10/15/20 timeline, decision rules, conceptual states) — explicitly marked "Próximamente/En preparación"; **no scheduler, no real emails, no new storage implemented** — it's documentation, not a backend.

Certified end-to-end against real `rifex-dev`: full creation matrix (money, physical × 3 delivery modes, with/without transfer for both expense owners), adversarial payloads rejected, post-sale freeze confirmed, footer link verified. Commit `a47fc40` (pushed to `origin/develop`). Trust untouched. PROD untouched.

Known limitation this session: could not interactively click-verify the Crear Rifa radio controls nor load `/rifas/[id]` via the browser automation tool (a pre-existing `router.isReady` gate — code not touched by this pass — never resolved for hard-navigated dynamic routes in this specific tool combination; static routes loaded fine). Verified instead via full build success, code review, and exhaustive live API-level testing against real `rifex-dev` data.

## RIFEX TRUST-3B (2026-08-29) — RUT↔Mercado Pago match certified end-to-end (DEV only)

Audited what TRUST-3B already had implemented (`extractMpRutFromUsersMe`, `resolveMpIdentityMatch`, `evaluateMpIdentityMatch`, `assertCreatorEligible` — all pre-existing, none redesigned) and found one real gap: RUT extraction from `/users/me` never checked `identification.type`, only that the number passed Chile's modulo-11 check digit — an identification of another document type whose number happened to match that algorithm would still have been extracted and could produce a false match. Fixed in commit `20b4362` (pushed to `origin/develop`): if `identification.type` is present and isn't `"RUT"`, extraction now returns `null` (never `matched`); if `type` is absent (legacy/unknown shape), original defensive behavior is preserved. Confirmed live against real `rifex-dev`: `identification.type="CPF"` with a number identical to the declared RUT correctly resolves to `unavailable`, not `matched`.

Certified the full flow end-to-end both with a new test suite (`tests/trust3bE2EFlow.test.mjs` — real functions from both modules against a shared in-memory store, not per-function mocks) and live against `rifex-dev`: a disposable QA user completed onboarding, declared a synthetic test RUT, and reproduced the exact `oauth/callback.js` sequence (connect first, resolve match second). Verified: the OAuth race window (connected, match not yet resolved) blocked `POST /api/rifas` with `mp_check_pending`; MATCH allowed it and a real raffle was created; MISMATCH and all CASO 3 variants (no identification, wrong type, malformed response) blocked with the correct reasons. No Mercado Pago RUT was ever persisted — only the comparison result. 119/119 tests pass (113 pre-existing + 6 new), build clean. Trust remains DEV ONLY — nothing was promoted to PROD.

## RIFEX COUNTRY GATE (2026-08-29) — Argentina disabled

The country-selection modal (`onboarding/pais.jsx`) showed Argentina as selectable in DEV because `countryPolicy.js`'s `AR` entry had `devOnly: true`, and `isCountryActive()` activates any `devOnly` country whenever `NEXT_PUBLIC_STAGE=development`. Fixed in commit `f7398b2` (pushed to `origin/develop`) by flipping `AR.devOnly` to `false` — a single-flag change, not a reversal of AR1/AR2 infrastructure. Chile unaffected (`enabled: true`, untouched). Since `evaluateCountryGate`/`isCountryActive` are the single shared source of truth behind the modal, `POST /api/onboarding/country`, and all 5 country-gated points (rifas, colectas, events, MP OAuth start, checkout), this one change closes the UI *and* the `country_code=AR` bypass simultaneously — confirmed via code trace, not just the modal. 10/10 tests pass, build clean. Argentina remains **fuera de operación** — this is not a reactivation of the international payments work.

## RIFEX TRUST REENTRY (2026-08-29) — fail-open fix

`origin/main` (PROD) is now at `3f3d6c4` — EVENTS V1 was promoted to PROD, cherry-picked from `develop` before Trust existed, so Trust remains **DEV ONLY / NOT CERTIFIED PROD** by construction. On `develop`, `assertCreatorEligible` (`src/lib/trustIdentityGate.js`) had a real fail-open: it used a blocklist that only rejected `mismatch`/`needs_review`/`checking`/`not_connected`, so `mp_identity_match = NULL` or `'unavailable'` fell through and authorized the caller. NULL is reachable live — `oauth/callback.js` sets `merchant_gateways.status='connected'` before `resolveMpIdentityMatch` resolves the match in a separate try/caught write. Fixed in commit `2d86d3c` (pushed to `origin/develop`): the gate now only authorizes `mp_identity_match === 'matched'`, everything else blocks. 45/45 tests pass, full build clean. A live, read-only investigation of what Mercado Pago Chile's `/users/me` actually returns for RUT (needed to know whether `'matched'` is realistically reachable at all) follows in the same session — see the report delivered to Rodrigo/Doris for the outcome, not duplicated here.

## RIFEX CURRENT STATE (2026-08-24 — Santiago → Antofagasta notebook handoff)

**Everything below this line, down to "END CURRENT STATE", supersedes the legacy Alignment/Architecture-Audit/Sprint-R4 narrative further down in this file for anything about current branch state, HEAD, or Events work.** That older material (HEAD `1aa97cd`, Sprint R4, DB Recovery incident) is preserved unedited below as historical record — it predates everything described here and is no longer the frontier of the project. Do not resume work from the old section without first reading this one.

### Git baseline (confirmed via `git fetch` + `git log` + `git status`, this session)

| Item | Value |
|---|---|
| `origin/develop` HEAD | `725c4f8` — `feat(events): add tickets and QR fulfillment` |
| `origin/main` HEAD | `c944bb3` — `docs(release): certify Rifex 2.0 production baseline` |
| Local branch | `develop`, matches `origin/develop` exactly |
| Working tree | clean (one stray untracked `supabase/` ephemeral dir from migration tooling was removed; nothing else) |
| Remote | `origin` → `https://github.com/ravymaster/rifex-frontend-v2.git` |

### PROD (`rifex.pro`, Vercel project `rifex-frontend-v2`, Supabase `wrdkdfuiwlujfxxijpao`)

`main` at `c944bb3` — **Rifex 2.0 certified baseline**: raffles + colectas + DRAW-1/1B/2 automatic draw scheduler + PRE-LAUNCH-FIX-1/2 security hardening (atomic ticket reservation, `approved_unfulfilled` late-payment handling, rate limiting, RLS on `rate_limit_hits`/`legal_declarations`). **Events/Eventos has NOT been promoted to PROD in any form** — no `events`/`event_ticket_types`/`event_orders`/`event_order_items`/`event_tickets` tables, no Events code, exist on `main` or in PROD Supabase. PROD Supabase migration history: 6 migrations, most recent `20260823100000` (PRE-LAUNCH-FIX-2 hardening). PROD was **not touched** by any EVENT-1/2/3 session — confirmed read-only after every phase.

### DEV (Supabase project `rifex-dev` / `nwxrvwbzqbhznscyirbq`, Vercel project `rifex-frontend-main` → `rifex-frontend-main.vercel.app`)

`develop` at `725c4f8` — everything PROD has, **plus** the full Events V1 stack through ticket issuance:

| Stage | Status | Delivered |
|---|---|---|
| EVENT-0 | Architecture approved (discovery only, no code) | Domain model, lifecycle, QR design decision, staff model, 6-phase plan |
| EVENT-1 | **DONE** | Foundation — create/publish event, ticket types, public pages, `/mis-iniciativas`, `/panel/eventos` |
| EVENT-2 | **DONE** | Checkout + Orders + Mercado Pago — atomic reservation, TTL, webhook, reconciliation, `approved_unfulfilled`, guest access token, 7% commission via `platformFee.js` |
| EVENT-3 | **DONE** | Tickets + QR — exactly-once issuance, per-ticket QR, guest "my tickets" page, `/t/[token]` resolver |
| EVENT-4 | **DONE — CERTIFIED (100/100 manual acceptance, real phone, Rodrigo)** | Staff (`door` role) + scanner + atomic check-in. Spec at `docs/events/EVENT4_STAFF_SCANNER_CHECKIN.md`. See "EVENT-4 checkpoint" and "final manual acceptance" below |
| EVENT-5 | **IMPLEMENTED — automated tests + build PASS, no live-browser verification yet** | Analytics dashboard + XLSX export (5 sheets), organizer-only. Spec at `docs/events/EVENT5_ANALYTICS_XLSX.md`. See "EVENT-5 checkpoint" below |

Supabase `rifex-dev` migration history: `db/migrations/2026-08-25b_event4_staff_scanner_checkin.sql` applied 2026-08-25 (manually, via the Supabase SQL Editor — see "EVENT-4 checkpoint" below for why). DEV Vercel deploy target: `rifex-frontend-main` project, `--prod` alias (its own top-level environment, unrelated to real PROD — see Reentry Notebook Warnings below).

### EVENT-3 checkpoint (functional, not a documentation-only commit)

```text
develop:  725c4f8
commit:   feat(events): add tickets and QR fulfillment
Verdict:  GO EVENT-4
```

Evidence (live DEV, this session):
- 20/20 functional+security tests PASS (A–T battery: quantities, non-paid states never issue, idempotent repeat-issuance, unique `qr_token`/`ticket_number`, QR 404 on invalid token, 20× GET does not consume, guest-token isolation, organizer-ownership isolation, void auditable).
- **Exactly-once issuance under concurrency**: 20 simultaneous `issue_event_order_tickets` calls on one paid order (quantity=3) → exactly 3 tickets in the database, verified by direct count, not by RPC response alone.
- Replay test: mark-paid + 3 concurrent issuance calls → exactly 2 tickets (not 6).
- `approved_unfulfilled` orders verified to never issue tickets, even with a valid `mp_payment_id`.
- QR scan ≠ check-in verified live in a real browser: `used_at` stayed `null` and `status` stayed `valid` after visiting `/t/[token]`.
- `npm run build` PASS, clean.
- QA fixtures: **0 residual** — see "Cleanup incident and correction" below.
- PROD confirmed untouched before and after (`origin/main` unchanged, PROD Supabase migration count unchanged).

**Cleanup incident and correction (self-detected during this session, not by the user):** EVENT-2's automated concurrency test (20 simultaneous buyers) never added its winning orders to that script's own cleanup list, which silently blocked (via a foreign-key constraint whose error return was never checked) the deletion of 6 test events, their ticket types, and 20 orders — one of those events was left `published` and publicly visible on `/eventos`. Found while doing EVENT-3's own regression smoke, corrected in this session (deleted in the correct FK order: tickets → order_items → orders → ticket_types → events), and reverified with a full sweep showing 0 events/orders/tickets/test-users/fake-gateways remaining on `rifex-dev`. Lesson captured in Risks/Pending below.

### EVENT-4 checkpoint (functional, applied to `rifex-dev` 2026-08-25)

```text
develop:  (this commit)
Verdict:  GO EVENT-4
```

**Migration application mechanism (resolves the open question EVENT-3 left about how SQL reaches `rifex-dev`):** `supabase db push`/`db pull` both refuse to operate — the 9 pre-EVENT-4 migrations were never recorded in the CLI's own `supabase_migrations.schema_migrations` bookkeeping table (`LegacyDbPushMissingLocalError`/`LegacyDbPullMigrationConflictError`), and the only CLI-offered fix, `supabase migration repair`, was explicitly withheld this session. `db/migrations/2026-08-25b_event4_staff_scanner_checkin.sql` was instead applied by pasting the full file into the Supabase Dashboard's SQL Editor for `rifex-dev` and executing it directly (`Success. No rows returned.`) — confirmed applied via read-only verification immediately after (see Evidence below), never via `psql`/`pg_dump`/any direct Postgres connection. Future Events migrations should expect to use the same manual SQL Editor path unless someone deliberately backfills the CLI's migration history first.

Evidence (live DEV, this session):
- Read-only structural verification immediately after the manual apply: `event_staff`/`event_checkins` tables exist; RLS genuinely blocks `anon` (`permission denied`, not just an empty result — confirms `revoke all` took effect, not only a missing SELECT policy); both new RPCs (`check_in_event_ticket`, `find_user_id_by_email`) return `permission denied` (`42501`) for `anon` and succeed for `service_role`; all 5 EVENT-1/2/3 tables still queryable; `event_tickets.used_at` column present.
- **36/36 functional+security tests PASS**, run twice against the real HTTP API (not just the RPC in isolation) with real Supabase-authenticated test users, real events, and real tickets issued via the actual EVENT-3 `issue_event_order_tickets` RPC (not fabricated rows) — organizer/door-active/door-revoked/random/anon authorization; ticket void; ticket from a different event (`ticket_wrong_event`, verified unconsumed after); staff authorized only for a different event; cancelled event; QR malformed → `invalid_token`; nonexistent ticket → 404; `GET /t/[token]` before **and** after check-in never mutates `used_at`, across repeated calls; `event_checkins` gets exactly one row with the correct `checked_in_by`; staff management (owner adds/revokes, non-owner/`door` rejected on both); manual fallback (`ticket_number`) staff-only, same atomic authority as QR; public read endpoints (`/api/events`, `/api/events/[id]`) unaffected.
- **Exactly-once check-in under concurrency**: 20 simultaneous `POST /api/events/[id]/check-in` calls against the real HTTP server, same `qr_token` → exactly 1 `pass`, exactly 19 `already_used`, `used_at` set once, exactly 1 `event_checkins` row — verified by direct DB count, not by response inspection alone. Ran twice (once per test pass) with identical results.
- `npm run build` PASS, clean, after a full `.next` cache wipe (a `.next` corruption from running `build` concurrently with a live `dev` server mid-session was found and fixed — see Risks/pending).
- QA fixtures: **0 residual** — 6 test events, 26 test tickets/orders, 14 test users created across two test passes, all deleted with `if (error) throw` on every step, final sweep confirmed `0`/`0`.
- PROD confirmed untouched: `origin/main` unchanged, no Supabase CLI command targeted `wrdkdfuiwlujfxxijpao`, no `rifex.pro` request made.
- ~~Camera capture/visual overlay not verified in a real browser~~ — **RESOLVED**, see "First manual acceptance test" below. The automated Browser pane limitation noted earlier this session (never reaching a visible/composited state) turned out not to matter: Rodrigo tested on his own real phone instead.

### First manual acceptance test on a real phone (2026-08-25) — bug found and fixed

Rodrigo confirmed on a real device: camera opened correctly, DEV clearly identifiable, mobile-first layout correct, second scan correctly showed "NO PASA — YA UTILIZADA" with the right check-in hour. **But** the first scan's green "PASA" appeared and disappeared too fast to screenshot.

**Root cause, confirmed by code review, not guessed:** `scanner.jsx` had a `RESULT_AUTO_RESET_MS = 2800` timer that automatically cleared the visible result and resumed the camera decode loop 2.8 seconds after *any* result, regardless of whether the phone was still pointed at the same QR. Rodrigo was still aiming at the screen to take a photo when the timer fired, the decode loop resumed, immediately re-detected the same (now-consumed) QR, and fired a second real `POST /api/events/[id]/check-in` — which correctly returned `already_used` and overwrote the visible `pass` result before he could react. **Not a race in the atomic check-in itself** (the DB-level exactly-once guarantee held — only one `event_checkins` row was ever created for that ticket) — the bug was purely in the client's decision to keep scanning after a result, contradicting the spec's own "queda listo rápidamente para el siguiente escaneo" *never* meaning "automatically, without the door person's input."

**Fix**: removed the auto-reset timer entirely. All detection-gating logic was extracted into `src/lib/scannerController.js` — a `locked` flag that a detection sets *synchronously*, before any `await`, and that only `reset()` (wired exclusively to the "Siguiente escaneo" button) can clear. The camera's `requestAnimationFrame` decode loop is now explicitly stopped (`cancelAnimationFrame`) the instant a detection is accepted, not just gated by a flag inside the loop, and only restarted on `reset()`. The manual `ticket_number` fallback and the "Siguiente escaneo" button itself route through the same lock, guarding against double-tap. `tests/scannerController.test.mjs` (`npm run test:scanner-controller`, Node's built-in `node --test`, no new dependency) reproduces the exact failure mode — 5 consecutive detections of the same QR fired synchronously before the first response resolves — and asserts exactly 1 underlying request fires; 4 tests total, all PASS. Re-ran the full 36-test HTTP suite plus the 20-concurrent check-in test after the fix: unaffected (6/6 spot-check + concurrency PASS again), since the fix is entirely client-side.

A second, unconsumed ticket was issued on the same `EVENT-4 TEST` fixture event for Rodrigo to repeat the manual test against the fixed scanner.

### EVENT-4 — final manual acceptance, confirmed (2026-08-25)

Fix committed at `c32713e` (`fix(events): stop scanner from auto-resuming and double-submitting`), deployed to `rifex-frontend-main`, re-tested by Rodrigo on a real phone against a fresh, previously-unconsumed ticket on the same `EVENT-4 TEST` fixture event. Confirmed:

- real browser camera opened and read a real QR off a screen;
- first scan → `PASA`, and it **stayed visible** — no automatic disappearance;
- the camera did **not** resume scanning on its own; resumption only happened when Rodrigo tapped "Siguiente escaneo";
- second scan of the same (now-consumed) QR → `NO PASA — YA UTILIZADA`, with the real check-in hour shown;
- mobile-first layout held up on a real device; manual fallback visible; DEV clearly identifiable as DEV.

```text
develop:  c32713e (fix), on top of a1093b6 (feat)
Verdict:  EVENT-4 — ACEPTADO 100/100 (Rodrigo, real-phone manual test)
```

All EVENT-4 TEST fixture data (1 event, 3 orders/tickets/checkins, 1 ticket type, 1 dedicated test account) was deleted from `rifex-dev` after acceptance, identified and removed by exact ID (not by pattern/prefix) — confirmed `rifex-dev` had exactly this one event and one user in the entire database both before and after, so nothing else could have been or was affected. `origin/main`/PROD untouched throughout.

### Architecture map — Events (EVENT-1/2/3/4), just enough to reorient without re-reading source

**EVENT-1 — catalog**
- `events` (draft/published/cancelled), `event_ticket_types` (active/hidden, `quantity_total`/`quantity_sold`).
- RLS: public SELECT only if `published`/`active`; all writes via service-role API routes, never client-direct.
- Key files: `src/pages/api/events/**`, `src/pages/eventos/**`, `src/pages/crear-evento.jsx`, `src/pages/panel/eventos/**`.

**EVENT-2 — checkout/orders**
- `event_orders` (`pending`/`paid`/`expired`/`cancelled`/`approved_unfulfilled`), `event_order_items` (price/name snapshot per line).
- Inventory: `event_ticket_types.quantity_reserved` added; available = `total - sold - reserved`, enforced by a DB `CHECK`.
- Atomic RPCs: `create_event_order` (reserve + snapshot + fee, all-or-nothing), `expire_event_order` (idempotent TTL release), `mark_event_order_paid` (reserved→sold, late-payment-safe).
- Guest checkout: no login; `event_orders.access_token` (opaque) is the only recovery credential.
- Commission: `src/lib/platformFee.js`, `PLATFORM_FEE_RATE = 0.07` — a **new, Events-only** source, deliberately not merged with the certified `RIFEX_FEE_RATE` in `checkout/mp.js`/`checkout/colecta.js` (touching those was judged higher-risk than the duplication).
- Webhook: `src/pages/api/checkout/webhook-events.js` — sibling file, never touches `webhook.js`/`webhook-colecta.js`.
- Key files: `src/pages/api/events/[id]/checkout.js`, `src/pages/api/checkout/webhook-events.js`, `src/pages/api/events/orders/[token].js`, `src/pages/eventos/pago/**`.

**EVENT-3 — tickets/QR**
- `event_tickets`: `ticket_number` (human, `RFX-EVT-XXXXXX`, never a credential), `qr_token` (opaque, the only real credential), `status` (`valid`/`void` only — no `used`, reserved for EVENT-4), snapshot of ticket-type name/price.
- `event_orders.tickets_issued_at` / `tickets_email_sent_at` — fulfillment state, deliberately separate from payment state.
- Atomic RPC: `issue_event_order_tickets(order_id)` — row-lock-serialized, exactly-once, `paid`-only. `void_event_ticket(ticket_id)` — backend-only invalidation primitive, no UI trigger yet, never deletes.
- Guest pages: `/eventos/orden/[token]` (persistent "my tickets", reuses EVENT-2's access_token), `/t/[token]` (public QR resolver, GET-only, no PII).
- QR image: `src/pages/api/events/tickets/[token]/qr.png.js`, reuses Colectas' satori+sharp+qrcode card-rendering *technique* only — no shared code, no shared domain.
- Key files: `src/lib/eventFulfillment.js` (the single "ensure issued + email" entry point, called from the webhook and lazily from the order-lookup endpoint), `src/lib/eventTicketMailer.js`.

**EVENT-4 — staff/scanner/check-in**
- `event_staff` (`role`: only `door`; `status`: `active`/`revoked`; unique per `event_id`+`user_id`; `user_email_snapshot` for display only, never authoritative). `event_checkins` (audit trail, one row per successful check-in, `unique(ticket_id)` as defense-in-depth).
- `event_tickets.used_at` (left nullable/unwritten since EVENT-3) is now the consumption authority: `NULL` → consumable, non-`NULL` → `already_used`. Never a `status` change — `status` stays `valid`/`void`, untouched by check-in.
- Atomic RPC: `check_in_event_ticket(qr_token, actor_user_id, event_id)` — locks the `event_tickets` row (`FOR UPDATE`), same concurrency pattern as EVENT-3's `issue_event_order_tickets`, just one level down (ticket instead of order). Validates ticket exists → belongs to the given event (cross-event check, before authorization) → actor is organizer or `door`+`active` staff of that event → event not `cancelled` → ticket not `void` → `used_at IS NULL`, then writes `used_at` and inserts `event_checkins` in the same transaction. No `SECURITY DEFINER` (same reasoning as `create_event_order`/`issue_event_order_tickets`: already runs as `service_role`, which already has the privileges it needs).
- `find_user_id_by_email(email)` — the one function in this migration that **does** use `SECURITY DEFINER` (with `search_path` pinned to `public, auth`) because resolving "does a user with this email exist" requires reading `auth.users`, not exposed via PostgREST otherwise. Never a public search — accepts exactly one email, returns one id or `null`, `service_role`-only.
- HTTP surface: `GET/POST /api/events/[id]/staff` (owner-only), `PATCH /api/events/[id]/staff/[staffId]` (owner-only, revoke/reactivate, never `DELETE`), `GET/POST /api/events/[id]/check-in` (`GET` = authorization ping for the UI, `POST` = the real check-in, accepts `qr_token` or staff-only `ticket_number` fallback — both paths converge on the same RPC).
- Scanner: `/panel/eventos/[id]/scanner`, mobile-first, camera via `jsqr` (new dependency — pure decode function, no camera/UI bundled, chosen specifically so the app owns 100% of the capture loop and the strict parsing, never a third-party navigation/URL-handling layer). Parsing lives in `src/lib/parseEventQr.js`: accepts a bare 32-hex token or a `/t/<token>` URL whose **origin must match the scanner's own** — anything else, including a same-shape URL on a foreign host, is "malformado," never navigated to.
- Key files: `db/migrations/2026-08-25b_event4_staff_scanner_checkin.sql`, `src/lib/eventStaffAuth.js`, `src/lib/parseEventQr.js`, `src/lib/scannerController.js` (detection-gating state machine, added after the first manual test found the auto-reset bug — see below), `src/pages/api/events/[id]/check-in.js`, `src/pages/api/events/[id]/staff/*`, `src/pages/panel/eventos/[id]/scanner.jsx`, `src/pages/panel/eventos/[id].jsx` (extended: staff section, "Abrir scanner" CTA, "Ingresaron" count), `src/pages/api/events/[id]/orders-summary.js` (extended additively: `tickets.checked_in`), `tests/scannerController.test.mjs` (`npm run test:scanner-controller`).

### Invariants that must hold across any future Events work

- **PAYMENT STATE ≠ FULFILLMENT STATE.** `event_orders.status` (payment truth) and `tickets_issued_at`/`tickets_email_sent_at` (fulfillment truth) are separate columns, separate concerns. A fulfillment failure must never revert a payment; a payment failure must never be papered over by fulfillment succeeding.
- `paid` is the **only** order status that may issue tickets.
- `approved_unfulfilled` **never** issues tickets, even with a valid `mp_payment_id` — this is the direct consequence of the late-payment-after-resale protection designed in EVENT-2 (never steal stock from a buyer who purchased after the original reservation expired).
- Scanning/opening a ticket's QR is **not** check-in. `GET /t/[token]` never consumes, never mutates `status` or `used_at` — verified again after EVENT-4 shipped: repeated `GET` calls before **and** after a real check-in leave `used_at` unchanged.
- A ticket is never `DELETE`d for being used or voided — `void` is a status, history is preserved. `event_staff` follows the same rule: revoking never deletes the row.
- EVENT-4 owns check-in authority entirely, exclusively via `check_in_event_ticket` — no other code path writes `event_tickets.used_at` or inserts into `event_checkins`.
- **Three separate truths, never merged**: `event_orders.status` (payment), `tickets_issued_at`/`tickets_email_sent_at` (fulfillment), `event_tickets.used_at`/`event_checkins` (access). A check-in never touches payment or inventory columns; verified — `check_in_event_ticket` never references `event_orders` at all.

### Risks / pending (documented, not being worked now)

1. **EVENT-3**: ticket-ready email delivery was not verified end-to-end with a real send — `ENABLE_EMAILS`/`RESEND_API_KEY` activity in DEV was not confirmed this session. The idempotency design (`tickets_email_sent_at`) is fail-safe either way (a skipped/failed send leaves the flag unset and is retried lazily), but nobody has watched a real email land in an inbox.
2. **EVENT-2**: no certified/implemented Mercado Pago refund flow. Cancelling an event with `paid` orders only sets `refund_required = true` on those orders (informational) — no automatic MP refund call exists or was invented.
3. **EVENT-2**: some webhook adversarial cases (amount mismatch, currency mismatch, payment/order mismatch) were verified by code-equivalence to the already-certified Colecta webhook pattern and by direct RPC testing, not by a live Mercado Pago sandbox payment — no sandbox credentials were available in-session.
4. ~~EVENT-4: scanner, staff accounts, and check-in do not exist~~ — **RESOLVED 2026-08-25**, see "EVENT-4 checkpoint" above.
5. **Test hygiene**: any future Supabase cleanup script must check `if (error) throw` (or equivalent) on every delete step, never assume success — see the Cleanup incident above, which happened specifically because an error return was silently ignored.
6. **This worktree's `.env.local` has `NEXT_PUBLIC_SUPABASE_URL` pointing at the PROD Supabase ref (`wrdkdfuiwlujfxxijpao`), not DEV.** This was flagged and deliberately avoided all session (DEV work used explicit `--project-ref nwxrvwbzqbhznscyirbq` on every Supabase CLI call, and the Vercel DEV project's own environment variables, never this local file). Do not `npm run dev` from this checkout without first fixing or overriding that value — see `SUPABASE_DEV_URL`/`SUPABASE_DEV_*` alternates already present in the same file.
7. ~~Live-schema introspection of `rifex-dev` is PENDING~~ — **RESOLVED 2026-08-25**, functionally (not via raw catalog dump — `db pull`/`db dump` remained blocked by the same CLI history-bookkeeping issue described in the EVENT-4 checkpoint above). Verified instead by exercising the real tables/RLS/RPCs directly: all EVENT-1/2/3 tables queryable, `event_staff`/`event_checkins` exist with RLS genuinely enforced, both new RPCs behave and are permission-scoped correctly. A byte-level `information_schema`/`pg_dump` comparison against the versioned SQL was still not done — low residual risk, since every constraint/RLS/grant the migration declares was independently exercised and confirmed behaviorally.
8. **`rifex-dev`'s database password must still be rotated before any direct PostgreSQL connection (`psql`, `pg_dump`, or equivalent) is attempted.** A `supabase db dump --dry-run` run during a 2026-08-25 session printed the real DB password in plaintext into the agent's output. No dump was actually executed, no data was touched, and the password was not saved to any file — but it must be treated as compromised. The user explicitly deferred rotation to the next session ("se realizará mañana") rather than blocking EVENT-4 on it — **rotation is still outstanding as of this checkpoint**, tracked here so it isn't forgotten. **Do not reuse the exposed credential for anything, under any circumstance.**
9. **Supabase CLI (`db push`/`db pull`) cannot be used for this project as-is** — the pre-EVENT-4 migration history was never recorded in the CLI's own bookkeeping table, and the only fix the CLI offers (`supabase migration repair`) has been withheld twice this session by explicit user instruction. Until someone deliberately authorizes a repair/backfill, every future Events migration will need the same manual SQL-Editor-paste path used for EVENT-4 — plan for it, don't assume `db push` will work.
10. ~~Camera/visual scanner UI not verified live~~ — **RESOLVED 2026-08-25**. First real-phone test by Rodrigo found a real bug (auto-reset timer racing the camera loop, overwriting `PASA` with `already_used`); fixed (`src/lib/scannerController.js`, commit `c32713e`); **second real-phone test confirmed the fix** — `PASA` stays visible, camera never resumes on its own, only "Siguiente escaneo" does. EVENT-4 manual acceptance: **100/100, CONFIRMED**, not outstanding anymore.
11. **`.next` build cache corruption from running `npm run build` while `npm run dev` was live** — caused a real `Cannot find module './chunks/vendor-chunks/next.js'` 500 error mid-session. Fixed by stopping `dev`, `rm -rf .next`, restarting. Not a code defect; a reminder not to run `build` and `dev` concurrently against the same checkout.

### PRE-LAUNCH-FIX-3 — `raffle_date_extensions` RLS incident (2026-08-25)

**Real Supabase Security Advisor alert** (email, "Action required: security vulnerabilities detected in your projects", `rls_disabled_in_public`, level ERROR, dated 2026-08-23) for both `rifex-dev` (`nwxrvwbzqbhznscyirbq`) and PROD (`wrdkdfuiwlujfxxijpao`). Not related to Events/EVENT-4.

**Root cause, confirmed by code review**: `public.raffle_date_extensions` (created in `2026-08-19_draw1_temporal_lifecycle.sql`, alongside `legal_declarations`) never received the RLS hardening that `legal_declarations` got in PRE-LAUNCH-FIX-1 (`2026-08-23_prelaunch_fix1_ticket_integrity.sql`, "P1-2") — an omission, not a design choice. No code under `src/` reads or writes this table directly (confirmed by grep); the only real writer is `extend_raffle_draw()`, an RPC that runs under `service_role` and bypasses RLS by design, same as `legal_declarations`'s writer.

**Exposure demonstrated, not assumed** (`rifex-dev`, before the fix): `relrowsecurity = false` at the catalog level (`pg_class`, confirmed via `supabase db query --linked`, the Management-API-based SQL runner — no `psql`, no `--dry-run`, no password involved). An `anon`-key `INSERT` succeeded with **zero error**, matching the alert's own wording ("anyone with your project URL can read, edit, and delete all data in this table") — the test row was immediately deleted via `service_role`, scoped by its own id.

**Fix**: `db/migrations/2026-08-25c_prelaunch_fix3_raffle_date_extensions_rls.sql` — a single `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, no new policies, identical pattern to the already-certified `legal_declarations` fix. Applied to `rifex-dev` via `supabase db query --linked -f <file>` (Management API, bypasses the same migration-history bookkeeping gap noted for EVENT-4 — this command is independent of `db push`/`pull` and was not blocked by it).

**DEV verification, all real, all this session**:
- Catalog re-check: `relrowsecurity = true`.
- Same `anon` `INSERT` now fails with `42501 new row violates row-level security policy`.
- Full security matrix (`anon`/authenticated owner/authenticated non-owner/`service_role` × SELECT/INSERT/UPDATE/DELETE against a real row) — **14/14 PASS**. Notably: even the raffle's own owner cannot read/write this table directly now — by design, matching `legal_declarations` exactly; the real flow goes through `extend_raffle_draw` (`service_role`), never direct table access.
- `extend_raffle_draw` exercised end-to-end (real raffle, real RPC call, real resulting row) — unaffected by the fix, confirms the one real write path still works.
- EVENT-4 check-in exercised end-to-end again (unrelated table, sanity-checked anyway per the mission's regression requirement) — unaffected.
- Full route smoke (`/`, `/login`, `/register`, `/rifas`, `/crear-rifa`, `/crear-colecta`, `/eventos`, `/mis-iniciativas`, `/panel`, `/api/rifas`, `/api/events`) — all 200.
- `npm run build` — PASS.
- Attempted to break the fix: confirmed via full-migration-history grep that `extend_raffle_draw` is the *only* function anywhere that ever writes to this table — no alternate write path exists to bypass.
- All QA fixtures created for this investigation (test users, a test raffle, test rows) deleted, verified `0` residual after each script.

**PROD — RESOLVED**: same `rls_disabled_in_public` finding confirmed via `supabase db advisors --linked --project-ref wrdkdfuiwlujfxxijpao` (ref confirmed explicitly, the persisted `rifex-dev` link was verified unchanged before and after) — PROD's advisor output also confirmed, independently, that **no Events tables or functions exist there** (a strict subset of DEV's findings), consistent with everything already documented. Applying the identical one-line fix to PROD via the agent was **blocked by the harness's own safety classifier** (recognized as a production-database-affecting command) — a deliberate environment safeguard, not worked around. **The user applied the fix manually** in the PROD SQL Editor, same file, same single statement. Verified read-only immediately after: `pg_class.relrowsecurity = true` for `public.raffle_date_extensions` in PROD, and a full `db advisors --type security --level error` re-scan of PROD returned **"No issues found"** — the CRITICAL finding is gone. PROD's `.env`/deploy/`main` branch/`rifex-frontend-v2` code were never touched — this was a database-only change, applied directly, no Git involvement, no deploy.

**PROD functional health, separately confirmed**: the live Vercel deployment behind `rifex-frontend-v2` responds (app and DB both healthy after the fix) when hit directly by its `*.vercel.app` URL. **A separate, unrelated domain incident was flagged here and fully diagnosed afterward — see "P0 — rifex.pro domain expired" immediately below.**

**Other advisor findings, not acted on this session** (lower severity, out of scope for this incident): `function_search_path_mutable` WARNs on several pre-existing functions and on some of EVENT-2/3/4's own RPCs (`create_event_order`, `expire_event_order`, `mark_event_order_paid`, `issue_event_order_tickets`, `void_event_ticket`, `check_in_event_ticket` — flagged regardless of `SECURITY DEFINER` status, a general best-practice warning); `anon`/`authenticated_security_definer_function_executable` WARNs on legacy raffle functions (`create_tickets_for_raffle`, `rifex_set_creator_defaults`, `set_bank_account_owner`, `set_creator_fields`, `set_raffle_creator_from_jwt`); `auth_leaked_password_protection` WARN (PROD only, HaveIBeenPwned check disabled). None are the CRITICAL/ERROR-level issue the email reported.

### P0 — `rifex.pro` domain expired at the registrar (2026-08-26)

**Not a code, deploy, or RLS-fix issue.** Rodrigo confirmed `https://rifex.pro` failing with `ERR_SSL_PROTOCOL_ERROR` from a second device/browser, right after the RLS-fix session above. Diagnosed read-only, no changes made anywhere.

**Root cause, confirmed with direct evidence, not inferred:**
- `vercel domains inspect rifex.pro` shows the domain correctly assigned to `rifex-frontend-v2` (`rifex.pro`, `www.rifex.pro`) — the Vercel-side project/domain assignment was never wrong. Vercel's own "Intended Nameservers" check (`ns1/ns2.vercel-dns.com`, shown with a checkmark) is **stale/no longer true** — it does not reflect what is live today.
- Real, live DNS — cross-checked via two independent public resolvers (Cloudflare `1.1.1.1` and Google `8.8.8.8` DNS-over-HTTPS, not just the local/hotel resolver) — shows the **actual authoritative nameservers are `ns1.dns-expired.com` / `ns2.dns-expired.com`**, not Vercel's. Both the apex (`rifex.pro`) and `www.rifex.pro` resolve to `2.57.91.92`, not any Vercel edge IP.
- `dns-expired.com`'s own SOA record names its authority as `hostinger.mars.orderbox-dns.com` / `business-domains.hostinger.com` — **Hostinger** (confirmed as the registrar; Vercel's own domain inspector already listed the registrar as "Third Party").
- A plain HTTP request to `2.57.91.92` with `Host: rifex.pro` returns Hostinger's own parking page, with the literal page title **"Your domain is expired."**

**Conclusion**: the `rifex.pro` domain **registration itself has lapsed at Hostinger** (not a DNS misconfiguration, not a Vercel certificate problem, not a CAA record, not a proxy). Hostinger's registrar-level expiration handling overrides the nameservers to its own parking service the moment a domain lapses — this is why Vercel still shows a "correct" project assignment and once-correct nameservers, while live DNS today points somewhere Vercel has no control over. **No fix exists inside Vercel** for this — setting an A record, re-adding the domain, or any Vercel-side action cannot restore a domain whose registration has expired at its registrar.

**Corrective action — outside this agent's reach, requires the domain owner:**
1. Log into Hostinger (the registrar for `rifex.pro`) and **renew the domain registration** — this is a billing/account action, not a technical one.
2. Once renewed, confirm Hostinger's nameservers are set back to `ns1.vercel-dns.com` / `ns2.vercel-dns.com` (Vercel's own recommendation, already correctly configured on the Vercel side and requiring no further Vercel changes) — **or**, if Vercel's DNS challenge re-appears after renewal, follow whatever it recommends at that point (do not assume today's exact instructions still apply after a renewal, since Hostinger's post-expiration state may differ).
3. Propagation after a registrar-level renewal + nameserver fix can take from minutes to a few hours depending on Hostinger/Vercel's caching.

**Verified, unaffected by this incident**: the live Vercel deployment (`rifex-frontend-v2`, hit directly by its Vercel-issued URL, bypassing the broken domain) is healthy. `rifex-dev` (DEV Supabase), the local `develop` git branch, and the PRE-LAUNCH-FIX-3 RLS correction from earlier this session are all confirmed untouched by this domain incident and by this investigation.

**No corrective action was applied by the agent** — confirmed there was nothing safe/unambiguous to change inside Vercel (the Vercel-side configuration was already correct), and registrar access was never available to this session. This matches the mission's own stop condition ("necesitas acceso al proveedor DNS externo").

### EVENT-5 checkpoint — CERTIFIED (real manual acceptance by Rodrigo + live verification against Vercel DEV/rifex-dev)

```text
develop:  0f9ab01
Verdict:  EVENT-5 — CERTIFIED
```

EVENT-5 (analytics dashboard + XLSX export) implemented per `docs/events/EVENT5_ANALYTICS_XLSX.md` — organizer-only (`canViewEventAnalytics`, never `door`/staff), corrected financial model (`approved_unfulfilled` included in "aprobada total"/comisión, excluded only from "cumplida"), corrected operational model (`Anuladas usadas antes de anularse` as its own category — real finding: `void_event_ticket` never guards or clears `used_at`), 5-sheet XLSX (ExcelJS 4.4.0, the only dependency installed), deterministic limits (20.000 orders/tickets/checkins, 500 staff), formula-injection neutralization, timezone-safe formatting (`events.timezone`, cached `Intl.DateTimeFormat`). No new table/migration — purely additive read-side code over the existing EVENT-1/2/3/4 schema.

**Rodrigo's real manual acceptance**: dashboard verified visible and correct, XLSX downloaded from real Vercel DEV, file opened correctly, dashboard and XLSX figures confirmed matching — EVENT-5 accepted functionally by him directly.

**Independent visual audit of the downloaded XLSX, found and fixed after Rodrigo's functional acceptance**: buyer name/email columns in Órdenes-Ventas and email/role columns in Personal de acceso overlapped or clipped — traced to static column widths narrower than real content (e.g. "Organizador (propietario)" is 25 characters against a 14-wide column). Fixed in `src/lib/eventAnalyticsWorkbook.js` (commit `0f9ab01`): every column across all 5 sheets widened, `wrapText` added as a real overflow safety net for content with no short business-length cap; CLP amounts given `numFmt: '"$"#,##0'` (values stay numeric, e.g. `29000` renders `$29.000`, never converted to text); raw technical headers renamed to reader-facing labels (`ticket_number` → "Número de entrada", `Ingresó (used_at)` → "Fecha de ingreso", `Refund requerido`/`refund_required` → "Reembolso pendiente"); Resumen's "Ingresadas" renamed to "Ingresadas válidas" to disambiguate from the Check-ins sheet's raw historical row count. Freeze panes, autofilter, alert-row coloring, and every business formula are unchanged.

Local evidence: **31/31 real automated tests PASS** (`npm run test:event-analytics` — 5 new tests added specifically for the visual fixes: currency numeric+format, header rename, wrapText-covers-overflow, no formula errors `#REF!`/`#VALUE!`/`#DIV/0!`/etc., no secrets in the generated file). `npm run build` PASS. `npm run test:scanner-controller` (EVENT-4 regression) 4/4 PASS unchanged — no EVENT-1/2/3/4 file was modified.

**Live evidence, real Vercel DEV + real `rifex-dev`** (across two certification sessions, same day): deployment confirmed `Ready`/Production/`iad1` at every step, commit verified via real build logs each time (`dae5344` → `31e5ac1` → `0f9ab01`). The same real controlled fixture created earlier (4 disposable `@example.com` test users, one event, 3 ticket types, orders/tickets/check-ins/void via real RPCs and endpoints, a genuine `approved_unfulfilled`, a real cancellation setting real `refund_required`) was reused. **17/17 real HTTP authorization+correctness tests PASS**, **24/24 real checks PASS on the file actually downloaded from the live deployment** (5 sheets, frozen row 1 on all, autofilter on the 4 tabular ones, currency numeric with real `numFmt`, renamed headers present, raw names absent, no formula errors, no secrets). Real round-trip timing: ~1.4-1.7s (analytics JSON), ~1.0-1.5s (XLSX export) on the small real fixture.

**Real performance finding, found and fixed earlier the same day**: the stress test first measured ~29-30s to build+serialize the workbook at the 20.000-row maximum — traced to `Intl.DateTimeFormat` being reconstructed on every date-format call (~60.000 times). Fixed by caching formatter instances per timezone; re-measured at ~15s combined. `maxDuration` confirmed against Vercel's current documentation (`vercel.com/docs/functions/configuring-functions/duration`, updated 2026-07-01): with Fluid Compute (platform default since 2025), **300s on every plan** — no `vercel.json`/code override exists in this repo. ~15s (synthetic max load, never uploaded to `rifex-dev`) and ~1-2s (real small load) both fit comfortably.

**Not deleted**: the real fixture event/orders/tickets/staff remain in `rifex-dev` — no cleanup was requested or performed this session.

### EVENT-6 Fase 1 checkpoint (autonomous security/regression audit of EVENT-1..5, DEV only)

```text
develop:  (this commit)
Verdict:  GO for EVENT-1..5 as they stand in rifex-dev — PROD promotion decision reserved for Rodrigo
```

Autonomous adversarial audit against real Vercel DEV (`rifex-frontend-main`) and real `rifex-dev` — auth/IDOR matrix, RLS/grants/Security Advisor, invariants (SCAN≠CHECK-IN, exactly-once, void never revives, PAYMENT≠FULFILLMENT), real concurrency (10 simultaneous ticket issuances, 15 simultaneous check-ins on the same QR), adversarial inputs (SQLi-shaped tokens, oversized tokens, hostile paths), and regression (Rifas/Colectas/Auth/Perfil/Mis-iniciativas/build). Full matrix and evidence: `docs/events/EVENT6_SECURITY_AUDIT.md`.

**30/31 real tests PASS** — the one "failure" was a wrong test expectation (a nonexistent event returns `403`, not `404`, from the analytics endpoint — actually more secure, since it never distinguishes "doesn't exist" from "not yours"). **Two real, low-risk findings from the Security Advisor, both fixed as defense-in-depth, neither exploitable when found** (verified live before fixing, not assumed): (1) 6 EVENT-2/3/4 RPCs had a mutable `search_path` (WARN) — none is `SECURITY DEFINER`, so no privilege-escalation path existed; fixed via `ALTER FUNCTION ... SET search_path = public` (metadata-only, zero logic risk); (2) `events`/`event_ticket_types` (EVENT-1) never received the explicit `revoke insert/update/delete` that every later Events table has — a live PostgREST test against a real published event's real ID confirmed 0 rows were ever affected by an anonymous write attempt before the fix; the revoke was added anyway as a second lock, deliberately leaving `SELECT` untouched (the public catalog read is legitimate). Both in `db/migrations/2026-08-26_event6_hardening_search_path_and_revoke.sql`. Zero application code was changed — no reproducible app-level defect was found.

Real concurrency evidence: 10 simultaneous `issue_event_order_tickets` calls on one order (qty=3) → exactly 3 tickets; 15 simultaneous HTTP check-ins on the same QR → exactly 1 `pass`, 14 `already_used`, exactly 1 `event_checkins` row. Fixture (2 published events, 5 disposable users, orders/tickets/staff) created via real RPCs/endpoints and fully deleted afterward, scoped by exact `event_id`/`user_id` — verified 0 residual rows. Also found and cleaned, as housekeeping, 3 empty leftover draft events from a previous EVENT-5 session's repeated test runs — the real EVENT-5 fixture itself (still holding order/ticket history, the one Rodrigo reviewed) was left untouched.

### EVENT-6 Fase 2 checkpoint (audit of the 16 inherited Rifas/Auth WARN findings + promotion package, DEV only)

```text
develop:  (this commit)
Verdict:  GO for EVENT-1..6 as they stand in rifex-dev — PROD promotion package prepared, not executed, decision reserved for Rodrigo
```

> ⚠️ **Most important finding of this phase, read first**: `public.create_tickets_for_raffle(uuid, integer)` — a legacy, unversioned `SECURITY DEFINER` function with **zero ownership check** and `EXECUTE` granted to `PUBLIC` — let a **completely anonymous** request (no session, just the public `anon` key) mint real tickets in **any raffle it doesn't own**, demonstrated live against a disposable fixture (5 tickets inserted in a stranger's raffle via a bare `POST /rest/v1/rpc/create_tickets_for_raffle`). Fixed in `rifex-dev` this session (`revoke execute ... from public, anon, authenticated`, `service_role` unaffected, verified live: post-fix the same attack returns `401`, 0 tickets created). **This function predates the DEV/PROD fork (no versioned migration — lives in the base schema dump) and is highly likely to be equally exploitable in PROD right now** — this session has no CLI link to PROD and is forbidden from writing there, so this is flagged as an **urgent, independent-of-Events-promotion action for Rodrigo**. Full detail: `docs/events/EVENT6_SECURITY_AUDIT_FASE2.md`.

Individually audited all 16 WARN findings inherited from Rifas/Auth (never grouped under a generic explanation, per instructions). Classification: 1 critical exploitable vulnerability (above, fixed), 8 genuine false positives (4 trigger functions — `rifex_set_creator_defaults`, `set_bank_account_owner`, `set_creator_fields`, `set_raffle_creator_from_jwt` — each flagged twice for anon+authenticated; live-tested, all return `404 PGRST202`, PostgREST never exposes `RETURNS trigger` functions as RPC endpoints, and Postgres itself refuses to invoke a trigger function outside real trigger context regardless of grants), 6 low-risk findings fixed as defense-in-depth (5× `search_path` mutable on `SECURITY INVOKER` functions — same low-risk profile as the EVENT-2/3/4 RPCs fixed in Fase 1; 2× unnecessary `anon`/`authenticated`/`PUBLIC` grant on `create_raffle_with_declarations`/`extend_raffle_draw` — live-tested as an IDOR hypothesis first: an authenticated real attacker calling both directly by RPC with a real victim's `uuid` as `p_user_id` was rejected by RLS itself, `raffle_not_found`/`42501`, because both are `SECURITY INVOKER` and RLS evaluates the caller's real `auth.uid()`, never the forged parameter — **not exploitable**, revoked anyway for consistency since the app only ever calls them via `service_role`), 1 administrative Auth setting (`auth_leaked_password_protection`) left untouched per explicit instruction, documented as pending for Rodrigo.

Security Advisor: 22 WARN → 16 (after Fase 1) → **1** (after Fase 2, purely administrative). Zero ERROR at any point. Zero `src/` files changed — all fixes are database-level (grants/search_path) via 3 new migrations: `2026-08-26b_event6_fase2_critical_revoke_create_tickets_for_raffle.sql`, `2026-08-26c_event6_fase2_hardening_rifas_search_path_and_revoke.sql`, `2026-08-26d_event6_fase2_revoke_trigger_functions_execute.sql`. Regression: real raffle creation + real draw-date extension via the legitimate `service_role` path (same as the real API routes) both still succeed post-fix; `npm run test:event-analytics` 31/31, `npm run test:scanner-controller` 4/4, `npm run build` clean; live smoke against the deployment (`/rifas`, `/crear-rifa`, `/mis-iniciativas`, `/login`, `/register`, `/perfil`, `/eventos`, `/panel`, `/panel/bancos`, `/api/rifas`, `/api/events`, `/onboarding/pais`) all `200`.

A full promotion package (exact commits, pending PROD migrations in order, required env var names, pre-checks, rollback plan, post-promotion tests, Rodrigo's manual actions, accepted risks) is prepared in `docs/events/EVENT6_SECURITY_AUDIT_FASE2.md` — **not executed**. Of the 34 commits between `origin/main` and current `develop`, only ~14 are Events-specific; 17 more (DRAW/Payment Engine/Argentina/UX/dev-policy work) were never audited by this session and need their own review before any promotion decision bundles them in.

### Rifex Trust — canonical design (this session, documentation only)

A full transversal Trust system (onboarding, identity, age verification, creator/organization verification, per-initiative review, fraud prevention, administration, reports, suspension, appeal, reputation from real operations, post-transaction evidence, data protection, future country expansion) was **designed, not implemented**, across 12 documents in `docs/trust/` plus this session's handoff. Start at `docs/trust/RIFEX_TRUST_CANONICAL_DESIGN.md`. Grounded in real, dated legal research (Ley 19.628 vigente; Ley 21.719, published 13-dec-2024, full force 1-dec-2026) and in the real current code (`src/pages/auth/callback.js`, `src/pages/onboarding/pais.jsx`, `legal_declarations`) — confirmed the actual gap: today, onboarding is only a country selector plus an unverified age/prize-ownership checkbox at raffle-creation time, nothing else.

**Most material finding of the whole design effort**: Chilean law treats raffles and public collections as games of chance/restricted activities, in principle authorized only to non-profit legal entities via Ministerio del Interior (Ley 10.262/1952) — Rifex's actual model (individual creators) sits in a real, currently-tensioned legal gray zone (documented by an April 2026 press article on "rifas de influencers"). No amount of identity verification resolves this by itself — flagged as **Prioridad 1** in `docs/trust/TRUST_DECISIONS_FOR_RODRIGO.md`, requires a Chilean lawyer, independent of any technical roadmap.

Explicit design stances worth knowing without reading every document: 18+ is verified, never just declared; a birth certificate is never the standard verification path (only a documented manual exception); no in-house facial recognition without a dedicated legal/security review; documents are preferably never retained past producing a verification result; no numeric risk score is ever shown, only explainable checks with mandatory human review; roles never allow self-approval; four false-document-adjacent methods were compared with real trade-offs, not just recommended blindly.

Roadmap: TRUST-0 (this session, done) through TRUST-9 (adversarial audit before production, same rigor as `EVENT6_SECURITY_AUDIT*`). Nothing beyond TRUST-0 is authorized.

### TRUST-1 checkpoint (onboarding universal — DONE in DEV, authorized end-to-end by Rodrigo)

```text
develop:  6333044 — feat(trust): implement TRUST-1 — universal onboarding + server-side gate
Pushed:   origin/develop 1f01d53..6333044 (authorized)
Migration: db/migrations/2026-08-26e_trust1_onboarding.sql applied to rifex-dev (authorized) — verified: trust_onboarding exists, RLS enabled, zero grants to anon/authenticated/PUBLIC
Deploy:   rifex-frontend-main auto-deployed dpl_HNT2giXgFCAdwpSmqtLN2kgM4QSy from the develop-branch git integration, ~2 min after the push (authorized)
Verdict:  TRUST-1 COMPLETO in DEV. PROD and main untouched.
```

Implemented: `trust_onboarding` table (new, independent of `users_profile`, RLS default-deny total — no client access at all, stricter than the existing `users_profile`/country pattern, precisely to keep `onboarding_completed_at` unreachable from the client); `src/lib/trustOnboardingPolicy.js` (pure validation) + `src/lib/trustOnboardingGate.js` (server authority, mirrors `countryGate.js`); `GET/POST /api/onboarding/trust/{status,complete}`; `/registro/continuar` UI; the server-side gate wired into 13 real sensitive endpoints across Rifas/Colectas/Eventos (create/edit/publish/staff/ticket-types — deliberately excluding pure deletion/revocation actions, which reduce risk rather than increase it, same reasoning applied consistently across both products). 29 real tests pass (`npm run test:trust-onboarding`), including a structural adversarial test proving the client can never smuggle `onboarding_completed_at`/`user_id` through the API. Full regression (`test:event-analytics` 31/31, `test:scanner-controller` 4/4, `npm run build`) clean both before and after applying the migration.

**Live verification in rifex-dev (2026-08-26, two disposable `@example.com` fixtures, deleted after, zero residual rows confirmed)**: isolated the country gate from the Trust gate by completing country onboarding first, then confirmed a real `403 onboarding_incomplete` from the Trust gate on `POST /api/rifas`, `/api/events`, `/api/colectas` while onboarding was incomplete; confirmed onboarding completion is resumable (partial submit returns the real missing-fields list) and idempotent; confirmed the adversarial attempt to inject `onboarding_completed_at`/`user_id` directly through `POST /api/onboarding/trust/complete` had no effect (whitelist holds); confirmed `GET status` without an auth header returns `401`. Security Advisor re-run post-migration: only the pre-existing `auth_leaked_password_protection` WARN (already classified in EVENT-6 Fase 2 as pending an admin/business decision) — **no new finding introduced by TRUST-1**.

**Real deployment risk that was live during this window, now resolved**: this code depends on `trust_onboarding` existing. Migration and code were applied/pushed together in the same authorized sequence, so DEV was never left in the broken state where the code is live but the table is missing.

### TRUST-2 checkpoint (identidad básica declarada — DONE in DEV, autonomous mission, pre-authorized end-to-end)

```text
develop:  5fa5bd4 — feat(trust): implement TRUST-2 — identity básica declarada (RUT chileno + edad 18+)
Pushed:   origin/develop bd8ea53..5fa5bd4
Migration: db/migrations/2026-08-27_trust2_identity.sql applied to rifex-dev — verified: rut_normalized/rut_declared_at columns exist, format CHECK present, unique partial index present, RLS/grants unchanged (still zero for anon/authenticated/PUBLIC)
Deploy:   rifex-frontend-main auto-deployed from the develop-branch git integration
Verdict:  TRUST-2 COMPLETO in DEV. PROD and main untouched.
```

Unlike TRUST-1 (which needed a Fase 9 checkpoint and Rodrigo's explicit "autorizado"), this mission's authorization list pre-cleared the entire sequence — audit, code, migration creation, applying it in `rifex-dev`, disposable fixtures, adversarial tests, commit+push to `origin/develop`, and the automatic `develop` deploy — so it ran to completion without an intermediate stop, exactly as instructed ("Rodrigo está agotado ... trabaja autónomamente"). Human UI testing is deliberately deferred: `PRUEBAS HUMANAS PENDIENTES PARA EL FIN DE SEMANA — RODRIGO DESCANSADO`.

Implemented: `rut_normalized`/`rut_declared_at` added to the SAME `trust_onboarding` row TRUST-1 already uses (never a new table — inherits RLS default-deny total automatically, avoids duplicating `legal_name`/`birth_date`/`phone` TRUST-1 already captures); Chilean RUT modulo-11 check-digit validation + canonical normalization + masking in `src/lib/trustIdentityPolicy.js`; superset gate `assertCreatorEligible` (`src/lib/trustIdentityGate.js`) replaced `assertOnboardingComplete` across the same 12 sensitive endpoints TRUST-1 already protected (Rifas/Colectas/Eventos create/edit/publish/staff/ticket-types) — now also requires declared 18+ and, for Chile only, a format-valid declared RUT. `age_verified`/`identity_verified`/`phone_verified` are literal `false` from `getIdentityStatus` — no column, no code path, nothing in TRUST-2 can ever write them. New `POST /api/onboarding/identity/rut`; `GET /api/onboarding/trust/status` extended with an `identity` block; `/registro/continuar` gained a conditional RUT step (Chile only, via the same `users_profile.country_code` RLS-permitted client read `countryOnboarding.js` already used elsewhere).

**Real bug found adversarially in DEV and fixed in the same session**: `upsertIdentityRut` originally used `.update()`, which silently no-ops (0 rows affected, no error) when the calling user has no `trust_onboarding` row yet (e.g. calling the RUT endpoint before ever completing TRUST-1) — the client got `200 OK` while nothing was actually saved. Caught live with a real fixture that skipped TRUST-1 first. Fixed to `.upsert()` with `onConflict: 'user_id'`, the same pattern `upsertOnboardingFields` already used. A regression test was added.

**Live verification in rifex-dev**, two rounds of disposable `@example.com` fixtures (deleted after each round, zero residual rows confirmed across `trust_onboarding`/`rifas`/`auth.users`): isolated `403 identity_incomplete` confirmed when RUT is missing for a Chilean user with country+TRUST-1 already satisfied; invalid RUT rejected; valid RUT in three input formats (dots/dash, plain, spaced) all normalize identically; `creator_eligible` flips to `true` only once the RUT is declared; declaring a minor's birth date afterward correctly flips `creator_eligible` back to `false` with `age_requirement_not_met`, while TRUST-1's `complete` stays `true` (states stay correctly separated); the `rut_normalized`/`age_verified`/`identity_verified`/`user_id` injection attempt through the RUT endpoint had zero effect; **a second fixture's attempt to declare the exact RUT the first fixture already held returned a real `409 rut_conflict` against Postgres's actual unique index** — confirmed the constraint is live, not just unit-tested against a mock, and confirmed the response never revealed whose RUT it was. Security Advisor re-run post-migration: only the same pre-existing `auth_leaked_password_protection` WARN — **no new finding introduced by TRUST-2**. 36 new tests (`npm run test:trust-identity`) plus full regression (`test:trust-onboarding` 29/29, `test:event-analytics` 31/31, `test:scanner-controller` 4/4, `npm run build`) clean, both before and after the migration.

### TRUST-3A checkpoint (private document verification, manual review — DONE in DEV, autonomous mission, pre-authorized end-to-end)

```text
develop:  f2f018b — feat(trust): implement TRUST-3A — private document verification, manual review (persons only)
Pushed:   origin/develop 1f388b7..f2f018b
Migrations: db/migrations/2026-08-27b_trust3a_identity_verification.sql (tables, bucket, columns) + 2026-08-27c_trust3a_fix_user_deletion_fks.sql (real bug fix, see below) — both applied to rifex-dev
Deploy:   rifex-frontend-main auto-deployed from the develop-branch git integration
Verdict:  TRUST-3A COMPLETO in DEV. PROD and main untouched.
```

Same mission structure as TRUST-2: fully pre-authorized (audit, code, migrations, bucket, applying in `rifex-dev`, disposable fixtures/fake documents, adversarial tests, commit+push to `origin/develop`, automatic `develop` deploy), ran to completion without an intermediate stop. `PRUEBAS HUMANAS PENDIENTES PARA EL FIN DE SEMANA — PRUEBA MANUAL DE TRUST-1, TRUST-2 Y TRUST-3A CON RODRIGO DESCANSADO`.

Implemented: `trust_identity_verifications` (one case per user, explicit state machine in `src/lib/trustIdentityVerificationPolicy.js` — `not_started → draft → submitted → under_review → {approved | correction_required → submitted again | rejected} `, plus `revoked` from `approved`), `trust_identity_documents` (evidence, never overwritten — replacing a side marks the old row `superseded`), `trust_identity_audit_log` (append-only, a DB trigger rejects any application-level UPDATE/DELETE). Private Storage bucket `trust-documents` (`public: false`, zero `storage.objects` policies reference it — default-deny by omission, confirmed live against real anon/authenticated calls, not just SQL inspection). Real defensive image pipeline with `sharp` (`src/lib/trustIdentityDocumentProcessing.js`): real magic-byte sniffing (never the client's Content-Type), explicit input-pixel limit, explicit dimension cap, full re-encode to JPEG (EXIF discarded, orientation normalized), SHA-256 hash for controlled de-duplication. Review queue gated by the SAME real admin primitive already used by `/api/admin/*` (`resolveAdmin`, `app_metadata.role === 'admin'` — no new role system invented, per this mission's explicit instruction). `identity_verified`/`age_verified` are now real columns on `trust_onboarding` — the ONLY code that can write them is `recordDecision`'s `approve` action, which requires two explicit human confirmation checkboxes (no OCR exists, so that confirmation IS the verification). Two-level policy kept explicit and still off: `creator_eligible_basic` (TRUST-2) unchanged; `creator_identity_verified` (TRUST-3A) exists but `isIdentityVerificationRequiredForCreators()` stays `false` — activating it is a pending business decision, not a side effect of this build. Organizations explicitly excluded — `account_type=organization` gets "Verificación de organizaciones próximamente", never the personal-cédula flow (reserved for TRUST-4). UX: `/trust/verificar` (titular), `/panel/admin/trust` + `/panel/admin/trust/[userId]` (review queue + decision, minimal).

**Two real bugs found adversarially in DEV and fixed in the same session**: (1) `start.js` selected a `country_code` column from `trust_onboarding` that has never existed there (it lives on `users_profile`) — the query errored silently (only `data` was destructured, never `error`), so `account_type` resolved `undefined` and **every real person was rejected as if they were an organization**. Fixed to select only `account_type` from the correct table, with the query error now checked and fail-closed. (2) The audit-log immutability trigger blocked the legitimate `DELETE` cascade Postgres issues when an `auth.users` row with any TRUST-3A history is deleted — **deleting any account that had touched TRUST-3A became impossible**, discovered live while cleaning up fixtures. Fixed with a follow-up migration: the audit log no longer has a cascading FK to `auth.users` (the history now intentionally survives account deletion — the correct posture for an audit trail), and `reviewer_id`/`identity_verified_by` became `ON DELETE SET NULL`.

**Live verification in rifex-dev**, four disposable `@example.com` fixtures (one admin, three person accounts) with synthetic JPEG documents generated via `sharp`, each visibly labeled "DOCUMENTO FICTICIO — SOLO PRUEBA" (deleted after, zero residual rows confirmed across all three tables + `auth.users` + `storage.objects`, including the audit-log rows themselves — those were cleaned as an explicit DBA operation, temporarily disabling the immutability trigger, that application code can never do): full happy path (start → upload both sides → submit → admin queue → atomic claim → approve with both confirmations → `identity_verified`/`age_verified` real `true` with `identity_verified_method: 'manual_document_review'`); correction_required → re-upload → resubmit → re-claim cycle; reject as a terminal state (`identity_verified` never touched, further submit blocked); a concurrent double-decision attempt on the same case correctly lost to the atomic `WHERE status='under_review'` update; an admin was correctly blocked from approving their own case (`403 cannot_review_own_case`); anonymous and authenticated-non-owner direct Storage access (list + download) to the bucket both confirmed blocked **against real Supabase Storage**, not just SQL inspection; a fake-extension text file, a real PDF, a corrupted JPEG, an oversized-dimension image, and a JPEG with an appended non-image payload ("polyglot") were all rejected or cleaned correctly. Security Advisor re-run after both migrations: only the same pre-existing `auth_leaked_password_protection` WARN — **no new finding introduced by TRUST-3A**. 43 new tests (`npm run test:trust-identity-verification`, including real `sharp` image-processing tests, not mocked) plus full regression (143/143 across all suites) and `npm run build` clean.

**Real gap, explicitly not closed in this phase**: no automatic expiration/purge job exists yet for documents or cases — `expires_at` is a provisional 2-year placeholder with nothing enforcing it. Document images remain in Storage indefinitely until a real retention job is built (TRUST-3B or a dedicated retention phase) — see `docs/trust/TRUST_DATA_RETENTION_MATRIX.md` for the honest deviation from the original "don't retain the image" design intent.

### Corrección canónica checkpoint (Mercado Pago como control principal + onboarding simplificado — DONE in DEV, autonomous overnight mission, pre-authorized end-to-end)

```text
develop:  0cc59dc — feat(trust): Mercado Pago como control principal + simplifica onboarding
Pushed:   origin/develop 5f41858..0cc59dc
Migrations: db/migrations/2026-08-28_mp_identity_match_onboarding_correction.sql — applied to rifex-dev
Deploy:   rifex-frontend-main auto-deployed from the develop-branch git integration
Verdict:  ONBOARDING MP COMPLETO in DEV. PROD and main untouched. No commits or prior migrations reverted — purely additive/corrective forward.
```

Rodrigo's decision, worked autonomously overnight while he slept, system-permission-only, no manual testing requested: Mercado Pago becomes the primary control that closes creator onboarding — Rifex compares (when the API allows it) the RUT declared in Rifex against the RUT of the connected Mercado Pago account's owner. TRUST-3A remains an exceptional fallback, never the default flow, `isIdentityVerificationRequiredForCreators()` unchanged (`false`).

**Onboarding simplified**: `birth_date` eliminated entirely (capture, storage, calculation, presentation) — confirmed 0 real rows in `rifex-dev` before dropping the column, replaced by a versioned boolean declaration (`adult_declared`/`adult_declared_at`/`adult_declaration_version`, current `adult-declaration-v1.0`) — never presented as `age_verified`. The `account_type` selector replaced by two fields (`person_name`/`organization_name`, exactly one must be filled) — `legal_name` dropped (also confirmed 0 real rows), `account_type` still exists as a column but is now derived server-side from which name field is filled, never trusted from the client. Phone simplified to a Chilean-specific 9-digit widget (fixed `+56` prefix, normalizes to E.164).

**Mercado Pago audit (Fase 4)**: could not empirically confirm whether `GET /users/me` returns an identification/RUT field for Chile — Mercado Pago's official docs blocked every automated fetch attempt (403), and this environment has no Mercado Pago app credentials configured to test against a live sandbox. Full detail in `docs/trust/MP_IDENTITY_MATCH_AUDIT.md`. The match code (`src/lib/mpIdentityMatchGate.js`, `extractMpRutFromUsersMe`) was written defensively: reads the field if present, never invents a match if absent (`unavailable` state, never blocks) — someone with real Mercado Pago credentials still needs to confirm the actual behavior, flagged in `docs/trust/TRUST_DECISIONS_FOR_RODRIGO.md`.

**New real control**: `merchant_gateways` gained `mp_identity_match`/`mp_identity_matched_at`/`mp_identity_match_reason`/`mp_match_rule_version`, plus a real unique index (`provider, mp_user_id) WHERE revoked_at is null` — confirmed live that a second Rifex account cannot claim an already-linked Mercado Pago account. `assertCreatorEligible` (TRUST-2's gate) now also requires, for Chile, a connected + `matched`/`unavailable` Mercado Pago account — `mismatch`/`needs_review` block, `not_connected`/`checking` block, `unavailable` never blocks. Changing the declared RUT invalidates any previous match (confirmed live — an adversarial test sequence accidentally proved this working correctly mid-session). Disconnecting invalidates the match (`disconnected` state).

**Live verification in rifex-dev**, two disposable `@example.com` fixtures (one person, one organization; deleted after, zero residual rows across `trust_onboarding`/`merchant_gateways`/`auth.users`/`rifas`/`events`): isolated `403 mp_not_connected` confirmed when everything else (onboarding, RUT, age) was already satisfied; simulated `matched`/`mismatch`/`unavailable`/`disconnected` Mercado Pago states via direct service-role fixtures (no real Mercado Pago OAuth handshake was possible without credentials) all produced the exact correct gate behavior; the real Postgres unique constraint on `mp_user_id` fired correctly when a second account attempted to claim an already-linked one; direct `/api/mp/status` confirmed `identity_match` is exposed without ever exposing the raw RUT. Security Advisor re-run: only the same pre-existing `auth_leaked_password_protection` WARN — no new finding. 15 new tests (`npm run test:mp-identity-match`) plus the trust-onboarding/trust-identity suites fully rewritten for the new fields, full regression (174/174 across all suites) and `npm run build` clean.

**Documentation-only additions**: `/seguridad` public page (linked from the footer) explaining real security measures honestly, without absolute claims; `docs/trust/META_ANTIFRAUD_STATEMENT.md` for Meta ad-account/business-verification requests; "Términos del Creador" section of `/terminos` substantially expanded (prize existence/ownership, evidence preservation, cooperation with authorities, participant/winner rights, phone-usage limits, non-disclosure of private data to third parties) marked `PENDIENTE DE REVISIÓN POR ABOGADO CHILENO ANTES DE PROD`; 2FA decision recorded (optional for creators now, should be mandatory for admins/reviewers before production, not implemented) in `docs/trust/TRUST_DECISIONS_FOR_RODRIGO.md`.

**Real, honest limitation**: the actual behavior of Mercado Pago's `/users/me` for Chile was never confirmed live in this session — whoever continues this work with real Mercado Pago credentials must connect a real test account and verify whether the identification field is actually present before treating this control as fully proven in practice.

### Adversarial audit checkpoint (read-only, no fixes applied — see `docs/trust/TRUST_MP_ADVERSARIAL_AUDIT_2026-08.md`)

**Verdict: `GO CON CONDICIONES`.** A dedicated audit-only mission (2026-08-29, autonomous, Rodrigo resting, no live DEV writes) found a real, demonstrated **critical fail-open**: `assertCreatorEligible` (`src/lib/trustIdentityGate.js`) uses a blocklist for `mp_identity_match` instead of an allowlist — a `NULL` value (reachable in practice: `oauth/callback.js` sets `status: 'connected'` before calling `resolveMpIdentityMatch` separately in a try/catch that "never blocks the flow if it fails," so a transient failure there leaves `mp_identity_match` permanently `NULL`) passes the gate exactly like `'matched'`, while `getIdentityStatus` correctly reports `creator_eligible: false` for the same data — a real, confirmed inconsistency between the enforcement gate and the UI. Reproduced with an isolated local test now permanently in `tests/trustIdentityGate.test.mjs`. Also found: the `unavailable` state design (never blocks) genuinely conflicts with this audit's requested policy ("unavailable must route to review, never approve silently") — a product decision for Rodrigo, not a bug; the OAuth callback logs the full `state` row (including the PKCE `code_verifier` secret and creator email) in an edge case (`callback.js:42`); a `mismatch` detected after publishing doesn't pause checkout for that already-published initiative; the three `upload-photo.js` endpoints (rifas/colectas/events) aren't gated by `assertCreatorEligible`. Full detail, severities, and proposed minimal fixes (none applied) in the audit report. 175/175 tests pass (174 existing + 1 new adversarial regression documenting the critical finding). No code, migrations, or DEV data changed — read-only audit + one new test file.

### NEXT (exact)

```text
NEXT: fix the CRITICAL fail-open found by the 2026-08-29 adversarial audit (docs/trust/TRUST_MP_ADVERSARIAL_AUDIT_2026-08.md, section 2) BEFORE any further Trust work or human testing with real accounts — assertCreatorEligible allows creation when mp_identity_match is NULL, treating it like 'matched'. Also pending from that audit: Rodrigo's decision on the 'unavailable' policy (section 3.1), the code_verifier logging fix (section 3.2), and the other proposed minimal corrections (section 18) — none applied yet, audit-only mission. EVENT-7 — not scoped, not authorized. Urgent, independent of Events, PC-de-escritorio-only: verify/fix create_tickets_for_raffle grants in PROD (see docs/handover/HANDOVER_NOTEBOOK_TO_DESKTOP_2026-08.md, section 5). TRUST-1, TRUST-2, TRUST-3A and the Mercado Pago identity-match correction are DONE in DEV (code + migrations applied + pushed + deployed) — TRUST-3B/TRUST-4 onward not authorized, not started. Urgent real follow-up: confirm with real Mercado Pago credentials whether /users/me actually returns identification for Chile (docs/trust/MP_IDENTITY_MATCH_AUDIT.md). Human UI testing is scheduled for this weekend with Rodrigo rested. A new Events backlog item was recorded (docs/events/EVENTS_BACKLOG.md) — documentation only, not part of EVENT-7. PROD promotion of Events and of Trust — a business decision, reserved for Rodrigo.
```

Before any further Events work: rotate the `rifex-dev` DB password (risk 8 below, still pending), do a real-device scanner smoke test if not already done (risk 10 below), confirm the real Vercel plan/Fluid Compute setting for `rifex-frontend-main`/`rifex-frontend-v2` (still unconfirmed, no non-interactive dashboard access this session either), and — urgently, desktop-PC-only — check whether PROD's `create_tickets_for_raffle` has the same dangerous grant.

**Canonical specs**: `docs/events/EVENT4_STAFF_SCANNER_CHECKIN.md` (EVENT-4, certified), `docs/events/EVENT5_ANALYTICS_XLSX.md` (EVENT-5, **CERTIFIED**), `docs/events/EVENT6_SECURITY_AUDIT.md` (EVENT-6 Fase 1), `docs/events/EVENT6_SECURITY_AUDIT_FASE2.md` (EVENT-6 Fase 2 — inherited WARN audit + promotion package), and `docs/trust/RIFEX_TRUST_CANONICAL_DESIGN.md` (Rifex Trust — TRUST-1/TRUST-2/TRUST-3A implemented in DEV, TRUST-3B/TRUST-4+ still design only).

### Reentry Notebook Procedure (Antofagasta)

Steps for a new machine, in order — stop and report if any step contradicts what's documented above rather than pushing forward:

1. Clone the repo if not already present: `https://github.com/ravymaster/rifex-frontend-v2.git`.
2. `cd` into the repo.
3. `git checkout develop`.
4. `git fetch origin`.
5. `git pull --ff-only origin develop`.
6. Verify `git rev-parse HEAD` is the EVENT-4 commit (`docs(events)`/`feat(events): add staff scanner and atomic check-in` on top of `725c4f8`) or a descendant. If it does not match, stop and reconcile against this document before touching anything.
7. `npm ci` (or `npm install`) if `node_modules` is missing/stale.
8. Configure the DEV environment **without ever committing secrets to Git**. Variable **names** needed (values must be transferred out-of-band, e.g. password manager or secure note — never pasted into a doc or commit): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (or the `SUPABASE_DEV_*` equivalents already scaffolded in this repo's env pattern — prefer those explicitly for DEV to avoid the PROD-pointing footgun above), `NEXT_PUBLIC_BASE_URL`, `MP_ACCESS_TOKEN`, `MP_CLIENT_ID`, `MP_CLIENT_SECRET`, `MP_PUBLIC_KEY`, `MP_REDIRECT_URI`, `MP_WEBHOOK_SECRET`, `ENABLE_EMAILS`, `RESEND_API_KEY`, `EMAIL_FROM`, `NEXT_PUBLIC_STAGE`, `HCAPTCHA_SECRET`, `NEXT_PUBLIC_HCAPTCHA_SITEKEY`, `ADMIN_API_TOKEN`, `DEV_TEST_EMAIL_TOKEN`, `CREATOR_FALLBACK_EMAIL`, `HOLD_MINUTES`.
9. Start the app locally (`npm run dev`) or work directly against the deployed DEV preview at `rifex-frontend-main.vercel.app` — both are valid, the deployed one requires no local secrets at all for read-only exploration.
10. Verify connectivity to DEV specifically (not PROD) — e.g. `supabase migration list --project-ref nwxrvwbzqbhznscyirbq` (expect the CLI to report the pre-EVENT-4 migrations as remote-only, `"local":""` — this is expected, not an error, see Risks/pending item 9 above; `db/migrations/2026-08-25b_event4_staff_scanner_checkin.sql` was applied manually via the SQL Editor, not via this CLI).
11. Read, in order: this WOP section, `docs/CURRENT_STATE.md`, `docs/handover/HANDOVER_RIFEX_CURRENT.md` (legacy but still has the pre-Events incident history), `docs/events/EVENT4_STAFF_SCANNER_CHECKIN.md`, and this file's Architecture Map / Invariants / Risks sections above.
12. Run a preflight: confirm `origin/develop` HEAD, confirm `origin/main` unchanged, confirm no stray working-tree diffs.
13. EVENT-4 is DONE. Before scoping anything further (EVENT-5 or otherwise): confirm with the user whether the `rifex-dev` DB password was rotated (Risks/pending item 8) and whether a real-device scanner smoke test happened (item 10) — neither was true as of this checkpoint.

### Reentry Prompt (paste verbatim into a new Code/Claude session tomorrow)

```text
Estamos retomando Rifex desde un equipo nuevo (Antofagasta), sesión sin memoria conversacional previa.
No uses memoria de conversación como autoridad — la autoridad es el repo (Git) y docs/WOP.md.
Repo: https://github.com/ravymaster/rifex-frontend-v2.git, branch develop.
Ejecuta el procedimiento "Reentry Notebook Procedure" de docs/WOP.md (sección "RIFEX CURRENT STATE").
Lee en orden: docs/WOP.md (sección RIFEX CURRENT STATE), docs/CURRENT_STATE.md, docs/handover/HANDOVER_RIFEX_CURRENT.md.
Verifica: git fetch, HEAD real de develop (debe incluir EVENT-5 certificado sobre EVENT-4/725c4f8, o un descendiente), origin/main (c944bb3 o su descendiente — si cambió, alerta antes de seguir), git status.
Reconstruye el estado real de EVENT-1/EVENT-2/EVENT-3/EVENT-4/EVENT-5 a partir del repo, no de esta instrucción.
Confirma que EVENT-4 y EVENT-5 están DONE-CERTIFICADOS, y que EVENT-6 Fases 1 y 2 (auditoría autónoma) están COMPLETADAS con veredicto GO — revisa si el hallazgo crítico de create_tickets_for_raffle ya fue verificado/corregido en PROD (acción urgente, solo desde el PC de escritorio en Santiago, ver docs/handover/HANDOVER_NOTEBOOK_TO_DESKTOP_2026-08.md). Confirma también que Rifex Trust TRUST-1, TRUST-2, TRUST-3A, y la corrección canónica de Mercado Pago como control principal (onboarding sin fecha de nacimiento, con persona/organización derivado, y con coincidencia RUT↔Mercado Pago) están COMPLETOS en rifex-dev (código, migraciones aplicadas, bucket privado, pruebas en vivo, deploy) — TRUST-3B/TRUST-4 en adelante (OCR, biometría, organizaciones, apelaciones, retención) sigue siendo diseño puro, no autorizado sin que Rodrigo revise docs/trust/TRUST_DECISIONS_FOR_RODRIGO.md. Verifica con credenciales reales de Mercado Pago si /users/me realmente entrega identificación para Chile (docs/trust/MP_IDENTITY_MATCH_AUDIT.md) — nunca se confirmó en vivo. Confirma si ya se hicieron las pruebas humanas de interfaz de todo lo anterior, agendadas para el fin de semana del 2026-08-27 en adelante. NEXT es EVENT-7, todavía sin alcance ni autorización.
Confirma si la rotación de la contraseña de rifex-dev y el smoke test real de cámara ya se hicieron (WOP, Risks/pending y "NEXT (exact)") — probablemente no.
No modifiques código todavía.
Entrégame un REENTRY REPORT (branch, HEAD, origin/develop, origin/main, git status, resumen EVENT-1/2/3/4/5, riesgos pendientes, NEXT) y detente ahí.
```

### END CURRENT STATE

---

## Current Documentary State

| Gate | Status |
|---|---|
| PRE-ALIGNMENT AUDIT | GO |
| ALIGNMENT A1 | GO |
| ALIGNMENT A2 | GO |
| CHECKPOINT A2 | GO |
| ALIGNMENT A3 | GO |
| ALIGNMENT A4 | GO |
| ALIGNMENT A5 | GO |
| ALIGNMENT | CLOSED - GO |
| ARCHITECTURE AUDIT AA1 | GO |
| ARCHITECTURE AUDIT AA2 | GO |
| ARCHITECTURE AUDIT AA3 | GO |
| ARCHITECTURE AUDIT DOCUMENTATION READY | YES |
| ARCHITECTURE AUDIT | CLOSED - GO |
| ARCHITECTURE DESIGN AD1 | GO |
| ARCHITECTURE DESIGN AD1 ADVERSARIAL REVIEW | GO |
| ARCHITECTURE DESIGN AD1 CORRECTION | GO |
| ARCHITECTURE DESIGN AD2 | GO |
| ARCHITECTURE DESIGN AD3 | GO |
| ARCHITECTURE DESIGN CLOSING GATE | GO |
| ARCHITECTURE DESIGN DOCUMENTATION READY | YES |
| ARCHITECTURE DESIGN | CLOSED - GO |
| R4 SPRINT READINESS | GO |
| SPRINT R4 | CLOSED - GO |
| SPRINT | R4 CLOSED; OTHER SPRINTS NOT YET OPEN / NOT AUTHORIZED |
| DB RECOVERY | DONE — 2026-08-14/15, informal/incident-driven, not via a Sprint packet (see Current Stage below) |
| MERCADO PAGO DIRECT CHECKOUT | CONFIRMED FUNCTIONAL IN PRODUCTION |
| ARCHITECTURE AUDIT — FRONTEND/LOGIC SEPARATION | OPEN - AUTHORIZED (2026-08-15) |


## Next Eligible Stage

```text
SPRINT R4: CLOSED — GO
DB RECOVERY: DONE (informal, incident-driven)
NEXT ELIGIBLE STAGE: ARCHITECTURE AUDIT — FRONTEND/LOGIC SEPARATION
ARCHITECTURE AUDIT — FRONTEND/LOGIC SEPARATION: OPEN - AUTHORIZED
OTHER SPRINTS: NOT AUTHORIZED
```
## Official Project States

| State | Meaning |
|---|---|
| BEGIN | New project initialization |
| ALIGNMENT | Reconstruction of an existing project before changing behavior |
| ARCHITECTURE AUDIT | Analysis of real architecture; no implementation |
| ARCHITECTURE DESIGN | Future architecture design; no implementation |
| SPRINT | Authorized implementation cycle |
| RELEASE AUDIT | Verification before commit/push |
| PAUSED | Work intentionally stopped |
| PRODUCTION | Production operation state |
| MAINTENANCE | Controlled maintenance |
| LEGACY | Legacy state or component |

## Current Stage

Rifex has closed `ALIGNMENT`, `ARCHITECTURE AUDIT` and `ARCHITECTURE DESIGN`. Architecture Design AD3 is documented with `GO`, Architecture Design Closing Gate is `GO`, R4 Sprint Readiness is `GO`, and Sprint R4 (Build Baseline Recovery) is `CLOSED - GO`: implemented, Release Audit confirmed GO, committed and pushed at HEAD `bbaf8a0` (`fix: restore checkout page build`).

**DB Recovery — done, but not through the formal Sprint packet process.** On 2026-08-14/15, the user disclosed that the original production Supabase project (`huoepoxuqaodfgbtbalb`) had been deleted directly in Supabase (not through this repository). This was discovered mid-session, confirmed live (`rifex.pro/api/rifas` returning `TypeError: fetch failed`), and constituted an active production incident, not a planned Sprint. Recovery was executed through direct, explicitly authorized, turn-by-turn user instruction rather than a pre-written packet: Vercel's production `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` were repointed to a new Supabase project (`wrdkdfuiwlujfxxijpao`, already provisioned earlier the same session for local sandbox testing via `db/restore/001_schema_supabase_clean.sql`), all sandbox/test rows were purged from it first, and production was confirmed restored to a genuinely empty, functional state. This is recorded as `DONE`, not as a closed Sprint — the WOP's Git Rules and Stage Change Process were not fully followed (no packet, no isolated Sprint commit boundary) because incident response took priority over ceremony. See `docs/handover/HANDOVER_RIFEX_CURRENT.md` for the full evidence trail.

Two code fixes were also implemented and pushed the same session, each independently verified against real data before commit: `webhook_events` was never written to despite the table, its unique index and its `event_id` builder already existing (`7e8e6b7`); `mp/disconnect.js` only cleared 8 of 13 credential columns, leaving a live `mp_refresh_token` behind after "disconnecting" (`1aa97cd`). Both were found live, not from static review.

**Production Validation, 2026-08-15.** After DB recovery, a real end-to-end purchase was completed on `rifex.pro`: a newly registered real Rifex account created a real raffle, the user's own real Mercado Pago account was connected as the seller via OAuth (no environment mismatch — this only reproduces cleanly in real production, not in sandbox, see Critical Risks), and a different real Mercado Pago account completed payment. Ticket sold, purchase approved, payment recorded, a real Mercado Pago webhook was received and logged, buyer/creator emails sent. This is the first `CONFIRMED FUNCTIONAL` evidence for the Mercado Pago checkout flow in this repository's documented history.

This does not certify every flow, does not adopt the three preserved recovery/hardening diffs (which, correction: are already part of `main` at HEAD — see Baseline Decision below), does not implement Mercado Pago split payments (requires direct engagement with Mercado Pago's commercial team, not a code or certification path — see `docs/handover/HANDOVER_RIFEX_CURRENT.md`), and does not by itself authorize the newly opened Architecture Audit beyond its stated scope (frontend/logic separation, in preparation for a UI/UX redesign — explicitly authorized by the user on 2026-08-15).

## Baseline Decision

```text
PROPOSED BASELINE DECISION: C
```

Decision C is the documentary baseline decision approved during Alignment A1 and carried forward through the A2 checkpoint. HEAD `1aa97cd43e63649d2d17255a42ee71600e631315` is the current confirmed HEAD (`fix: clear all credential fields on MP disconnect, not just half`). `bbaf8a02d2ff3681186e8f84317ce1c7cdd064ee` (`fix: restore checkout page build`), the R4 implementation commit, is an ancestor of HEAD. Previous citations (`b46ef9d`, `48013ce`, `bbaf8a0`, `1fc064a`) each lagged the real HEAD because the commit that closed a gate did not bump its own self-citation — a recurring pattern in this repository; see `docs/audits/EXECUTION_ENVIRONMENT_AUDIT.md` for the first reconciliation (`STALE, NOT CORRUPTED`, no diverged history). Correction to a separate stale claim: `mailer.js`, `reconcile-payments.js` and `webhook.js` are **not** an outstanding working-tree diff — `git diff --stat` against HEAD for those three files is empty; they are ordinary committed files in `main`. That claim was already stale before this session began. The PostgreSQL backup corresponds to the original Supabase project, which has since been deleted (see Current Stage) — it is now the only surviving evidence of that project's data, and remains sensitive evidence outside the Git baseline. R4 build-success is confirmed; beyond that, the Mercado Pago checkout flow is now `CONFIRMED FUNCTIONAL` in production (see Current Stage, Production Validation) — a materially stronger claim than "build-success only," scoped specifically to that flow.

| Layer | Status |
|---|---|
| HEAD `1aa97cd` | CONFIRMED current HEAD (fix: clear all credential fields on MP disconnect, not just half) |
| R4 implementation commit `bbaf8a0` | CONFIRMED ancestor of HEAD (fix: restore checkout page build) |
| `webhook_events` fix `7e8e6b7` | CONFIRMED; verified live with a real Mercado Pago webhook in production |
| `mp/disconnect.js` fix `1aa97cd` | CONFIRMED; verified by seeding all 13 credential columns and confirming full clear |
| Supabase project | CONFIRMED changed: original (`huoepoxuqaodfgbtbalb`) deleted by the user outside this repo; current baseline is `wrdkdfuiwlujfxxijpao`, used by **both** production and local dev — architecture gap, not target state |
| PostgreSQL backup | CONFIRMED sensitive evidence outside Git baseline; corresponds to the deleted project, not the current one |
| A2 documents | CONFIRMED documentation materialization |
| Architecture Audit documents | CONFIRMED documentation materialization |
| Architecture Design AD3 report | CONFIRMED documentation materialization |
| R4 Sprint packet | CLOSED - GO; implemented at `bbaf8a0`, `npm run build` passes |
| Production Validation | CONFIRMED 2026-08-15; real seller, real buyer, real webhook — see Current Stage |
| Recovery decision | B: split recovery into R4, DB, R1, R2, R3 Technical and Fees Policy; DB unit executed informally (incident-driven), R1/R2/R3/Fees Policy still not authorized |

## Recovery Sequence

```text
R4 -> DB Recovery Contract -> R1 -> R2 -> R3 Technical -> Fees Policy -> Release Audits -> Separate Commits
```

This sequence is approved as a recovery plan, not as implementation. Recovery changes must not be implemented before Architecture Design and an explicitly authorized Sprint.

## Alignment Closing Criteria

Alignment may close when product identity, Git baseline, working tree ownership, current architecture, domain, database, security, known risks and recovery plan are documented with no unresolved integrity uncertainty.

Condition to open Architecture Design: Architecture Audit must be closed with `GO`, the current dirty working tree must remain explained, and the user must explicitly authorize Architecture Design.

## Known Working Tree

`src/lib/mailer.js`, `src/pages/api/admin/reconcile-payments.js` and `src/pages/api/checkout/webhook.js` were previously described here as "pre-existing functional diffs." Correction: they are ordinary committed files in `main` at HEAD, with no working-tree diff (`git diff --stat` against HEAD is empty). That description was already stale before this session began.

Sensitive artifact:

- `db_cluster-10-11-2025@05-41-59.backup.gz` — corresponds to the original Supabase project (`huoepoxuqaodfgbtbalb`), deleted 2026-08-14/15. It is now the only surviving evidence of that project's data. Still outside the Git baseline; do not inspect, move or delete without a specific mission.

New untracked artifact:

- `db/restore/001_schema_supabase_clean.sql` — the schema-provisioning script actually used to build the current Supabase project (`wrdkdfuiwlujfxxijpao`), now serving both production and local dev. Untracked as of HEAD `1aa97cd`; should be committed, since it is no longer just a sandbox artifact.

## Blockers And Limits

| Item | Classification |
|---|---|
| Functional verification | PARTIAL — Mercado Pago direct-collection checkout CONFIRMED FUNCTIONAL in production (2026-08-15); other flows remain UNVERIFIED |
| DB remote state | CONFIRMED (new project `wrdkdfuiwlujfxxijpao`, schema applied, empty of legacy data, currently serving both production and local dev) |
| Canonical ticket/purchase/payment states | CONTRADICTORY claim inherited from prior audits of the now-deleted original project; not re-verified against the new project's data model, which was restored from the same schema and is presumed to carry the same contradiction until checked |
| Mercado Pago split payments (1:N) | NOT AVAILABLE; requires direct engagement with Mercado Pago's commercial team, not a code change or self-service certification |
| Sandbox testing of Mercado Pago OAuth-connected-seller flow | BLOCKED as currently configured — the app has no sandbox-specific OAuth Client ID/Secret, so any OAuth-connected token comes back tied to the production Client ID (`APP_USR-` prefix, not `TEST-`), causing an environment mismatch when paired with a sandbox buyer. Only verified working in real production |
| Architecture Audit | CLOSED - GO |
| Architecture Design | CLOSED - GO |
| R4 Sprint Readiness | GO |
| Sprint R4 | CLOSED - GO |
| DB Recovery | DONE — informal, incident-driven, 2026-08-14/15 |
| Architecture Audit — Frontend/Logic Separation | OPEN - AUTHORIZED (2026-08-15) |
| Sprint | R4 CLOSED; OTHERS NOT YET OPEN / NOT AUTHORIZED |

## Rules For AI Agents

- Use the repository as source of truth.
- Distinguish facts, inferences, and proposals.
- Use `CONFIRMED`, `INFERRED`, `PROPOSED`, `UNKNOWN`, `UNVERIFIED`, `NOT IMPLEMENTED`, `NOT EVIDENCED`, `CONTRADICTORY`, and `BLOCKED`.
- Do not present code presence as functional verification.
- Do not mix HEAD with working tree diffs.
- Do not treat the backup as Git baseline.
- Do not expose secrets, personal data, or backup rows.
- Preserve user and previous-agent work unless explicitly authorized.

## Gate Values

| Gate | Meaning |
|---|---|
| GO | Evidence satisfies the stated gate |
| PARTIAL | Most work is complete but documented gaps remain |
| NO GO | Integrity, scope, or evidence failed |

## Git Rules

- No Sprint is complete without Release Audit.
- Closed work requires commit, push, HEAD verified, and clean working tree.
- Dirty working trees must be explained by category.
- Do not use destructive Git commands without explicit authorization.
- Do not stage, commit, or push during Architecture Design documentation materialization unless explicitly authorized.

## Stage Change Process

A later stage can open only when the current gate is reported and the user authorizes the next stage. Sprint R4 was explicitly authorized, implemented, release-audited GO, committed and pushed. DB Recovery was subsequently executed informally — not through this process — in direct response to a production incident (see Current Stage); it is `DONE`, not `CLOSED - GO` in the packet sense, and that distinction is preserved deliberately rather than retrofitted. The user has since explicitly authorized the next formal stage: `ARCHITECTURE AUDIT — FRONTEND/LOGIC SEPARATION` (2026-08-15), scoped to mapping business logic vs. presentation ahead of a UI/UX redesign — no redesign implementation is authorized yet.

## Resume Handover

| Item | Status |
|---|---|
| Recovery preservation | GO |
| Recovery branch | `recovery/rifex-hardening-preserved` |
| Recovery commit | `1c23702f401f8c501077ecfd265a213245e62a63` |
| Handover | `docs/handover/HANDOVER_RIFEX_CURRENT.md` |
| R4 | CLOSED - GO at ancestor `bbaf8a0` |
| DB Recovery | DONE (informal, incident-driven, 2026-08-14/15) |
| Production Validation | CONFIRMED 2026-08-15 — see Current Stage |
| Next eligible / open stage | Architecture Audit — Frontend/Logic Separation; OPEN - AUTHORIZED |

Recovery preservation keeps the R1/R2/R3 hardening work on its own branch, recoverable without adopting it into `main` — that decision is unaffected by today's events, since the branch's three files are already present in `main` at HEAD regardless (see Baseline Decision correction). DB Recovery is done, but through incident response rather than the packet process; R1/R2/R3/Fees Policy remain `NOT AUTHORIZED`. The currently open stage is the Architecture Audit into frontend/logic separation, authorized 2026-08-15, in preparation for — but not itself authorizing — a UI/UX redesign. See `docs/handover/HANDOVER_RIFEX_CURRENT.md` for the full narrative.

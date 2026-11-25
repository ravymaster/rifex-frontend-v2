# Execution Environment Audit

This report documents a local execution/portability audit performed on a freshly cloned copy of the repository on a Linux machine. It does not open Sprint, does not implement fixes, and does not certify functional behavior beyond what is stated below.

## Purpose

Determine whether observed local execution problems on Linux are environment/configuration issues or code defects, and reconcile documentation drift discovered in the process.

## Git State Inspected

| Item | Value |
|---|---|
| HEAD | `48013ce53a3f108331b09c25d82d9eba1af4cd93` |
| origin/main | `48013ce53a3f108331b09c25d82d9eba1af4cd93` (matches HEAD) |
| Working tree | `package.json`, `package-lock.json` modified; no other diffs |
| Three recovery/hardening diffs (`mailer.js`, `reconcile-payments.js`, `webhook.js`) | Absent from working tree; match HEAD |

## Finding 1: Documented HEAD Hashes Were Stale, Not Corrupted

`README.md` and `docs/WOP.md` cited HEAD `b46ef9d` (two commits behind real HEAD). `docs/CURRENT_STATE.md` and `docs/handover/HANDOVER_RIFEX_CURRENT.md` cited HEAD `19e2899` (one commit behind real HEAD). Neither matched the real HEAD `48013ce`.

`git diff --stat 19e2899 HEAD` shows the only commit in that range added `docs/handover/HANDOVER_RIFEX_CURRENT.md` and touched only `.md` files. There is no diverged history, no rewritten commit, no merge conflict.

Classification: `CONTRADICTORY (STALE, NOT CORRUPTED)`. Each document was frozen at the commit that produced it and was not bumped again when a later commit closed a subsequent gate. `README.md` and `docs/WOP.md` were updated in this pass to cite the real HEAD as of this audit.

## Finding 2: `docs/dotenv.example` Referenced But Missing

`.gitignore` carries `!.env.example` and `docs/dotenv.example` as exceptions to the env-file ignore rule, and `scripts/run-dev.sh` executes:

```bash
cp -n docs/dotenv.example .env.local || true
```

`docs/dotenv.example` does not exist anywhere in the repository (`CONFIRMED` by direct filesystem check). Because the copy is guarded by `|| true`, the script's failure is silent: `run-dev.sh` proceeds to `npm run dev` with zero environment variables configured. This is a `CONFIRMED` onboarding gap, not a Windows/Linux portability defect — the script itself is a portable bash script.

Impact: a developer following the documented bootstrap path (`scripts/run-dev.sh`) gets a running dev server with no Supabase/Mercado Pago/Resend/hCaptcha configuration and no indication why features are broken.

## Finding 3: `.gitignore` Has Redundant/Malformed Env Entries

`.gitignore` contains multiple repeated blocks of `.env*` / `.env.local` entries and one stray line:

```text
-e "\n.env*\n"
```

This line has no ignore effect of its own (git does not interpret `-e` or the quotes; it is treated as a literal, non-matching pattern) and does not exclude anything that the other `.env*` lines don't already exclude. `CONFIRMED` cosmetic/hygiene issue. No functional impact: `.env*` is still ignored by the surrounding valid entries.

## Finding 4: Two Dead Windows-Origin Script Files

`scripts/kick.js` and `scripts/nop.js` are UTF-16LE, CRLF-terminated files (confirmed via `file`). Neither is referenced in `package.json` scripts, nor imported/required anywhere in the repository (`CONFIRMED` by full-repo grep). They are inert artifacts, most likely created by a Windows editor/shell redirect. No functional impact because nothing executes them.

## Finding 5: `package.json` `allowScripts` Diff Explained

The working tree carries an undocumented diff in `package.json`/`package-lock.json` adding:

```json
"allowScripts": { "sharp@0.34.3": true }
```

`git log --all -- package.json` shows this key was never present in any commit on any branch. The local npm installation is npm `11.17.0` (Node `24.19.0`, via nvm), and that npm build ships `lib/utils/allow-scripts-writer.js`, `check-allow-scripts.js`, and `strict-allow-scripts-preflight.js` — a real, current npm feature that gates native postinstall scripts (such as `sharp`'s) behind an explicit per-package approval, persisted into `package.json`. `node_modules/@img/sharp-linux-x64` is present and `require('sharp')` succeeds.

Classification: `CONFIRMED EXPLAINED, NO IMPACT`. This is a local package-manager artifact produced by installing on this machine, not a repository defect. Not reverted, not adopted into a commit here.

## Finding 6 (Reconfirmed, Not New): `/checkout` Build/Render Failure

Re-ran the previously documented failure on this machine, with evidence:

- `npm run build` with no env vars: fails earlier than the previously documented failure, at `Error: supabaseUrl is required` during "Collecting page data", because `src/pages/checkout/index.js` constructs a Supabase client at module scope.
- `npm run build` with placeholder Supabase env vars: reproduces the previously documented failure exactly — `React error #31` / `TypeError: t.status is not a function`, isolated to `/checkout`; all other 24 pages generate successfully.
- `npm run dev` with placeholder Supabase env vars: `/` , `/rifas`, `/login` return `200`; `/checkout` returns `500` with `TypeError: Cannot read properties of undefined (reading 'method')` at `src/pages/checkout/index.js:38`, because Next invokes the file's default export as a React component, not as an API handler.

Root cause `CONFIRMED`: `src/pages/checkout/index.js` contains API-handler code (imports `mercadopago`, uses `req.body`, calls `res.status(...).json(...)`, no JSX, no component export) at a Pages Router page path. This is the exact defect already scoped and designed for in `docs/sprints/R4_BUILD_BASELINE_SPRINT_PACKET.md`. Reproducible identically on Windows or Linux; not a portability issue. Not modified by this audit.

## Conclusions

| Question | Answer |
|---|---|
| Can Rifex run locally on Linux without architecture changes? | `PARTIAL` — everything except `/checkout` runs; `/checkout` is a pre-diagnosed, pre-scoped code defect (R4), not an environment issue |
| Are the observed local problems mainly environment/configuration? | `PARTIAL` — `docs/dotenv.example` gap is a real configuration/onboarding defect; the dominant reported symptom (`/checkout`) is a code defect |
| Is there a real Windows/Linux portability bug requiring a fix? | `NO` — no hardcoded Windows paths, no `process.platform` branching, no CRLF in source under `src/`, no filesystem-specific dependency found |

## Scope And Limits

This audit did not modify any file under `src/`, `scripts/`, `package.json`, or `.gitignore`. It did not call any external service with real credentials. It did not install, remove, or upgrade any dependency. It does not authorize or open Sprint R4 or any other Sprint.

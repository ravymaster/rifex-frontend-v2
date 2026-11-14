# RIFEX RAFFLE EXPERIENCE 2026 — PROD PROMOTION

**Fecha**: 2026-09-08
**Autorizado por**: Rodrigo, tras QA humana final aprobada en desktop y mobile sobre `origin/develop` (VISUAL LOCK).
**Fuente certificada**: `origin/develop @ c3a3553`
**Baseline PROD antes de esta promoción**: `origin/main @ 84708a9` (tag `v3.0.1-rifex-prod-panel-pagination`)
**Release branch**: `release/rifex-raffle-experience-2026` (worktree aislado desde `origin/main`, sin merge/rebase de la historia de `develop`)

## 1. Método

Reconstrucción quirúrgica, no merge. Se calculó la divergencia real `origin/main` ↔ `origin/develop` con diff de dos puntos (tip a tip — el diff de tres puntos contra el merge-base histórico da una cifra inflada e inútil por la antigüedad del ancestro común de ambas ramas, que nunca se han fusionado). Resultado real: **57 archivos** divergentes. Cada uno fue clasificado individualmente por uso real (`git grep`, lectura de imports, lectura de los 5 test files de Rifas de `develop` para confirmar dependencias reales) — nunca por nombre de archivo o mensaje de commit.

## 2. Matriz de divergencia (57 archivos)

### 2.1 Promovidos a PROD — 29 archivos

| Archivo | Tipo | Motivo |
|---|---|---|
| `db/migrations/2026-09-07_raffle_slug_features.sql` | Nuevo (corregido) | Ver §3 — versión de `develop` tenía una regresión real, corregida antes de promover |
| `docs/rifas/CHECKOUT_UNIFICADO_V2_2026.md` | Nuevo | Doc técnico de la misión, precedente: PROD ya carga docs técnicos específicos por feature |
| `docs/rifas/CHECKOUT_V2_UX_CORRECTION_2026.md` | Nuevo | ídem |
| `docs/rifas/FINAL_VISUAL_LOCK_2026.md` | Nuevo | ídem |
| `docs/rifas/HUMAN_SLUG_V2_2026.md` | Nuevo | ídem |
| `docs/rifas/RAFFLE_EXPERIENCE_2026.md` | Nuevo | ídem |
| `docs/rifas/RAFFLE_VISUAL_POLISH_2026.md` | Nuevo | ídem |
| `src/components/rifex/PrizeGallery.jsx` | Nuevo | Galería/lightbox real, importada por `rifas/[id].jsx` y `checkout.jsx` |
| `src/components/rifex/QuantitySelector.jsx` | Nuevo | No importado por ninguna página (retiro de invocación, no del archivo — certificado por `checkoutUnifiedV2.test.mjs` MODAL-CO 4), pero su propio código es leído/testeado directamente por `raffleExperience2026.test.mjs` |
| `src/lib/idOrSlug.js` | Nuevo | Compatibilidad slug/UUID — usado por API y página pública |
| `src/lib/raffleLabels.js` | Nuevo | Helpers de etiquetas humanas de estado/tipo de premio |
| `src/pages/rifas/[id]/checkout.jsx` | Nuevo | Pantalla real de checkout v2 (único paso, sin modales) |
| `src/styles/checkoutV2.module.css` | Nuevo | Estilos del checkout nuevo |
| `src/styles/prizeGallery.module.css` | Nuevo | Estilos de la galería |
| `src/styles/quantitySelector.module.css` | Nuevo | Import directo de `QuantitySelector.jsx` |
| `tests/checkoutUnifiedV2.test.mjs` | Nuevo | Test específico de Rifas |
| `tests/finalVisualLock.test.mjs` | Nuevo | ídem |
| `tests/humanSlugV2.test.mjs` | Nuevo | ídem |
| `tests/raffleExperience2026.test.mjs` | Nuevo | ídem |
| `tests/raffleVisualPolish.test.mjs` | Nuevo | ídem |
| `src/pages/api/checkout/mp.js` | Modificado | Asignación server-side de números (RPC atómica ya certificada sin cambios); comisión 7% intacta — ver §4 |
| `src/pages/api/rifas/[id]/index.js` | Modificado | GET soporta slug o UUID (`idOrSlugColumn`) |
| `src/pages/api/rifas/index.js` | Modificado | `features`, generación/retry de slug |
| `src/pages/crear-rifa.jsx` | Modificado | Fotos hasta 5, features dinámicas, perfil organizador |
| `src/pages/rifas/[id].jsx` | Modificado | Página pública completa (visual lock, galería, Buy Box compacto) |
| `src/pages/terminos.js` | Modificado | 2 líneas, referencia a `checkout.jsx` en vez de `BuyerForm.jsx` |
| `src/pages/terminos-rifas.js` | Modificado | ídem |
| `src/styles/crearRifa.module.css` | Modificado | Estilos aditivos (preview de fotos, tarjeta de organizador) |
| `src/styles/rifaDetalle.module.css` | Modificado | Visual lock — contenedores, breakout de centrado |

### 2.2 Excluidos — 28 archivos (ajenos a la cadena certificada de Rifas)

| Archivo | Motivo de exclusión |
|---|---|
| `docs/public-surface/FINAL_PUBLIC_SURFACE_CLOSURE.md` | Landings/Eventos/Campañas/Admin — ya vive en PROD, ajeno a Rifas |
| `docs/public-surface/PRODUCT_LANDINGS_V1.md` | ídem |
| `src/components/DevBanner.jsx` | DEV-only — `authUxCrawler.test.mjs` de PROD certifica que nunca debe existir en PROD |
| `src/lib/captchaGate.js` | DEV-only bypass de captcha — mismo certificado |
| `src/pages/_app.js` | Wiring de `DevBanner`/`captchaGate` |
| `src/pages/login.jsx` | RUT relajado + bypass captcha DEV-only |
| `src/pages/register.jsx` | ídem |
| `tests/authUxCrawler.test.mjs` | Versión de `develop` valida el bypass DEV; la de `main` certifica lo contrario — se deja la de `main` intacta |
| `src/components/rifex/BuyerForm.jsx` | Componente legacy, aún activo en `main` (flujo antiguo); ningún test de Rifas lee su contenido — queda huérfano naturalmente al reemplazar la página padre, sin tocarlo |
| `src/components/rifex/RaffleIntroModal.jsx` | ídem |
| `docs/difusion/DIFUSION_V1.md` | Difusión/Medidor de convocatoria — explícitamente fuera de alcance de esta misión |
| `docs/inscripciones/*.md` (4 archivos) | Módulo Inscripciones, ajeno a Rifas |
| `docs/public-surface/PUBLIC_SURFACE_CLASSIFICATION_GUARD.md` | Registro PSCG de rutas de Eventos/Campañas/Landings/Admin — ninguna ruta de Rifas cambió de categoría |
| `docs/trust/PROGRESSIVE_ONBOARDING_GATE.md` | Solo housekeeping de docs (retiro de banner de promoción), ajeno a Rifas |
| `src/pages/api/blog/index.js`, `src/pages/api/blog/[slug]/index.js`, `src/pages/blog/index.js` | Módulo Blog |
| `docs/CURRENT_STATE.md`, `docs/WOP.md`, `docs/handover/NUEVA_SESION_PROMPT.md` | Docs narrativas — siempre reescritas frescas para PROD, nunca copiadas de `develop` (esta misma promoción las actualiza con su propio addendum) |
| `db/migrations/2026-08-26d5_ar2_country_columns_reconstructed.sql` | Solo existe en `main` (AR2/columnas de país) — no aplica, permanece como está |
| `docs/releases/RIFEX_BLOG_PRIVATE_PROD_PROMOTION_2026-09-01.md`, `RIFEX_CONTROLLED_PROD_RELEASE_2026-08-31.md`, `RIFEX_FULL_PROD_RELEASE_2026-08-30.md` | Solo existen en `main` (historial de releases previos) — no aplica |
| `tests/blogPrivateProd.test.mjs` | Solo existe en `main` — no aplica |

## 3. Bug encontrado y corregido antes de promover

Auditando la única migración faltante (`2026-09-07_raffle_slug_features.sql`), se detectó que su redefinición de `create_raffle_with_declarations` (`CREATE OR REPLACE FUNCTION`) omite tres columnas — `requires_transfer_procedures`, `transfer_expenses_owner`, `transfer_conditions` — que una migración distinta y ya certificada (`2026-08-29_physical_prize_transfer_transparency.sql`, idéntica en ambas ramas) había agregado a la misma función. Confirmado empíricamente contra la base real de `rifex-dev` con un fixture desechable: al crear una rifa con `requires_transfer_procedures: true, transfer_expenses_owner: 'creator', transfer_conditions: '...'`, la fila resultante volvía con `false`/`null`/`null` — los tres campos se pierden en silencio. Fixture limpiado inmediatamente después.

**Corrección aplicada**: la migración incluida en esta promoción (`db/migrations/2026-09-07_raffle_slug_features.sql` dentro de este release) NO es una copia de la de `develop` — es una versión reconstruida que agrega `slug`/`features` al mismo `INSERT` que ya incluye las 3 columnas de transferencia, sin perder ninguna de las dos evoluciones previas de la función. PROD nunca recibirá la regresión. El mismo defecto sigue vivo hoy en `rifex-dev` (no forma parte de esta misión de PROD, pendiente de una corrección separada en DEV).

## 4. Auditoría Payment Engine / RLS / Trust / cross-contaminación

- **`checkout/mp.js`**: diff real contra `main` es de 146 líneas, exclusivamente la nueva `assignRandomAvailableNumbers()` (Fisher-Yates sobre ventana acotada de candidatos) + cambio de `numbers[]` a `quantity` en el body + guard `quantity_exceeds_total`. La escritura real de la reserva sigue siendo 100% la misma RPC atómica todo-o-nada ya certificada (`reserve_tickets_for_purchase`), sin cambios. `RIFEX_FEE_RATE = 0.07` y todo el cálculo de `marketplace_fee`/resolución de token de vendedor quedan **exactamente igual** — no aparecen en el diff.
- **`checkout/webhook.js`**, **`paymentEngine/money.js`**, **`drawWinner.js`**: confirmados **byte-idénticos** a `main` — cero cambios.
- **Eventos / Campañas / Inscripciones / Trust / Blog**: cero archivos de esos módulos en el diff final contra `main` (`git diff origin/main --name-only | grep -iE "evento|campan|inscripc|trust|blog|paymentEngine|platformFee|colecta"` → sin resultados).
- **RLS / migraciones**: única migración promovida es la corregida en §3, puramente aditiva (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, índice único parcial, backfill, redefinición de función ya certificada con `search_path`/`REVOKE` reafirmados). No toca ninguna política RLS existente.

## 5. Evidencia técnica

- **Clasificación**: 29/29 archivos verificados sin contaminación cruzada (`git status --short` exacto, sin archivos DEV-only presentes).
- **Tests específicos de Rifas**: 5/5 archivos (`checkoutUnifiedV2`, `finalVisualLock`, `humanSlugV2`, `raffleExperience2026`, `raffleVisualPolish`) — todos verdes.
- **Regresión completa**: verde salvo 1 test preexistente y ajeno (`tests/eventAnalyticsWorkbook.test.mjs`, stress test de XLSX de Eventos con umbral de tiempo ajustado, sensible a la carga de esta máquina — no forma parte de los 29 archivos promovidos).
- **Build**: `npm run build` limpio, exit 0, `/rifas/[id]`, `/rifas/[id]/checkout`, `/rifas/crear` presentes en la salida.
- **`git diff --check`**: limpio, sin marcadores de conflicto ni problemas de whitespace.

## 6. Estado actual

Release branch construida y verificada localmente. **Aún no pusheada a `origin/main`** — pendiente de autorización explícita de Rodrigo tras revisar esta matriz, según lo instruido ("Antes del push a main, reportar la matriz de divergencia... Si la reconstrucción es limpia... preparar el push").

Próximos pasos tras autorización: commit final → push a `origin/main` → verificar deploy Vercel → smoke en `rifex.pro` (sin pago real) → solo después de la QA humana de Rodrigo sobre PROD, crear el tag final (`v3.1-rifex-prod-raffle-experience-2026`, propuesto).

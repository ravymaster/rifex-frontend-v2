# HUMAN SLUG V2 + PUBLIC RAFFLE CLEANUP (2026-09-07)

DEV only. Branch `dev/human-slug-v2-raffle-cleanup-2026-09-07`, sobre
`origin/develop` (que ya incluía RAFFLE VISUAL POLISH, commit `a6fc58f`).

## Origen

Mandato explícito de Rodrigo tras verificar en vivo el despliegue de RAFFLE
VISUAL POLISH: (A) la ficha pública seguía mostrando un modal/popup antiguo
(tipo "mixto", Premio/Valor del número/Termina/Estado) que ya no pertenece
al diseño 2026 — esa información ya vive en el hero/tarjetas; (B) el enlace
público de una rifa real (`/rifas/lambo`) devolvía 404 porque esa rifa
específica quedó con el slug V1 del backfill (`lambo-6f9973`), con aspecto
técnico.

## Objetivo A — Retiro del modal antiguo

`RaffleIntroModal.jsx` se auditó primero: es invocado **únicamente** desde
`rifas/[id].jsx` (nunca desde `crear-rifa.jsx`, que solo lo mencionaba en un
comentario). Retiro quirúrgico de la invocación, no del archivo — el
componente sigue existiendo por si se necesita en el futuro, simplemente no
se renderiza más en la ficha pública. Se eliminó también todo el estado y
lógica asociada (`showIntro`, el `useEffect` de mostrar/ocultar según
ganador/query `?noIntro=1`/`localStorage`, y su entrada en
`hasAnyModalOrOverlay`). El popup **Trust** ("Antes de continuar" — el
aviso de identidad/seguridad del organizador, vía `TrustPopup`) es un
componente completamente distinto, fuera de alcance, y no fue tocado en
absoluto: sigue importado y renderizado exactamente igual.

## Objetivo B — Human Slug V2

Antes: primer intento sin sufijo (ya correcto), reintento con sufijo de 4
caracteres aleatorios ante colisión real. Ahora: **mismo algoritmo, mismo
`slugify()`**, solo se amplía `MAX_SLUG_ATTEMPTS` de 3 a 5 (más margen bajo
colisión concurrente real) y el sufijo de colisión se acota a exactamente 3
caracteres alfanuméricos (`Math.random().toString(36).slice(2, 5)`) — nunca
derivado de mostrar los primeros caracteres del UUID, patrón que sí existía
en el backfill SQL original de RAFFLE VISUAL POLISH y que deliberadamente no
se reutiliza acá ni se retrocede sobre datos existentes.

Ejemplos verificados: `"Lambo"` → `lambo` (o `lambo-k7m` en colisión real);
`"Toyota RAV4 2026"` → `toyota-rav4-2026`; `"¡10 Millones en Efectivo!"` →
`10-millones-en-efectivo` — sin cambios en `slugify()` porque ya producía
exactamente esta salida desde su creación original para el blog.

## Concurrencia y unicidad — sin migración nueva

La autoridad real de unicidad sigue siendo el índice único parcial
(`raffles_slug_unique_idx`) ya creado en la migración de RAFFLE VISUAL
POLISH. El patrón de creación **nunca hace `SELECT` antes del `INSERT`**
(evita la carrera clásica de verificar-y-luego-insertar): intenta la RPC
`create_raffle_with_declarations` con el slug candidato, y solo reintenta
con un nuevo sufijo aleatorio si Postgres rechaza con `23505` (violación
real del índice único). Cualquier otro error se propaga de inmediato, nunca
se interpreta como colisión de slug.

**Prueba de concurrencia real** (no solo tests unitarios): fixture
disponible ejecutado contra `rifex-dev` con un creador real disposable
(usuario Auth real, `trust_onboarding` completo incluyendo RUT válido,
`merchant_gateways` con MP conectado y `mp_identity_match: 'matched'`),
autenticado con `signInWithPassword` real, disparando **dos peticiones HTTP
simultáneas** (`Promise.all`) a `POST /api/rifas` con el mismo título contra
un servidor `next start` real. Resultado: dos creaciones exitosas (200), dos
slugs **distintos** (`lambo-concurrencia-qa-mtrl8q43` y
`...-mtrl8q43-73c`), el sufijo de colisión de exactamente 3 caracteres
alfanuméricos (nunca un hex de 6 derivado del UUID), ambos slugs resueltos
al UUID real correcto en la base, y limpieza verificada en cero (0 rifas
residuales, 0 filas de `trust_onboarding` residuales tras la corrida).

## Compatibilidad de URLs — sin migración destructiva

`idOrSlugColumn()` (de RAFFLE VISUAL POLISH, sin cambios) sigue resolviendo
tres formas simultáneamente, sin prioridad especial ni redirect canónico
añadido: UUID histórico, slug V1 con sufijo hex (`lambo-6f9973`), y slug V2
limpio o con sufijo corto. Ninguna rifa existente fue re-migrada — el V1 no
se toca, esta misión solo cambia la generación para creaciones nuevas.

## UUID como identidad interna — re-auditado, sin regresión

Re-confirmado explícitamente (tests `IDENTIDAD-V2 1-5`): checkout, canal
realtime, `release-expired`/`ensureWinner`, `checkout/mp.js`,
`api/raffles/winner.js`, el draw y el QR siguen operando exclusivamente
sobre `raffle.id` (UUID real ya resuelto) o son agnósticos al slug — nunca
sobre el parámetro crudo de la URL. Este es el mismo fix ya certificado en
RAFFLE VISUAL POLISH; esta misión no lo modifica, solo verifica que sigue
vigente.

## NO TOCAR — confirmado intacto

Cero cambios a Payment Engine, Mercado Pago, comisión/`marketplace_fee`,
webhook, reconciliación, `reserve_tickets_for_purchase`, asignación
automática de números, draw/ganador, QR, scanner, Trust (incluyendo el
aviso "Antes de continuar"), RLS, schema de Supabase, Eventos, Campañas,
Inscripciones, facturación, emails, ni `origin/main`. Sin migraciones SQL
nuevas — el diff completo de esta misión son 2 archivos:
`src/pages/api/rifas/index.js` y `src/pages/rifas/[id].jsx`.

## Tests y evidencia

`tests/humanSlugV2.test.mjs` — 31 escenarios (MODAL 1-4, TRUST 1-2,
SLUG-V2 1-10, COMPAT 1-5, IDENTIDAD-V2 1-5, SIN-CAMBIOS-V2 1-5), 31/31 en
verde. Regresión completa: 1001/1002 (único fallo: el flake histórico ya
documentado de `eventAnalyticsWorkbook.test.mjs`, sensible a carga de
máquina, sin relación con esta misión). Build de producción limpio. QA
visual manual contra `next start` real con credenciales `rifex-dev`
(worktree throwaway, ya eliminado): hero visible de inmediato, sin el modal
antiguo nunca renderizado, galería/pestañas/selector de cantidad
interactivos y funcionales (verificado clic a clic, no solo lectura de
HTML), aviso Trust "Antes de continuar" intacto, sin overflow horizontal en
375px. Se observó — y se documenta honestamente, sin ocultarlo — el mismo
artefacto cosmético ya conocido de sesiones anteriores: dos 400 en consola
al cargar `_buildManifest.js`/`_ssgManifest.js` bajo `next start` local; no
afectó la hidratación real (las pestañas y el selector de cantidad
respondieron correctamente a clics reales) y, según el precedente de RAFFLE
VISUAL POLISH, no reproduce contra un despliegue real de Vercel.

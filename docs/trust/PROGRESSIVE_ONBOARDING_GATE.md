# RIFEX PROGRESSIVE ONBOARDING — Gate de elegibilidad al crear iniciativas

**Misión**: RIFEX — MISIÓN DEV / ONBOARDING PROGRESIVO PARA CREACIÓN DE INICIATIVAS / RIFAS + CAMPAÑAS + EVENTOS
**Fecha**: 2026-09-03
**Ejecutado por**: Claude Code, misión autónoma DEV-only (sin PROD, sin `main`, sin migraciones)
**Baseline**: `origin/develop` en `4a363e7` al inicio; `origin/main` (PROD) no referenciado ni tocado en ningún momento.

---

## 1. Estado inicial encontrado

Rifex ya permitía registro/login/navegación de la comunidad sin exigir habilitación completa de creador — eso nunca fue el problema. El problema real: los 3 formularios de creación (`crear-rifa.jsx`, `crear-colecta.jsx`, `crear-evento.jsx`) ya tenían un boundary SSR de **sesión** (de la misión AUTH UX 2026 anterior — `getServerSideProps` + `getSupabaseServer`), pero ningún boundary de **elegibilidad**. Un usuario autenticado pero sin onboarding completo, sin Mercado Pago conectado, o con Trust en `mismatch`/`pending` llegaba directo al formulario completo. El único guardia era `resolveTrustOnboardingRedirect` (`trustOnboardingClient.js`), un `useEffect` client-side deliberadamente fail-open ("esto solo mejora la UX, la autoridad real es el server-side gate") que corría **después** de que el JSX completo del formulario ya había montado.

## 2. Arquitectura de onboarding/Trust ya existente (auditada, no reconstruida)

- `assertCreatorEligible(userId)` (`src/lib/trustIdentityGate.js`, TRUST-2): única autoridad real de elegibilidad. Orden de checks: onboarding completo → RUT si el país lo requiere → `mp_identity_match === 'matched'` si el país lo requiere (fail-closed: cualquier otro valor bloquea) → verificación documental TRUST-3A si `isIdentityVerificationRequiredForCreators()` es `true` (hoy hardcodeado `false`, dormant).
- `sanitizeNextPath(raw, fallback)` (`src/lib/countryPolicy.js`): única implementación de saneo de redirect interno del repo, reusada en 5+ puntos antes de esta misión.
- `/registro/continuar.jsx`: onboarding universal (nombre, teléfono, declaración de adultez, términos, RUT si aplica) + consciencia de MP; ya sabía reanudar desde donde quedó y ya enlazaba a `/panel/bancos?next=...` cuando solo faltaba MP.
- `/panel/bancos.js`: máquina de 5 estados de conexión MP (desconectado/pendiente/validado/mismatch/no disponible), sobrevive el round-trip OAuth vía `sessionStorage`, botón "Continuar" solo se habilita cuando `pendingNext && creatorEligible`.
- `/api/onboarding/trust/status.js`: expone el mismo criterio de elegibilidad para polling de UI.

Ninguna de estas piezas fue reconstruida, duplicada, ni tuvo su lógica reimplementada.

## 3. Fix implementado

**Un único archivo nuevo de orquestación**, `src/lib/creationGate.js`, exporta `resolveCreationGate(ctx, destinationPath)`:

1. Verifica sesión real vía `getSupabaseServer(req, res).auth.getUser()`. Sin sesión → `redirect` a `/login?next=<destino>`.
2. Llama `assertCreatorEligible(user.id)` — la misma autoridad que usan las APIs de creación. Si no es elegible, mapea el `reason` al paso existente que lo resuelve:

| `reason` | paso |
|---|---|
| `onboarding_incomplete`, `onboarding_check_failed`, `identity_incomplete`, `identity_check_failed` | `/registro/continuar` |
| `mp_not_connected`, `mp_identity_mismatch`, `mp_check_pending` | `/panel/bancos` |
| `identity_verification_required` | `/trust/verificar` (estructural; TRUST-3A sigue dormant) |

3. Elegible → `{ props: {} }`, mismo formulario de siempre.

`destinationPath` es **siempre un literal fijo** pasado por la propia página (`resolveCreationGate(ctx, "/crear-rifa")`), nunca `ctx.query` — sin superficie de open-redirect en este código.

Las 3 páginas de creación llaman a esta función desde su `getServerSideProps`; se eliminó el `useEffect` client-side fail-open (`resolveTrustOnboardingRedirect`) de las 3, dejando intacta la lógica de datos no relacionada (`setToken`, `loadMine` para "Mis campañas").

`/trust/verificar.jsx` recibió plomería mínima y honesta: preservación de `next` vía `sanitizeNextPath` (misma función, sin segunda implementación) y un botón "Continuar" en la rama `status === 'approved'`, para que el mapeo de arriba no quede roto si esa política se activa en el futuro. También se corrigió el `useEffect` de sesión para depender de `router.isReady` y preservar la ruta real solicitada en el redirect a `/login` (antes usaba una auto-referencia hardcodeada).

## 4. Matriz de estados (CASO A-E del prompt)

| Caso | Condición | Resultado |
|---|---|---|
| A | No autenticado | `/login?next=<destino>` |
| B | Autenticado, onboarding básico incompleto | `/registro/continuar?next=<destino>` |
| C | Onboarding OK, falta/mismatch/pending MP | `/panel/bancos?next=<destino>` |
| D | Trust no permite crear (TRUST-3A, hoy dormant) | `/trust/verificar?next=<destino>` |
| E | Elegible | Acceso inmediato al formulario solicitado |

## 5. Cobertura de entry points (sección 7 del prompt)

Next.js Pages Router ejecuta `getServerSideProps` en **cada** request a una página, incluida la navegación client-side vía `<Link>`/router — no solo en carga directa de URL. Gatear las 3 páginas destino cubre por construcción: CTAs de nav, Home, wizard, panel, y acceso directo por URL, sin tocar ningún botón individual. Verificado además que `src/pages/rifas/crear.jsx` es un alias client-side puro a `/crear-rifa`, no un segundo entry point real.

## 6. Protección autoritativa server-side (sección 5)

`api/rifas/index.js`, `api/colectas/index.js`, `api/events/index.js` siguen llamando `assertCreatorEligible` de forma independiente en el POST real de creación — confirmado por `git diff --stat origin/develop -- src/pages/api/` con salida vacía. El nuevo gate es exclusivamente UX; nunca sustituye ni debilita la protección real.

## 7. Seguridad — next / open redirect (sección 6 y 13)

- `resolveCreationGate` nunca lee `ctx.query`; el `destinationPath` que compone cada redirect es siempre el literal fijo que la página pasa.
- Cada paso downstream (`/registro/continuar`, `/panel/bancos`, `/trust/verificar`) sigue usando `sanitizeNextPath` para cualquier `next` que sí venga de query string — sin segunda implementación de saneo.
- No hay loop posible: un usuario elegible recibe `{ props: {} }` directo; un usuario en `/registro/continuar`/`/panel/bancos` es resuelto por la re-detección propia de esas páginas en cada visita, no por este gate.

## 8. Tests

- `tests/creationGate.test.mjs` (27 tests, funcionales reales — Supabase mockeado vía monkeypatch de prototype, mismo patrón que `tests/trustIdentityGate.test.mjs`): cubre los 20 escenarios adversariales exigidos por la sección 12 del prompt — anónimo por vertical, autenticado-incompleto por vertical, sin conexión de pago, cada estado real de Trust/MP (`pending`, `checking`/`unknown`, `mismatch`, `unavailable`, `matched`), acceso directo elegible, preservación de destino por vertical, `next` malicioso sin efecto, bypass por URL directa, API protegida independientemente, sin loop para ya-elegibles, retorno único tras completar onboarding.
- `tests/authUxCrawler.test.mjs` actualizado (no debilitado): se dividió el loop `PROTECTED_PAGES` en `DIRECT_BOUNDARY_PAGES` (sin cambios, mismas aserciones literales) y `GATED_CREATION_PAGES` (nuevas aserciones sobre el import y la llamada exacta a `resolveCreationGate`).

## 9. Validación

- Suite específica: `creationGate` + `authUxCrawler` + `publicAudit` + `trustIdentityGate` + `sanitizeNextPath` + `onboardingBancosUx` + `publicSurfaceFinalCleanup` → **268/268**.
- Regresión completa `node --test 'tests/*.test.mjs'` → **635/636** (mismo flake histórico de timing en `eventAnalyticsWorkbook.test.mjs`, firma idéntica ~33-34s contra presupuesto de 20s, re-verificada como el mismo caso conocido, no uno nuevo).
- `npm run build` → limpio.
- Self-audit grep sobre el diff completo (`payment|webhook|marketplace_fee|argentina|migration|service_role|mp_identity_match\s*=|RIFEX_FEE_RATE`) → cero coincidencias reales.
- Smoke test en vivo (dev server local): anónimos reciben `307` real con cuerpo mínimo (25-28 bytes) en las 3 páginas gateadas; `/trust/verificar`, `/registro/continuar`, `/panel/bancos` siguen en `200` y funcionales, incluso con `?next=` presente; sin errores de servidor.

## 10. Auto-auditoría adversarial (sección 14)

Intentos realizados contra la propia implementación, todos bloqueados:
- Saltar onboarding → bloqueado (`getServerSideProps` corre antes de cualquier JS de cliente).
- Abrir el formulario directo por URL → bloqueado, mismo mecanismo.
- Forjar `next` externo → el gate ni siquiera lee `ctx.query`; no hay input forjable en este código.
- Generar un loop → ninguno encontrado, cada estado tiene exactamente un siguiente paso determinista.
- Degradar `unknown`/`pending`/`unavailable` a `matched` → imposible, `assertCreatorEligible` no fue tocado y el gate solo lee su `ok` booleano.
- Crear vía API sin elegibilidad → bloqueado independientemente por las APIs (confirmado por diff vacío).
- Perder el destino en el round-trip OAuth de Mercado Pago → verificado intacto (lógica de `sessionStorage`/`next`-forwarding de `/panel/bancos` no tocada).
- Afectar a un creador ya elegible → verificado sin cambios, ruta elegible es `{ props: {} }` directo.

Ningún hallazgo requirió fix adicional.

## 11. Archivos modificados

Nuevos: `src/lib/creationGate.js`, `tests/creationGate.test.mjs`.
Modificados: `src/pages/crear-rifa.jsx`, `src/pages/crear-colecta.jsx`, `src/pages/crear-evento.jsx`, `src/pages/trust/verificar.jsx`, `tests/authUxCrawler.test.mjs`.

## 12. Deuda / riesgos restantes

`identity_verification_required` → `/trust/verificar` queda mapeado estructuralmente pero es inalcanzable en la práctica hoy (`isIdentityVerificationRequiredForCreators()` sigue en `false` por decisión de producto, no tocada por esta misión). Sin riesgo funcional; solo requiere reverificación si esa política se activa en el futuro.

## 13. Compatibilidad

Sin cambios a: login, registro, hCaptcha, RUT donde aplica, OAuth de Mercado Pago, Trust, `assertCreatorEligible`, Mis Iniciativas, navegación pública, Blog privado, hardening de crawler, comisión 7%, webhooks, cumplimiento. Un usuario ya habilitado no nota ningún cambio: Crear → formulario, igual que antes.

## 14. Confirmación PROD/`main`

`origin/main` no fue referenciado, leído ni modificado en ningún paso de esta misión. Sin migraciones, sin despliegue PROD, sin pagos reales, sin emails reales, sin cambio de secretos.

---

**RIFEX PROGRESSIVE ONBOARDING DEV CERTIFIED**

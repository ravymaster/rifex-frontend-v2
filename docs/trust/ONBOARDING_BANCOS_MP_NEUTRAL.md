# ONBOARDING + BANCOS/MP — Neutral Payment Onboarding & Legacy MP Revalidation (2026-08-30)

**Estado: activo en `rifex-dev`. Sin migración. Sin OAuth real ejecutado
durante QA. `assertCreatorEligible`/regla TRUST-3B matched-only sin
cambios.**

## 1. Autoauditoría previa

- Confirmado `/registro/continuar` mostraba, en su paso de cierre
  ("Un último paso"), texto y estados específicos de Mercado Pago
  (`connected`/`matched`/`mismatch`/`needs_review`/`unavailable`/
  `checking`) con dos CTAs separados ("Conectar Mercado Pago" / "Ya
  conecté, verificar").
- Confirmado `sanitizeNextPath` (`src/lib/countryPolicy.js`) es la
  ÚNICA implementación de sanitización de `next` en todo el repo,
  reusada por 5 call sites (`registro/continuar.jsx`,
  `onboarding/pais.jsx`, `trustOnboardingClient.js`,
  `countryOnboarding.js`, y ahora también `panel/bancos.js`) — un solo
  punto de endurecimiento beneficia a los 5.
- Confirmado el bug real: `merchant_gateways` puede tener
  `status='connected'` con `mp_identity_match` nulo/no resuelto (cuenta
  conectada ANTES de que existiera la columna, o antes de TRUST-3B) —
  la única forma de forzar la validación era desconectar y reconectar
  (destruye el vínculo real con Mercado Pago innecesariamente).
- Confirmado `resolveMpIdentityMatch` (`src/lib/mpIdentityMatchGate.js`,
  TRUST-3B, certificado) ya es agnóstico de CUÁNDO se obtuvo
  `usersMeResponse` — recibe la respuesta ya resuelta, nunca vuelve a
  llamar a Mercado Pago por su cuenta. Esto significa que revalidar una
  conexión existente es, estructuralmente, "volver a obtener
  `usersMeResponse` con el token ya guardado y pasárselo a la misma
  función" — sin reimplementar la regla de match en ningún lado nuevo.
- Confirmado el esquema real de `merchant_gateways` (26 columnas,
  incluye `access_token`, `mp_access_token`, `mp_refresh_token`,
  `revoked_at`, `expires_at`, `mp_identity_match`) — suficiente para
  toda la misión sin ninguna columna nueva.

## 2. Onboarding neutral

`src/pages/registro/continuar.jsx` — el bloque de cierre reemplazó todo
el detalle de Mercado Pago por:

```
Un último paso
Para crear iniciativas necesitas conectar tu medio de pago,
donde recibirás tus pagos.
[Ir a conectar tu medio de pago] -> /panel/bancos?next=<ruta preservada>
```

Se eliminaron `checkingMp`/`handleCheckMp` (ya sin uso) y la única
mención residual de Mercado Pago en el helper de RUT se reescribió a
"el titular de tu medio de pago conectado". El onboarding sigue
sabiendo SI falta un medio de pago (`mpState.required`) y si todo ya
está listo (`readyForWelcome`) — nunca el detalle de qué proveedor ni
en qué estado.

## 3. Safe `next`

`sanitizeNextPath` pasó de un chequeo de prefijo por string a resolver
con `new URL(s, ORIGEN_INTERNO)` y comparar `origin` — la técnica
recomendada por OWASP para "safe redirect". Cubre explícitamente:
`https://evil.com`, `//evil.com`, `javascript:`, `data:`, `\evil.com`,
`/\evil.com`, caracteres de control (tab/CR/LF/NUL), y deja pasar
`/%5cevil.com` como lo que realmente es (una ruta interna inofensiva,
nunca un cambio de host — certificado resolviendo la salida con
`new URL()` y comparando `origin`, no con un `grep` sobre el string).
Certificado con 13 tests dedicados (`tests/sanitizeNextPath.test.mjs`).

## 4. `/panel/bancos` — estados explícitos

| Estado | Condición real | Texto |
|---|---|---|
| A. Desconectado | `!connected` | "No tienes una cuenta de Mercado Pago conectada." |
| Reconexión requerida | `!connected` y `reason` es `revoked`/`token_expired` | "Necesitamos que vuelvas a conectar tu cuenta." |
| B. Conectado, pendiente | `connected` y `identity_match` nulo/`checking`/`not_connected`/`disconnected` | "Tu cuenta está conectada, pero necesitamos validar su titularidad." |
| C. Validado | `identity_match==='matched'` | "✓ Cuenta de Mercado Pago validada." |
| D. Inconsistencia | `mismatch`/`needs_review` | "No pudimos validar que la cuenta receptora corresponda con la identidad registrada en Rifex." |
| E. No disponible | `unavailable` | "No pudimos verificar tu cuenta en este momento. Inténtalo nuevamente." |

Nunca solo color — cada estado tiene texto explícito además del badge.
Botón "Verificar cuenta" nuevo, visible en B/D/E, con guarda de doble
click (`verifyBusy`) y mensaje de resultado tras cada intento.

Bloque "¿No tienes cuenta de Mercado Pago?" (solo visible cuando no hay
conexión) enlaza a `https://www.mercadopago.cl/hub/registration/landing`
— verificado en vivo contra el sitio real de Mercado Pago Chile (link
"Abrir cuenta gratis"), nunca inventado. Deliberadamente un elemento
`<a>` distinto del botón "Conectar" (que sigue siendo el OAuth real).

## 5. Legacy MP revalidation

`src/lib/mpRevalidate.js` (nuevo) — `revalidateMpConnection(userId)`:

1. Lee la fila `merchant_gateways` existente. Si no está genuinamente
   conectada (revocada, sin token, expirada localmente), devuelve
   `not_connected` sin intentar ninguna llamada de red.
2. Llama `GET https://api.mercadopago.com/users/me` con el
   `access_token` YA guardado — nunca un token nuevo, nunca OAuth.
3. Si Mercado Pago responde 401/403: el token está muerto (expirado o
   revocado del lado de Mercado Pago). Se marca `revoked_at` +
   `status='not_connected'` + `mp_identity_match='not_connected'` en la
   MISMA fila (nunca una segunda) — `/api/mp/status` refleja
   correctamente "necesita reconectar" en la siguiente consulta. Nunca
   se interpreta como mismatch.
4. Si responde 200 (o falla de forma transitoria/red caída): delega
   TODO el cómputo de match en `resolveMpIdentityMatch` (TRUST-3B, sin
   modificar) — mismo criterio exacto que usa el callback de OAuth.

`POST /api/mp/revalidate` (thin route) — Bearer-only, rate-limited,
identidad siempre resuelta del token (nunca un parámetro "de quién").

**Caso real certificado** (mandato sección 17): usuario con onboarding
completo + Mercado Pago conectado desde antes de Trust +
`mp_identity_match` nulo. `tests/mpRevalidate.test.mjs` (escenarios
16-19) certifica el flujo completo contra el código REAL
(`revalidateMpConnection`), con inyección del resultado de `/users/me`
(sin red real en tests) — reutiliza la MISMA fila, nunca desconecta,
nunca reconecta, nunca duplica.

## 6. Regla Trust preservada

`src/lib/trustIdentityGate.js#assertCreatorEligible` — **cero cambios**.
`matched` sigue siendo el único valor que habilita. `NULL`,
`unavailable`, `mismatch`, `needs_review`, y "solo conectado" siguen
sin habilitar. Ningún fallback permisivo, ningún RUT de Mercado Pago
persistido, ninguna inferencia por nombre.

## 7. Manejo de token revocado/expirado

Ver sección 5, paso 3. Nunca se convierte automáticamente en mismatch.
Nunca se inventa un refresh-token flow nuevo (fuera de alcance
explícito) — el único remedio ofrecido al usuario es "vuelve a
conectar", igual que si nunca hubiera conectado.

## 8. Country Gate

Chile: Mercado Pago disponible (sin cambios). Stripe: tarjeta visual
"No disponible en tu país" / "Próximamente", deshabilitada,
incondicional (no se agregó una capability nueva a `COUNTRY_POLICY`
porque Stripe no está disponible en NINGÚN país todavía — hubiera sido
infraestructura paralela innecesaria para un catálogo puramente
visual). Argentina: sin cambios, `enabled:false`, `devOnly:false`.

## 9. Stripe — solo catálogo visual

Cero API, cero OAuth, cero tablas, cero secrets, cero webhooks, cero
payment intents, cero checkout, cero cuentas conectadas. Certificado
por test que confirma la ausencia de cualquier archivo de integración
real (`src/pages/api/stripe/*`, `src/lib/stripe.js`, etc.).

## 10. Seguridad / manejo de tokens

`access_token`/`mp_access_token` nunca salen de `mpRevalidate.js`: la
ruta API nunca los lee directamente (delega TODO en el módulo lib), la
respuesta HTTP solo expone `{ok, status, reason}`, nunca se loguean.
Certificado con tests dedicados (26/27/28) que además verifican que el
RUT devuelto por Mercado Pago nunca se persiste — solo el resultado de
la comparación.

**Hallazgo de seguridad reportado, NO corregido** (fuera de alcance —
"NO modificar RLS" es una prohibición explícita de este mandato):
`merchant_gateways` tiene GRANT de tabla completo
(SELECT/INSERT/UPDATE/DELETE) para el rol `anon` a nivel de Postgres,
aunque las políticas RLS (`auth.uid() = user_id`, verificadas en
`pg_policies`) bloquean correctamente cualquier acceso real sin sesión
— confirmado en vivo contra `rifex-dev`: una consulta anónima real
devuelve `200 []`, nunca datos. No hay fuga de datos hoy (RLS es la
capa que efectivamente protege), pero el grant es más amplio de lo
necesario (el resto de las tablas de Cumplimiento, por comparación, ni
siquiera otorgan el grant base a `anon`). Documentado para que una
misión futura, con autorización explícita de tocar RLS/grants, lo
corrija.

## 11. QA DEV

Sin migración aplicada (no hizo falta ninguna). Confirmado en vivo:
esquema de `merchant_gateways` sin cambios, RLS habilitada con
políticas owner-only, cero filas `merchant_gateways` existentes en
`rifex-dev` en este momento (ninguna cuenta legacy real conectada para
revalidar en vivo). Dado que:

- el mandato prohíbe explícitamente crear fixtures ("NO crear
  fixtures") y conectar/reconectar Mercado Pago real, y
- no existe hoy ninguna conexión MP real en `rifex-dev` contra la cual
  hacer una revalidación read-only,

el "CASO REAL" de la sección 17 del mandato se certificó mediante la
suite de tests de librería (`tests/mpRevalidate.test.mjs`, escenarios
16-19), que ejercita el código REAL (`revalidateMpConnection`) contra
un almacén en memoria con forma idéntica a Postgres, inyectando la
respuesta de `/users/me` en vez de hacer la llamada de red real — el
mismo nivel de certificación ya usado en toda la suite Cumplimiento
para lógica que depende de proveedores externos.

## 12. Tests nuevos

56 tests en 3 archivos: `tests/sanitizeNextPath.test.mjs` (13, todos
los vectores de open-redirect del mandato + adversariales),
`tests/mpRevalidate.test.mjs` (27, estados A-E, legacy sin
desconectar, token revocado, idempotencia, ownership, privacidad),
`tests/onboardingBancosUx.test.mjs` (16, onboarding neutral, Stripe
visual, Country Gate, copy exacto por estado).

## 13. Regresión y build

381 tests corridos (suite completa): 380 pasan, 1 falla — el mismo
flaky de timing XLSX ya documentado en fases anteriores, no
relacionado. `npm run build` completó sin errores.

## 14. Explícitamente NO implementado / NO tocado

Comisión 7%, Payment Engine, preference creation, webhook,
reconciliación, payouts, scopes OAuth, callback de OAuth, integración
real de Stripe, Argentina, Events, Cumplimiento, regla Trust
matched-only, MP Quality 100, Home.

## 15. Pendiente para fases futuras

- Revisar el GRANT amplio a `anon` en `merchant_gateways` (sección 10)
  — requiere autorización explícita para tocar RLS/grants.
- Certificar el flujo de revalidación legacy contra una cuenta MP real
  en DEV cuando exista una conexión legítima disponible para pruebas
  read-only.

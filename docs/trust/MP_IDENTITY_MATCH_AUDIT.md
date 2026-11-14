# Auditoría de Mercado Pago — coincidencia de identidad (Fase 4)

> Parte de la misión de corrección canónica "onboarding MP como control principal" (2026-08-27). Documenta lo que
> se pudo y no se pudo confirmar sobre qué entrega realmente la API de Mercado Pago, antes de implementar la
> coincidencia RUT Rifex ↔ titular Mercado Pago (Fase 5).

## Método

1. Lectura completa del código real ya existente: `src/pages/api/mp/oauth/start.js`, `callback.js`, `status.js`,
   `disconnect.js`, y la tabla `merchant_gateways` (`db/restore/001_schema_supabase_clean.sql` + esquema real vía
   consulta directa a `rifex-dev`).
2. Intentos de acceso a la documentación oficial de Mercado Pago (`mercadopago.cl/developers`,
   `mercadopago.com.ar/developers`, `mercadopago.com.uy/developers`) vía fetch automatizado.
3. Búsquedas web dirigidas a encontrar un ejemplo real de la respuesta de `GET /users/me`.
4. Verificación de si este entorno (`rifex-dev-notebook`, DEV) tiene credenciales reales de una app de Mercado
   Pago configuradas para probar contra el sandbox.

## Resultado 1 — Código real ya existente

- `oauth/callback.js` ya llama a `GET https://api.mercadopago.com/users/me` con el `access_token` recién obtenido,
  pero **solo extraía `email` y `public_key`** — nunca leyó ni intentó leer un campo de identificación/RUT antes de
  esta misión.
- El intercambio OAuth (`POST /oauth/token`) confirmado: devuelve `access_token`, `refresh_token`, `user_id`,
  `scope`, `live_mode`, `expires_in` — sin ningún campo de identificación (esperado, ese endpoint nunca lo trae).
- `start.js` no solicita ningún scope adicional (`scope: "offline_access"` aparece comentado, nunca activo) — el
  flujo usa los scopes por defecto de una app de Mercado Pago.
- `merchant_gateways` ya tenía RLS habilitado con políticas `auth.uid() = user_id` (aunque con grants de tabla
  amplios a `anon`/`authenticated` — hallazgo aparte, no explotable porque toda policy exige `auth.uid() =
  user_id`, documentado acá por transparencia pero fuera del alcance de esta misión, no se tocó).

## Resultado 2 — Documentación oficial de Mercado Pago

**Bloqueada en todos los intentos.** Cada URL de `*.mercadopago.*/developers/*` devolvió `403 Forbidden` al fetch
automatizado (protección anti-bot del lado de Mercado Pago, no un problema de red local). Se intentaron múltiples
dominios de país (`.cl`, `.ar`, `.uy`) y variantes `.md` de las URLs, sin éxito.

## Resultado 3 — Búsquedas web

Se confirmó, vía resultados de búsqueda de terceros (no de Mercado Pago directamente), que la API de
Customers/Checkout de Mercado Pago SÍ usa un objeto `identification: { type: "RUT", number: "..." }` en otros
contextos (crear un customer, un payer). **No se encontró ningún ejemplo real, oficial o de terceros, de la
respuesta completa de `GET /users/me` para una cuenta de Mercado Pago Chile** — ni confirmando ni descartando que
incluya un campo de identificación equivalente para el titular de la cuenta conectada vía OAuth.

## Resultado 4 — Credenciales reales en este entorno

`rifex-dev-notebook` **no tiene** `MP_CLIENT_ID`/`MP_CLIENT_SECRET`/`MP_ACCESS_TOKEN` configurados en
`.env.local` en el momento de esta auditoría, y `merchant_gateways` no tenía ninguna cuenta ya conectada en
`rifex-dev` para inspeccionar una respuesta real archivada. No fue posible, por lo tanto, hacer una prueba viva
contra el sandbox real de Mercado Pago durante esta sesión.

## Respuestas a las 7 preguntas de la Fase 4

1. **¿MP entrega `user_id` estable?** Sí — confirmado, ya en uso desde antes de esta misión (`tok.user_id`).
2. **¿Entrega identificación chilena?** No confirmado. No se pudo verificar ni en documentación ni en vivo.
3. **¿Entrega RUT completo?** No confirmado, mismo motivo.
4. **¿El dato corresponde al titular receptor?** No aplica hasta confirmar 2/3 — si el campo existe, corresponde
   al titular de la cuenta autenticada vía OAuth (`/users/me` siempre describe al dueño del `access_token` usado).
5. **¿La app tiene autorización para usarlo?** No confirmado — depende de si el campo viene incluido en los scopes
   por defecto (no se solicitó ningún scope adicional).
6. **¿Diferencias entre cuenta personal y empresa?** No confirmado.
7. **¿Qué dato mínimo debe conservar Rifex?** Decidido independientemente del resultado de MP: **nunca** el RUT de
   Mercado Pago en sí — solo el resultado de la comparación (`matched`/`mismatch`/`unavailable`/etc.), la fecha, y
   la versión de la regla usada. Ver `src/lib/mpIdentityMatchGate.js`.

## Decisión de implementación (dado lo anterior)

Dado que ninguna fuente confiable confirmó el campo, el código (`src/lib/mpIdentityMatchGate.js`,
`extractMpRutFromUsersMe`) se escribió de forma **defensiva**: intenta leer `identification.number` /
`identification.id` de la respuesta real de `/users/me` en cada conexión real; si el campo no existe o no es un
RUT válido, el resultado es `unavailable` — nunca se inventa una coincidencia, y nunca se bloquea al creador por
la ausencia del dato (mandato explícito de la misión). El comportamiento real solo se conocerá quien tenga acceso
a credenciales reales de una app de Mercado Pago y conecte una cuenta de prueba — pendiente para quien continúe
esta fase con acceso a esas credenciales.

## Pendiente explícito

- Confirmar empíricamente, con credenciales reales de una app de Mercado Pago Chile, si `/users/me` entrega
  `identification` para el titular conectado.
- Si no lo entrega nunca, evaluar si existe otro endpoint de Mercado Pago (p. ej. `/v1/account/settings`,
  reportes de liquidación) que sí lo haga, dentro de los scopes que la app ya tiene autorizados.
- Revisar con Mercado Pago (soporte de desarrolladores) si existe una vía oficial para solicitar ese dato para
  fines de prevención de fraude — puede requerir una solicitud de scope adicional o una aprobación especial.

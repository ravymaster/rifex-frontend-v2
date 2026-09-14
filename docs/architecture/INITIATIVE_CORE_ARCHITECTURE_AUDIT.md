# Initiative Core — Auditoría de Arquitectura (Fase 0)

**Fecha:** 2026-08-16
**Alcance:** Solo lectura. Sin cambios de código, sin cambios de base de datos, sin push.
**Encargado por:** prompt de Doris (asistente OpenAI del usuario) para Claude Code.
**Objetivo:** determinar qué partes de Rifex son reutilizables para dos productos nuevos (Colecta, Evento) sin tocar el flujo financiero certificado de Rifa.

---

## 1. Estado Git verificado

```
HEAD:                18138ae3f04319e43caa22dd881240cd65cb0dd0
v1.0-rifex-baseline:  18138ae3f04319e43caa22dd881240cd65cb0dd0 (mismo commit)
git diff v1.0-rifex-baseline..HEAD:  vacío (cero diferencias de contenido)
```

**HEAD coincide exactamente con la baseline certificada.** No hay commits de más ni de menos.

Working tree **no está 100% limpio**, pero lo no-limpio es pre-existente y no es código de Rifex:
- `package-lock.json` / `package.json` — modificados desde antes de que empezara cualquier trabajo de esta sesión (confirmado: ya aparecían así en el estado inicial de la conversación, antes de tocar nada).
- `.claude/` — configuración de la herramienta de sesión, no código de la app.

Ningún archivo de `src/`, `db/` o `docs/` tiene cambios sin commitear. Se puede proceder.

---

## 2. Arquitectura financiera actual

Flujo real, verificado en código:

```
Creador conecta MP (OAuth)
  → src/pages/api/mp/oauth/start.js (requiere sesión real, uid del token)
  → Mercado Pago redirige a src/pages/api/mp/oauth/callback.js
  → intercambia code por access_token/refresh_token (PKCE)
  → guarda en merchant_gateways (user_id, provider='mp', access_token, mp_refresh_token, expires_at)

Comprador paga
  → src/pages/api/checkout/mp.js
  → arma preference con marketplace_fee = floor(total * 0.07), capado al total
  → usa el access_token DEL CREADOR (no el de la plataforma) para crear la preference
  → checkout redirige a Mercado Pago

Mercado Pago confirma
  → src/pages/api/checkout/webhook.js (o src/pages/api/admin/reconcile-payments.js como respaldo)
  → NUNCA confía en el body del webhook — siempre vuelve a pedir el pago real a la API de MP
    con el token de plataforma o el del vendedor
  → valida firma x-signature (HMAC contra MP_WEBHOOK_SECRET; rechaza 401 si viene y no calza)
  → marca tickets.status='sold', purchases.status='approved', upsert en payments
    (con amount_cents y marketplace_fee_cents reales, tomados de fee_details de MP)
  → si la rifa queda agotada: dispara src/lib/drawWinner.js (sorteo automático)
  → manda correos (comprador, creador, y si hubo sorteo, ganador + creador) vía src/lib/mailer.js
```

**Dato clave:** el 7% (`marketplace_fee`) se calcula en `src/pages/api/checkout/mp.js` (constante `RIFEX_FEE_RATE = 0.07`), se envía a nivel raíz del objeto `preference` de Checkout Pro, y Mercado Pago lo descuenta automáticamente del lado de ellos — Rifex nunca retiene ni transfiere plata manualmente. El monto real cobrado se re-lee después desde `fee_details` en la respuesta de la API de MP (no se confía en lo que se calculó al crear la preference), y se guarda en `payments.marketplace_fee_cents` para auditoría.

**Conexión MP del creador** (`merchant_gateways`): tabla genérica por diseño — `user_id` + `provider` (hoy solo `'mp'`), con RLS `auth.uid() = user_id` en todas las políticas. **No tiene ninguna referencia a rifas.** Es, de hecho, la pieza más reutilizable de toda la arquitectura financiera: cualquier producto nuevo puede leer el token conectado del creador exactamente de la misma forma, sin tocar esta tabla ni su lógica de OAuth.

**Nota de seguridad pre-existente (no introducida esta sesión, no se toca ahora):** `merchant_gateways.access_token` / `mp_access_token` / `mp_refresh_token` se guardan en texto plano, protegidos solo por RLS + que las lecturas server-side usan la service-role key. No es parte de esta auditoría corregirlo, pero cualquier producto nuevo que lea esta tabla hereda esa misma superficie de riesgo — no la amplía, pero tampoco la reduce.

---

## 3. Componentes reutilizables (sin modificar)

| Componente | Por qué es reutilizable |
|---|---|
| `merchant_gateways` + flujo OAuth de MP | Ya es genérico: `user_id` + `provider`, cero referencia a rifas |
| Auth (Supabase, Bearer token, `supabase.auth.getUser(token)`) | Patrón usado igual en cada endpoint de esta sesión, cero acoplamiento a rifas |
| `users_profile`, `/perfil`, `/perfil/[id]` | Perfil del creador es genérico; ya muestra "iniciativas" del creador de forma agnóstica al render de cada tarjeta |
| `src/lib/mailer.js` — `sendEmail()`, `escapeHtml()`, `fmtCLP()` | El motor de envío y los helpers son 100% genéricos. Las plantillas (`sendBuyerApprovedEmail`, etc.) son específicas de rifa, pero se **agregan** plantillas nuevas al lado, no se tocan las existentes |
| `webhook_events` (tabla de auditoría) | Esquema genérico (`payment_id`, `payload`, `headers`, `event_id`) — no referencia `raffle_id` en absoluto |
| Patrón de verificación de firma de webhook (HMAC + manifest de MP) | Es lógica de MP, no de rifas — copiable tal cual para un webhook de Colecta/Evento |
| `Layout.jsx`, `Header.jsx`, `Grid.js`, `IconCard.jsx`, `IconsGrid.jsx`, componentes de `ui/`, `auth/` | Sin props ni lógica específica de rifa observada |
| Mecanismo del selector de "tema/categoría" en `crear-rifa.jsx` (grid de iconos + estado) | El *mecanismo* es genérico — solo el contenido del array `THEMES` es temático de rifa. Reutilizable copiando el patrón, no el archivo |
| Patrón de chat con invitado-por-nombre (tabla + componente + Realtime) | El *patrón* (auth opcional, invitado marcado, Realtime) es reutilizable — el componente concreto (`RaffleChat.jsx`) está atado a `raffleId`, ver sección 4 |
| Patrón de blog con posts/comentarios/reacciones | El motor (`blog_posts`, likes, comentarios) es reciente y **no tiene filas en producción que dependan de su forma exacta** — es el candidato más barato para generalizar de verdad (ver sección 7) |

---

## 4. Componentes exclusivos de Rifa (NO tocar, NO extender)

| Componente | Por qué es exclusivo |
|---|---|
| `src/lib/drawWinner.js` + `src/pages/api/raffles/winner.js` | Sortea un número entre `tickets` vendidos. Colecta no tiene "ganador"; Evento tampoco (es asistencia, no sorteo) |
| Tabla `raffle_results` | Existe solo para guardar el resultado del sorteo |
| `raffles.total_numbers`, `.price_cents`, `.prize_type`, `.prize_amount_cents`, `.payout_method`, `.delivery_method`, `.prize_photos` | Conceptos de "premio a sortear", sin equivalente directo en Colecta/Evento |
| `purchases.numbers` / `payments.numbers` (integer[], NOT NULL) | Array de números de rifa — no existe en una contribución libre (Colecta) ni mapea limpio a "cantidad de entradas" (Evento) sin reinterpretarlo |
| `purchases.raffle_id` / `payments.raffle_id` | Literalmente nombrada así, no genérica (`entity_id`) — ver riesgo en sección 6 |
| `src/pages/api/checkout/mp.js`, `webhook.js`, `confirm.js`, `admin/reconcile-payments.js` | Todo el pipeline de pago de rifa, certificado, congelado |
| `src/pages/api/rifas/**`, `src/pages/crear-rifa.jsx`, `src/pages/rifas/[id].jsx` | CRUD y vista de rifa |
| `src/pages/panel/index.js`, `api/panel/raffles.js`, `api/panel/earnings.js` | Dashboard hoy consulta `raffles`/`payments` por `raffle_id` de forma literal y hardcodeada, sin capa de abstracción |
| `RaffleChat.jsx` (prop `raffleId` literal), `ProfileView.jsx`'s `RaffleCard` interno (lee `total_numbers`/`sold`/`price_cents`), `BuyerForm.jsx` (`selected` = array de números), `RifaCard.jsx`, `RaffleIntroModal.jsx` | Todos tipados/nombrados alrededor de "rifa" — reusables como **patrón a copiar**, no como código a extender con `if (tipo === 'evento')` |
| `blog_posts.raffle_id` + `src/pages/api/blog/historia.js` | La lógica de "historia de éxito" está hardcodeada contra `raffles`/`payments`, incluyendo el requisito `status==='closed'` y la suma de `numbers.length` — no portable tal cual |

**Hallazgo importante no anticipado en el prompt:** el concepto de "rifa" hoy **no vive en una sola tabla**. Existe `raffles` (inglés, esquema nuevo) y en paralelo `rifas` (español, esquema legacy: `titulo`, `precio_clp`, `cupos`, `temas`, `estado`) con una vista de compatibilidad `raffles_compat` que traduce una a la otra. `tickets` tiene el mismo par (`rifa_tickets`/`tickets_compat`). Esto no es un problema nuevo ni algo a resolver ahora, pero es contexto que cualquier estrategia de "tabla genérica de iniciativas" futura va a tener que asumir: no hay un único esquema de rifa limpio del cual partir todavía.

---

## 5. Protected Baseline

Archivos/tablas que **no deben modificarse** al construir Colecta o Evento:

**Backend:**
- `src/pages/api/checkout/mp.js`
- `src/pages/api/checkout/webhook.js`
- `src/pages/api/checkout/confirm.js`
- `src/pages/api/admin/reconcile-payments.js`
- `src/pages/api/mp/oauth/start.js`, `src/pages/api/mp/oauth/callback.js`
- `src/pages/api/mp/status.js`, `src/pages/api/mp/disconnect.js`
- `src/pages/api/rifas/**` (incluye `[id]/index.js`, `delete.js`, `index.js`)
- `src/pages/api/raffles/winner.js`
- `src/lib/drawWinner.js`
- `src/pages/api/panel/raffles.js`, `src/pages/api/panel/earnings.js`

**Frontend:**
- `src/pages/crear-rifa.jsx`
- `src/pages/rifas/[id].jsx`, `src/pages/rifas/index.js`
- `src/pages/panel/index.js`, `src/pages/panel/bancos.js`
- `src/components/rifex/RaffleChat.jsx`, `RaffleIntroModal.jsx`, `BuyerForm.jsx`
- `src/components/RifaCard.jsx`

**Base de datos (tablas, no tocar esquema ni políticas RLS):**
- `raffles`, `rifas` (legacy), `raffles_compat` (vista)
- `tickets`, `rifa_tickets` (legacy), `tickets_compat` (vista)
- `purchases`, `payments`, `raffle_results`
- `merchant_gateways` (se **lee**, nunca se modifica su esquema)

**Librerías compartidas — se pueden usar/importar, pero no editar sus funciones existentes (solo agregar funciones nuevas al lado):**
- `src/lib/mailer.js` (agregar plantillas nuevas, no tocar `sendBuyerApprovedEmail`/`sendCreatorSaleEmail`/`sendWinnerEmail`/`sendCreatorWinnerEmail`)
- `src/lib/supabaseAdmin.js`, `src/lib/supabaseClient.js`

---

## 6. Riesgos

1. **`raffle_id` está grabado a fuego en `purchases` y `payments`.** Cualquier tentación de "reutilizar la tabla `payments` para Colecta/Evento" implicaría tocar una tabla certificada — está explícitamente prohibido por el principio no negociable. La estrategia correcta es tablas hermanas nuevas, no columnas genéricas agregadas a `payments`.
2. **Esquema de rifa duplicado (`raffles` vs `rifas` legacy).** No bloquea Colecta/Evento (que no necesitan tocar ninguna de las dos), pero sí significa que no existe hoy un "molde limpio" de tabla de iniciativa del cual clonar mecánicamente — cada tabla nueva se diseña desde cero, no por copia.
3. **Ningún componente usa `entityId`/`entityType` genérico.** Confirmado por grep (cero resultados para `initiative`, `product_type`, `entity_type`, `polymorphic` en todo el repo). Construir Colecta/Evento como tablas/endpoints/componentes hermanos — no como una rama condicional dentro del código de rifa — es la única forma de cumplir "no convertir el código en una cadena de condicionales por tipo" sin violar "no modificar el flujo estable de Rifa".
4. **Dashboard (`panel/index.js`) no tiene capa de abstracción.** Sumar Colecta/Evento al panel del creador implica o (a) pestañas/rutas nuevas por tipo (`/panel/colectas`, `/panel/eventos`) reusando el *patrón* visual pero no el código, o (b) eventualmente una vista unificada — pero eso es una decisión de producto para más adelante, no de esta fase.
5. **Admin sigue sin rol real** (ver sección 9) — no bloquea Fase 0, pero cada producto nuevo que necesite curaduría/moderación va a tensar más el mecanismo actual (email fijo / token compartido).
6. **Tokens de MP en texto plano en `merchant_gateways`** — riesgo heredado, no introducido por esta fase, pero cualquier código nuevo que lea esa tabla debe seguir el mismo patrón server-only ya establecido (nunca exponerlo al cliente).
7. **`notification_url` con fallback a variable de entorno compartida.** Verificado en código (`src/pages/api/checkout/mp.js:154-155`): `notification_url` se arma como `process.env.MP_WEBHOOK_URL || `${base}/api/checkout/webhook``. Hoy `MP_WEBHOOK_URL` **no está seteada** (verificado en `.env.local`), así que cada preference apunta dinámicamente a `/api/checkout/webhook`. Pero si algún día se configura esa variable (por ejemplo, para fijar una URL de producción estable) y un futuro `checkout/colecta.js`/`checkout/evento.js` copia este mismo fallback tal cual, **todos los pagos de todos los productos terminarían notificando al webhook de rifa**, que no sabe interpretar un `colecta_id`. Este es del tipo de dependencia oculta que el prompt pidió buscar explícitamente. **Mitigación para cuando se implemente:** el checkout de cada producto nuevo debe usar su propia variable (`MP_WEBHOOK_URL_COLECTA`, etc.) o construir la URL dinámica sin depender de ningún override compartido con rifa.

---

## 7. Estrategia propuesta para Colecta

**No implementar todavía — esto es la propuesta a evaluar.**

Tablas nuevas, hermanas de las de rifa, sin tocarlas:
- `colectas` (id, title, description, cover_image, creator_id, creator_email, suggested_amounts int[], status, created_at, end_date)
- `colecta_contributions` (id, colecta_id, buyer_email, buyer_name, amount_cents, mp_payment_id, status, created_at) — equivalente de `payments`/`purchases` pero sin `numbers`, sin concepto de "agotado"

Backend nuevo, sin tocar el existente:
- `src/pages/api/checkout/colecta.js` — arma la preference de MP con `marketplace_fee = floor(monto * 0.07)`, usando el token del creador vía `merchant_gateways` (mismo patrón que `checkout/mp.js`, archivo separado)
- `src/pages/api/checkout/webhook-colecta.js` (o un router que despache por `metadata.kind`) — misma lógica de re-verificación contra la API de MP + firma, pero escribiendo en `colecta_contributions`, no en `payments`
- `src/lib/mailer.js` — agregar `sendContributionEmail`/`sendCreatorContributionEmail` (nuevas funciones, no tocar las existentes)

Frontend nuevo:
- `/colectas`, `/colectas/[id]`, `/crear-colecta` — copiando el *patrón* de `crear-rifa.jsx` (selector de categoría, no de tema-de-rifa) y `rifas/[id].jsx` (pero con botones de monto sugerido en vez de grilla de números)
- Reusar `ProfileView.jsx` mostrando también colectas del creador (requiere una variante de tarjeta, no tocar `RaffleCard` interno)

Es el candidato de **menor riesgo**: no hay concepto de "número", "sorteo" ni "ganador" — el monto es directo, sin inventario que gestionar.

---

## 8. Estrategia propuesta para Evento

**No implementar todavía — esto es la propuesta a evaluar.**

Tablas nuevas:
- `eventos` (id, title, description, venue, event_date, creator_id, ticket_types jsonb o tabla `evento_ticket_types`, status)
- `evento_tickets` (id, evento_id, ticket_type_id, buyer_email, buyer_name, qr_code text unique, status ['pagado','usado'], checked_in_at, mp_payment_id)

Backend nuevo:
- `src/pages/api/checkout/evento.js` — mismo patrón de `marketplace_fee` 7%
- `src/pages/api/checkout/webhook-evento.js` — al aprobar, genera `qr_code` único (ej. UUID + firma HMAC propia, no relacionada a la firma de MP) y lo manda por correo
- `src/pages/api/eventos/[id]/checkin.js` — nuevo, valida el QR contra `evento_tickets`, marca `status='usado'` (requiere sesión del creador o de alguien que él autorice)

Frontend nuevo:
- `/eventos`, `/eventos/[id]` (página pública con tipos de entrada), `/crear-evento`
- Vista de check-in (`/panel/eventos/[id]/checkin`) — probablemente cámara + lector de QR, componente nuevo

Complejidad mayor que Colecta (generación y validación de QR, estados de ticket, flujo de check-in en puerta), pero la estrategia de reutilización (MP conectado, mailer, auth, patrón de tablas hermanas) es idéntica.

---

## 9. Requisitos futuros del Admin

Hoy el "admin" son dos mecanismos ad-hoc, no un rol real:
- `ADMIN_API_TOKEN` (header compartido) para `reconcile-payments.js`
- `ADMIN_EMAILS` (lista de emails en variable de entorno) para publicar en el blog

Con 3 productos en la plataforma, esto se va a volver insuficiente para cosas como: destacar una Colecta/Evento en portada, moderar contenido reportado, o dar de baja una iniciativa fraudulenta sin pasar por SQL manual. **Recomendación (no urgente, no bloqueante para Fase 0):** cuando se vuelva necesario, agregar una columna real de rol (`users_profile.role` o tabla `admin_users`) en vez de seguir sumando variables de entorno — pero esto es una decisión aparte, fuera del alcance de esta auditoría.

## 10. Preparación futura para IA

Confirmado el principio: el futuro "Warp AI Engine" **nunca debe operar Mercado Pago directamente**. Para que eso sea estructuralmente cierto (no solo una promesa), la IA debería actuar siempre **a través de los mismos endpoints que ya usa un usuario logueado** (Bearer token del usuario, no service-role, no credenciales de MP propias) — es decir, la IA "usa la app como un usuario", nunca como un proceso con llaves maestras. Si la estrategia de las secciones 7 y 8 se sigue tal cual (endpoints nuevos, bien acotados, auth por sesión igual que el resto del sitio), la preparación para IA es un efecto colateral gratis de mantener buena higiene de API — no hace falta una capa aparte "para la IA".

## 11. Recomendación GO / NO-GO para comenzar Colecta V1

**GO**, con dos condiciones:
1. Se respeta la estrategia de tablas/endpoints hermanos (sección 7) — cero cambios a `payments`, `purchases`, `checkout/mp.js`, `checkout/webhook.js`.
2. Antes de escribir el primer endpoint real, se define un solo detalle de producto que hoy no está resuelto: **¿qué pasa si nadie sabe/decide un "objetivo" de la colecta — es aporte libre sin meta, o siempre hay un monto objetivo con progreso?** El prompt original dice "aporte libre o sugerido" sin meta, lo cual simplifica mucho (no hay estado "meta cumplida/no cumplida" que decidir) — si eso es definitivo, Colecta V1 es directo. Si en algún momento se quiere agregar meta+progreso, es una V2, no bloquea arrancar V1 como está planteado.

Evento se recomienda como **V2, después de Colecta** — mismo patrón de reutilización, pero con más superficie nueva (tipos de entrada, generación y validación de QR, flujo de check-in), mejor construirlo con la estrategia ya probada en un producto más simple primero.

---

## Nota de autoauditoría

Verificaciones hechas para intentar romper esta propuesta antes de entregarla (todas contra código real, no memoria de sesiones anteriores):
- Confirmé que `notification_url` se puede fijar por cada preference de MP (`checkout/mp.js:189`), no es una configuración global fija en el dashboard de MP — esto es lo que hace viable tener webhooks separados por producto. Encontré en el camino el riesgo del fallback compartido `MP_WEBHOOK_URL` (sección 6, punto 7).
- Confirmé que no existe `middleware.js`/`_middleware.js` global que pudiera asumir patrones de ruta y romper endpoints nuevos.
- Confirmé, grepeando cada archivo que consulta `merchant_gateways`, que ninguna de esas queries filtra por `raffle_id` — es genuinamente independiente de rifa.
- Todo lo marcado como "confirmado"/"verificado" en este documento viene de lectura directa de archivos citados con ruta y línea. Donde no pude verificar contra un archivo de esquema versionado (las tablas `blog_posts`/`blog_comments`/`blog_reactions`, creadas directo en Supabase esta sesión sin migración en `db/`), lo marqué explícitamente como inferencia a partir del uso en las queries, no como hecho confirmado en DDL.
- No encontré ninguna dependencia oculta que obligue a modificar `payments`, `purchases`, `checkout/mp.js` o `checkout/webhook.js` para que Colecta o Evento funcionen — la estrategia de tablas/endpoints hermanos se sostiene.

# Auditoría adversarial autónoma — TRUST-1 + TRUST-2 + TRUST-3A + Onboarding Mercado Pago

> Misión de auditoría pura (2026-08-29), sin correcciones aplicadas. Objetivo: intentar romper y verificar lo ya
> implementado, no ampliar el alcance. Rodrigo descansando — sin pruebas humanas pedidas, sin consultas
> intermedias. Todo lo de abajo se obtuvo leyendo el código real, corriendo pruebas locales aisladas (nunca contra
> datos reales de `rifex-dev`), y consultando `rifex-dev`/Vercel DEV exclusivamente en modo lectura.

## 1. Veredicto ejecutivo

**`GO CON CONDICIONES`.**

El sistema es, en conjunto, sólido: RLS default-deny total en las tablas nuevas, `service_role` nunca en el
cliente, ningún estado se puede falsificar directamente desde el navegador, el Storage privado de TRUST-3A resiste
acceso directo, y la separación declarado/verificado se mantiene consistente en todo el código y en las páginas
públicas. Pero esta auditoría encontró **un fail-open real y demostrado** (sección 2) en el gate que protege los
12 endpoints sensibles — no teórico, reproducido con una prueba aislada que ahora vive permanentemente en la suite
de pruebas. Antes de cualquier prueba humana con datos reales, ese hallazgo crítico debería resolverse (fuera de
esta misión, que es de auditoría, no de corrección).

## 2. Riesgos críticos

### 2.1 — `mp_identity_match = NULL` con `status = 'connected'` deja pasar como si fuera `matched` (fail-open real)

**Archivo**: `src/lib/trustIdentityGate.js`, función `assertCreatorEligible`, líneas 120-135.

**Causa raíz**: la función usa una **lista de bloqueo** — rechaza explícitamente `'mismatch'`, `'needs_review'`,
`'checking'`, `'not_connected'` — nunca una lista de permiso que exija exactamente `'matched'` (o `'matched'`/
`'unavailable'`). Cualquier valor que no esté en la lista de bloqueo cae al final de la función y retorna
`{ok: true}`. Esto incluye `NULL`.

**Por qué es alcanzable en la práctica, no solo teórico**: `src/pages/api/mp/oauth/callback.js` hace el `upsert`
de `merchant_gateways` con `status: "connected"` **antes** de llamar a `resolveMpIdentityMatch(...)` por separado
(líneas ~150-160), y esa segunda llamada está envuelta en un `try/catch` que explícitamente "nunca bloquea el
flujo si falla" (comentario del propio código). Si esa llamada falla por cualquier motivo transitorio (un error de
red hacia Supabase, un timeout, un bug futuro), `mp_identity_match` queda en `NULL` **para siempre**, sin
reintento ni alerta — y la cuenta queda con `status='connected'` + `mp_identity_match=NULL`.

**Confirmado con una prueba aislada** (nunca contra `rifex-dev` real), agregada permanentemente a
`tests/trustIdentityGate.test.mjs`:

```
assertCreatorEligible con mp_identity_match=NULL, status='connected' -> { ok: true }
getIdentityStatus.creator_eligible con el MISMO estado                -> false
```

**Impacto real**: un usuario cuya conexión a Mercado Pago nunca terminó de resolverse puede crear/editar/publicar
Rifas, Colectas y Eventos, agregar staff, crear tipos de entrada — exactamente lo mismo que si Mercado Pago
hubiera confirmado la coincidencia de titular, sin que eso haya ocurrido nunca. La UI (`getIdentityStatus`, que
alimenta `/registro/continuar` y el estado "¿está listo para publicar?") sí lo marca como no elegible — pero eso
es solo UX; quien llame la API directo (o tenga un formulario ya abierto en el momento exacto en que esto ocurre)
pasa igual.

**Severidad**: crítica. Rompe el invariante explícito de esta misión ("ningún estado fail-open").

**Corrección mínima propuesta (NO implementada en esta misión)**: invertir la lógica a lista de permiso —
`assertCreatorEligible` solo debería dejar pasar cuando `mp.mp_identity_match === 'matched'` o (si se mantiene la
política actual) `=== 'unavailable'` explícitamente; cualquier otro valor, incluido `NULL`/desconocido, debería
bloquear con un motivo claro (p. ej. `mp_check_pending`). Alinear `getIdentityStatus` y `assertCreatorEligible`
para que compartan literalmente la misma función de decisión en vez de reimplementar la lógica dos veces (la causa
raíz de fondo de esta inconsistencia).

## 3. Riesgos altos

### 3.1 — Contradicción aparente del informe anterior, resuelta: es de redacción, pero revela una tensión de diseño real

El informe de cierre de la misión de corrección (`docs/WOP.md`, línea ~339 en el commit `6e42468`) dice: *"`assertCreatorEligible`
... now also requires, for Chile, a connected + `matched`/`unavailable` Mercado Pago account"* — la barra `/` se
puede leer como "exige matched Y también unavailable" en vez de "exige matched O unavailable", lo que parece
contradecir la frase, en el mismo documento, de que "`unavailable` never blocks". **Verificado por código: no hay
contradicción funcional** — ambas frases describen el mismo comportamiento real (`unavailable` nunca bloquea,
tanto en `assertCreatorEligible` como en `getIdentityStatus`), solo la redacción de una oración era ambigua.

Pero esto expone una **tensión de diseño real** contra la política que ESTA misión pide explícitamente: *"`unavailable`
no puede declararse validado; `unavailable` debe dirigir a revisión/alternativa, no aprobar silenciosamente; ningún
estado fail-open."* El código actual **no hace eso** — trata `unavailable` exactamente igual que `matched` para
efectos de aprobar la creación, sin dirigir a ninguna revisión ni marcar la cuenta de ninguna forma distinguible
del caso realmente confirmado. Esto fue una decisión deliberada de la misión anterior (que pedía explícitamente
"no bloquear todo el trabajo restante" cuando Mercado Pago no entrega el dato), pero **choca con la política
deseada de esta auditoría**. No es un bug — es una decisión de producto que Rodrigo debería confirmar o revertir
conscientemente, no algo que deba "corregirse" silenciosamente.

**Severidad**: alta (afecta a una fracción potencialmente grande de conexiones reales, dado que ni siquiera se
confirmó si Mercado Pago entrega el RUT para Chile — ver sección 9).

### 3.2 — El callback de Mercado Pago registra en logs el `code_verifier` (secreto PKCE) y el email del creador

**Archivo**: `src/pages/api/mp/oauth/callback.js`, línea 42:

```js
console.warn("[mp/oauth/callback] missing uid in state. state:", st);
```

`st` es la fila completa leída de `mp_oauth_state` (`id, code_verifier, creator_email, uid, country`) — esto
imprime el `code_verifier` (el secreto PKCE que, junto con el `code` de autorización, permitiría completar un
intercambio de token) y el email del creador directo a los logs del servidor. Se dispara en un caso de borde real
(un `state` sin `uid` asociado), no en el camino feliz, pero sigue siendo una fila completa con un secreto
impresa en logs que probablemente tengan retención y acceso más amplios que la base de datos misma.

**Severidad**: alta (exposición de secreto + PII en un sistema de logging con controles de acceso probablemente
más débiles que la base de datos).

**Corrección mínima propuesta**: `console.warn("[mp/oauth/callback] missing uid in state. state id:", st?.id);` —
nunca el objeto completo.

### 3.3 — Un `mismatch` detectado después de publicar no interrumpe el checkout de esa iniciativa

**Archivo**: `src/pages/api/checkout/mp.js`, líneas ~152-186.

La resolución del token del vendedor para procesar un pago solo verifica que exista un `access_token` (para poder
cobrar) — nunca consulta `mp_identity_match`. Si una iniciativa se publicó cuando el estado era `matched` o
`unavailable`, y **después** cambia a `mismatch` (por ejemplo, el creador cambia su RUT declarado, lo que invalida
el match — ver `upsertIdentityRut`), el checkout de compradores reales **sigue funcionando exactamente igual**: el
dinero sigue llegando a esa cuenta de Mercado Pago sin interrupción. `assertCreatorEligible` solo protege la
*creación* de nuevas iniciativas, nunca revisa las ya publicadas.

**Severidad**: alta si se considera el objetivo de negocio completo (detectar y frenar fraude en curso), moderada
si se acepta como alcance explícito ("Mercado Pago cierra el onboarding", nunca se pidió pausar iniciativas ya
publicadas).

**Corrección mínima propuesta**: fuera del alcance de la corrección de onboarding tal como está descrita — pero
si Rodrigo quiere que un `mismatch` posterior también pause el checkout de iniciativas ya publicadas, eso
requeriría un nuevo chequeo explícito en `checkout/mp.js`/`checkout/colecta.js` contra `mp_identity_match`, y una
decisión de producto sobre qué hacer con órdenes ya en curso.

## 4. Riesgos moderados

### 4.1 — El `state` de OAuth se borra al final del callback, no inmediatamente después de leerlo

**Archivo**: `src/pages/api/mp/oauth/callback.js`. El `state` se lee (línea ~32) y recién se borra al final (línea
~165), después del intercambio de token y de escribir en `merchant_gateways`. Existe una ventana teórica de
replay/concurrencia entre la lectura y el borrado — mitigada en la práctica porque Mercado Pago invalida el
`code` de autorización tras el primer uso (comportamiento estándar de OAuth2), y porque PKCE exige también el
`code_verifier` correcto, no solo el `state`. No se pudo demostrar explotable con las herramientas de esta
auditoría (no se ejecutó ningún OAuth real, per las reglas de esta misión), pero no es defensa en profundidad
ideal.

**Corrección mínima propuesta**: hacer la lectura y el borrado del `state` atómicos (p. ej. `DELETE ... RETURNING
*` en una sola operación) al principio del handler, antes de cualquier llamada de red a Mercado Pago.

### 4.2 — Los endpoints de subida de fotos no exigen elegibilidad de creador

**Archivos**: `src/pages/api/rifas/upload-photo.js`, `src/pages/api/colectas/upload-photo.js`,
`src/pages/api/events/upload-photo.js`. Los tres exigen sesión válida (`Bearer` token real), pero ninguno llama a
`assertCreatorEligible`. Un usuario autenticado que nunca completó el registro puede subir un archivo real y
recibir una URL pública real bajo el dominio de Storage de Rifex.

**Impacto**: no permite crear, publicar ni recaudar (el archivo subido solo se vuelve útil si luego se asocia a
una Rifa/Colecta/Evento real, lo que sí exige el gate) — pero sí permite alojamiento de archivos públicos
arbitrarios sin haber completado ningún registro, lo que es inconsistente con el espíritu de "nadie crea sin
terminar el onboarding" y es un vector menor de abuso (hotlinking, alojar contenido no relacionado con Rifex).

**Severidad**: moderada.

**Corrección mínima propuesta**: agregar el mismo `assertCreatorEligible` a los tres endpoints, mismo patrón que
los 12 ya protegidos.

### 4.3 — Validación de RUT no distingue titularidad personal de organizacional

Ya documentado explícitamente como una limitación conocida en `docs/trust/TRUST_IMPLEMENTATION_ROADMAP.md`
(sección TRUST-2) y en `TRUST_DECISIONS_FOR_RODRIGO.md` — reconfirmado en esta auditoría: el mismo algoritmo
módulo 11 valida tanto un RUN de persona natural como un RUT de empresa (son el mismo formato en Chile). Rifex no
consulta el SII ni ningún registro de personas jurídicas, así que una cuenta `organization_name` puede declarar
el RUT personal de su representante y conectar la cuenta de Mercado Pago **personal** de esa misma persona, y el
match pasaría como `matched` sin que eso implique que la organización esté acreditada como entidad. **Verificado
que ninguna página pública afirma lo contrario** (`/seguridad` solo dice "verificamos la consistencia entre los
datos del creador y la titularidad de la cuenta receptora", nunca "verificamos que la organización es real") — el
gap es técnico y ya está documentado como pendiente, no una afirmación falsa activa.

**Severidad**: moderada (ya conocida, ya documentada, no urgente per el propio roadmap — reservada para TRUST-4).

## 5. Riesgos menores

### 5.1 — El error de intercambio de token de Mercado Pago se registra completo en logs

`src/pages/api/mp/oauth/callback.js:78`: `console.error("[mp/oauth/callback] token error:", tokenRes.status, tok);`
— `tok` es la respuesta completa de error de Mercado Pago. En la práctica, una respuesta de error de OAuth2 rara
vez contiene un token válido, pero es una práctica de logging más laxa de lo ideal — un proveedor podría, en
teoría, ecoar parámetros de la solicitud en un mensaje de error.

**Corrección mínima propuesta**: loguear solo `tokenRes.status` y `tok?.error`/`tok?.error_description`, nunca el
objeto completo.

### 5.2 — Políticas RLS redundantes en `merchant_gateways` (higiene, no explotable)

`merchant_gateways` tiene 8 políticas RLS superpuestas de distintas eras del proyecto (`manage own gateways`, `mg
owner read`, `mg owner upsert`, `mg_read`, `mgw_select_own`, `mgw_update_own`, `mgw_upsert_own`, `select own
gateways`) — todas exigen `auth.uid() = user_id`, así que **no hay ninguna combinación explotable** (confirmado
leyendo cada `qual`/`with_check` real vía consulta de solo lectura a `rifex-dev`). Es deuda técnica de higiene, no
un hallazgo de seguridad — candidato a una futura limpieza tipo EVENT-6, fuera del alcance de esta auditoría.

## 6. Contradicción `unavailable` — resolución final

Ver secciones 2 y 3.1. Resumen: **no hay contradicción de comportamiento** entre `assertCreatorEligible` y
`getIdentityStatus` para el estado `unavailable` específicamente (ambos lo tratan como "no bloquea") — la aparente
contradicción era de redacción en un documento. Pero **sí hay una contradicción real entre ambas funciones** para
el estado `NULL` (sección 2, crítico), y **sí hay una divergencia real entre el comportamiento actual y la
política que esta misión pide** para `unavailable` (sección 3.1, alto).

## 7. Cobertura completa de endpoints

Reconfirmado leyendo cada archivo real (no de memoria) — los mismos 12 endpoints protegidos por
`assertCreatorEligible` desde TRUST-2, sin cambios en esta corrección:

| Endpoint | Acción | Estado |
|---|---|---|
| `POST /api/rifas` | crear | ✅ protegido |
| `PATCH /api/rifas/[id]` | editar/publicar | ✅ protegido |
| `POST /api/rifas/[id]/draw` | sortear | ✅ protegido |
| `POST /api/rifas/[id]/extend` | extender | ✅ protegido |
| `POST /api/rifas/delete` | eliminar | ⚪ excluido deliberadamente (reduce riesgo) |
| `POST /api/colectas` | crear (queda 'active' de inmediato) | ✅ protegido |
| `POST /api/events` | crear | ✅ protegido |
| `PATCH /api/events/[id]` | editar/cancelar | ✅ protegido |
| `POST /api/events/[id]/publish` | publicar | ✅ protegido |
| `POST /api/events/[id]/ticket-types` | crear tipo de entrada | ✅ protegido |
| `PATCH /api/events/[id]/ticket-types/[typeId]` | editar tipo de entrada | ✅ protegido (DELETE excluido deliberadamente) |
| `POST /api/events/[id]/staff` | agregar staff | ✅ protegido |
| `PATCH .../staff/[staffId]` (status=active) | reactivar staff | ✅ protegido (revocar excluido deliberadamente) |

**Bypasses/gaps nuevos encontrados en esta auditoría**:

- `rifas|colectas|events/upload-photo.js` (3 endpoints) — **sin gate** (sección 4.2). No permiten crear/publicar
  por sí solos, pero no exigen onboarding para nada.
- `checkout/mp.js`/`checkout/colecta.js` — correctamente sin gate de creador (son flujos de **comprador**, nunca
  se pidió que lo tuvieran) — pero no revalidan `mp_identity_match` de una iniciativa ya publicada (sección 3.3).
- `mp/preference.js` — ruta legacy, devuelve `410 Gone` siempre, ya neutralizada antes de esta sesión.

**Rutas alternativas revisadas**: el proyecto usa exclusivamente Next.js Pages API (`src/pages/api/**`) — no hay
App Router, no hay Server Actions, no hay una segunda familia de rutas. Se revisaron `src/pages/api/rifas/**`,
`colectas/**`, `events/**`, `checkout/**`, `mp/**` completos (listado exhaustivo, no muestreo). No se encontraron
endpoints "ocultos" ni duplicados fuera de los ya conocidos.

**Confirmado mediante lectura de código** (no mediante fixtures reales, prohibidas en esta misión): un usuario sin
`onboarding_completed_at` no puede pasar `isOnboardingComplete`, que es la primera verificación de
`assertCreatorEligible` — el resto de la cadena (edad, RUT, Mercado Pago) es inalcanzable sin eso. Confirmado con
las 42 pruebas de `tests/trustIdentityGate.test.mjs`/`trustOnboardingGate.test.mjs`.

## 8. Seguridad OAuth

- **State/CSRF**: `state` es un id aleatorio de 24 bytes (`crypto.randomBytes(24)`, base64url) generado por
  `oauth/start.js`, guardado server-side junto al `code_verifier` — nunca predecible ni reusable por un tercero
  sin acceso a la base.
- **PKCE**: implementado correctamente (`S256`, `code_challenge`/`code_verifier` reales).
- **Redirect URI**: se calcula server-side (`resolveBaseUrl`), nunca aceptado como parámetro del cliente.
- **Identidad del usuario que inicia el flujo**: `oauth/start.js` resuelve el `uid` desde la sesión real
  (`getSupabaseServer(req,res).auth.getUser()`), nunca desde un parámetro — ya corregido en una sesión anterior
  (comentario explícito en el código sobre la vulnerabilidad previa que esto reemplazó).
- **Intercambio de token**: `x-www-form-urlencoded` a `https://api.mercadopago.com/oauth/token`, server-side,
  `client_secret` nunca expuesto al cliente.
- **`mp_user_id` ligado al token**: sí — proviene directo de la respuesta del intercambio de token
  (`tok.user_id`), nunca de un valor que el cliente mande.
- **Único escritor de `merchant_gateways`**: `service_role`, confirmado — cero grants efectivos a
  `anon`/`authenticated` (RLS con políticas owner-only, sección 5.2). El navegador no puede escribir
  `mp_identity_match='matched'` directamente.
- **Fallas encontradas**: sección 3.2 (logging de secreto), sección 4.1 (borrado tardío del state).

## 9. Estado real del match RUT

**No certificable con OAuth real en esta sesión** (mismo hallazgo que la auditoría previa,
`docs/trust/MP_IDENTITY_MATCH_AUDIT.md`, reconfirmado: sin credenciales de una app de Mercado Pago en este
entorno, documentación oficial bloqueada). El código de extracción (`extractMpRutFromUsersMe`) es defensivo y
correcto por diseño — nunca inventa una coincidencia — pero el comportamiento real de `/users/me` para Chile
sigue sin confirmarse.

`MATCH MP IMPLEMENTADO PERO NO CERTIFICADO CON OAUTH REAL CHILE.`

## 10. Persona/organización

Verificado por código y por las 42 pruebas de `trustOnboardingPolicy.test.mjs`/`trustOnboardingGate.test.mjs`:
exactamente uno de `person_name`/`organization_name` (ambos vacíos y ambos llenos rechazados, incluido el intento
de mandar ambos en la misma petición), `account_type` siempre derivado server-side. Con 0 filas reales en
`trust_onboarding` (confirmado en la sesión de corrección), no hubo datos que migrar — el camino de migración
nunca se ejercitó contra datos reales, solo está probado en código puro. RUT único (índice único parcial),
reconfirmado sin cambios desde TRUST-2. Ver sección 4.3 para la limitación de que un RUT formalmente válido no
acredita una organización.

## 11. Edad declarada

Verificado: `birth_date` eliminado por completo del código (solo quedan menciones en comentarios explicativos,
cero código funcional — ver sección 6 de la corrección anterior, reconfirmado con un grep fresco en esta
auditoría) y de la base (columna dropeada, confirmado con una consulta de solo lectura). `adult_declared` no se
puede falsificar como una fecha — es estrictamente un booleano validado server-side
(`validateAdultDeclaration`), con versión (`adult_declaration_version`) que invalida declaraciones antiguas si la
política cambia. Ninguna página (`/seguridad`, `/registro/continuar`, `/trust/verificar`) dice "edad verificada" —
siempre "declaración".

## 12. Teléfono

Formato chileno (9 dígitos, empieza en 9) validado cliente y servidor, normalizado a E.164 server-side siempre
(nunca confía en el formato que mande el cliente). Sin `phone_verified` en ningún lado — confirmado. Sin
duplicidad exigida (mismo teléfono puede repetirse entre cuentas — decisión ya documentada, no un descuido). Sin
exposición pública ni en logs (grep dedicado, sección de privacidad).

## 13. TRUST-3A

Reconfirmado sin cambios desde su propia auditoría de cierre: bucket privado, RLS, URLs firmadas de 120s,
`resolveAdmin` como única autoridad de revisor, auto-aprobación bloqueada, historial append-only con trigger real.
**Confirmado en esta auditoría, puntos prioritarios**:
- `isIdentityVerificationRequiredForCreators()` sigue en `false` (grep + prueba unitaria) — TRUST-3A no se activa
  automáticamente.
- `/trust/verificar` no está enlazado desde ningún flujo normal de onboarding (grep dedicado, cero resultados) —
  documentos reales no se piden en el camino estándar.
- El plazo provisional de 2 años (`expires_at`) solo se muestra al propio titular como "vigente hasta tal fecha",
  nunca presentado como una política de retención garantizada en ninguna página pública.
- Sin job de purga automática — gap ya documentado honestamente en `TRUST_DATA_RETENTION_MATRIX.md`, reconfirmado
  sin cambios.
- Ninguna página pública menciona biometría (grep dedicado, cero resultados).

## 14. Privacidad

Sin exposición de RUT/teléfono/nombres privados/tokens/storage keys en ninguna respuesta de API revisada
(`status.js`, `complete.js`, `mp/status.js`, endpoints TRUST-3A) — todo enmascarado o ausente donde corresponde.
**Excepción encontrada**: sección 3.2 (logging de `code_verifier`+email en un caso de borde del callback OAuth).
Sin PII en analytics ni en el Git history reciente revisado (commits de esta y las últimas sesiones — solo
mensajes de commit descriptivos, sin secretos ni datos pegados). No se imprimen valores encontrados en este
informe, solo archivo/categoría/severidad, per el mandato de esta misión.

## 15. Términos y `/seguridad`

- "Términos del Creador" ampliado (confirmado — 17 puntos vs. los 7 originales), versionado
  (`CURRENT_TERMS_VERSION` subido a `terms-v1.1`, fuerza re-aceptación), marcado explícitamente `PENDIENTE DE
  REVISIÓN POR ABOGADO CHILENO ANTES DE PROD`.
- Ningún incumplimiento se llama "delito" automáticamente — frase explícita presente.
- Teléfono limitado a uso transaccional — frase explícita presente en Términos y en `/seguridad`.
- Datos privados no se entregan automáticamente a terceros — frase explícita presente.
- `/seguridad`: cero frases prohibidas (`grep` dedicado, cero coincidencias reales — solo la lista de frases
  prohibidas aparece en un comentario del propio código, no en el contenido visible).
- Footer enlaza correctamente a `/seguridad` (confirmado en el build: la ruta compila y el link existe en
  `Layout.jsx`).
- El informe para Meta (`META_ANTIFRAUD_STATEMENT.md`) no oculta el proveedor (nombra Mercado Pago
  explícitamente) ni exagera controles — incluye una sección explícita "Qué NO decir".

## 16. Pruebas

- Suites completas ejecutadas: `test:trust-onboarding` (40), `test:trust-identity` (42, incluye la nueva prueba
  crítica de esta auditoría), `test:trust-identity-verification` (43), `test:mp-identity-match` (15),
  `test:event-analytics` (31), `test:scanner-controller` (4) — **175/175 pasan**.
- `npm run build` limpio.
- 1 prueba adversarial nueva agregada permanentemente (sección 2) — documenta el fail-open encontrado, no lo
  corrige.
- No se ejecutaron pagos, OAuth real, ni conexiones a Mercado Pago reales, per el mandato de esta misión.

## 17. Evidencia faltante

- Confirmación real, con credenciales de una app de Mercado Pago, de si `/users/me` entrega `identification` para
  Chile (sección 9) — sigue pendiente, no se pudo obtener en esta sesión tampoco.
- Prueba humana real de conectar una cuenta de Mercado Pago de prueba y observar el resultado — pendiente para el
  fin de semana.
- No se pudo reproducir en vivo contra `rifex-dev` el escenario de la sección 2 (fail-open) porque esta misión
  prohíbe crear fixtures/datos en DEV — la prueba quedó aislada localmente, que es una demostración válida del
  bug (el código es idéntico), pero no es lo mismo que verlo ocurrir con datos reales.

## 18. Correcciones mínimas propuestas (NO implementadas en esta misión)

En orden de prioridad:

1. **(Crítico)** Cambiar `assertCreatorEligible` de lista de bloqueo a lista de permiso explícita para
   `mp_identity_match` — sección 2.
2. **(Alto)** Decisión de Rodrigo: ¿`unavailable` debe seguir aprobando en silencio, o debe dirigir a una cola de
   revisión (posiblemente TRUST-3A) como pide esta auditoría? — sección 3.1.
3. **(Alto)** Nunca loguear el objeto `state` completo en `oauth/callback.js` — solo `st?.id` — sección 3.2.
4. **(Alto/Moderado según decisión de negocio)** Decidir si un `mismatch` detectado después de publicar debe
   pausar el checkout de esa iniciativa — sección 3.3.
5. **(Moderado)** Borrar el `state` de OAuth atómicamente al leerlo, al inicio del callback — sección 4.1.
6. **(Moderado)** Agregar `assertCreatorEligible` a los 3 endpoints de subida de fotos — sección 4.2.
7. **(Menor)** No loguear la respuesta completa de error del intercambio de token — sección 5.1.
8. **(Menor, no urgente)** Limpiar las 8 políticas RLS redundantes de `merchant_gateways` — sección 5.2.

## 19. Pruebas humanas del fin de semana

`PENDIENTE PARA EL FIN DE SEMANA — RODRIGO DESCANSADO`:

- Probar la interfaz completa de TRUST-1/TRUST-2/TRUST-3A/onboarding Mercado Pago con una cuenta real.
- Conectar una cuenta de Mercado Pago de prueba real y observar qué devuelve realmente `/users/me` — esto
  resolvería la sección 9 de forma definitiva.
- Decidir conscientemente la política de `unavailable` (sección 3.1) antes de que más cuentas reales pasen por
  ese camino.
- Revisar y decidir sobre las 8 correcciones mínimas propuestas (sección 18), priorizando la #1 (crítica) antes
  de cualquier prueba con datos reales de producción.

## 20. Veredicto final

**`GO CON CONDICIONES`**

Condición no negociable antes de considerar esto listo para más que pruebas humanas controladas: resolver el
hallazgo crítico de la sección 2 (fail-open en `mp_identity_match=NULL`). El resto de los hallazgos (altos,
moderados, menores) no bloquean pruebas humanas supervisadas en DEV, pero sí deberían resolverse antes de
cualquier conversación seria sobre promoción a producción.

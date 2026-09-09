# MEDIDOR QR V1 — Producto

Reemplaza por completo el mandato anterior "MEDIDOR DE CONVOCATORIA V1"
(nunca aplicado más allá de un fixture desechable, revertido antes de
cualquier commit — cero residuo en `rifex-dev` y en el repo). Dominio
nuevo e independiente: nunca toca raffles/colectas/events/event_*/
registration_*.

## Qué es

Una herramienta gratuita de adquisición: el organizador crea una
pregunta con 2-4 alternativas (a partir de una plantilla o escrita a
mano), Rifex genera un código QR que apunta a una página pública
(`/m/<slug>`), el organizador lo imprime y lo pega donde quiera
(flyer, vitrina, mesa, producto, cartel de evento). Quien escanea
responde en un toque, sin login, 100% anónimo. El organizador ve
métricas agregadas y puede exportarlas a Excel.

Slogan: "Ponlo donde quieras. Mide la respuesta."

## Qué NO es

- No mide asistencia real, solo intención declarada.
- No pide ni almacena datos personales de quien responde.
- No tiene pagos, comisión, ni Mercado Pago — cupo 1/mes gratis.
- No es un generador de flyers — el organizador aporta su propio
  material, Rifex solo genera el QR.

## Plantillas (10) — son UX, no arquitecturas distintas

`src/lib/medidorQrTemplates.js` — Convocatoria, Satisfacción, Interés
en producto, Comercio/nuevos productos, Atención al cliente,
Gastronomía, Taller/curso/actividad, Preferencia, Recomendación,
Personalizado (sin precarga). Las 10 producen el MISMO contrato
`medidores_qr.question` + `medidores_qr.options` — nunca una tabla o
endpoint distinto por plantilla.

## Cupo mensual — 1 Medidor QR gratis por cuenta

REUSE DIRECT de `currentFreePeriodKey`/`nextFreePeriodStartsAt`
(`src/lib/registrationFreeQuota.js`, el mismo cálculo ya certificado en
Inscripciones — mes calendario UTC "YYYY-MM", nunca rolling 30 días).
La autoridad real es exclusivamente la RPC `create_medidor_qr`
(`db/migrations/2026-09-08_medidor_qr_v1.sql`): el ledger insert-only
`medidor_qr_free_usage` con `UNIQUE(organizer_id, period_key)` es la
única fuente de verdad — nunca un pre-check en la API que pudiera
desincronizarse bajo concurrencia.

**Mecanismo de atomicidad**: el insert del Medidor va sin protección
propia salvo colisión de slug (reintenta con otro slug, nunca consume
cupo); el insert del ledger usa `RAISE EXCEPTION ... using errcode =
'P0001'` dentro de su propio bloque — al no ser capturada por nada más
arriba, esa excepción revierte TODA la llamada, incluido el insert del
Medidor ya "exitoso" un instante antes. Nunca queda un Medidor huérfano
sin su fila de consumo.

**Probado en vivo contra rifex-dev** (no solo unitariamente):
segunda creación mismo mes rechazada con `409 free_quota_already_used`
sin dejar fila huérfana; dos creaciones simultáneas del mismo
organizador (`Promise.all`) → exactamente una gana; usuario B no
consume el cupo de usuario A; cambio de período (mes) restaura el
cupo; intento directo contra la API (sin pasar por la UI) también
bloqueado — ver `tests/medidorQr.test.mjs`, sección "6. EMPÍRICO EN
VIVO".

## Fechas y estados

Modelo mínimo: `status` solo tiene `active`/`closed` (sin `draft` — la
creación es de una sola pasada; sin `paused` — el dashboard solo
expone Abrir/Cerrar). Los estados "aún no comienza"/"finalizada" que
ve el visitante se DERIVAN de `measurement_start`/`measurement_end` en
tiempo de lectura, nunca son un valor persistido aparte — la ventana
temporal se respeta incluso si el status sigue `active`.

`created_at` es inmutable. `measurement_start`/`measurement_end`
controlan cuándo la página pública acepta respuestas — la página nunca
devuelve 404 para un slug que existe, solo cambia el mensaje según el
estado real.

**Cerrar (`status.js`) es terminal** — nunca reabre, y NO elimina
métricas/histórico/Excel/URL pública: solo cambia el campo `status`.
Verificado en vivo: tras cerrar, `/m/<slug>` sigue resolviendo con
`HTTP 200` mostrando "Esta medición ha finalizado.", el QR sigue
descargable, y una respuesta anónima nueva es rechazada
(`medidor_not_active`). No existe ningún endpoint de borrado — se
prefiere cierre/archivo sobre destrucción de datos con métricas.

## Identidad pública permanente del QR

El código QR impreso codifica exclusivamente `/m/<slug>` — nunca
cambia aunque el organizador edite nombre, pregunta, alternativas,
fechas o destino después. El `slug` es inmutable desde su creación
(único endpoint que lo genera es `POST /api/medidor-qr`, con reintento
en colisión vía `slugify` + sufijo aleatorio).

## Edición (PATCH `/api/medidor-qr/[id]`)

- `name` (nombre interno, nunca visible a quien responde): **siempre**
  editable.
- `destination_url`/`destination_button_label`: **siempre** editables
  (incluida su eliminación) — cambiar el destino nunca invalida un QR
  ya impreso, porque el QR nunca codifica la URL de destino.
- `question`/`options`: editables **solo si `response_count === 0`**,
  recalculado server-side en cada request (nunca confiado de un flag
  del cliente) — desde la primera respuesta válida quedan bloqueados
  para no alterar el significado histórico de resultados ya
  existentes.
- `measurement_start`/`measurement_end`: siempre editables (ajustar la
  ventana no reinterpreta respuestas ya registradas).
- `slug`/`status`/`organizer_id`/`created_at`/`scan_count`: nunca
  tocados por este endpoint.

Probado en vivo: nombre editable con respuestas existentes; intento de
editar `options` con una respuesta existente rechazado con `409
locked_has_responses`; intento de `destination_url` con `javascript:`
rechazado con `unsupported_protocol`; `slug` verificado sin cambios
tras todas las ediciones anteriores.

## Anti-duplicación de respuestas (privacidad)

`src/lib/medidorQrVisitor.js` genera un `visitor_key` opaco
(`crypto.randomUUID()` doble, sin guiones) guardado en
`localStorage`, enviado en cada escritura (visita/respuesta/clic). La
autoridad real es exclusivamente `UNIQUE(medidor_qr_id, visitor_key)`
en cada tabla de instrumentación — deliberadamente **no** robusto
contra localStorage limpiado o modo incógnito, documentado como
limitación honesta, nunca ligado a identidad real.

Nunca se pide nombre, correo, teléfono, RUT ni ubicación a quien
responde. Sin fingerprinting invasivo, sin geolocalización precisa,
sin perfil oculto del visitante.

## Definiciones de métricas — nunca aproximaciones presentadas como personas exactas

Calculadas server-side en `loadMedidorQrMetrics`
(`src/pages/api/medidor-qr/[id]/index.js`) — el navegador solo recibe
el objeto `metrics` ya agregado, nunca las filas crudas de
respuestas/visitas.

- **Escaneos** (`scan_count`): crudo, sin deduplicar — se incrementa en
  cada carga de `/m/<slug>` vía `record_medidor_qr_visit`.
- **Visitantes (aproximado)** (`visit_count`): filas distintas por
  `visitor_key` en `medidor_qr_visits` — deliberadamente etiquetado
  "aproximado" porque su única autoridad es el `visitor_key` de
  localStorage (ver limitación de privacidad arriba).
- **Respuestas** (`response_count`): total de filas en
  `medidor_qr_responses`.
- **Conversión**: `response_count / scan_count` (0% si `scan_count`
  es 0) — nunca sobre visitantes.
- **Clics al destino** / **% sobre respuestas**: clics voluntarios al
  botón de destino opcional, calculados sobre respuestas (nunca sobre
  escaneos) — el funnel real es Escaneos → Respuestas → Clics, la RPC
  `record_medidor_qr_destination_click` exige que ese `visitor_key` ya
  tenga una respuesta registrada antes de contar un clic.
- **Evolución diaria**: agrupada por el **día local del organizador**
  (`medidor.timezone`, default `America/Santiago`), nunca por día UTC
  crudo — evita que una respuesta a las 21:30 en Santiago (00:30 UTC
  del día siguiente) aparezca en la fecha equivocada.

No existe una métrica "SIN RESPUESTA" separada porque no se puede
calcular con autoridad real: `scan_count` no está garantizado como
"personas distintas" (es crudo), así que "escaneos menos respuestas"
sería una resta entre una cifra cruda y una exacta — engañosa. Se
omitió deliberadamente en vez de presentar una aproximación como algo
preciso.

## Extensión — destino opcional post-respuesta

El organizador puede configurar opcionalmente: solo un agradecimiento,
o un botón que muestra el dominio real de destino antes de navegar
("¿Quieres continuar a ejemplo.cl?") — **nunca una redirección
automática**. Validación server-side vía `src/lib/safeExternalUrl.js`:
parser real `new URL()` (nunca un regex hecho a mano), allowlist
exacto `http:`/`https:` — rechaza `javascript:`, `data:`, `file:`,
`mailto:`, cualquier esquema no listado, y URLs de más de 2000
caracteres. `url.href` preserva path, query string, parámetros UTM y
fragment completos (probado en vivo).

**No existe un redirect endpoint abierto genérico**: el cliente ya
tiene la `destination_url` validada devuelta por `respond_to_medidor_qr`,
y navega directamente con `window.open()`. El endpoint `/click` solo
registra el clic (rate-limited, requiere respuesta previa del mismo
`visitor_key`) — nunca redirige nada. El registro del clic es
fire-and-forget (`goToDestination()` en `src/pages/m/[slug].jsx`
nunca hace `await` sobre el POST de `/click`): un analytics endpoint
lento o caído nunca atrapa ni retrasa la salida del visitante.

## Página pública — marca Rifex discreta

Rifex no compite visualmente con el contenido del organizador. Tras
responder: confirmación breve + botón de destino opcional (si
corresponde). Al pie, en toda rama de estado (no encontrado,
finalizada, aún no comienza, activa): una firma pequeña y gris "Powered
by Rifex.pro" enlazando a `/medidor-qr` — nunca un bloque promocional
grande de "Crea tu propio Medidor QR". Accesibilidad: colores muted
ajustados a `#64748b` (mismo tono usado en el resto del sitio, mejor
contraste que el gris más claro original), `aria-live="polite"` en el
bloque de confirmación, botones de opción con padding generoso para
targets táctiles.

## Excel — solo métricas, nunca personas

`src/lib/medidorQrWorkbook.js`, vía `exceljs`. Hoja "Resumen": nombre,
pregunta, fechas, escaneos, visitantes, respuestas, conversión, clics
al destino, y desglose por alternativa (conteo + porcentaje). Hoja
"Evolución diaria": fecha, escaneos, respuestas, columnas dinámicas
por alternativa. Encabezado congelado + autofiltro en ambas hojas.
Ninguna fila referencia `visitor_key`, IP, cookies ni ningún
identificador técnico — certificado por test estático que excluye los
comentarios explicativos del código (para no dar un falso positivo
sobre las propias explicaciones de por qué esos campos están
ausentes).

## Escalabilidad e integridad (extensión final)

- **Paginación server-side real** en "Mis Medidores QR"
  (`src/lib/panelPagination.js`, mismo patrón certificado en
  Inscripciones/Eventos), orden `created_at desc`.
- **Nombre interno** (`name`) separado de la pregunta pública —
  siempre editable, sirve para identificar el Medidor en el panel sin
  depender del texto exacto de la pregunta.
- **Búsqueda + filtro** (`?q=`, `?status=all|active|finalizados`) en
  `GET /api/medidor-qr/mine`, aplicados a la MISMA query que la
  paginación (nunca un filtrado en memoria sobre una página ya
  paginada). El término de búsqueda se sanea antes de interpolarse en
  el filtro `.or()` de PostgREST. "Finalizados" es `status='closed' OR
  measurement_end < now()` — el mismo criterio de "finalizada" que usa
  la página pública, no solo el campo `status` crudo.
- **Timezone persistido** (`medidores_qr.timezone`, default
  `America/Santiago`, mismo patrón que Events/Inscripciones) — usado
  tanto en la evolución diaria del dashboard como en el Excel, nunca
  se asume que UTC representa el día local del organizador.
- Explícitamente **no implementado** en V1 (decisión de alcance, no
  olvido): duplicar Medidor, analítica avanzada, exportación
  asíncrona, planes de pago, equipos — el esquema (`organizer_id`
  simple, sin tabla de roles) no lo hace innecesariamente difícil
  después.

## SEO / PSCG

| Ruta | Categoría | Boundary |
|---|---|---|
| `/medidor-qr` | PUBLIC_INDEXABLE | — |
| `/m/[slug]` | PUBLIC_NOINDEX | SSR, `noindex+noarchive` en toda rama |
| `/crear-medidor-qr` | PRIVATE_AUTHENTICATED | ssr_redirect |
| `/panel/medidor-qr` | PRIVATE_AUTHENTICATED | ssr_redirect |
| `/panel/medidor-qr/[id]` | PRIVATE_AUTHENTICATED | ssr_redirect |

`/medidor-qr` en `sitemap.xml`; `/crear-medidor-qr` en el `Disallow`
de `robots.txt` (`/panel` ya cubre las rutas de panel). `/m/[slug]`
deliberadamente NO está en el `Disallow` — la señal real es `noindex`,
no bloqueo de crawling (mismo criterio que `/inscripcion/[id]`):
evita miles de páginas de usuario ensuciando el índice sin depender de
un mecanismo más agresivo.

## RLS

`medidores_qr`: RLS habilitado + policy pública de solo lectura
acotada a `status='active'` (consistencia transversal — la app real
nunca hace SELECT directo desde el cliente, todo pasa por API
server-side con `service_role`). Las 4 tablas de instrumentación
(`medidor_qr_responses`/`visits`/`destination_clicks`/`free_usage`):
`revoke all` — cero acceso público, ni siquiera de solo lectura.

## Integración

Navbar (desktop + móvil) y footer ("Cómo funciona Medidor QR"): link
real a `/medidor-qr`. Mis Iniciativas: card con link a
`/panel/medidor-qr`. Home: card en la grilla de capacidades (sección
separada del hero — el hero de Home quedó explícitamente **fuera de
alcance** de esta misión por instrucción directa, una futura misión
visual dedicada lo rediseñará).

**Gap conocido, deliberadamente no resuelto**: `/difusion` (guía
multiproducto para organizadores, `src/lib/difusionGuides.js`) no
incluye todavía Medidor QR. Encontrado durante el autoaudit final —
`/difusion` no está en la lista explícita de superficies permitidas
para esta misión (Home/Navbar/Footer/Mis Iniciativas), así que se deja
documentado como trabajo futuro en vez de expandir el alcance sin
autorización.

## Seguridad — resumen adversarial

Cubierto en profundidad por `tests/medidorQr.test.mjs` (30 estáticos +
12 empíricos en vivo contra `rifex-dev`, fixtures desechables,
eliminados al final de cada test):

- Ownership real (`organizer_id !== user.id` → 403) antes de cualquier
  operación en GET/PATCH/status/export.
- IDOR: fila de un Medidor solo referenciable por su `organizer_id`
  real.
- Identidad SIEMPRE derivada de `auth.getUser(token)`, nunca del
  cliente.
- Cuota mensual: RAISE EXCEPTION revierte la transacción completa,
  probado con carrera real (`Promise.all`).
- Anti-duplicación de respuestas: `UNIQUE(medidor_qr_id, visitor_key)`
  real, probado en vivo.
- Rate limiting en creación, respuesta, visita, clic, export.
- Destino: allowlist de protocolo, nunca un redirect endpoint abierto.
- Excel: certificado sin PII vía test estático.

## Limitaciones honestas

- El `visitor_key` en `localStorage` no es robusto contra limpiar
  storage o modo incógnito — un mismo humano puede volver a responder
  si borra sus datos de navegación. Documentado, no un bug.
- "Visitantes (aproximado)" está etiquetado así a propósito: su única
  autoridad es el `visitor_key`, no una identidad verificada.
- El worktree local que contenía todo el trabajo sin commitear se
  perdió por un reinicio de máquina durante la sesión (vivía en
  `/tmp`, efímero). La base de datos en `rifex-dev` (tablas, RPCs,
  RLS) no se vio afectada — se reconstruyó el código completo desde el
  historial de la conversación y se re-verificó con build + 1118/1119
  tests + QA real E2E contra el servidor antes de continuar.

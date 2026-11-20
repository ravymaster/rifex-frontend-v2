# RIFEX RAFFLE EXPERIENCE 2026 — Rediseño visual + selector de cantidad

DEV only. Branch `dev/raffle-experience-2026-09-06`, sobre `origin/develop` @ `7506890`.

## Contexto

Rifex v3.0.1 está certificado en PROD. Esta misión NO reconstruye la lógica de Rifas —
la audita primero, reutiliza todo lo que ya funciona, y solo toca lo estrictamente
necesario para: (1) corregir un bug real de imágenes del premio nunca renderizadas,
(2) corregir un bug real de "$0" para premios físicos, (3) eliminar la grilla pública
de números y reemplazarla por un selector de cantidad, (4) mostrar el organizador
real vía la autoridad de perfil ya existente.

## Arquitectura actual auditada (antes de tocar código)

| Capacidad | Implementación actual | Veredicto |
|---|---|---|
| Creación (`POST /api/rifas` + RPC `create_raffle_with_declarations`) | Sólida, hardened, atómica | Reutilizada 100% sin cambios |
| Upload de fotos (`upload-photo.js`, bucket `raffle-prizes`) | Funciona correctamente end-to-end | Reutilizada 100% sin cambios |
| Columna `raffles.prize_photos` (text[]) | Se escribe y se lee correctamente en la API | Reutilizada — el bug estaba en el render, no acá |
| Reserva de tickets (`reserve_tickets_for_purchase` RPC) | Atómica, todo-o-nada, certificada en PRE-LAUNCH-FIX-1 | Reutilizada 100% sin cambios |
| Draw/winner (`drawWinner.js`) | Opera sobre `tickets.status='sold'`, agnóstico a cómo se reservó | Reutilizada 100% sin cambios |
| MP/webhook/reconciliación | Capa de pagos autocontenida, ya hardened | Reutilizada 100% sin cambios |
| QR (`qr.png.js`) | QR de nivel-rifa (apunta a la URL pública), no hay QR por-ticket | Reutilizada sin cambios — no existía, no se inventó uno nuevo |
| Perfil del organizador (`GET /api/perfil/[id]`) | Join en vivo contra `users_profile`, público, sin PII | Reutilizada — se llama desde la rifa en vez de duplicar datos |

## El bug real de imágenes (hallazgo de auditoría)

`raffle.prize_photos` llegaba correcto y completo desde `GET /api/rifas/[id]` — el
upload, el bucket, la columna y la API estaban 100% bien. El bug era que **ningún
componente en todo `src/` leía ese campo**: ni `rifas/[id].jsx`, ni
`RaffleIntroModal.jsx`, ni ningún componente de galería (no existía ninguno). Cero
mismatch de nombres, cero problema de Storage/bucket policy — un gap genuino de
render. Se corrigió construyendo `PrizeGallery.jsx` (nuevo) que lee
`raffle.prize_photos` directamente — cero cambios de backend/storage/schema.

## El bug real de "$0" (hallazgo de auditoría)

`prizeCLP` se calculaba siempre desde `raffle.prize_amount_cents`, que es `null` para
premios físicos (por diseño — ver §3/§6 del schema). Se corrigió con una rama
explícita: `prize_type === 'money'` muestra el monto real; `prize_type === 'physical'`
muestra el título de la rifa (no existe una columna "nombre del premio" separada —
la rifa ES el premio, consistente con el schema real y con el mockup aprobado).

## Selector de cantidad — reemplaza la grilla pública

La grilla de números fue eliminada de la UI pública (`rifas/[id].jsx`) por decisión de
producto. El comprador ahora ve `QuantitySelector` (−/cantidad/+, precio unitario,
total) y nunca ve ni elige números específicos.

## Asignación automática server-side — sin migración

El endpoint `POST /api/checkout/mp` pasó de aceptar `{numbers: [...]}` (arreglo
explícito elegido por el cliente) a aceptar `{quantity}` (solo un entero). La
resolución de qué números concretos asignar ocurre 100% en el servidor
(`assignRandomAvailableNumbers`), pero la escritura real sigue siendo exactamente la
misma RPC atómica todo-o-nada ya certificada (`reserve_tickets_for_purchase`) —
**no se creó ninguna migración ni RPC nueva**.

SQL `random()` real vía PostgREST habría requerido una función nueva (migración,
STOP explícito según el mandato). En su lugar: se toma un offset aleatorio acotado
+ una ventana de candidatos (`quantity * 6`, tope 200 filas) ordenada por `number`,
se baraja esa ventana en memoria (Fisher-Yates), y se proponen los primeros N a la
RPC atómica. Si la RPC rechaza el lote (`tickets_unavailable` — alguien más tomó
alguno de esos números entre la lectura y la escritura), se reintenta con una
ventana fresca (hasta 6 veces). La garantía real de "cero duplicados, cero
overselling" vive 100% en la RPC — el adaptador de arriba solo decide qué
candidatos proponerle, nunca reemplaza su atomicidad.

**Evidencia real de tuning**: la primera corrida con `quantity*3`/4 reintentos, bajo
20 compradores concurrentes reales sobre un pool de 100, dejó 1 de 20 solicitudes
sin resolver (`assignment_conflict_retry_exhausted` — comportamiento seguro, nunca
un duplicado, pero evitable). Se amplió a `quantity*6`/6 reintentos y la misma
prueba repetida dio 20/20 exitosas, 60/60 números únicos, cero duplicados.

## Organizador — vía la autoridad real de perfil

La rifa nunca almacena nombre/foto del organizador — solo `creator_id`/`creator_email`.
La página pública y `crear-rifa.jsx` llaman a `GET /api/perfil/[uid]` (la misma API
pública ya usada por "Ver perfil del creador") para mostrar nombre/avatar/bio en
vivo — cero campo nuevo, cero duplicación, cero riesgo de dato obsoleto.

## Performance

La página pública ya no descarga el arreglo completo de tickets — solo counts
agregados (`count:'exact', head:true`, cero filas transferidas) para "Números
disponibles: X de Y". El servidor solo transfiere `quantity`/`total`, nunca la
lista completa de números disponibles.

## Seguridad

- El cliente nunca puede enviar `numbers`/`assigned_numbers`/`forced_numbers` — el
  body de `POST /api/checkout/mp` solo acepta `quantity` (entero validado).
- Country Gate, rate limiting, y la resolución de `raffle_id` no cambiaron.
- El techo de cantidad es `raffle.total_numbers` real — no un límite inventado.

## Prueba en vivo real (concurrencia, contra `rifex-dev`)

Fixture disposable: rifa de 100 tickets, 20 compradores concurrentes pidiendo 3
cada uno (60 de 100) → **20/20 éxitos, 60/60 números únicos, cero duplicados**,
disponibilidad final exacta (40). Segunda rifa de 5 tickets, 3 compradores pidiendo
3 cada uno (9 de 5, prueba de agotamiento) → exactamente 1 compra exitosa (3
números), las otras 2 fallaron de forma determinística y segura
(`insufficient_availability`), disponibilidad final exacta (2) — nunca negativa,
nunca overselling. Fixture eliminado y verificado en cero al final.

## Deuda real / fuera de alcance

- No existe QR por-ticket para Rifas (a diferencia de Eventos) — no se construyó
  uno nuevo, coherente con "esta misión no agrega producto nuevo".
- El panel de creador (`/panel/index.jsx`) no fue tocado — el mandato solo pedía
  rediseñar la ficha pública y la creación, no el panel interno.
- Búsqueda/filtrado de rifas no estaba en el alcance de esta misión.

## Archivos

Nuevos: `src/components/rifex/PrizeGallery.jsx`, `src/components/rifex/QuantitySelector.jsx`,
`src/lib/raffleLabels.js`, `src/styles/prizeGallery.module.css`,
`src/styles/quantitySelector.module.css`, `tests/raffleExperience2026.test.mjs`.

Modificados: `src/pages/api/checkout/mp.js`, `src/pages/rifas/[id].jsx`,
`src/pages/crear-rifa.jsx`, `src/components/rifex/BuyerForm.jsx`,
`src/components/rifex/RaffleIntroModal.jsx`, `src/styles/rifaDetalle.module.css`,
`src/styles/crearRifa.module.css`.

Sin cambios: todo lo demás de Rifas (creación RPC, reserva RPC, draw, MP, webhook,
reconciliación, QR, upload de fotos, Storage, RLS, migraciones).

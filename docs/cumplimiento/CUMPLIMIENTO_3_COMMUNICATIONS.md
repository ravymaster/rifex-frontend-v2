# CUMPLIMIENTO-3 — Communications + Winner Secure Access (2026-08-30)

**Estado: fundación en `rifex-dev`. Ningún motor automático activo. `/cumplimiento` sigue siendo roadmap público — "Próximamente".**

## 1. Auditoría del flujo real de emails (antes de codificar)

`notifyWinnerDrawn(raffleId, winner)` (`src/lib/drawWinner.js`), invocada
exactamente una vez por sorteo real (guardada por `isNew:true`), ya
enviaba dos correos:

- **`sendWinnerEmail`** al comprador ganador — asunto "🏆 ¡Ganaste!",
  incluía nombre, número ganador, y un texto genérico ("el organizador
  se pondrá en contacto"). **No** incluía premio, modalidad de entrega,
  ni condiciones de transferencia.
- **`sendCreatorWinnerEmail`** al creador — asunto "🎉 Ya hay ganador",
  incluía número, nombre y contacto del ganador. Tampoco incluía
  delivery/transferencia.

**No existía ningún correo a participantes no ganadores** — no hay
nada que "mantener" para ese grupo porque nunca existió.

## 2. Principio de no duplicación (obligatorio)

Estos dos correos existentes **son ahora la comunicación Día 0** — se
enriquecieron con la información de premio/entrega/transferencia
(tomada del snapshot congelado del caso, nunca de la rifa actual) y,
en el caso del ganador, con el link seguro a su caso. **Nunca se creó
un tercer/cuarto correo separado.** `mailer.js` sigue teniendo
exactamente las mismas funciones exportadas (`sendWinnerEmail`,
`sendCreatorWinnerEmail`), solo con parámetros nuevos opcionales.

## 3. Punto de integración — sin romper CUMPLIMIENTO-2

`notifyWinnerDrawn` ahora, después de asegurar el caso (sin cambios de
CUMPLIMIENTO-2), delega el envío real a `sendDay0Communications`
(`src/lib/fulfillmentCommunications.js`) — el orden real es:

```
winner persisted (raffle_results)
  -> ensureFulfillmentCaseForRaffle (CUMPLIMIENTO-2, sin cambios)
  -> sendDay0Communications (CUMPLIMIENTO-3, nuevo)
```

Si el caso no se pudo asegurar, o `sendDay0Communications` lanza una
excepción inesperada, `notifyWinnerDrawn` cae a un **fallback** que
manda los mismos dos correos SIN enriquecimiento ni ledger — el
ganador y el creador **nunca** dejan de recibir notificación solo
porque Cumplimiento tuvo un problema. `drawWinner()` (algoritmo,
elegibilidad, `raffle_results`, exactly-once) no se tocó en absoluto.

## 4. Ledger — `raffle_fulfillment_communications`

Ver DDL completo en
`db/migrations/2026-08-30_cumplimiento3_communications_and_winner_access.sql`.
`UNIQUE(case_id, communication_type, recipient_role)` es la autoridad
real de "intención exactly-once" — un reintento **siempre** actualiza
la fila existente (`attempt_count`, `status`, `last_error_safe`),
nunca inserta una segunda. Esto es intención exactly-once, no entrega
exactly-once: Resend puede tener su propia semántica de reintento, eso
queda fuera del control de esta tabla.

9 tipos ya modelados en el CHECK constraint (`DAY_0_WINNER` /
`DAY_0_CREATOR` ya usados; `DAY_10_*`/`DAY_15_*`/`DAY_20_*` reservados,
sin fila insertada todavía por ningún código real).

Sin `recipient_reference` (email/nombre) duplicado en el ledger a
propósito — el destinatario real se resuelve desde el snapshot del
caso (`winner_buyer_email`) o `raffles.creator_email` en el momento del
envío, evitando una segunda copia de PII que pueda desincronizarse.

## 5. Semántica de fallo del proveedor

`status` ∈ {`pending`, `sent`, `skipped`, `failed`}. `skipped` (cuando
`ENABLE_EMAILS!=true`) y `failed` (error real del proveedor) se
distinguen — ambos permiten reintento posterior; solo `sent` congela
el estado (y, para el ganador, el token de acceso — sección 7).
`last_error_safe` guarda únicamente un string corto (mensaje/tipo),
**nunca** la respuesta cruda del proveedor ni secrets. Certificado con
una prueba real (sin `RESEND_API_KEY` configurado, `sendEmail` real
devuelve `ok:false` de forma determinística, sin red): el caso
permanece intacto, `raffle_results` nunca se toca.

## 6. Recovery

No existe cron todavía. El propio `sendDay0Communications(fulfillmentCase, args)`
**es** la operación de recovery: llamarlo de nuevo para un caso cuyo
Día 0 falló o quedó a medias reintenta exactamente lo que falta (nunca
lo ya confirmado como `sent`), sin duplicar ninguna fila del ledger ni
el correo. Certificado con reintentos secuenciales, concurrentes, y
"reintento del flujo completo de DRAW" (3 pasadas seguidas).

## 7. Acceso seguro del ganador — diseño del token

**Auditado el patrón existente antes de decidir**:
`event_orders.access_token` (EVENT-2) se genera con
`gen_random_uuid()` concatenado y se guarda **en texto plano**,
comparado por igualdad directa — aceptable para su threat model, pero
el mandato de esta misión pide explícitamente no persistir el token
del ganador en texto plano. Se decidió **no copiar ciegamente** ese
patrón:

- Token crudo: `crypto.randomBytes(32)` → hex de 64 caracteres (256
  bits de entropía) — mayor, no menor, que el de Events.
- DB: solo `winner_access_token_hash` (SHA-256 del crudo, 64 hex).
  El crudo **nunca** se persiste — se genera en memoria, se envía en
  el correo del ganador, y se descarta.
- Lookup: se hashea el token entrante y se compara por igualdad exacta
  contra la columna — el espacio de 256 bits hace un timing attack
  práctico irrelevante para este caso de uso (mismo criterio que
  tokens de reseteo de contraseña en la industria).

## 8. Ciclo de vida del token

**Nunca expira por tiempo** (nada de 24 horas) — debe seguir siendo
útil durante todo el ciclo futuro (Día 0 → 10 → 15 → 20 → eventual
revisión). Rotación: el token solo se genera/rota mientras
`DAY_0_WINNER` no esté en `status='sent'` — una vez confirmado el
envío, el token queda **estable** para el resto del ciclo de vida del
caso (nunca se invalida un link ya entregado). Esto resuelve limpiamente
el problema de "reintento sin el crudo en memoria": si el primer envío
falló, el token nunca llegó al ganador, así que rotarlo en el reintento
es siempre seguro.

## 9. Ruta pública del caso

`GET /api/cumplimiento/caso/[token]` (rate-limited, mismo patrón que
`/api/events/orders/[token]`) + página
`src/pages/cumplimiento/caso/[token].jsx`. Respuesta genérica (`404`)
para token ausente, con formato inválido, o inexistente — nunca revela
si el formato es "plausible", si la rifa existe, ni ninguna otra señal
de enumeración. Certificado: token de un caso nunca abre otro caso;
formato plausible-pero-falso da exactamente el mismo resultado que un
formato corto.

**Datos expuestos** (`CASE_COLUMNS_PUBLIC` en `fulfillmentCommunications.js`):
`raffle_id`, `raffle_title`, `prize_type`, `prize_amount_cents`,
`delivery_method`, `requires_transfer_procedures`,
`transfer_expenses_owner`, `transfer_conditions`, `status`,
`winner_determined_at`, `raffle_closed_at`. **Nunca**: `creator_id`,
`winner_purchase_id`, `winner_buyer_email/name`,
`winner_access_token_hash`, `creator_response`/`winner_response`, ni
ningún dato de otro comprador. Certificado con una prueba explícita de
ausencia de esas claves en la respuesta.

Sin botones de confirmación — la página es estrictamente de solo
lectura en esta fase (certificado por ausencia estructural de
`recordCreatorResponse`/`recordWinnerResponse` tanto en la página como
en el endpoint).

## 10. Acceso del creador — sin cambios

El creador sigue usando su sesión Rifex autenticada (`Authorization:
Bearer`) + ownership en la query, exactamente como los endpoints ya
certificados de CUMPLIMIENTO-1 (`GET /api/panel/cumplimiento*`). No se
creó ningún token guest para él — certificado por ausencia estructural
del mecanismo de token del ganador en esos archivos.

## 11. Escalamiento futuro — preservado, no implementado

El schema/dominio ya soporta la distinción futura entre
`WINNER_DENIED_RECEIPT` (respuesta explícita `winner_response='not_yet'`)
y `WINNER_NO_RESPONSE` (silencio, `winner_response=NULL`) — heredado de
CUMPLIMIENTO-1/2, sin cambios necesarios acá. Los tipos
`DAY_20_INTERNAL_ESCALATION`/`DAY_20_REVIEW_NOTICE_WINNER`/
`DAY_20_REVIEW_NOTICE_CREATOR` ya están en el CHECK constraint del
ledger, listos para que CUMPLIMIENTO-4/5 los use — **ningún código
real los inserta todavía**. `rifex.contacto@gmail.com`/
`contacto@rifex.pro` no están hardcodeados en ninguna parte del dominio
— ni siquiera como constante sin usar.

## 12. Hallazgo append-only (CUMPLIMIENTO-2) — respetado

No se modificó ni debilitó el trigger append-only de
`raffle_fulfillment_events`. Para el fixture de QA en DEV se reutilizó
el mismo caso residual ya documentado de CUMPLIMIENTO-2 cuando fue
posible, evitando crear fixtures permanentes adicionales sin necesidad
real.

## 13. Qué NO se implementó (explícito)

Día 10/15/20 (scheduler ni contenido), reminders, cierre automático,
escalamiento interno real, expediente enviado a Rifex, revisión
humana, reputación/scoring, acciones de respuesta del ganador/creador
("Sí recibí"/"No recibí"/etc.), cualquier cambio a PROD.

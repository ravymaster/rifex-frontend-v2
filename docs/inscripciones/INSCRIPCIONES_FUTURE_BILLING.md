# INSCRIPCIONES — Facturación futura Plus/Gold (documentado, NO implementado)

**Estado**: diseño puro, sin cambios por la promoción a PROD (2026-09-04). Ningún checkout, ningún gateway de pago, ningún endpoint de compra, ningún botón "Upgrade", ningún atajo de administrador, ningún parámetro de query/body que active esto existe en PROD ni en el repo a la fecha de este documento. Este archivo existe para que una futura misión no tenga que reconstruir Inscripciones, Participantes, QR, Scanner, Check-in, Excel, página pública ni panel — solo debe conectar la facturación.

## Modelo de planes

Definido en `src/lib/registrationPlans.js` — única autoridad de capacidades:

| Plan | Capacidad | Pago |
|---|---|---|
| FREE | 50 | Ninguno — 1 por mes calendario por cuenta |
| PLUS | 200 | **Pago único por actividad** (no suscripción) |
| GOLD | 2000 | **Pago único por actividad** (no suscripción) |

`REGISTRATION_PLANS.plus.publiclyAvailable` y `.gold.publiclyAvailable` son `false` en PROD hoy — ese flag, no un checkout, es lo que le dice a cualquier futura UI que no debe mostrar esos planes.

## Por qué PLUS/GOLD son categóricamente distintos de "Inscripciones pagada"

PLUS/GOLD cobran al **organizador** por más capacidad de software de Rifex — nunca al participante por inscribirse. Si algún caso necesitara cobrar al participante, ese caso es Eventos, no una variante de Inscripciones.

## Por qué es estructuralmente imposible activar PLUS/GOLD hoy en PROD

1. La única función SQL capaz de insertar una fila en `registration_activities` en PROD es `create_free_registration_activity`, y su firma **no tiene parámetros** `p_plan`/`p_capacity`.
2. Ningún endpoint de `/api/inscripciones/**` en PROD lee `plan` ni `capacity` del body de ninguna request (verificado por grep en el self-audit previo a la promoción).
3. `registration_activities.plan`/`.capacity` solo se escriben en el INSERT inicial de esa RPC.

## Punto de integración futuro — "RIFEX INSCRIPTIONS BILLING"

Cuando una misión futura implemente esto: 1) cobrar al organizador el plan elegido, pago único por actividad; 2) confirmar el pago server-side; 3) emitir un entitlement (concepto nuevo, ej. `registration_entitlements`, insert-only, análogo a `registration_free_usage`); 4) crear/elevar una actividad con la capacidad correspondiente vía una nueva RPC parametrizada que solo pueda ejecutarse tras verificar el entitlement; 5) preservar exactamente el resto del flujo sin cambios.

## Qué NO se decide en este documento

Precio de Plus/Gold, proveedor de pago, si Plus/Gold aparecen en `/inscripciones` como planes visibles antes o después de comprarse, flujo de "upgrade" de una actividad FREE ya creada, y si el límite de "1 FREE por mes" sigue aplicando a organizadores que ya compraron Plus/Gold — todas son decisiones de producto explícitas para la misión que implemente esto.

# Warp Conversacional V1 en Rifex PROD — preparación

Rama `prod/warp-conversational-v1`, creada desde `main` (`a776593`). Solo local; no publicada.

## Qué incluye
- **Paquetes vendorizados** con su SHA-256:
  - `@warp-ai/assistant` 0.7.5;
  - `@warp-ai/connector` 0.4.0;
  - `@warp-ai/discovery` 0.1.0.
- **Connector** con las 9 capacidades `rifex.*`, todas de lectura pública, y los 22 contextos de página. Es idéntico a lo certificado en `develop` (`eebf189`).
- **Rutas de servidor:**
  - `/api/v1/discovery`;
  - `/api/warp/capabilities/[capabilityId]`;
  - `/api/warp/chat` y `/api/warp/chat/actions`;
  - `/api/warp/assistant`;
  - `/api/warp/health`.
- **Botón global del asistente** en `_app.js`. Solo aparece si el servidor lo enciende.
- **Enlaces del asistente:** solo `https://rifex.pro` es clicable; el dominio de DEV queda como texto.

## Qué NO incluye
- La página `/piloto-warp`, el banner de DEV ni otros trabajos de `develop`, como analytics o la puerta de admin de DEV.
- Cambios en autenticación, pagos, comisión, RLS, base de datos ni Mercado Pago.
- Capacidades que modifiquen datos.
- **Pendiente:** `site.navigation.list` y `site.content.read`. Se agregan con el mapa de PROD aprobado por una persona.

## Variables de PROD (solo por nombre)

| Variable | Tipo | Para qué |
|---|---|---|
| `RIFEX_WARP_PILOT` | privada (`on`) | Enciende el botón y las rutas del chat. Sin ella: botón oculto y chat 404 |
| `WARP_AI_API_URL` | privada | URL del Warp de PROD (solo servidor) |
| `WARP_AI_API_KEY` | privada, Sensitive | Clave del sitio para Warp PROD (solo servidor) |
| `NEXT_PUBLIC_BASE_URL` | pública | Debe ser `https://rifex.pro`; sin valor, se usa `https://rifex.pro` |
| `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_*` | existentes | Catálogo público y límite de mensajes (sin cambios) |

- Ninguna variable de Warp va en `NEXT_PUBLIC_*`.

## Comportamiento al desplegar
- `/api/v1/discovery` y `/api/warp/capabilities/*` quedan públicas apenas se despliega el código, aunque el asistente esté apagado. Solo exponen información pública de lectura.
- Sin `RIFEX_WARP_PILOT=on` y sin configuración de servidor, `/api/warp/assistant` responde `{"enabled":false}` y el botón no aparece.

## Orden de despliegue
1. Warp PROD primero: configuración del sitio `rifex.pro` con las capacidades, los contextos, el presupuesto y la clave propia.
2. Rifex PROD después: merge a `main` y luego las variables privadas.

## Rollback
- **Apagar el asistente sin desplegar:** quitar `RIFEX_WARP_PILOT` (o ponerlo distinto de `on`) y volver a desplegar el mismo commit.
- **Volver atrás todo:** Instant Rollback al despliegue PROD anterior y `git revert -m 1 <merge>` en `main`.
- No hay datos, tablas ni migraciones que deshacer.

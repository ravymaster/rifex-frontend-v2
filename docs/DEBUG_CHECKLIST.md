# DEBUG CHECKLIST

## A. Previos (entorno)
- Node 18+ (`node -v`)
- `.env.local` con claves (Supabase + MP + BASE_URL)

## B. Crear rifa
- POST `/api/rifas` inserta en `raffles`
- Tras insert, **crea tickets** 1..N si no existen

## C. Selección y checkout
- `/rifas/[id]` obtiene `raffles` + `tickets`
- POST `/api/checkout/mp`:
  - valida disponibilidad
  - inserta `purchases (initiated)`
  - `tickets → pending` + `purchase_id`
  - guarda `mp_preference_id`
  - devuelve init_point

## D. Confirmación
- `/checkout/success` → POST `/api/checkout/confirm` con `preference_id`
- `purchases.status` se actualiza
- `tickets → sold` si `approved`, `available` si rechazo

## E. Webhook
- `/api/checkout/webhook` hace lo mismo en background (idempotencia por `purchase_id`)

## F. Problemas comunes
- **Faltan envs** → 500 en API
- **CORS** → revisar dominio BASE_URL
- **Claves MP vencidas** → regenerar Access Token

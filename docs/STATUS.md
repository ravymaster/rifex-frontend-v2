# Rifex – STATUS (autoupdate friendly)
_Last updated: **2025-09-12 00:07:23**_

## 0) Propósito
Documento compacto para “re‑onboarding express” cuando se reinicia el navegador o el chat. Úsalo para poner a Ailén al día en 1 minuto.

## 1) Stack actual
- **Next.js 14 (Pages Router)** – carpeta `src/pages`
- **Supabase (Postgres + RLS)** – tablas: `raffles`, `tickets`, `purchases`, `merchant_gateways` (activos).  
  *Legado no usado por el FE hoy*: `rifas`, `rifa_tickets`, `payments`.
- **MercadoPago** – Preference + Webhook + confirmación manual

## 2) Flujo de compra (resumen)
1. `/rifas/[id]` → selecciona números → **POST** `/api/checkout/mp`  
   - `purchases`: insert `initiated` + guarda `mp_preference_id`  
   - `tickets`: `pending` + `purchase_id`
2. Pago → retorno a `/checkout/success` (o llega **webhook**)
3. Confirmación (`/api/checkout/confirm` o webhook):  
   - `purchases.status`: `approved|pending|rejected|failure`  
   - `tickets`: `sold` si `approved`, `available` si fallo

## 3) Rutas clave
- **Pages**: `src/pages/rifas/[id].jsx`, `src/pages/crear-rifa.jsx`, `src/pages/checkout/success.jsx`
- **API Checkout**: `src/pages/api/checkout/index.js`, `mp.js`, `confirm.js`, `webhook.js`
- **API Rifas**: `src/pages/api/rifas/index.js` (crea `raffles` y ahora **tickets 1..N**)
- **Panel MP**: `src/pages/panel/mercado-pago.js` + `api/merchant/mp/*`

## 4) Variables de entorno (usar `.env.local`)
- `NEXT_PUBLIC_SUPABASE_URL=`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=`
- `SUPABASE_SERVICE_ROLE_KEY=`
- `NEXT_PUBLIC_BASE_URL=` (ej: http://localhost:3000 o dominio prod sin `/` final)
- `MP_ACCESS_TOKEN=`

## 5) Estados canónicos
- `tickets.status`: `available | pending | sold`
- `purchases.status`: `initiated | approved | pending | rejected | failure`
- `raffles.status`: `draft | active | closed` (en FE se inicia `active`)

## 6) Pasos “arranco en frío” (60 segundos)
1. **Clonar/abrir** repo o cargar `rifex-frontend-*.zip` en el chat.  
2. Crear `.env.local` desde `docs/dotenv.example` **(copiar y completar claves)**.  
3. `npm i` → `npm run dev` (Node 18+).  
4. Crear rifa en `/crear-rifa` → confirmar que se generen **tickets 1..N**.  
5. Probar compra con pocos números → ver `purchases` y `tickets` en Supabase.  
6. Pagar → `/checkout/success` → confirmar `sold` o liberación.

## 7) Debug rápido (Check‑list)
- **Tickets no aparecen** → revisar `api/rifas/index.js` (bloque de creación 1..N) y `.env.local` de Supabase (service key).  
- **Checkout no abre** → faltan claves MP, `NEXT_PUBLIC_BASE_URL`, o CORS.  
- **No cambia a SOLD** → confirmar `preference_id` en URL de success, revisar `/api/checkout/confirm` y webhook.  
- **Duplicidad de datos** → **NO usar** tablas `rifas/rifa_tickets` desde FE.

## 8) Tareas abiertas (breve)
- [ ] Conciliación opcional en `payments` (insert al confirmar).  
- [ ] Limpieza final de tablas legado (`rifas/rifa_tickets`) cuando migremos 100%.  
- [ ] Validaciones UI/UX (toasts, disabled states, etc.).


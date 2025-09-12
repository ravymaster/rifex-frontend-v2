# Esquema BD (resumen)

> Fuente de verdad: `db/db/schema_snapshot.json`.  
> Este documento resume los campos que usa el frontend y sus relaciones.

## Tablas clave

### raffles
- **id** (uuid, pk)
- **title** (text)
- **description** (text, null)
- **price_cents** (int)
- **total_numbers** (int)
- **prize_type** (text) — `money` | `physical`
- **prize_amount_cents** (int, null) — solo si `prize_type = money`
- **plan** (text) — `free` | `pro`
- **theme** (text, null)
- **status** (text) — `draft` | `active` | `closed` | `deleted`
- **start_date** (date, null)
- **end_date** (date, null)
- **created_at** (timestamptz, default now())

### tickets
- **id** (uuid, pk)
- **raffle_id** (uuid, fk → raffles.id, on delete cascade)
- **number** (int) — 1..N
- **status** (text) — `available` | `reserved` | `paid`
- **purchase_id** (uuid, fk → purchases.id, null)
- **created_at** (timestamptz, default now())

### purchases
- **id** (uuid, pk)
- **raffle_id** (uuid, fk → raffles.id)
- **buyer_email** (text)  *(o campo equivalente para identificar al comprador)*
- **amount_cents** (int)
- **currency** (text, default `CLP`)
- **preference_id** (text) — id de preferencia MP
- **payment_id** (text, null) — id de pago MP cuando vuelve éxito
- **status** (text) — `pending` | `approved` | `rejected` | `cancelled`
- **created_at** (timestamptz)
- **paid_at** (timestamptz, null)

### merchant_mp  *(nombre exacto puede variar; ver `schema_snapshot.json`)*
Guarda credenciales de Mercado Pago por usuario.
- **id** (uuid, pk)
- **user_id** (uuid)
- **mp_access_token** (text)
- **created_at** (timestamptz)

## Reglas de negocio (usadas por el frontend)
- **Soft delete**: rifa con ventas o cerrada ⇒ `status = 'deleted'` (se oculta del panel).
- **Hard delete**: rifa sin actividad ⇒ borrar `tickets`/`purchases` relacionados y luego `raffles`.
- El panel cuenta **vendidos** con tickets `status = 'paid'`.
- `/api/panel/raffles` excluye `status = 'deleted'` por defecto y permite `?q=` por título/ID.

> Si algún nombre de campo difiere, actualiza este MD según `db/db/schema_snapshot.json`.

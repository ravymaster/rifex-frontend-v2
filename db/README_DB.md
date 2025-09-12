# Rifex – Base de Datos (Supabase/Postgres)

**Snapshot actual (2025-09-11):**
Tablas: merchant_gateways, payments, purchases, raffles, tickets, rifas, rifa_tickets, users_profile

**Observaciones rápidas:**
- Duplicidad de modelo: `raffles/tickets` (EN) vs `rifas/rifa_tickets` (ES)
- `payments` aún no enlaza a `purchases`
- `mp_payment_id`: bigint en `payments` vs text en `purchases`

**Convención de migraciones:** `db/migrations/AAAAMMDD-hhmm-descripcion.sql`
**Snapshot JSON:** `db/schema_snapshot.json` (se agrega después)

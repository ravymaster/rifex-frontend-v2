# Rifex – Base de Datos (Supabase/Postgres)

**Snapshot actual (2025-09-11):**
Tablas: merchant_gateways, payments, purchases, raffles, tickets, rifas, rifa_tickets, users_profile

**Observaciones rápidas:**
- Duplicidad de modelo: `raffles/tickets` (EN) vs `rifas/rifa_tickets` (ES)
- `payments` aún no enlaza a `purchases`
- `mp_payment_id`: bigint en `payments` vs text en `purchases`

**Convención de migraciones (real, verificada 2026-08-25 contra `db/migrations/*.sql`):** `db/migrations/AAAA-MM-DD_descripcion.sql`. Cuando existe más de una migración en la misma fecha, se usan sufijos de letra (`b`, `c`, ...) antes del guion bajo — ej. `2026-08-20b_draw1b_fix_prize_photos_null.sql`, `2026-08-23c_event1_foundation.sql`. No se usa hora (`hhmm`) en el nombre de archivo.
**Snapshot JSON:** `db/schema_snapshot.json` (se agrega después)

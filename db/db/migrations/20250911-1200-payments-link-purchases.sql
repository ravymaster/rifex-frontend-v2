-- Unifica tipos y crea relación payments -> purchases (mínimo)

-- 1) Convertir mp_payment_id a TEXT
ALTER TABLE public.payments
  ALTER COLUMN mp_payment_id TYPE text USING mp_payment_id::text;

-- 2) Agregar columna de enlace (si no existe)
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS purchase_id uuid NULL;

-- 3) Índices básicos
CREATE INDEX IF NOT EXISTS payments_purchase_id_idx ON public.payments(purchase_id);

-- 4) FK payments.purchase_id -> purchases.id (evita duplicar si ya existe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_purchase_id_fkey'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_purchase_id_fkey
      FOREIGN KEY (purchase_id) REFERENCES public.purchases(id)
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END$$;

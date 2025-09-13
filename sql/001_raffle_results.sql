create table if not exists public.raffle_results (
  raffle_id uuid primary key,
  number int not null,
  buyer_email text,
  buyer_name text,
  purchase_id uuid,
  created_at timestamptz default now()
);

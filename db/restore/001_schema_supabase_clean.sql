-- =============================================================================
-- Rifex — schema-only restore for a NEW, EMPTY Supabase project
-- =============================================================================
-- Source: db_cluster-10-11-2025@05-41-59.backup.gz (plain-text pg_dump cluster
--         dump, database "postgres"), extracted 2026-08-14.
--
-- Scope: everything under schema "public" only — tables, views (including
-- raffles_compat and tickets_compat), sequences, column defaults, indexes,
-- constraints (PK/UNIQUE/CHECK/FK), triggers, trigger functions, RLS enable
-- statements and RLS policies.
--
-- Deliberately removed from the original dump (do not re-add):
--   - CREATE ROLE / ALTER ROLE for anon, authenticated, service_role,
--     supabase_admin, authenticator, etc. — a new Supabase project already
--     has these roles.
--   - CREATE SCHEMA auth / storage / extensions / graphql / realtime / vault
--     / pgbouncer, and every object defined inside them — a new Supabase
--     project already provides these. This file only ever REFERENCES them
--     (auth.uid(), auth.jwt(), auth.role(), auth.users), never redefines them.
--   - Every "ALTER ... OWNER TO ...;" statement (postgres/supabase_admin
--     ownership is assigned automatically in a new project; the SQL Editor
--     role cannot reassign ownership to those roles anyway).
--   - Every GRANT/REVOKE and "Type: ACL" / "Type: DEFAULT ACL" block —
--     default privileges on a new Supabase project already match these.
--   - CREATE EXTENSION statements: the dump only relies on gen_random_uuid(),
--     which pgcrypto provides — already enabled by default on new Supabase
--     projects. No custom type/enum/extension is used by public schema
--     objects, so nothing else was needed here.
--
-- This file contains NO DATA (no COPY/INSERT). See the companion data file
-- (if you asked for one) for row data — that file contains REAL production
-- PII and live payment-provider credentials and must be handled separately.
--
-- Run once, top to bottom, in the SQL Editor of a brand-new, empty Supabase
-- project. Wrapped in a single transaction: if anything fails, nothing is
-- left half-applied.
-- =============================================================================

BEGIN;

--
-- Name: create_tickets_for_raffle(uuid, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_tickets_for_raffle(p_raffle_id uuid, p_total integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  insert into tickets (raffle_id, number, status)
  select p_raffle_id, g, 'available'
  from generate_series(1, p_total) as g;
end;
$$;



--
-- Name: rifex_set_creator_defaults(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.rifex_set_creator_defaults() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  jwt jsonb := null;
  jwt_email text := null;
begin
  -- Obtener email desde el JWT (si existe)
  begin
    jwt := current_setting('request.jwt.claims', true)::jsonb;
    if jwt ? 'email' then
      jwt_email := jwt->>'email';
    end if;
  exception when others then
    jwt_email := null;
  end;

  if NEW.creator_id is null then
    NEW.creator_id := auth.uid();
  end if;

  if NEW.creator_email is null then
    NEW.creator_email := coalesce(jwt_email, NEW.creator_email);
  end if;

  return NEW;
end;
$$;



--
-- Name: set_bank_account_owner(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_bank_account_owner() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  new.user_id := auth.uid();  -- pisa lo que venga del cliente
  return new;
end;
$$;



--
-- Name: set_creator_fields(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_creator_fields() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_email text;
begin
  -- Si no vino, toma el UID del token
  if new.creator_id is null then
    new.creator_id := auth.uid();
  end if;

  -- Completa el email del creador desde auth.users
  if (new.creator_email is null or new.creator_email = '')
     and new.creator_id is not null then
    select email into v_email from auth.users where id = new.creator_id;
    new.creator_email := v_email;
  end if;

  return new;
end $$;



--
-- Name: set_raffle_creator_from_jwt(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_raffle_creator_from_jwt() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_email text;
  v_uid uuid;
begin
  if TG_OP = 'INSERT' then
    -- Email desde el JWT
    if NEW.creator_email is null then
      begin
        v_email := auth.jwt() ->> 'email';
        if v_email is not null then
          NEW.creator_email := v_email;
        end if;
      exception
        when others then
          -- ignoramos cualquier error al leer el JWT
          null;
      end;
    end if;

    -- UID desde el JWT
    if NEW.creator_id is null then
      begin
        v_uid := auth.uid();
        if v_uid is not null then
          NEW.creator_id := v_uid;
        end if;
      exception
        when others then
          null;
      end;
    end if;
  end if;

  return NEW;
end;
$$;



--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  new.updated_at = now();
  return new;
end$$;



--
-- Name: bank_accounts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.bank_accounts (
    user_id uuid NOT NULL,
    holder_name text NOT NULL,
    tax_id text,
    bank_name text,
    account_type text DEFAULT 'corriente'::text,
    account_number text,
    payout_email text,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT bank_accounts_account_type_check CHECK ((account_type = ANY (ARRAY['corriente'::text, 'vista'::text, 'ahorro'::text]))),
    CONSTRAINT bank_accounts_email_chk CHECK ((payout_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'::text))
);



--
-- Name: email_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.email_logs (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    type text NOT NULL,
    mp_payment_id text,
    purchase_id text,
    raffle_id text,
    to_email text,
    status text,
    reason text,
    payload jsonb
);



--
-- Name: email_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.email_logs ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.email_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: merchant_gateways; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.merchant_gateways (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider text NOT NULL,
    public_key text,
    access_token text,
    webhook_secret text,
    status text DEFAULT 'not_started'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    mp_user_id text,
    linked_email text,
    linked_uid uuid,
    mp_public_key text,
    mp_access_token text,
    mp_refresh_token text,
    scope text,
    live_mode boolean DEFAULT false,
    revoked_at timestamp with time zone,
    expires_at timestamp with time zone,
    refresh_token text
);



--
-- Name: mp_accounts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.mp_accounts (
    mp_user_id text NOT NULL,
    access_token text NOT NULL,
    refresh_token text,
    public_key text,
    token_type text,
    scope text,
    live_mode boolean DEFAULT false,
    nickname text,
    email text,
    linked_email text,
    linked_uid text,
    expires_in integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);



--
-- Name: mp_links; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.mp_links (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    mp_user_id text,
    public_key text,
    access_token text,
    refresh_token text,
    scope text,
    token_type text,
    expires_in integer,
    status text DEFAULT 'connected'::text,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);



--
-- Name: mp_links_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.mp_links_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;



--
-- Name: mp_links_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.mp_links_id_seq OWNED BY public.mp_links.id;


--
-- Name: mp_oauth_state; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.mp_oauth_state (
    id text NOT NULL,
    code_verifier text NOT NULL,
    creator_email text,
    uid text,
    created_at timestamp with time zone DEFAULT now()
);



--
-- Name: payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payments (
    id bigint NOT NULL,
    mp_payment_id text,
    status text,
    collector_id bigint,
    external_reference text,
    preference_id text,
    amount numeric,
    currency text,
    payer_email text,
    raw jsonb,
    created_at timestamp with time zone DEFAULT now(),
    purchase_id uuid,
    status_detail text,
    emailed_buyer boolean DEFAULT false,
    emailed_creator boolean DEFAULT false,
    raffle_id uuid,
    buyer_email text,
    buyer_name text,
    amount_cents integer,
    numbers integer[] DEFAULT '{}'::integer[] NOT NULL,
    live_mode boolean,
    via text
);



--
-- Name: payments_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.payments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;



--
-- Name: payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.payments_id_seq OWNED BY public.payments.id;


--
-- Name: purchases; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.purchases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    raffle_id uuid,
    buyer_email text,
    mp_payment_id text,
    mp_preference_id text,
    status text DEFAULT 'initiated'::text NOT NULL,
    numbers integer[] NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    accepted_terms boolean DEFAULT false,
    accepted_terms_at timestamp with time zone,
    terms_version text,
    buyer_name text,
    holds_until timestamp with time zone,
    paid_at timestamp with time zone
);



--
-- Name: raffle_results; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.raffle_results (
    raffle_id uuid NOT NULL,
    number integer NOT NULL,
    buyer_email text,
    buyer_name text,
    purchase_id uuid,
    created_at timestamp with time zone DEFAULT now()
);



--
-- Name: raffles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.raffles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    price_cents integer NOT NULL,
    total_numbers integer NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    description text,
    plan text DEFAULT 'free'::text,
    theme text DEFAULT 'mixto'::text,
    prize_type text DEFAULT 'money'::text,
    prize_amount_cents integer,
    payout_method text,
    delivery_method text,
    prize_photos text[],
    start_date date,
    end_date date,
    status text DEFAULT 'draft'::text,
    creator_email text,
    creator_id uuid
);



--
-- Name: rifas; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.rifas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    creador_id uuid,
    titulo text NOT NULL,
    descripcion text,
    tipo_premio text DEFAULT 'dinero'::text,
    precio_clp integer NOT NULL,
    cupos integer NOT NULL,
    temas text[],
    inicio date,
    termino date,
    estado text DEFAULT 'borrador'::text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT rifas_estado_check CHECK ((estado = ANY (ARRAY['borrador'::text, 'publicada'::text, 'cerrada'::text]))),
    CONSTRAINT rifas_tipo_premio_check CHECK ((tipo_premio = ANY (ARRAY['dinero'::text, 'fisico'::text])))
);



--
-- Name: raffles_compat; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.raffles_compat WITH (security_invoker='on') AS
 SELECT id,
    titulo AS title,
    descripcion AS description,
    (COALESCE(precio_clp, 0) * 100) AS price_cents,
    NULL::integer AS prize_amount_cents,
    cupos AS total_numbers,
        CASE
            WHEN ((temas IS NULL) OR (array_length(temas, 1) = 0)) THEN 'Mixto'::text
            ELSE temas[1]
        END AS theme,
    estado AS status,
    termino AS end_date,
    inicio AS start_date,
    creador_id AS creator_id,
    created_at
   FROM public.rifas r;



--
-- Name: rifa_tickets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.rifa_tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rifa_id uuid,
    num integer NOT NULL,
    status text DEFAULT 'free'::text NOT NULL,
    holder_user uuid,
    payment_ref text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT rifa_tickets_status_check CHECK ((status = ANY (ARRAY['free'::text, 'reserved'::text, 'paid'::text])))
);



--
-- Name: tickets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    raffle_id uuid,
    number integer NOT NULL,
    status text DEFAULT 'available'::text NOT NULL,
    purchase_id uuid,
    hold_until timestamp with time zone
);



--
-- Name: tickets_compat; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.tickets_compat WITH (security_invoker='on') AS
 SELECT id,
    rifa_id AS raffle_id,
    num AS number,
        CASE status
            WHEN 'free'::text THEN 'available'::text
            WHEN 'reserved'::text THEN 'pending'::text
            WHEN 'paid'::text THEN 'sold'::text
            ELSE 'available'::text
        END AS status,
    holder_user,
    payment_ref,
    created_at
   FROM public.rifa_tickets t;



--
-- Name: users_profile; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users_profile (
    user_id uuid NOT NULL,
    nombre text,
    rut text,
    plan text DEFAULT 'free'::text,
    created_at timestamp with time zone DEFAULT now()
);



--
-- Name: webhook_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.webhook_events (
    id bigint NOT NULL,
    provider text DEFAULT 'mercadopago'::text NOT NULL,
    event_type text,
    payment_id text,
    live_mode boolean,
    payload jsonb NOT NULL,
    headers jsonb,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    event_id text
);



--
-- Name: webhook_events_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.webhook_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;



--
-- Name: webhook_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.webhook_events_id_seq OWNED BY public.webhook_events.id;


--
-- Name: mp_links id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mp_links ALTER COLUMN id SET DEFAULT nextval('public.mp_links_id_seq'::regclass);


--
-- Name: payments id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments ALTER COLUMN id SET DEFAULT nextval('public.payments_id_seq'::regclass);


--
-- Name: webhook_events id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.webhook_events ALTER COLUMN id SET DEFAULT nextval('public.webhook_events_id_seq'::regclass);


--
-- Name: bank_accounts bank_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_pkey PRIMARY KEY (user_id);


--
-- Name: bank_accounts bank_accounts_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_user_id_unique UNIQUE (user_id);


--
-- Name: email_logs email_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.email_logs
    ADD CONSTRAINT email_logs_pkey PRIMARY KEY (id);


--
-- Name: merchant_gateways merchant_gateways_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.merchant_gateways
    ADD CONSTRAINT merchant_gateways_pkey PRIMARY KEY (id);


--
-- Name: merchant_gateways merchant_gateways_user_id_provider_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.merchant_gateways
    ADD CONSTRAINT merchant_gateways_user_id_provider_key UNIQUE (user_id, provider);


--
-- Name: mp_accounts mp_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mp_accounts
    ADD CONSTRAINT mp_accounts_pkey PRIMARY KEY (mp_user_id);


--
-- Name: mp_links mp_links_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mp_links
    ADD CONSTRAINT mp_links_pkey PRIMARY KEY (id);


--
-- Name: mp_oauth_state mp_oauth_state_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mp_oauth_state
    ADD CONSTRAINT mp_oauth_state_pkey PRIMARY KEY (id);


--
-- Name: payments payments_mp_payment_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_mp_payment_id_key UNIQUE (mp_payment_id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: purchases purchases_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_pkey PRIMARY KEY (id);


--
-- Name: raffle_results raffle_results_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.raffle_results
    ADD CONSTRAINT raffle_results_pkey PRIMARY KEY (raffle_id);


--
-- Name: raffles raffles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.raffles
    ADD CONSTRAINT raffles_pkey PRIMARY KEY (id);


--
-- Name: rifa_tickets rifa_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rifa_tickets
    ADD CONSTRAINT rifa_tickets_pkey PRIMARY KEY (id);


--
-- Name: rifa_tickets rifa_tickets_rifa_id_num_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rifa_tickets
    ADD CONSTRAINT rifa_tickets_rifa_id_num_key UNIQUE (rifa_id, num);


--
-- Name: rifas rifas_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rifas
    ADD CONSTRAINT rifas_pkey PRIMARY KEY (id);


--
-- Name: tickets tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_pkey PRIMARY KEY (id);


--
-- Name: tickets tickets_raffle_id_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_raffle_id_number_key UNIQUE (raffle_id, number);


--
-- Name: users_profile users_profile_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users_profile
    ADD CONSTRAINT users_profile_pkey PRIMARY KEY (user_id);


--
-- Name: webhook_events webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.webhook_events
    ADD CONSTRAINT webhook_events_pkey PRIMARY KEY (id);


--
-- Name: bank_accounts_updated_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX bank_accounts_updated_at_idx ON public.bank_accounts USING btree (updated_at DESC);


--
-- Name: bank_accounts_user_id_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX bank_accounts_user_id_key ON public.bank_accounts USING btree (user_id);


--
-- Name: email_logs_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX email_logs_created_at_idx ON public.email_logs USING btree (created_at DESC);


--
-- Name: mp_links_user_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX mp_links_user_idx ON public.mp_links USING btree (user_id);


--
-- Name: payments_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX payments_created_at_idx ON public.payments USING btree (created_at);


--
-- Name: payments_live_mode_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX payments_live_mode_idx ON public.payments USING btree (live_mode);


--
-- Name: payments_mp_payment_id_uindex; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX payments_mp_payment_id_uindex ON public.payments USING btree (mp_payment_id);


--
-- Name: payments_purchase_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX payments_purchase_id_idx ON public.payments USING btree (purchase_id);


--
-- Name: payments_raffle_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX payments_raffle_id_idx ON public.payments USING btree (raffle_id);


--
-- Name: payments_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX payments_status_idx ON public.payments USING btree (status);


--
-- Name: purchases_holds_until_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX purchases_holds_until_idx ON public.purchases USING btree (holds_until);


--
-- Name: purchases_terms_accepted_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX purchases_terms_accepted_idx ON public.purchases USING btree (accepted_terms, accepted_terms_at);


--
-- Name: tickets_hold_until_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX tickets_hold_until_idx ON public.tickets USING btree (hold_until);


--
-- Name: tickets_purchase_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX tickets_purchase_id_idx ON public.tickets USING btree (purchase_id);


--
-- Name: tickets_raffle_number_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX tickets_raffle_number_unique ON public.tickets USING btree (raffle_id, number);


--
-- Name: users_profile_rut_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX users_profile_rut_key ON public.users_profile USING btree (rut);


--
-- Name: webhook_events_event_id_u; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX webhook_events_event_id_u ON public.webhook_events USING btree (event_id);


--
-- Name: webhook_events_live_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX webhook_events_live_idx ON public.webhook_events USING btree (live_mode);


--
-- Name: webhook_events_payment_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX webhook_events_payment_idx ON public.webhook_events USING btree (payment_id);


--
-- Name: webhook_events_received_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX webhook_events_received_idx ON public.webhook_events USING btree (received_at);


--
-- Name: bank_accounts tr_set_bank_account_owner; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER tr_set_bank_account_owner BEFORE INSERT OR UPDATE ON public.bank_accounts FOR EACH ROW EXECUTE FUNCTION public.set_bank_account_owner();


--
-- Name: raffles trg_raffles_set_creator; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_raffles_set_creator BEFORE INSERT ON public.raffles FOR EACH ROW EXECUTE FUNCTION public.set_raffle_creator_from_jwt();


--
-- Name: raffles trg_rifex_set_creator_defaults; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_rifex_set_creator_defaults BEFORE INSERT ON public.raffles FOR EACH ROW EXECUTE FUNCTION public.rifex_set_creator_defaults();


--
-- Name: raffles trg_set_creator_fields; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_set_creator_fields BEFORE INSERT ON public.raffles FOR EACH ROW EXECUTE FUNCTION public.set_creator_fields();


--
-- Name: users_profile trg_users_profile_updated; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_users_profile_updated BEFORE UPDATE ON public.users_profile FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: bank_accounts bank_accounts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: merchant_gateways merchant_gateways_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.merchant_gateways
    ADD CONSTRAINT merchant_gateways_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: mp_links mp_links_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mp_links
    ADD CONSTRAINT mp_links_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: payments payments_purchase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES public.purchases(id) ON DELETE SET NULL;


--
-- Name: purchases purchases_raffle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_raffle_id_fkey FOREIGN KEY (raffle_id) REFERENCES public.raffles(id) ON DELETE CASCADE;


--
-- Name: rifa_tickets rifa_tickets_holder_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rifa_tickets
    ADD CONSTRAINT rifa_tickets_holder_user_fkey FOREIGN KEY (holder_user) REFERENCES auth.users(id);


--
-- Name: rifa_tickets rifa_tickets_rifa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rifa_tickets
    ADD CONSTRAINT rifa_tickets_rifa_id_fkey FOREIGN KEY (rifa_id) REFERENCES public.rifas(id) ON DELETE CASCADE;


--
-- Name: rifas rifas_creador_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rifas
    ADD CONSTRAINT rifas_creador_id_fkey FOREIGN KEY (creador_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: tickets tickets_raffle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_raffle_id_fkey FOREIGN KEY (raffle_id) REFERENCES public.raffles(id) ON DELETE CASCADE;


--
-- Name: users_profile users_profile_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users_profile
    ADD CONSTRAINT users_profile_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: bank_accounts ba_del_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY ba_del_own ON public.bank_accounts FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: bank_accounts ba_ins_any; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY ba_ins_any ON public.bank_accounts FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: bank_accounts ba_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY ba_insert ON public.bank_accounts FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: bank_accounts ba_sel_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY ba_sel_own ON public.bank_accounts FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: bank_accounts ba_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY ba_select ON public.bank_accounts FOR SELECT TO authenticated, anon USING ((auth.uid() = user_id));


--
-- Name: bank_accounts ba_upd_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY ba_upd_own ON public.bank_accounts FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK (true);


--
-- Name: bank_accounts ba_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY ba_update ON public.bank_accounts FOR UPDATE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: bank_accounts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: email_logs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: merchant_gateways manage own gateways; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "manage own gateways" ON public.merchant_gateways USING ((auth.uid() = user_id));


--
-- Name: merchant_gateways; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.merchant_gateways ENABLE ROW LEVEL SECURITY;

--
-- Name: merchant_gateways mg owner read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "mg owner read" ON public.merchant_gateways FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: merchant_gateways mg owner upsert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "mg owner upsert" ON public.merchant_gateways USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: merchant_gateways mg_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY mg_read ON public.merchant_gateways FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: merchant_gateways mgw_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY mgw_select_own ON public.merchant_gateways FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: merchant_gateways mgw_update_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY mgw_update_own ON public.merchant_gateways FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: merchant_gateways mgw_upsert_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY mgw_upsert_own ON public.merchant_gateways FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: mp_accounts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.mp_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: mp_links; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.mp_links ENABLE ROW LEVEL SECURITY;

--
-- Name: mp_links mp_links_insert_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY mp_links_insert_own ON public.mp_links FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: mp_links mp_links_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY mp_links_select_own ON public.mp_links FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: mp_links mp_links_update_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY mp_links_update_own ON public.mp_links FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: mp_oauth_state; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.mp_oauth_state ENABLE ROW LEVEL SECURITY;

--
-- Name: users_profile owner rw profile; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "owner rw profile" ON public.users_profile USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: rifas owners manage rifas; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "owners manage rifas" ON public.rifas USING ((auth.uid() = creador_id)) WITH CHECK ((auth.uid() = creador_id));


--
-- Name: payments pay_select_srv; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY pay_select_srv ON public.payments FOR SELECT USING ((auth.role() = 'service_role'::text));


--
-- Name: payments pay_write_srv; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY pay_write_srv ON public.payments USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: payments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

--
-- Name: users_profile profile_insert_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY profile_insert_own ON public.users_profile FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: users_profile profile_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY profile_select_own ON public.users_profile FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: users_profile profile_update_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY profile_update_own ON public.users_profile FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: rifas public rifas read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "public rifas read" ON public.rifas FOR SELECT USING ((estado = 'publicada'::text));


--
-- Name: purchases; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

--
-- Name: raffle_results; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.raffle_results ENABLE ROW LEVEL SECURITY;

--
-- Name: raffles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.raffles ENABLE ROW LEVEL SECURITY;

--
-- Name: raffles raffles_delete_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY raffles_delete_own ON public.raffles FOR DELETE TO authenticated USING (((creator_id = auth.uid()) OR (creator_email = (auth.jwt() ->> 'email'::text))));


--
-- Name: raffles raffles_insert_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY raffles_insert_own ON public.raffles FOR INSERT TO authenticated WITH CHECK (((creator_id = auth.uid()) OR (creator_email = (auth.jwt() ->> 'email'::text))));


--
-- Name: raffles raffles_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY raffles_select_own ON public.raffles FOR SELECT TO authenticated USING (((creator_id = auth.uid()) OR (creator_email = (auth.jwt() ->> 'email'::text))));


--
-- Name: raffles raffles_select_public_active; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY raffles_select_public_active ON public.raffles FOR SELECT TO anon USING ((status = ANY (ARRAY['active'::text, 'closed'::text])));


--
-- Name: raffles raffles_select_public_active_auth; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY raffles_select_public_active_auth ON public.raffles FOR SELECT TO authenticated USING ((status = ANY (ARRAY['active'::text, 'closed'::text])));


--
-- Name: raffles raffles_update_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY raffles_update_own ON public.raffles FOR UPDATE TO authenticated USING (((creator_id = auth.uid()) OR (creator_email = (auth.jwt() ->> 'email'::text)))) WITH CHECK (((creator_id = auth.uid()) OR (creator_email = (auth.jwt() ->> 'email'::text))));


--
-- Name: rifa_tickets; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.rifa_tickets ENABLE ROW LEVEL SECURITY;

--
-- Name: rifa_tickets rifa_tickets_public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY rifa_tickets_public_read ON public.rifa_tickets FOR SELECT TO anon USING (true);


--
-- Name: rifas; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.rifas ENABLE ROW LEVEL SECURITY;

--
-- Name: rifas rifas_public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY rifas_public_read ON public.rifas FOR SELECT TO anon USING (true);


--
-- Name: mp_links select own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "select own" ON public.mp_links FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: merchant_gateways select own gateways; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "select own gateways" ON public.merchant_gateways FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: tickets; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

--
-- Name: rifa_tickets tickets insert own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "tickets insert own" ON public.rifa_tickets FOR INSERT WITH CHECK (((auth.role() = 'service_role'::text) OR (holder_user = auth.uid())));


--
-- Name: rifa_tickets tickets read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "tickets read" ON public.rifa_tickets FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.rifas r
  WHERE ((r.id = rifa_tickets.rifa_id) AND ((r.estado = 'publicada'::text) OR (r.creador_id = auth.uid()))))));


--
-- Name: rifa_tickets tickets upsert own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "tickets upsert own" ON public.rifa_tickets FOR UPDATE USING (((auth.role() = 'service_role'::text) OR (holder_user = auth.uid()))) WITH CHECK (((auth.role() = 'service_role'::text) OR (holder_user = auth.uid())));


--
-- Name: tickets tickets_select_creator; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tickets_select_creator ON public.tickets FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.raffles r
  WHERE ((r.id = tickets.raffle_id) AND ((r.creator_id = auth.uid()) OR (r.creator_email = (auth.jwt() ->> 'email'::text)))))));


--
-- Name: tickets tickets_select_public_by_raffle; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tickets_select_public_by_raffle ON public.tickets FOR SELECT TO anon USING ((EXISTS ( SELECT 1
   FROM public.raffles r
  WHERE ((r.id = tickets.raffle_id) AND (r.status = ANY (ARRAY['active'::text, 'closed'::text]))))));


--
-- Name: tickets tickets_select_public_by_raffle_auth; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tickets_select_public_by_raffle_auth ON public.tickets FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.raffles r
  WHERE ((r.id = tickets.raffle_id) AND (r.status = ANY (ARRAY['active'::text, 'closed'::text]))))));


--
-- Name: mp_links upsert own insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "upsert own insert" ON public.mp_links FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: mp_links upsert own update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "upsert own update" ON public.mp_links FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: users_profile; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.users_profile ENABLE ROW LEVEL SECURITY;

--
-- Name: webhook_events we_select_srv; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY we_select_srv ON public.webhook_events FOR SELECT USING ((auth.role() = 'service_role'::text));


--
-- Name: webhook_events we_write_srv; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY we_write_srv ON public.webhook_events USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: webhook_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;


COMMIT;

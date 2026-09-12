-- db/migrations/2026-09-12_admin_analytics_v1.sql
-- RIFEX ADMIN ANALYTICS — analítica propia, primera parte (registro de
-- eventos de visita/interacción). Aplicar SOLO contra rifex-dev — jamás
-- PROD (ver mandato "CODE — RIFEX ADMIN ANALYTICS + MODO MANTENIMIENTO",
-- corrección de alcance 2026-09-12: analytics sí se implementa, modo
-- mantenimiento se canceló por completo).
--
-- DECISIÓN DE DISEÑO (documentada, no trivial): esta tabla NUNCA guarda
-- "payment_approved". El mandato exige que una conversión de pago se
-- confirme "desde una fuente servidor confiable; nunca aceptar
-- payment_approved declarado libremente por el navegador". La opción más
-- segura para no tocar Payment Engine/checkout/webhook en absoluto (cero
-- líneas modificadas ahí, mandato explícito) es NO escribir el evento de
-- pago acá — en su lugar, el dashboard admin calcula "pagos aprobados" y
-- la conversión checkout_start -> pago leyendo DIRECTO de las tablas ya
-- autoritativas (payments, colecta_contributions, event_orders), exactamente
-- como ya hace src/pages/api/admin/metrics.js. Esto es además más fiel al
-- principio "no duplicar métricas que ya existan".
--
-- Tampoco se registran aquí qr_scan/qr_response: Medidor QR ya tiene su
-- propia instrumentación autoritativa (medidor_qr_visits,
-- medidor_qr_responses, medidores_qr.scan_count) desde 2026-09-08 — el
-- dashboard admin lee esas tablas directo para ese módulo, sin duplicar.
--
-- Eventos que SÍ viven acá (todos disparables solo por el propio visitante,
-- sin afirmar nada financiero): page_view, cta_click, form_start,
-- form_complete, checkout_start. Aplica a Rifas, Campañas, Eventos e
-- Inscripciones (los 4 módulos con página pública propia).
--
-- Privacidad (mandato explícito): sin IP completa, sin nombres/correos/
-- teléfonos, sin contenido de formularios, sin tokens. `visitor_id` es un
-- UUID propio (cookie de primera parte), nunca ligado a auth.users incluso
-- si el visitante está logueado. Retención documentada: 13 meses (ver
-- comentario en la columna created_at) — sin cron de purga automática en
-- esta primera versión (pendiente, ver informe final).
create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),

  -- Módulo + entidad: nunca "libre" — CHECK explícito para que un typo o
  -- un payload malicioso no pueda crear un módulo inventado en los datos.
  module text not null check (module in ('raffle', 'campaign', 'event', 'registration')),
  entity_id uuid not null,

  event_type text not null check (event_type in (
    'page_view', 'cta_click', 'form_start', 'form_complete', 'checkout_start'
  )),

  -- Visitante pseudónimo (cookie propia, ver src/lib/analyticsClient.js) —
  -- nunca el user_id real de auth.users, ni siquiera si hay sesión.
  visitor_id uuid not null,

  -- Contexto mínimo, saneado server-side antes de insertar (nunca crudo
  -- del navegador) — ver src/pages/api/analytics/track.js.
  referrer_host text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  device_category text not null default 'unknown' check (device_category in ('mobile', 'tablet', 'desktop', 'unknown')),
  traffic_type text not null default 'human' check (traffic_type in ('human', 'bot', 'internal')),

  -- Aislamiento DEV/PROD real: cada entorno tiene su propia base de datos
  -- Supabase (rifex-dev vs PROD) — esta columna es solo trazabilidad
  -- adicional, nunca la autoridad de aislamiento (esa ya la da la base
  -- separada en sí). Ver src/lib/environmentPolicy.js#getStage().
  environment text not null check (environment in ('development', 'production')),

  extra jsonb,

  -- Retención documentada: 13 meses desde created_at (ver informe final —
  -- purga manual por ahora, cron de limpieza queda como pendiente).
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_module_entity_idx on public.analytics_events(module, entity_id, created_at);
create index if not exists analytics_events_type_created_idx on public.analytics_events(event_type, created_at);
create index if not exists analytics_events_visitor_idx on public.analytics_events(visitor_id, event_type, module, entity_id, created_at);

-- RLS: mismo criterio que las 4 tablas de instrumentación de Medidor QR
-- (2026-09-08) — revoke all de public/anon/authenticated. Toda escritura
-- pasa por /api/analytics/track (service_role, con rate limit + validación
-- estricta de payload); toda lectura admin pasa por /api/admin/* (también
-- service_role, gateado por resolveAdmin).
alter table public.analytics_events enable row level security;
revoke all on public.analytics_events from public, anon, authenticated;

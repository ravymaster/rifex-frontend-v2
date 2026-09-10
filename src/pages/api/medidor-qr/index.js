// src/pages/api/medidor-qr/index.js
// MEDIDOR QR V1 — POST únicamente: crear un Medidor QR. Identidad
// SIEMPRE derivada de auth.getUser(token) — nunca de un organizer_id
// que mande el cliente. Onboarding: assertOnboardingComplete (TRUST-1,
// general) — NUNCA assertCreatorEligible/Country Gate, mismo criterio
// que Inscripciones (este módulo vive fuera del onboarding financiero).
//
// Cuota mensual (FREE QUOTA ADJUSTMENT 2026-09-09: 10/mes, antes 1):
// REUSE DIRECT de currentFreePeriodKey/nextFreePeriodStartsAt
// (registrationFreeQuota.js, ya certificado en Inscripciones) — nunca
// un segundo cálculo de período. La autoridad real de "cuánto se usó
// este mes" es exclusivamente la RPC create_medidor_qr (conteo bajo
// advisory lock transaccional sobre medidor_qr_free_usage, ver
// db/migrations/2026-09-09_medidor_qr_free_quota_10.sql), nunca una
// validación previa en esta ruta que pudiera desincronizarse bajo
// concurrencia (ver prueba adversarial de carrera real en 9/10).
import { createClient } from '@supabase/supabase-js';
import { assertOnboardingComplete, getOnboardingRecord } from '@/lib/trustOnboardingGate';
import { enforceRateLimit } from '@/lib/rateLimit';
import { currentFreePeriodKey, nextFreePeriodStartsAt } from '@/lib/registrationFreeQuota';
import { MEDIDOR_QR_FREE_QUOTA_LIMIT } from '@/lib/medidorQrQuota';
import { slugify } from '@/lib/slugify';
import { parseSafeExternalUrl } from '@/lib/safeExternalUrl';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const MAX_NAME = 120;
const MAX_QUESTION = 300;
const MAX_OPTION = 80;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 4;
const MAX_DESTINATION_LABEL = 60;
const MAX_SLUG_ATTEMPTS = 5;

async function getRequester(req) {
  const authz = req.headers.authorization || '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : null;
  if (!token) return null;
  const { data: ures, error } = await supabase.auth.getUser(token);
  if (error || !ures?.user) return null;
  return ures.user;
}

function deriveOrganizerNameSnapshot(record) {
  if (!record) return null;
  if (record.account_type === 'organization' && record.organization_name) return record.organization_name;
  if (record.person_name) return record.person_name;
  return record.organization_name || null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  try {
    const user = await getRequester(req);
    if (!user) return res.status(401).json({ ok: false, error: 'missing_auth' });

    if (await enforceRateLimit(req, res, { key: `medidor-qr-create:${user.id}`, maxHits: 10, windowSeconds: 60 })) return;

    const onboarding = await assertOnboardingComplete(user.id);
    if (!onboarding.ok) return res.status(403).json({ ok: false, error: onboarding.reason, message: onboarding.message });

    const body = req.body || {};

    // EXTENSIÓN FINAL — ESCALABILIDAD E INTEGRIDAD V1 (punto 3): nombre
    // interno, siempre distinto de la pregunta pública.
    const name = String(body.name || '').trim();
    if (!name || name.length > MAX_NAME) return res.status(400).json({ ok: false, error: 'invalid_name' });

    const question = String(body.question || '').trim();
    if (!question || question.length > MAX_QUESTION) return res.status(400).json({ ok: false, error: 'invalid_question' });

    const rawOptions = Array.isArray(body.options) ? body.options : [];
    const options = rawOptions.map((o) => String(o || '').trim()).filter(Boolean);
    if (options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) {
      return res.status(400).json({ ok: false, error: 'invalid_options_count' });
    }
    if (options.some((o) => o.length > MAX_OPTION)) {
      return res.status(400).json({ ok: false, error: 'invalid_option_length' });
    }
    // Duplicados triviales (mismo texto, insensible a mayúsculas/espacios).
    const normalized = options.map((o) => o.toLowerCase());
    if (new Set(normalized).size !== normalized.length) {
      return res.status(400).json({ ok: false, error: 'duplicate_options' });
    }

    const measurementStart = body.measurement_start ? new Date(body.measurement_start) : null;
    const measurementEnd = body.measurement_end ? new Date(body.measurement_end) : null;
    if (!measurementStart || Number.isNaN(measurementStart.getTime())) {
      return res.status(400).json({ ok: false, error: 'invalid_measurement_start' });
    }
    if (!measurementEnd || Number.isNaN(measurementEnd.getTime())) {
      return res.status(400).json({ ok: false, error: 'invalid_measurement_end' });
    }
    if (measurementEnd.getTime() <= measurementStart.getTime()) {
      return res.status(400).json({ ok: false, error: 'measurement_end_before_start' });
    }

    // Destino opcional (extensión del mandato) — validado server-side
    // ANTES de llegar a la RPC. Nunca esquemas peligrosos (ver
    // safeExternalUrl.js): solo http/https reales.
    let destinationUrl = null;
    let destinationButtonLabel = null;
    if (body.destination_url) {
      const parsed = parseSafeExternalUrl(body.destination_url);
      if (!parsed.ok) return res.status(400).json({ ok: false, error: `invalid_destination_url:${parsed.error}` });
      destinationUrl = parsed.href;
      destinationButtonLabel = body.destination_button_label ? String(body.destination_button_label).trim().slice(0, MAX_DESTINATION_LABEL) : null;
    }

    const onboardingRecord = await getOnboardingRecord(user.id);
    const organizerNameSnapshot = deriveOrganizerNameSnapshot(onboardingRecord);
    const periodKey = currentFreePeriodKey(new Date());
    const baseSlug = slugify(question);

    let created = null;
    let lastError = null;
    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
      const slug = attempt === 0 ? baseSlug : `${baseSlug}-${Math.random().toString(36).slice(2, 5)}`;
      const { data: result, error: rpcErr } = await supabase.rpc('create_medidor_qr', {
        p_organizer_id: user.id,
        p_period_key: periodKey,
        p_organizer_name_snapshot: organizerNameSnapshot,
        p_name: name,
        p_question: question,
        p_options: options,
        p_measurement_start: measurementStart.toISOString(),
        p_measurement_end: measurementEnd.toISOString(),
        p_destination_url: destinationUrl,
        p_destination_button_label: destinationButtonLabel,
        p_slug: slug,
      });

      if (rpcErr) {
        // Defensivo: con el mecanismo actual (conteo bajo advisory lock
        // ANTES de insertar nada, ver la migración) la RPC ya no
        // levanta una excepción de Postgres por cuota agotada — la
        // rechaza con un {ok:false} normal, manejado más abajo. Esta
        // rama queda solo para errores realmente inesperados.
        throw rpcErr;
      }

      if (result?.ok) { created = result.medidor; lastError = null; break; }
      if (result?.error === 'slug_collision') { lastError = result.error; continue; }
      if (result?.error === 'free_quota_already_used') {
        return res.status(409).json({
          ok: false,
          error: 'free_quota_already_used',
          message: `Ya utilizaste tus ${MEDIDOR_QR_FREE_QUOTA_LIMIT} Medidores QR gratuitos de este período.`,
          quota_limit: MEDIDOR_QR_FREE_QUOTA_LIMIT,
          next_available_at: nextFreePeriodStartsAt(new Date()).toISOString(),
        });
      }
      // invalid_options u otro error de validación server-side.
      return res.status(400).json({ ok: false, error: result?.error || 'invalid_request' });
    }

    if (!created) throw new Error(lastError || 'slug_generation_failed');

    return res.status(201).json({ ok: true, medidor: created });
  } catch (e) {
    console.error('[api/medidor-qr] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}

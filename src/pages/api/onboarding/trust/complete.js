// src/pages/api/onboarding/trust/complete.js
// TRUST-1 — POST: guarda avance del onboarding universal (parcial o
// total) del usuario autenticado. Nunca acepta onboarding_completed_at,
// user_id, ni account_type desde el body — solo los campos base;
// "completo" y account_type se calculan siempre server-side desde el
// resultado real, ver src/lib/trustOnboardingGate.js.
//
// Corrección canónica (2026-08-27): person_name/organization_name
// reemplazan legal_name+account_type; adult_declared (booleano
// versionado) reemplaza birth_date por completo — nunca una fecha,
// nunca una edad calculada.
import { createClient } from '@supabase/supabase-js';
import { enforceRateLimit, resolveClientIp } from '@/lib/rateLimit';
import {
  validateOnboardingFields,
  isOnboardingComplete,
  missingOnboardingFields,
  CURRENT_TERMS_VERSION,
  CURRENT_PRIVACY_VERSION,
  CURRENT_ADULT_DECLARATION_VERSION,
} from '@/lib/trustOnboardingPolicy';
import { upsertOnboardingFields } from '@/lib/trustOnboardingGate';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// Solo estos nombres pueden llegar del cliente — cualquier otra clave en
// el body (incluida cualquier variante de "onboarding_completed_at",
// "user_id" o "account_type") se ignora silenciosamente, nunca se
// refleja en el upsert.
const ALLOWED_FIELDS = ['person_name', 'organization_name', 'phone', 'adult_declared', 'terms_accepted', 'privacy_accepted'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  try {
    const authz = req.headers.authorization || '';
    const token = authz.startsWith('Bearer ') ? authz.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, error: 'missing_auth' });

    const { data: ures, error: uerr } = await supabase.auth.getUser(token);
    if (uerr || !ures?.user) return res.status(401).json({ ok: false, error: 'invalid_auth' });
    const uid = ures.user.id;

    const ip = resolveClientIp(req);
    if (await enforceRateLimit(req, res, { key: `trust-onboarding-complete:${uid}`, maxHits: 20, windowSeconds: 60 })) return;

    const { data: profile } = await supabase.from('users_profile').select('country_code').eq('user_id', uid).maybeSingle();
    const countryCode = profile?.country_code ?? null;

    const body = req.body || {};
    const input = { country_code: countryCode };
    for (const key of ALLOWED_FIELDS) {
      if (body[key] !== undefined) input[key] = body[key];
    }

    // Validación de forma, campo por campo, ANTES de tocar la base —
    // nunca se persiste un campo inválido, ni siquiera como borrador.
    const fieldErrors = validateOnboardingFields(input);
    if (Object.keys(fieldErrors).length > 0) {
      return res.status(400).json({ ok: false, error: 'invalid_fields', fields: fieldErrors });
    }

    const patch = {};
    if (input.person_name !== undefined) patch.person_name = String(input.person_name).trim();
    if (input.organization_name !== undefined) patch.organization_name = String(input.organization_name).trim();
    if (input.phone !== undefined) patch.phone = String(input.phone).trim();
    if (input.adult_declared === true) {
      patch.adult_declared = true;
      patch.adult_declaration_version = CURRENT_ADULT_DECLARATION_VERSION;
    }
    if (input.terms_accepted === true) {
      patch.terms_version = CURRENT_TERMS_VERSION;
      patch.terms_accepted_at = new Date().toISOString();
    }
    if (input.privacy_accepted === true) {
      patch.privacy_version = CURRENT_PRIVACY_VERSION;
      patch.privacy_accepted_at = new Date().toISOString();
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ ok: false, error: 'empty_patch' });
    }

    const updated = await upsertOnboardingFields(uid, patch);
    const complete = isOnboardingComplete({ ...updated, country_code: countryCode });

    return res.status(200).json({
      ok: true,
      complete,
      missing: complete ? [] : missingOnboardingFields({ ...updated, country_code: countryCode }),
    });
  } catch (e) {
    console.error('[api/onboarding/trust/complete] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}

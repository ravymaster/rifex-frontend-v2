// src/pages/api/onboarding/trust/complete.js
// TRUST-1 — POST: guarda avance del onboarding universal (parcial o
// total) del usuario autenticado. Nunca acepta onboarding_completed_at,
// user_id, ni ningún campo de estado reservado desde el body — solo los
// campos base; "completo" se calcula siempre server-side desde el
// resultado real, ver src/lib/trustOnboardingGate.js.
import { createClient } from '@supabase/supabase-js';
import { enforceRateLimit, resolveClientIp } from '@/lib/rateLimit';
import {
  validateOnboardingFields,
  isOnboardingComplete,
  missingOnboardingFields,
  CURRENT_TERMS_VERSION,
  CURRENT_PRIVACY_VERSION,
} from '@/lib/trustOnboardingPolicy';
import { upsertOnboardingFields } from '@/lib/trustOnboardingGate';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// Solo estos nombres pueden llegar del cliente — cualquier otra clave en
// el body (incluida cualquier variante de "onboarding_completed_at" o
// "user_id") se ignora silenciosamente, nunca se refleja en el upsert.
const ALLOWED_FIELDS = ['legal_name', 'birth_date', 'phone', 'account_type', 'terms_accepted', 'privacy_accepted'];

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

    const body = req.body || {};
    const input = {};
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
    if (input.legal_name !== undefined) patch.legal_name = String(input.legal_name).trim();
    if (input.birth_date !== undefined) patch.birth_date = input.birth_date;
    if (input.phone !== undefined) patch.phone = String(input.phone).trim();
    if (input.account_type !== undefined) patch.account_type = input.account_type;
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
    const complete = isOnboardingComplete(updated);

    return res.status(200).json({
      ok: true,
      complete,
      missing: complete ? [] : missingOnboardingFields(updated),
    });
  } catch (e) {
    console.error('[api/onboarding/trust/complete] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}

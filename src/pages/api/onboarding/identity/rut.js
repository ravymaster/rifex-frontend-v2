// src/pages/api/onboarding/identity/rut.js
// TRUST-2 — POST: declara/actualiza el RUN/RUT chileno del usuario
// autenticado. Nunca acepta un estado "verificado" — solo la forma
// cruda, validada y normalizada server-side (nunca confiada al
// navegador, ver trustIdentityPolicy.js). 'rut_conflict' es el único
// código de error por duplicidad — nunca revela a quién pertenece un
// RUT ya declarado por otra cuenta.
import { createClient } from '@supabase/supabase-js';
import { enforceRateLimit, resolveClientIp } from '@/lib/rateLimit';
import { upsertIdentityRut } from '@/lib/trustIdentityGate';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

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
    if (await enforceRateLimit(req, res, { key: `trust-identity-rut:${uid}`, maxHits: 20, windowSeconds: 60 })) return;

    const rut = req.body?.rut;
    if (typeof rut !== 'string' || !rut.trim()) {
      return res.status(400).json({ ok: false, error: 'rut_required' });
    }

    const result = await upsertIdentityRut(uid, rut);
    if (!result.ok) {
      const status = result.reason === 'rut_conflict' ? 409 : 400;
      return res.status(status).json({ ok: false, error: result.reason });
    }

    return res.status(200).json({ ok: true, rut_masked: result.rut_masked });
  } catch (e) {
    console.error('[api/onboarding/identity/rut] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}

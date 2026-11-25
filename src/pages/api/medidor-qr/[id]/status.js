// src/pages/api/medidor-qr/[id]/status.js
// MEDIDOR QR V1 — POST únicamente: cierre terminal owner-only. Sección
// 21 del mandato: modelo mínimo, solo Abrir/Cerrar — nunca
// Pausar/Reanudar ni reabrir un Medidor cerrado. Cerrar NO elimina
// métricas/histórico/Excel/URL pública (sección 8 de la EXTENSIÓN
// FINAL) — solo cambia el campo status, la fila y todas sus
// instrumentaciones se conservan intactas.
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

async function getRequester(req) {
  const authz = req.headers.authorization || '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : null;
  if (!token) return null;
  const { data: ures, error } = await supabase.auth.getUser(token);
  if (error || !ures?.user) return null;
  return ures.user;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const { id } = req.query || {};
  if (!id) return res.status(400).json({ ok: false, error: 'missing_id' });

  // Único valor aceptado: 'closed'. No existe ningún otro valor
  // aceptado por este endpoint — nunca hay un camino para reabrir un
  // Medidor ya cerrado.
  const requestedStatus = req.body?.status;
  if (requestedStatus !== 'closed') return res.status(400).json({ ok: false, error: 'invalid_status' });

  try {
    const user = await getRequester(req);
    if (!user) return res.status(401).json({ ok: false, error: 'missing_auth' });

    const { data: medidor, error: fetchErr } = await supabase
      .from('medidores_qr')
      .select('id, organizer_id, status')
      .eq('id', id)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!medidor) return res.status(404).json({ ok: false, error: 'not_found' });
    if (medidor.organizer_id !== user.id) return res.status(403).json({ ok: false, error: 'not_your_medidor' });

    if (medidor.status === 'closed') return res.status(200).json({ ok: true, already_closed: true });

    const { error: updateErr } = await supabase
      .from('medidores_qr')
      .update({ status: 'closed', updated_at: new Date().toISOString() })
      .eq('id', id);
    if (updateErr) throw updateErr;

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[api/medidor-qr/[id]/status] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}

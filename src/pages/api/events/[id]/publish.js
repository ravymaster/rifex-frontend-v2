// src/pages/api/events/[id]/publish.js
// EVENT-1 — Publicación explícita, owner-only. Valida precondiciones
// server-side siempre (nunca confía en que el formulario ya validó).
// Idempotente: publicar un evento ya publicado responde 200 sin duplicar
// efectos (nunca un 500 ni un estado inconsistente por doble click).
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const { id } = req.query || {};
  if (!id) return res.status(400).json({ ok: false, error: 'missing_id' });

  try {
    const authz = req.headers.authorization || '';
    const token = authz.startsWith('Bearer ') ? authz.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, error: 'missing_auth' });

    const { data: ures, error: uerr } = await supabase.auth.getUser(token);
    if (uerr || !ures?.user) return res.status(401).json({ ok: false, error: 'invalid_auth' });

    const { data: event, error: fetchErr } = await supabase
      .from('events')
      .select('id, organizer_id, title, starts_at, ends_at, status')
      .eq('id', id)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!event) return res.status(404).json({ ok: false, error: 'not_found' });
    if (event.organizer_id !== ures.user.id) return res.status(403).json({ ok: false, error: 'not_your_event' });

    if (event.status === 'published') {
      return res.status(200).json({ ok: true, event, already_published: true });
    }
    if (event.status === 'cancelled') {
      return res.status(409).json({ ok: false, error: 'event_cancelled' });
    }

    // Fase 9: precondiciones server-side.
    if (!event.title || !event.title.trim()) {
      return res.status(400).json({ ok: false, error: 'missing_title' });
    }
    if (!event.starts_at) {
      return res.status(400).json({ ok: false, error: 'missing_starts_at' });
    }

    const { data: ticketTypes, error: ttErr } = await supabase
      .from('event_ticket_types')
      .select('id, name, price_cents, quantity_total, status')
      .eq('event_id', id);
    if (ttErr) throw ttErr;

    const activeTypes = (ticketTypes || []).filter((t) => t.status === 'active');
    if (activeTypes.length === 0) {
      return res.status(400).json({ ok: false, error: 'no_active_ticket_types' });
    }
    const invalidType = activeTypes.find(
      (t) => !t.name || !t.name.trim() || !(t.price_cents >= 0) || !(t.quantity_total > 0)
    );
    if (invalidType) {
      return res.status(400).json({ ok: false, error: 'invalid_ticket_type', ticket_type_id: invalidType.id });
    }

    const { data: updated, error: updErr } = await supabase
      .from('events')
      .update({ status: 'published', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', event.status) // re-chequeo defensivo por si cambió entre el SELECT y acá
      .select('*')
      .maybeSingle();
    if (updErr) throw updErr;
    if (!updated) {
      // Alguien más ya lo transicionó (cancelled/published) entre el chequeo y el update.
      const { data: fresh } = await supabase.from('events').select('*').eq('id', id).single();
      if (fresh?.status === 'published') return res.status(200).json({ ok: true, event: fresh, already_published: true });
      return res.status(409).json({ ok: false, error: 'event_state_changed' });
    }

    return res.status(200).json({ ok: true, event: updated });
  } catch (e) {
    console.error('[api/events/[id]/publish] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}

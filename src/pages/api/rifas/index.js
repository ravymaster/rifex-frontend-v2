// src/pages/api/rifas/index.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// Campos permitidos para crear
const ALLOWED_CREATE_FIELDS = new Set([
  'title',
  'price_cents',
  'total_numbers',
  'description',
  'plan',
  'theme',
  'prize_type',
  'prize_amount_cents',
  'payout_method',
  'delivery_method',
  'prize_photos',
  'start_date',
  'end_date',
  'status'
]);

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      // Listado público simple (útil para /rifas)
      const { status, q } = req.query || {};
      let query = supabase
        .from('raffles')
        .select('*')
        .order('created_at', { ascending: false });

      if (status && status !== 'all') {
        query = query.eq('status', status);
      } else {
        query = query.neq('status', 'deleted');
      }

      if (q && String(q).trim()) {
        const s = String(q).trim();
        query = query.or(`title.ilike.%${s}%,id.eq.${s}`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json({ ok: true, items: data || [] });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      // Datos del usuario (desde el navegador agregaremos estos headers)
      const creator_email = (req.headers['x-user-email'] || '').toString().trim() || null;
      const creator_id = (req.headers['x-user-id'] || '').toString().trim() || null;

      // Sanitizar payload
      const row = {};
      for (const k of Object.keys(body)) {
        if (ALLOWED_CREATE_FIELDS.has(k)) row[k] = body[k];
      }
      if (!row.title) return res.status(400).json({ ok: false, error: 'missing_title' });

      row.price_cents = Math.max(0, Math.round(Number(row.price_cents || 0)));
      row.total_numbers = Math.max(1, Math.round(Number(row.total_numbers || 0)));
      if (row.prize_amount_cents != null) {
        row.prize_amount_cents = Math.max(0, Math.round(Number(row.prize_amount_cents || 0)));
      }
      if (!row.status) row.status = 'active';

      // Asignar creador si viene (evitamos depender del trigger)
      if (creator_email) row.creator_email = creator_email;
      if (creator_id) row.creator_id = creator_id;

      // Crear rifa
      const { data: created, error: insErr } = await supabase
        .from('raffles')
        .insert(row)
        .select('*')
        .single();
      if (insErr) throw insErr;

      // Crear tickets 1..N
      const tickets = Array.from({ length: created.total_numbers }, (_, i) => ({
        raffle_id: created.id,
        number: i + 1,
        status: 'available'
      }));

      // Insert masivo en lotes de 1k
      for (let i = 0; i < tickets.length; i += 1000) {
        const chunk = tickets.slice(i, i + 1000);
        const { error: tErr } = await supabase.from('tickets').insert(chunk);
        if (tErr) throw tErr;
      }

      // Respondemos con id arriba para que el cliente redirija a /rifas/:id
      return res.status(200).json({ ok: true, id: created.id, data: created });
    }

    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (e) {
    console.error('[api/rifas] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}





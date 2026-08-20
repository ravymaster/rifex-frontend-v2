// src/pages/api/rifas/index.js
import { createClient } from '@supabase/supabase-js';
import { assertCountryGate } from '@/lib/countryGate';
import { COUNTRY_POLICY } from '@/lib/countryPolicy';
import { zonedTimeToUtcISOString, computeSalesEndAt } from '@/lib/raffleTime';
import { recordDeclarations, DECLARATION_TYPES } from '@/lib/legalDeclarations';

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
  'status',
  'extension_limit',
]);

const MAX_EXTENSION_LIMIT = 3;

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
        // Listado público real: solo lo que efectivamente está activo o
        // cerrado (con página pública visitable) — nunca draft ni ningún
        // otro estado intermedio, aunque no sea 'deleted'.
        query = query.in('status', ['active', 'closed']);
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

      // Identidad real del creador: se verifica el token contra Supabase,
      // no se confía en headers que el cliente podría falsificar.
      const authz = req.headers.authorization || '';
      const token = authz.startsWith('Bearer ') ? authz.slice(7) : null;
      if (!token) return res.status(401).json({ ok: false, error: 'missing_auth' });

      const { data: ures, error: uerr } = await supabase.auth.getUser(token);
      if (uerr || !ures?.user) return res.status(401).json({ ok: false, error: 'invalid_auth' });

      const creator_id = ures.user.id;
      const creator_email = (ures.user.email || '').toLowerCase() || null;

      // Country Gate (G2): país operativo del creador, autoridad única =
      // users_profile.country_code server-side.
      const gate = await assertCountryGate(creator_id, 'raffles');
      if (!gate.ok) return res.status(403).json({ ok: false, error: gate.reason, message: gate.message });

      // DRAW-1: declaraciones obligatorias — 18+ y propiedad del premio.
      // Server-side siempre (nunca confiar solo en el checkbox del cliente).
      if (body.age_confirmed !== true) {
        return res.status(400).json({ ok: false, error: 'age_confirmation_required' });
      }
      if (body.prize_declaration_confirmed !== true) {
        return res.status(400).json({ ok: false, error: 'prize_declaration_required' });
      }

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

      row.extension_limit = Math.max(0, Math.min(MAX_EXTENSION_LIMIT, Math.round(Number(row.extension_limit || 0))));

      // Asignar creador si viene (evitamos depender del trigger)
      if (creator_email) row.creator_email = creator_email;
      if (creator_id) row.creator_id = creator_id;

      // DRAW-1: fecha/hora de sorteo — opcional. El creador solo entrega
      // fecha/hora "de pared"; la zona horaria SIEMPRE se resuelve server-side
      // desde el país real del creador (users_profile.country_code), nunca
      // desde un valor que mande el cliente — mismo criterio que el Country
      // Gate. Si no se entrega, la rifa queda exactamente en modelo V1
      // (draw_at/sales_end_at/timezone en NULL, sin gate de tiempo).
      const { draw_date, draw_time } = body || {};
      if (draw_date && draw_time) {
        const { data: profile } = await supabase
          .from('users_profile')
          .select('country_code')
          .eq('user_id', creator_id)
          .maybeSingle();
        const countryCode = profile?.country_code || null;
        const timeZone = COUNTRY_POLICY[countryCode]?.defaultTimezone || null;
        if (!timeZone) {
          return res.status(400).json({ ok: false, error: 'country_timezone_unavailable' });
        }
        const drawAtIso = zonedTimeToUtcISOString(draw_date, draw_time, timeZone);
        if (!drawAtIso) {
          return res.status(400).json({ ok: false, error: 'invalid_draw_datetime' });
        }
        if (new Date(drawAtIso).getTime() <= Date.now()) {
          return res.status(400).json({ ok: false, error: 'draw_at_must_be_future' });
        }
        row.draw_at = drawAtIso;
        row.sales_end_at = computeSalesEndAt(drawAtIso);
        row.timezone = timeZone;
      }

      // Crear rifa
      const { data: created, error: insErr } = await supabase
        .from('raffles')
        .insert(row)
        .select('*')
        .single();
      if (insErr) throw insErr;

      // DRAW-1: registrar declaraciones legales (reusable para Campañas después).
      try {
        await recordDeclarations({
          userId: creator_id,
          entityType: 'raffle',
          entityId: created.id,
          types: [DECLARATION_TYPES.AGE_18, DECLARATION_TYPES.PRIZE_OWNERSHIP],
        });
      } catch (e) {
        console.error('[api/rifas] legal declarations error (no bloquea la creación)', e?.message || e);
      }

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





// src/pages/api/rifas/index.js
import { createClient } from '@supabase/supabase-js';
import { assertCountryGate } from '@/lib/countryGate';
import { assertOnboardingComplete } from '@/lib/trustOnboardingGate';
import { COUNTRY_POLICY } from '@/lib/countryPolicy';
import { zonedTimeToUtcISOString, computeSalesEndAt } from '@/lib/raffleTime';
import { DECLARATION_TYPES } from '@/lib/legalDeclarations';
import { enforceRateLimit } from '@/lib/rateLimit';

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
// DRAW-1B: anticipación mínima — con T-5, esto deja al menos 5 minutos
// reales de venta antes de que sales_end_at cierre las compras.
const MIN_LEAD_MINUTES = 10;

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

      // PRE-LAUNCH-FIX-1 (P1-3): identidad ya resuelta acá — se limita por
      // user_id, nunca por IP, para que un usuario no consuma cupo de otro
      // detrás del mismo NAT/proxy.
      if (await enforceRateLimit(req, res, { key: `rifas-create:${creator_id}`, maxHits: 10, windowSeconds: 60 })) return;

      // Country Gate (G2): país operativo del creador, autoridad única =
      // users_profile.country_code server-side.
      const gate = await assertCountryGate(creator_id, 'raffles');
      if (!gate.ok) return res.status(403).json({ ok: false, error: gate.reason, message: gate.message });

      // TRUST-1: onboarding universal obligatorio antes de crear — igual
      // criterio que el Country Gate, autoridad única server-side, nunca
      // confiado a que el cliente ya haya pasado por /registro/continuar.
      const onboarding = await assertOnboardingComplete(creator_id);
      if (!onboarding.ok) return res.status(403).json({ ok: false, error: onboarding.reason, message: onboarding.message });

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

      // DRAW-UX-FINAL: fecha/hora de sorteo — OBLIGATORIA para toda rifa
      // nueva (ninguna rifa nueva puede quedar con draw_at=NULL). Las rifas
      // legacy ya existentes no se tocan — este requisito solo aplica al
      // camino de creación. El creador solo entrega fecha/hora "de pared";
      // la zona horaria SIEMPRE se resuelve server-side desde el país real
      // del creador (users_profile.country_code), nunca desde un valor que
      // mande el cliente — mismo criterio que el Country Gate.
      const { draw_date, draw_time } = body || {};
      if (!draw_date || !draw_time) {
        return res.status(400).json({ ok: false, error: 'missing_draw_datetime', message: 'La fecha y hora del sorteo son obligatorias.' });
      }
      {
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
        if (new Date(drawAtIso).getTime() < Date.now() + MIN_LEAD_MINUTES * 60_000) {
          return res.status(400).json({ ok: false, error: 'draw_at_too_soon', message: `El sorteo debe ser al menos ${MIN_LEAD_MINUTES} minutos en el futuro.` });
        }
        row.draw_at = drawAtIso;
        row.sales_end_at = computeSalesEndAt(drawAtIso);
        row.timezone = timeZone;
        // DRAW-UX-FINAL: end_date se deriva SIEMPRE de draw_date (fecha "de
        // pared" ya en términos del creador, sin conversión adicional) para
        // que la compatibilidad V1 (listados, panel, perfil público) no
        // dependa de que el cliente la mande por su cuenta.
        row.end_date = draw_date;
      }

      // DRAW-1B: crear rifa + declaraciones legales en una sola transacción
      // (RPC atómica) — si el registro de 18+/premio falla, la rifa
      // tampoco queda creada. Nunca dejar una rifa sin evidencia de
      // aceptación (fail-closed).
      const { data: created, error: rpcErr } = await supabase.rpc('create_raffle_with_declarations', {
        p_raffle: row,
        p_user_id: creator_id,
        p_declaration_types: [DECLARATION_TYPES.AGE_18, DECLARATION_TYPES.PRIZE_OWNERSHIP],
      });
      if (rpcErr) throw rpcErr;

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





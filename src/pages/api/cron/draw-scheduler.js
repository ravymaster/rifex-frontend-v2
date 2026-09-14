// src/pages/api/cron/draw-scheduler.js
// DRAW-2: disparo automático del sorteo por tiempo. Server-only — el
// frontend nunca elige ganador, solo lee el resultado ya persistido
// (raffle_results). Protegido por CRON_SECRET (nunca ADMIN_API_TOKEN,
// exclusivo de este endpoint). No acepta raffle_id desde el cliente: la
// selección de rifas vencidas ocurre siempre server-side.
//
// Idempotente/recovery: usa draw_at <= now() (no igualdad exacta), así una
// ejecución tardía recupera cualquier rifa pendiente sin perder sorteos.
// raffle_results.raffle_id sigue siendo la única autoridad exactly-once —
// drawWinner() ya la respeta, este endpoint no introduce un segundo
// mecanismo de "ganador".
import { createClient } from '@supabase/supabase-js';
import { drawWinner, notifyWinnerDrawn } from '@/lib/drawWinner';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const secret = process.env.CRON_SECRET;
  const authz = req.headers.authorization || '';
  if (!secret || authz !== `Bearer ${secret}`) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  try {
    const nowIso = new Date().toISOString();

    // Rifas vencidas: activas, con draw_at configurado y ya pasado.
    // Rifas V1 (draw_at IS NULL) quedan afuera del filtro por construcción
    // — el scheduler nunca las toca, comportamiento legado intacto.
    const { data: due, error: dueErr } = await supabase
      .from('raffles')
      .select('id')
      .eq('status', 'active')
      .not('draw_at', 'is', null)
      .lte('draw_at', nowIso);
    if (dueErr) throw dueErr;

    const results = [];
    for (const r of due || []) {
      const { data: existing, error: exErr } = await supabase
        .from('raffle_results')
        .select('raffle_id')
        .eq('raffle_id', r.id)
        .maybeSingle();
      if (exErr) { results.push({ raffleId: r.id, error: exErr.message }); continue; }
      if (existing) { results.push({ raffleId: r.id, skipped: 'already_drawn' }); continue; }

      try {
        const draw = await drawWinner(r.id, { force: true, triggerSource: 'scheduled_draw' });
        if (draw.isNew) {
          await supabase.from('raffles').update({ status: 'closed' }).eq('id', r.id);
          await notifyWinnerDrawn(r.id, draw.winner);
          results.push({ raffleId: r.id, drawn: true, winnerNumber: draw.winner.number });
        } else if (draw.ready) {
          // Otro disparador (webhook/manual) ganó la carrera exactamente
          // en este intervalo — exactly-once real, no es un error.
          results.push({ raffleId: r.id, skipped: 'already_drawn_race' });
        } else {
          results.push({ raffleId: r.id, skipped: 'no_sold_tickets' });
        }
      } catch (e) {
        results.push({ raffleId: r.id, error: e?.message || String(e) });
      }
    }

    return res.status(200).json({ ok: true, checked: (due || []).length, results });
  } catch (e) {
    console.error('[cron/draw-scheduler] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}

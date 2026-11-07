import { createClient } from '@supabase/supabase-js';
import { requireRaffleApiAccess } from '@/lib/raffleShareAccess';
import { countRaffleTickets } from '@/lib/raffleTicketCounts';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const { id } = req.query;
  // Exposición pública de Rifas (src/lib/raffleExposure.js) y puerta
  // neutra del modo `gated` (src/lib/raffleShareAccess.js).
  const access = await requireRaffleApiAccess(req, res, String(id || ''));
  if (!access) return;
  const raffleId = access.raffle?.id || id;

  try {
    // ?summary=1 → solo totales (refresco periódico de la ficha).
    if (req.query.summary === '1') {
      const counts = await countRaffleTickets(supabase, raffleId);
      return res.status(200).json({ ok: true, counts });
    }

    const { data, error } = await supabase
      .from('tickets')
      .select('number,status')
      .eq('raffle_id', raffleId)
      .order('number', { ascending: true });

    if (error) throw error;

    return res.status(200).json({ tickets: data || [] });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Tickets fetch error' });
  }
}


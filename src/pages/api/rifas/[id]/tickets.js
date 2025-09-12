import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { id } = req.query;
    const { data, error } = await supabase
      .from('tickets')
      .select('number,status')
      .eq('raffle_id', id)
      .order('number', { ascending: true });

    if (error) throw error;

    return res.status(200).json({ tickets: data || [] });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Tickets fetch error' });
  }
}


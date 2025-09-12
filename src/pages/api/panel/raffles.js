import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res){
  try{
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession:false } }
    );

    const { status, q } = req.query;

    let query = supabase
      .from('raffles')
      .select('id,title,price_cents,total_numbers,prize_type,prize_amount_cents,status,end_date,created_at')
      .order('created_at', { ascending:false });

    // Por defecto ocultamos las archivadas
    if(status && status !== 'all'){
      query = query.eq('status', status);
    }else{
      query = query.neq('status','deleted');
    }

    if(q && q.trim()){
      const s = q.trim();
      query = query.or(`title.ilike.%${s}%,id.eq.${s}`);
    }

    const { data: raffles, error } = await query;
    if(error) throw error;

    // SOLD por rifa
    const ids = raffles.map(r=>r.id);
    let soldById = {};
    if(ids.length){
      const { data: soldRows, error: sErr } = await supabase
        .from('tickets')
        .select('raffle_id')
        .eq('status','sold')
        .in('raffle_id', ids);
      if(sErr) throw sErr;
      for(const row of soldRows){
        soldById[row.raffle_id] = (soldById[row.raffle_id]||0) + 1;
      }
    }

    const items = raffles.map(r=> ({ ...r, sold: soldById[r.id] || 0 }));
    return res.status(200).json({ items });
  }catch(e){
    console.error('panel/raffles error', e);
    const msg = e?.message || e?.error?.message || 'server_error';
    return res.status(500).json({ error: msg });
  }
}


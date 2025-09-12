// pages/api/checkout/index.js
import { createClient } from '@supabase/supabase-js';
import { MercadoPagoConfig, Preference } from 'mercadopago';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const safe = (s) => (s ? `${s.slice(0,6)}…${s.slice(-4)}` : '(empty)');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { raffleId, numbers, buyerEmail } = req.body;

    // Rifa
    const { data: raffle, error: rerr } = await supabase
      .from('raffles').select('*').eq('id', raffleId).single();
    if (rerr || !raffle) return res.status(404).json({ error: 'Raffle not found' });

    // Validar disponibilidad
    const { data: current } = await supabase
      .from('tickets')
      .select('id, number, status')
      .eq('raffle_id', raffleId)
      .in('number', numbers);

    if (!current || current.some(t => t.status !== 'available')) {
      return res.status(409).json({ error: 'Some numbers are not available' });
    }

    // Crear purchase
    const { data: purchase, error: perr } = await supabase
      .from('purchases')
      .insert({ raffle_id: raffleId, buyer_email: buyerEmail, numbers, status: 'initiated' })
      .select('*')
      .single();
    if (perr) throw perr;

    // Reservar → pending
    await supabase
      .from('tickets')
      .update({ status: 'pending', purchase_id: purchase.id })
      .eq('raffle_id', raffleId)
      .in('number', numbers);

    // MP v2
    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) return res.status(500).json({ error: 'Missing MP_ACCESS_TOKEN' });
    console.log('[checkout] MP token:', safe(accessToken));

    const mpClient = new MercadoPagoConfig({ accessToken });
    const preference = new Preference(mpClient);

    const unitPriceCLP = (raffle.price_cents || 0) / 100;

    const prefRes = await preference.create({
      body: {
        items: [{
          id: raffleId,
          title: `Rifa: ${raffle.title} - Números ${numbers.join(', ')}`,
          quantity: 1,
          currency_id: 'CLP',
          unit_price: unitPriceCLP * numbers.length,
        }],
        payer: { email: buyerEmail },
        metadata: { purchaseId: purchase.id, raffleId, numbers },
        back_urls: {
          success: `${process.env.NEXT_PUBLIC_BASE_URL}/checkout/success`,
          failure: `${process.env.NEXT_PUBLIC_BASE_URL}/checkout/failure`,
          pending: `${process.env.NEXT_PUBLIC_BASE_URL}/checkout/pending`,
        },
        auto_return: 'approved',
        notification_url: `${process.env.NEXT_PUBLIC_BASE_URL}/api/checkout/webhook`,
      }
    });

    // guardar preference_id
    await supabase.from('purchases')
      .update({ mp_preference_id: prefRes.id })
      .eq('id', purchase.id);

    return res.status(200).json({
      init_point: prefRes.init_point || prefRes.sandbox_init_point,
      id: purchase.id
    });
  } catch (e) {
    console.error('CHECKOUT ERROR:', e);
    const msg = e?.message || e?.error?.message || (typeof e === 'string' ? e : JSON.stringify(e));
    return res.status(500).json({ error: msg });
  }
}

// pages/api/checkout/index.js
import { createClient } from '@supabase/supabase-js';
import { MercadoPagoConfig, Preference } from 'mercadopago';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const base = (process.env.NEXT_PUBLIC_BASE_URL || 'https://rifex.pro').replace(/\/$/, '');
const safe = (s) => (s ? `${s.slice(0,6)}…${s.slice(-4)}` : '(empty)');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { raffleId, numbers, buyerEmail } = req.body;

    const { data: raffle, error: rerr } = await supabase
      .from('raffles').select('id,title,price_cents').eq('id', raffleId).single();
    if (rerr || !raffle) return res.status(404).json({ error: 'Raffle not found' });

    const unitPriceCLP = Math.round((raffle.price_cents || 0) / 100);
    if (!numbers?.length || !unitPriceCLP) return res.status(400).json({ error: 'Invalid data' });

    // purchase
    const { data: purchase, error: perr } = await supabase
      .from('purchases')
      .insert({ raffle_id: raffleId, buyer_email: buyerEmail, numbers, status: 'initiated' })
      .select('*')
      .single();
    if (perr) throw perr;

    // reservar
    await supabase
      .from('tickets')
      .update({ status: 'pending', purchase_id: purchase.id })
      .eq('raffle_id', raffleId)
      .in('number', numbers);

    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) return res.status(500).json({ error: 'Missing MP_ACCESS_TOKEN' });
    console.log('[checkout] MP token:', safe(accessToken));

    const mpClient = new MercadoPagoConfig({ accessToken });
    const preference = new Preference(mpClient);

    const prefRes = await preference.create({
      body: {
        items: [{
          id: raffleId,
          title: `Rifa: ${raffle.title}`,
          quantity: numbers.length,
          currency_id: 'CLP',
          unit_price: unitPriceCLP,
        }],
        payer: { email: buyerEmail },
        metadata: { purchaseId: purchase.id, raffleId, numbers },
        back_urls: {
          success: `${base}/rifas/${raffleId}?pay=success&pid=${purchase.id}`,
          failure: `${base}/rifas/${raffleId}?pay=failure&pid=${purchase.id}`,
          pending: `${base}/rifas/${raffleId}?pay=pending&pid=${purchase.id}`,
        },
        auto_return: 'approved',
        binary_mode: true,
        external_reference: String(purchase.id),
        notification_url: `${base}/api/checkout/webhook`,
      }
    });

    const initPoint = prefRes?.init_point || prefRes?.sandbox_init_point;
    await supabase.from('purchases')
      .update({ mp_preference_id: prefRes.id })
      .eq('id', purchase.id);

    return res.status(200).json({ ok:true, init_point: initPoint, id: purchase.id });
  } catch (e) {
    console.error('CHECKOUT ERROR:', e?.status, e?.message, e);
    const msg = e?.message || e?.error?.message || (typeof e === 'string' ? e : JSON.stringify(e));
    return res.status(500).json({ error: msg });
  }
}


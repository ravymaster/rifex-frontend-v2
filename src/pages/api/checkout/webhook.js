// pages/api/checkout/webhook.js
import { createClient } from '@supabase/supabase-js';
import { MercadoPagoConfig, Payment } from 'mercadopago';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const paymentId = req.body?.data?.id || req.body?.id;
    if (!paymentId) return res.status(200).json({ ok: true });

    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) return res.status(200).json({ ok: true });

    const mpClient = new MercadoPagoConfig({ accessToken });
    const payment = new Payment(mpClient);

    const p = await payment.get({ id: String(paymentId) });
    const status = p.status; // approved | pending | rejected
    const preference_id =
      p.metadata?.preference_id ||
      p.order?.id ||
      p.additional_info?.items?.[0]?.id || null;

    if (!preference_id) return res.status(200).json({ ok: true });

    const { data: purchase } = await supabase
      .from('purchases')
      .select('*')
      .eq('mp_preference_id', preference_id)
      .single();
    if (!purchase) return res.status(200).json({ ok: true });

    await supabase.from('purchases')
      .update({ status, mp_payment_id: String(paymentId) })
      .eq('id', purchase.id);

    if (status === 'approved') {
      await supabase.from('tickets')
        .update({ status: 'sold' })
        .eq('raffle_id', purchase.raffle_id)
        .eq('purchase_id', purchase.id);
    } else if (status === 'rejected') {
      await supabase.from('tickets')
        .update({ status: 'available', purchase_id: null })
        .eq('raffle_id', purchase.raffle_id)
        .eq('purchase_id', purchase.id);
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('WEBHOOK ERROR:', e);
    return res.status(200).json({ ok: true }); // MP espera 200 siempre
  }
}

// src/pages/api/checkout/confirm.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { payment_id, status, preference_id } = req.body || {};
    if (!preference_id) return res.status(400).json({ error: 'Missing preference_id' });

    // 1) Buscar la compra por preference_id (guardado al crear la preferencia)
    const { data: purchase, error: pErr } = await supabase
      .from('purchases')
      .select('*')
      .eq('mp_preference_id', preference_id)
      .single();

    if (pErr || !purchase) {
      return res.status(404).json({ error: 'Purchase not found for preference_id' });
    }

    // 2) Determinar estado final (si no viene, asumimos approved)
    const finalStatus = status || 'approved';

    // 3) Actualizar estado de la compra
    const { error: upErr } = await supabase
      .from('purchases')
      .update({
        status: finalStatus,
        mp_payment_id: payment_id ? String(payment_id) : purchase.mp_payment_id || null,
      })
      .eq('id', purchase.id);
    if (upErr) throw upErr;

    // 4) Actualizar tickets según estado de la compra
    if (finalStatus === 'approved') {
      const { error: tErr } = await supabase
        .from('tickets')
        .update({ status: 'sold' })
        .eq('raffle_id', purchase.raffle_id)
        .eq('purchase_id', purchase.id);
      if (tErr) throw tErr;
    } else if (finalStatus === 'rejected' || finalStatus === 'failure') {
      const { error: tErr } = await supabase
        .from('tickets')
        .update({ status: 'available', purchase_id: null })
        .eq('raffle_id', purchase.raffle_id)
        .eq('purchase_id', purchase.id);
      if (tErr) throw tErr;
    } else if (finalStatus === 'pending') {
      // opcional: mantenemos 'pending' para que el webhook finalice luego
    }

    // 5) Devolver también raffleId para que success.jsx marque el banner
    return res.status(200).json({
      ok: true,
      status: finalStatus,
      raffleId: purchase.raffle_id,
    });
  } catch (e) {
    console.error('CONFIRM ERROR:', e);
    const msg = e?.message || e?.error?.message || JSON.stringify(e);
    return res.status(500).json({ error: msg });
  }
}





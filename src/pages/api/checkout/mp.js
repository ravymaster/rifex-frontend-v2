// src/pages/api/checkout/mp.js
import { createClient } from '@supabase/supabase-js';
import { MercadoPagoConfig, Preference } from 'mercadopago';

/**
 * ENV requeridas:
 *  - NEXT_PUBLIC_SUPABASE_URL
 *  - SUPABASE_SERVICE_ROLE_KEY
 *  - NEXT_PUBLIC_BASE_URL (https://<tu-tunnel>.trycloudflare.com, SIN slash final)
 *  - MP_ACCESS_TOKEN
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY; // server-side
const RAW_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
const BASE_URL     = RAW_BASE_URL.replace(/\/+$/, ''); // sin / final

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  // Helpers de rollback si algo sale mal
  const rollbackTickets = async (raffleId, numbers, purchaseId) => {
    try {
      await supabase
        .from('tickets')
        .update({ status: 'available', purchase_id: null })
        .eq('raffle_id', raffleId)
        .in('number', numbers);
      if (purchaseId) {
        await supabase
          .from('purchases')
          .update({ status: 'failure' })
          .eq('id', purchaseId);
      }
    } catch (_) {}
  };

  try {
    const body = req.body || {};
    const raffleId   = body.raffle_id || body.raffleId;
    const numbers    = Array.isArray(body.numbers) ? body.numbers.map(n => Number(n)) : [];
    const buyerEmail = (body.buyer_email || body.buyerEmail || '').trim() || null;

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return res.status(500).json({ ok: false, error: 'missing_supabase_envs' });
    }
    if (!process.env.MP_ACCESS_TOKEN) {
      return res.status(500).json({ ok: false, error: 'missing_mp_access_token' });
    }
    if (!raffleId || numbers.length === 0) {
      return res.status(400).json({ ok: false, error: 'missing_params' });
    }

    // 1) Rifa
    const { data: raffle, error: rerr } = await supabase
      .from('raffles').select('*').eq('id', raffleId).maybeSingle();
    if (rerr || !raffle) return res.status(404).json({ ok: false, error: 'raffle_not_found' });

    // 2) Disponibilidad
    const { data: current, error: terr } = await supabase
      .from('tickets')
      .select('id, number, status')
      .eq('raffle_id', raffleId)
      .in('number', numbers);
    if (terr) throw terr;
    if (!current || current.length !== numbers.length) {
      return res.status(409).json({ ok: false, error: 'tickets_not_found_or_mismatch' });
    }
    if (current.some(t => t.status !== 'available')) {
      return res.status(409).json({ ok: false, error: 'some_tickets_not_available' });
    }

    // 3) Purchase initiated
    const { data: purchase, error: perr } = await supabase
      .from('purchases')
      .insert({ raffle_id: raffleId, buyer_email: buyerEmail, numbers, status: 'initiated' })
      .select('*')
      .single();
    if (perr) throw perr;

    // 4) Reservar tickets → pending
    const { error: uerr } = await supabase
      .from('tickets')
      .update({ status: 'pending', purchase_id: purchase.id })
      .eq('raffle_id', raffleId)
      .in('number', numbers);
    if (uerr) {
      await rollbackTickets(raffleId, numbers, purchase.id);
      throw uerr;
    }

    // 5) MP Preference (SDK v2 requiere { body: { ... } })
    const mpClient   = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
    const preference = new Preference(mpClient);

    const title     = raffle.title || `Rifa ${raffleId}`;
    const unitPrice = Math.max(1, Math.round(Number(raffle.price_cents || 0) / 100)); // evitar 0

    const back_urls = {
      success: `${BASE_URL}/checkout/success`,
      pending: `${BASE_URL}/checkout/pending`,
      failure: `${BASE_URL}/checkout/failure`,
    };

    let prefRes;
    try {
      prefRes = await preference.create({
        body: {
          items: [{
            id: String(purchase.id),
            title,
            quantity: 1,
            unit_price: unitPrice,
            currency_id: 'CLP',
          }],
          external_reference: String(purchase.id),
          back_urls,
          auto_return: 'approved',
          notification_url: `${BASE_URL}/api/checkout/webhook`,
          metadata: {
            raffle_id: String(raffleId),
            numbers,
            purchase_id: String(purchase.id),
          },
        }
      });
    } catch (e) {
      // Si falla la creación, liberamos los tickets
      await rollbackTickets(raffleId, numbers, purchase.id);
      throw e;
    }

    // 6) Guardar preference_id en purchases
    await supabase
      .from('purchases')
      .update({ mp_preference_id: prefRes.id })
      .eq('id', purchase.id);

    // 7) Responder URL de pago
    const init_point = prefRes.init_point || prefRes.sandbox_init_point;
    return res.status(200).json({ ok: true, init_point, id: purchase.id });

  } catch (e) {
    console.error('MP checkout error:', e);
    const msg = e?.message || e?.error?.message || e?.error || 'server_error';
    return res.status(500).json({ ok: false, error: msg });
  }
}


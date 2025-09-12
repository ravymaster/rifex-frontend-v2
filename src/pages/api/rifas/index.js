// pages/api/rifas/index.js
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Server ONLY (bypass RLS)
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  try {
    if (!url || !serviceKey) {
      return res.status(500).json({
        ok: false,
        message: "Faltan envs: NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY",
      });
    }

    const b = req.body ?? {};
    // Normaliza valores
    const price_cents = Number(b.price_cents);
    const total_numbers = Number(b.total_numbers);
    const prize_amount_cents =
      b.prize_type === "money" ? Number(b.prize_amount_cents ?? 0) : null;

    if (!b.title || !price_cents || !total_numbers) {
      return res.status(400).json({ ok: false, message: "Faltan campos obligatorios" });
    }

    const payload = {
      title: b.title,
      price_cents,
      total_numbers,
      description: b.description ?? null,

      plan: b.plan ?? "free",
      theme: b.theme ?? "mixto",
      prize_type: b.prize_type ?? "money",
      prize_amount_cents,
      payout_method: b.prize_type === "money" ? (b.payout_method ?? "rifex_transfer") : null,
      delivery_method: b.prize_type === "physical" ? (b.delivery_method ?? "a_convenir") : null,
      prize_photos: Array.isArray(b.prize_photos) ? b.prize_photos : null,

      start_date: b.start_date ?? null,
      end_date: b.end_date ?? null,
      status: b.status ?? "active",
    };

    const { data, error } = await supabase
      .from("raffles")
      .insert(payload)
      .select("id")
      .single();

    if (error) {
      console.error("Supabase insert error:", error);
      return res.status(400).json({ ok: false, message: error.message });
    }

    // 👇 Si ya tienes lógica que crea tickets 1..N en otro lado, deja esto comentado.
    // const ids = Array.from({ length: total_numbers }, (_, i) => ({
    //   raffle_id: data.id, number: i + 1, status: "available"
    // }));
    // await supabase.from("tickets").insert(ids);


    // Crear tickets 1..N si no existen todavía
    try {
      const { count } = await supabase
        .from('tickets')
        .select('id', { count: 'exact', head: true })
        .eq('raffle_id', data.id);

      if (!count || count === 0) {
        const ids = Array.from({ length: total_numbers }, (_, i) => ({
          raffle_id: data.id,
          number: i + 1,
          status: 'available'
        }));
        const { error: tErr } = await supabase.from('tickets').insert(ids);
        if (tErr) console.warn('Tickets insert warning:', tErr.message);
      }
    } catch (tCatch) {
      console.warn('Tickets insert try/catch:', tCatch?.message || tCatch);
    }

    return res.status(200).json({ ok: true, id: data.id });
  } catch (e) {
    console.error("API /api/rifas error:", e);
    return res.status(500).json({ ok: false, message: "Error inesperado" });
  }
}



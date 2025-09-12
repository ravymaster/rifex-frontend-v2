// src/pages/api/auth/me.js
import { getSupabaseServer } from '@/lib/supabaseServer';

export default async function handler(req, res) {
  const supabase = getSupabaseServer(req, res);
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error) return res.status(500).json({ ok: false, message: error.message });
  if (!user) return res.status(401).json({ ok: false, user: null });

  return res.status(200).json({ ok: true, user });
}

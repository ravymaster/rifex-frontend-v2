import { getSupabaseServer } from '@/lib/supabaseServer';

export default async function handler(req, res) {
  const supa = getSupabaseServer(req, res);
  const { data: { user }, error } = await supa.auth.getUser();
  res.status(200).json({
    ok: !error,
    user: user ? { id: user.id, email: user.email } : null,
    cookies_seen: Object.keys(req.cookies || {}),
  });
}

import { getSupabaseServer } from '@/lib/supabaseServer';

export default async function handler(req, res) {
  const supa = getSupabaseServer(req, res);
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return res.status(401).json({ ok:false, message:'No autorizado' });

  const { data, error } = await supa
    .from('users_profile')
    .select('nombre, plan')
    .eq('id', user.id)
    .single();

  if (error) return res.status(500).json({ ok:false, message:error.message });
  return res.json({ ok:true, data });
}

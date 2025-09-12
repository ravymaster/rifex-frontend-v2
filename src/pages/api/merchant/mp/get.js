// src/pages/api/merchant/mp/get.js
import { createServerClient } from '@supabase/ssr';
import { serialize } from 'cookie';

export default async function handler(req, res) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name) { return req.cookies[name]; },
        set(name, value, options) { res.setHeader('Set-Cookie', serialize(name, value, options)); },
        remove(name, options) { res.setHeader('Set-Cookie', serialize(name, '', { ...options, maxAge: 0 })); },
      },
    }
  );

  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr) return res.status(500).json({ ok: false, error: userErr.message });
  if (!user) return res.status(401).json({ ok: false, error: 'not_authenticated' });

  const { data, error } = await supabase
    .from('merchant_gateways')
    .select('*')
    .eq('user_id', user.id)
    .eq('provider', 'mp')
    .maybeSingle();

  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.status(200).json({ ok: true, data });
}


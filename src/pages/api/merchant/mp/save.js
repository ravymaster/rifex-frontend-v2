// src/pages/api/merchant/mp/save.js
import { createServerClient } from '@supabase/ssr';
import { serialize } from 'cookie';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  // Adaptador de cookies para API routes (sin next/headers)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name) {
          return req.cookies[name];
        },
        set(name, value, options) {
          res.setHeader('Set-Cookie', serialize(name, value, options));
        },
        remove(name, options) {
          res.setHeader(
            'Set-Cookie',
            serialize(name, '', { ...options, maxAge: 0 })
          );
        },
      },
    }
  );

  // Usuario actual
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr) {
    return res.status(500).json({ ok: false, error: userErr.message });
  }
  if (!user) {
    return res.status(401).json({ ok: false, error: 'not_authenticated' });
  }

  const { public_key, access_token } = req.body || {};
  if (!public_key || !access_token) {
    return res.status(400).json({ ok: false, error: 'missing_fields' });
  }

  // Guardar / actualizar credenciales de MP
  const { data, error } = await supabase
    .from('merchant_gateways')
    .upsert(
      {
        user_id: user.id,
        provider: 'mp',
        public_key,
        access_token,
        status: 'in_progress',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,provider' }
    )
    .select()
    .single();

  if (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }

  return res.status(200).json({ ok: true, data });
}


import { createServerClient } from '@supabase/ssr';
import { serialize } from 'cookie';

export function getSupabaseServer(req, res) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name) {
          return req.cookies?.[name];
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
}

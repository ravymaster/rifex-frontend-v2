// src/pages/api/blog/subscribe.js
// Alta a la newsletter del blog. Público, sin auth.
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || ''));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!isValidEmail(email)) return res.status(400).json({ ok: false, error: 'invalid_email' });

  try {
    const { error } = await supabase.from('blog_subscribers').upsert({ email }, { onConflict: 'email', ignoreDuplicates: true });
    if (error) throw error;
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[api/blog/subscribe] error', e);
    return res.status(500).json({ ok: false, error: e?.message || 'error' });
  }
}

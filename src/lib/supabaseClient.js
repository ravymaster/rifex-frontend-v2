// src/lib/supabaseClient.js
import { createBrowserClient } from '@supabase/ssr';

export const supabaseBrowser = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ⬇️ Alias (PONLOS DESPUÉS de crear supabaseBrowser)
export const supabase = supabaseBrowser; // opcional, para imports { supabase }
export default supabaseBrowser;          // opcional, para import supabase



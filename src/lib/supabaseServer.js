// src/lib/supabaseServer.js
import { createServerClient } from "@supabase/ssr";
import { serialize } from "cookie";

/**
 * getSupabaseServer(req,res)
 * - Usa cookies del request para hidratar la sesión en SSR.
 * - Acumula Set-Cookie (no pisa headers previos).
 * - Aplica flags seguros por defecto.
 */
export function getSupabaseServer(req, res) {
  const appendSetCookie = (cookieStr) => {
    const prev = res.getHeader("Set-Cookie");
    if (!prev) {
      res.setHeader("Set-Cookie", cookieStr);
    } else if (Array.isArray(prev)) {
      res.setHeader("Set-Cookie", [...prev, cookieStr]);
    } else {
      res.setHeader("Set-Cookie", [prev, cookieStr]);
    }
  };

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name) {
          return req.cookies?.[name];
        },
        set(name, value, options) {
          const cookie = serialize(name, value, {
            path: "/",
            sameSite: "lax",
            // En prod con HTTPS conviene secure:true
            secure: true,
            ...options,
          });
          appendSetCookie(cookie);
        },
        remove(name, options) {
          const cookie = serialize(name, "", {
            path: "/",
            sameSite: "lax",
            secure: true,
            maxAge: 0,
            ...options,
          });
          appendSetCookie(cookie);
        },
      },
    }
  );
}

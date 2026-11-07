// src/lib/rateLimit.js
// PRE-LAUNCH-FIX-1 (P1-3): rate limiting minimo, deliberadamente simple.
//
// Por que Postgres y no un Map en memoria: Vercel ejecuta cada función API
// como una instancia serverless separada (potencialmente muchas en
// paralelo bajo tráfico real) — un contador en memoria de proceso NO se
// comparte entre instancias, así que un límite "en memoria" solo protege
// contra ráfagas dentro de UNA instancia, dando una falsa sensación de
// protección global. La tabla `rate_limit_hits` + la RPC atómica
// `rate_limit_hit` (INSERT ... ON CONFLICT DO UPDATE) sí son una fuente de
// verdad compartida entre todas las instancias, sin introducir Redis ni
// infraestructura nueva — reusa el mismo Postgres que ya sostiene todo el
// resto del sistema.
//
// Limitación conocida y documentada (ventana fija/"fixed window"): un
// cliente podría, en el peor caso, hacer hasta ~2x el límite configurado
// si sincroniza sus requests justo en el borde entre dos ventanas
// consecutivas. Esto es una barrera pre-launch razonable, NO un sistema
// anti-abuso de nivel enterprise (eso requeriría sliding window o token
// bucket, fuera de alcance de este sprint).
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

/**
 * IP del cliente real, resuelta desde las cabeceras que Vercel controla —
 * nunca confiando ciegamente en un valor que el propio cliente podría
 * inventar. Vercel antepone el X-Forwarded-For del cliente y AGREGA el IP
 * real al final de la cadena al pasar por su borde, así que el último
 * segmento es el que Vercel mismo escribió, no algo que el cliente pueda
 * controlar. `x-real-ip`, cuando está presente, es igual de confiable.
 * Documentado explícitamente: si Rifex algún día corre detrás de OTRO
 * proxy (no Vercel), esta suposición debe revisarse.
 */
export function resolveClientIp(req) {
  const real = req.headers["x-real-ip"];
  if (real) return String(Array.isArray(real) ? real[0] : real).trim();
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) {
    const parts = String(Array.isArray(fwd) ? fwd[0] : fwd).split(",");
    return parts[parts.length - 1].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

/**
 * Aplica un límite de N hits por ventana de `windowSeconds` para `key`.
 * @param {string} key identidad a limitar — user_id si hay sesión,
 *   IP si es anónimo (ver resolveClientIp). Nunca mezclar ambos tipos de
 *   key en el mismo namespace sin prefijo, para que un usuario autenticado
 *   nunca comparta cupo con anónimos detrás del mismo IP.
 * @param {number} maxHits
 * @param {number} windowSeconds
 * @returns {Promise<{allowed:boolean, count:number, limit:number, retryAfterSeconds:number}>}
 */
export async function checkRateLimit(key, maxHits, windowSeconds) {
  const nowMs = Date.now();
  const windowMs = windowSeconds * 1000;
  const windowStartMs = Math.floor(nowMs / windowMs) * windowMs;
  const windowStart = new Date(windowStartMs).toISOString();
  const retryAfterSeconds = Math.max(1, Math.ceil((windowStartMs + windowMs - nowMs) / 1000));

  const { data: count, error } = await supabase.rpc("rate_limit_hit", {
    p_key: key,
    p_window_start: windowStart,
  });

  if (error) {
    // Fail-open deliberado: un error de infraestructura de rate-limit no
    // debe tumbar el endpoint real que protege. Se loguea para
    // observabilidad, nunca se usa para bloquear tráfico legítimo.
    console.error("[rateLimit] rate_limit_hit error (fail-open):", error.message);
    return { allowed: true, count: 0, limit: maxHits, retryAfterSeconds };
  }

  return { allowed: count <= maxHits, count, limit: maxHits, retryAfterSeconds };
}

/**
 * Helper de handler: aplica el límite y, si excede, escribe la respuesta
 * 429 con Retry-After y devuelve true (indicando "ya respondí, no sigas").
 * Si no excede, devuelve false (el caller continúa normalmente).
 */
export async function enforceRateLimit(req, res, { key, maxHits, windowSeconds }) {
  const result = await checkRateLimit(key, maxHits, windowSeconds);
  if (!result.allowed) {
    res.setHeader("Retry-After", String(result.retryAfterSeconds));
    res.status(429).json({
      ok: false,
      error: "rate_limited",
      retry_after_seconds: result.retryAfterSeconds,
    });
    return true;
  }
  return false;
}

// src/pages/onboarding/pais.jsx
// Paso único post-login (G1): declarar país operativo. Nunca se redirige a
// sí misma — es el destino final de cualquier chequeo de país, no un punto
// de partida que vuelva a chequear.
import Head from "next/head";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "@/components/Layout";
import styles from "@/styles/onboarding.module.css";
import { supabaseBrowser as supabase } from "@/lib/supabaseClient";
import { COUNTRY_POLICY, COUNTRY_CODES, sanitizeNextPath, isEnabledCountry } from "@/lib/countryPolicy";

export default function OnboardingPais() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const nextPath = sanitizeNextPath(
    router.isReady ? router.query?.next?.toString() : "",
    "/panel"
  );

  // Requiere sesión — si no hay, manda a login y vuelve acá después.
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data?.session) {
        router.replace(`/login?next=${encodeURIComponent(router.asPath || "/onboarding/pais")}`);
        return;
      }
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  async function onSelect(code) {
    if (saving) return;
    if (!isEnabledCountry(code)) return; // defensa extra, aunque el botón ya está disabled
    setErr("");
    setSaving(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) {
        setErr("Tu sesión expiró. Vuelve a iniciar sesión.");
        return;
      }
      const r = await fetch("/api/onboarding/country", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ country_code: code }),
      });
      const j = await r.json().catch(() => ({ ok: false }));
      if (!j.ok) {
        setErr("No se pudo guardar tu país. Intenta nuevamente.");
        return; // nunca redirige si no se confirmó el guardado
      }
      router.replace(nextPath);
    } catch (e) {
      console.error("[onboarding/pais]", e);
      setErr("No se pudo guardar tu país. Intenta nuevamente.");
    } finally {
      setSaving(false);
    }
  }

  if (!ready) return null;

  return (
    <>
      <Head><title>¿En qué país operarás? — Rifex</title></Head>
      <main className={styles.page}>
        <section className={styles.shell}>
          <div className={styles.inner}>
            <h1 className={styles.title}>¿En qué país operarás con Rifex?</h1>
            <p className={styles.sub}>Esto define la moneda y el medio de pago de tus rifas y campañas.</p>

            <div className={styles.grid}>
              {COUNTRY_CODES.map((code) => {
                const c = COUNTRY_POLICY[code];
                if (isEnabledCountry(code)) {
                  return (
                    <button
                      key={code}
                      type="button"
                      className={styles.option}
                      disabled={saving}
                      onClick={() => onSelect(code)}
                    >
                      <span className={styles.optionFlag}>{c.flag}</span>
                      <span className={styles.optionLabel}>{c.label}</span>
                      <span className={styles.badge}>Disponible</span>
                    </button>
                  );
                }
                return (
                  <div key={code} className={styles.optionDisabled} aria-disabled="true">
                    <span className={styles.optionFlag}>{c.flag}</span>
                    <span className={styles.optionLabel}>{c.label}</span>
                    <span className={styles.badge}>Próximamente</span>
                  </div>
                );
              })}
            </div>

            {err && <p className={styles.err}>{err}</p>}
          </div>
        </section>
      </main>
    </>
  );
}

OnboardingPais.getLayout = (page) => <Layout>{page}</Layout>;

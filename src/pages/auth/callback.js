// src/pages/auth/callback.js
// Punto único de retorno para login OAuth (Google). Intercambia el ?code=
// por una sesión real y recién ahí manda a donde el usuario quería ir —
// antes esto solo pasaba si el destino era /panel.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import { supabaseBrowser as supabase } from '@/lib/supabaseClient';
import { resolveCountryOnboardingRedirect } from '@/lib/countryOnboarding';

export default function AuthCallback() {
  const router = useRouter();
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!router.isReady) return;
    const nextQ = (router.query?.next || '').toString();
    const next = nextQ.startsWith('/') ? nextQ : '/panel';

    // El cliente (@supabase/ssr) ya detecta y canjea el ?code= solo al cargar
    // la página — acá solo esperamos a que esa sesión aparezca.
    let done = false;
    const finish = async (session) => {
      if (done) return;
      done = true;
      if (!session) { setErr('No se pudo completar el inicio de sesión con Google.'); return; }
      // G1: si falta declarar país operativo, el onboarding pasa primero —
      // preserva `next` para volver ahí una vez completado.
      const onboardingUrl = await resolveCountryOnboardingRedirect(next);
      router.replace(onboardingUrl || next);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) finish(session);
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) finish(data.session);
    });

    const timeout = setTimeout(() => finish(null), 8000);

    return () => { sub?.subscription?.unsubscribe(); clearTimeout(timeout); };
  }, [router.isReady, router.query?.next]);

  return (
    <section style={{ padding: '60px 0', textAlign: 'center' }}>
      <div className="container">
        {err ? (
          <>
            <p style={{ color: '#b91c1c' }}>{err}</p>
            <a className="btn btn-primary" href="/login" style={{ display: 'inline-block', marginTop: 12 }}>Volver a intentar</a>
          </>
        ) : (
          <p>Iniciando sesión…</p>
        )}
      </div>
    </section>
  );
}

AuthCallback.getLayout = (page) => <Layout>{page}</Layout>;

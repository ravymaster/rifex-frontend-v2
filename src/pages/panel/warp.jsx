// src/pages/panel/warp.jsx
// WARP CONVERSACIONAL — "Mis solicitudes del Asistente de IA" (nombre público). PSCG:
// PRIVATE_AUTHENTICATED (ssr_redirect; cubierto por 'Disallow: /panel').
// Lee solo las solicitudes propias vía /api/warp-conversacional/solicitudes
// (RLS con el JWT del usuario). Nunca muestra notas internas.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { supabaseBrowser as supabase } from '@/lib/supabaseClient';
import { getSupabaseServer } from '@/lib/supabaseServer';
import styles from '@/styles/warpConversacional.module.css';

export async function getServerSideProps(ctx) {
  const s = getSupabaseServer(ctx.req, ctx.res);
  let user = null;
  try {
    const { data } = await s.auth.getUser();
    user = data?.user || null;
  } catch (_) {
    user = null;
  }
  if (!user) {
    return { redirect: { destination: '/login?next=/panel/warp', permanent: false } };
  }
  return { props: {} };
}

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Santiago' });
  } catch {
    return '—';
  }
}

export default function MisSolicitudesWarp() {
  const [state, setState] = useState({ status: 'loading', requests: [] });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (!token) {
          window.location.assign('/login?next=/panel/warp');
          return;
        }
        const res = await fetch('/api/warp-conversacional/solicitudes', { headers: { Authorization: `Bearer ${token}` } });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !json?.ok) {
          setState({ status: 'error', requests: [] });
          return;
        }
        setState({ status: 'ok', requests: json.requests || [] });
      } catch {
        if (!cancelled) setState({ status: 'error', requests: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Layout title="Mis solicitudes del Asistente de IA — Rifex" description="Estado de tus solicitudes de piloto del Asistente de IA." noindex>
      <div className={styles.accountWrap}>
        <Link href="/mis-iniciativas" style={{ fontSize: 13, color: '#6B7280' }}>← Mis iniciativas</Link>
        <h1 className={styles.accountTitle}>Mis solicitudes del Asistente de IA</h1>
        <p className={styles.accountSub}>
          Aquí ves el estado de tus solicitudes de piloto del Asistente de IA. ¿Necesitas ayuda? <Link href="/contacto">Escríbenos a soporte</Link>.
        </p>

        {state.status === 'loading' && <p className={styles.requestMeta} role="status">Cargando tus solicitudes…</p>}
        {state.status === 'error' && (
          <p className={styles.formError} role="alert">No pudimos cargar tus solicitudes. Inténtalo nuevamente en unos minutos.</p>
        )}
        {state.status === 'ok' && state.requests.length === 0 && (
          <div className={styles.emptyState}>
            <p style={{ margin: '0 0 12px' }}>Todavía no tienes solicitudes de piloto.</p>
            <Link href="/warp-conversacional#solicitar" className={styles.btnInline}>Solicitar piloto</Link>
          </div>
        )}
        {state.status === 'ok' && state.requests.length > 0 && (
          <ul className={styles.requestList}>
            {state.requests.map((r) => (
              <li key={r.id} className={styles.requestCard}>
                <div className={styles.requestHead}>
                  <p className={styles.requestDomain}>{r.domain}</p>
                  <span className={styles.statusPill}>{r.statusLabel}</span>
                </div>
                <p className={styles.requestMeta}>{r.company} · Enviada el {fmtDate(r.createdAt)} · Identificador {r.shortId}</p>
                <p className={styles.requestNext}><b>Siguiente paso:</b> {r.nextStep}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Layout>
  );
}

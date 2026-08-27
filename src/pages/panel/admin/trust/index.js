// src/pages/panel/admin/trust/index.js
// TRUST-3A — cola de revisión manual (solo admins reales, gate real es
// la API vía resolveAdmin — esto es solo UX, nunca la autoridad).
import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { supabaseBrowser as supabase } from '@/lib/supabaseClient';

export default function AdminTrustQueue() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;
      if (!session) {
        router.replace(`/login?next=${encodeURIComponent('/panel/admin/trust')}`);
        return;
      }
      try {
        const res = await fetch('/api/admin/trust/queue', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const data2 = await res.json();
        if (!res.ok || !data2.ok) {
          setError(res.status === 403 ? 'No tienes acceso a esta sección.' : 'No se pudo cargar la cola.');
          return;
        }
        setItems(data2.items || []);
      } finally {
        setReady(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready) return null;

  return (
    <>
      <Head><title>Cola de verificación — Rifex Admin</title></Head>
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>
        <h1 style={{ fontWeight: 800, marginBottom: 8 }}>Verificación de identidad — cola de revisión</h1>
        {error && <p style={{ color: '#b91c1c' }}>{error}</p>}
        {!error && items.length === 0 && <p>No hay casos pendientes de revisión.</p>}
        {!error && items.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ padding: '8px 4px' }}>Usuario</th>
                <th style={{ padding: '8px 4px' }}>País</th>
                <th style={{ padding: '8px 4px' }}>Estado</th>
                <th style={{ padding: '8px 4px' }}>Enviado</th>
                <th style={{ padding: '8px 4px' }} />
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.user_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px 4px', fontFamily: 'monospace', fontSize: 12 }}>{it.user_id.slice(0, 8)}…</td>
                  <td style={{ padding: '8px 4px' }}>{it.country_code || '—'}</td>
                  <td style={{ padding: '8px 4px' }}>{it.status}</td>
                  <td style={{ padding: '8px 4px' }}>{it.submitted_at ? new Date(it.submitted_at).toLocaleString('es-CL') : '—'}</td>
                  <td style={{ padding: '8px 4px' }}>
                    <Link href={`/panel/admin/trust/${it.user_id}`}>Abrir</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </>
  );
}

AdminTrustQueue.getLayout = (page) => <Layout>{page}</Layout>;

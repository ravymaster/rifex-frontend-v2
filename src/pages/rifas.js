// src/pages/rifas.jsx
import Head from 'next/head';
import Layout from '@/components/Layout';
import styles from '@/styles/rifas.module.css';
import { useEffect, useState } from 'react';
import { supabaseBrowser as supabase } from '@/lib/supabaseClient';

const temaEmoji = {
  superheroes:'🦸', mitologia:'⚡', dinosaurios:'🦖', universo:'🌌',
  comidas:'🍔', fauna:'🦁', videojuegos:'🎮', autos:'🚗'
};
const premioEmoji = { dinero:'💸', fisico:'🎁' };

const fmtCLP = (cents) => `$${new Intl.NumberFormat('es-CL').format(Math.round(Number(cents || 0) / 100))}`;

export default function Rifas() {
  const [tab, setTab] = useState('publicas'); // 'publicas' | 'mias'
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [needsLogin, setNeedsLogin] = useState(false);

  async function load() {
    setLoading(true);
    setNeedsLogin(false);
    try {
      if (tab === 'mias') {
        // "Mis rifas" necesita sesión real — reusa el mismo endpoint ya
        // probado del panel del creador, que filtra por dueño de verdad
        // (creator_id/creator_email), no un query param sin autenticar.
        const { data: { session } = {} } = await supabase.auth.getSession();
        if (!session) {
          setItems([]);
          setNeedsLogin(true);
          return;
        }
        const r = await fetch('/api/panel/raffles', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const j = await r.json();
        setItems(j?.items || []);
      } else {
        const r = await fetch('/api/rifas');
        const j = await r.json();
        setItems(j?.items || []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [tab]);

  return (
    <>
      <Head><title>Rifas — Rifex</title></Head>

      <main className={styles.page}>
        <div className={`container ${styles.header}`}>
          <h1 className={styles.title}>Explora rifas</h1>
          <p className={styles.sub}>Mira las rifas publicadas o revisa las tuyas.</p>

          <div className={styles.tabs}>
            <button
              className={`${styles.tab} ${tab === 'publicas' ? styles.active : ''}`}
              onClick={() => setTab('publicas')}
            >
              Públicas
            </button>
            <button
              className={`${styles.tab} ${tab === 'mias' ? styles.active : ''}`}
              onClick={() => setTab('mias')}
              title="Requiere sesión"
            >
              Mis rifas
            </button>
          </div>
        </div>

        <div className="container">
          {loading && (
            <div className={styles.skelGrid}>
              {Array.from({length:6}).map((_,i)=>(
                <div key={i} className={styles.skelCard} />
              ))}
            </div>
          )}

          {!loading && needsLogin && (
            <div className={styles.empty}>
              Iniciá sesión para ver tus rifas. <a href="/login?next=/rifas">Ingresar</a>
            </div>
          )}

          {!loading && !needsLogin && items.length === 0 && (
            <div className={styles.empty}>
              {tab === 'publicas'
                ? 'No hay rifas publicadas todavía.'
                : 'Aún no has creado rifas.'}
            </div>
          )}

          {!loading && !needsLogin && items.length > 0 && (
            <div className={styles.grid}>
              {items.map(r => (
                <article key={r.id} className={styles.card}>
                  <header className={styles.cardHead}>
                    <h3 className={styles.cardTitle}>{r.title}</h3>
                    <span className={styles.badge}>
                      {premioEmoji[r.prize_type] || '🎟️'} {r.status}
                    </span>
                  </header>

                  {r.theme && (
                    <div className={styles.tags}>
                      <span className={styles.tag}>
                        {temaEmoji[r.theme] || '🏷️'} {r.theme}
                      </span>
                    </div>
                  )}

                  <div className={styles.meta}>
                    <span><strong>Precio:</strong> {fmtCLP(r.price_cents)}</span>
                    <span><strong>Cupos:</strong> {r.total_numbers}</span>
                    {r.end_date && (
                      <span className={styles.datesInline}>Termina el {r.end_date}</span>
                    )}
                  </div>

                  <footer className={styles.cardFoot}>
                    <a className={styles.btnGhost} href={`/rifas/${r.id}`}>Ver rifa</a>
                  </footer>
                </article>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}

Rifas.getLayout = (page) => <Layout>{page}</Layout>;

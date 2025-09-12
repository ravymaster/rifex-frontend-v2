// src/pages/rifas.jsx
import Head from 'next/head';
import Layout from '@/components/Layout';
import styles from '@/styles/rifas.module.css';
import { useEffect, useState } from 'react';

const temaEmoji = {
  superheroes:'🦸', mitologia:'⚡', dinosaurios:'🦖', universo:'🌌',
  comidas:'🍔', fauna:'🦁', videojuegos:'🎮', autos:'🚗'
};
const premioEmoji = { dinero:'💸', fisico:'🎁' };

const fmtCLP = (n) => `$${new Intl.NumberFormat('es-CL').format(Number(n || 0))}`;

export default function Rifas() {
  const [tab, setTab] = useState('publicas'); // 'publicas' | 'mias'
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const url = tab === 'mias' ? '/api/rifas?mine=true' : '/api/rifas';
    const r = await fetch(url);
    const j = await r.json();
    setItems(j?.data || []);
    setLoading(false);
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

          {!loading && items.length === 0 && (
            <div className={styles.empty}>
              {tab === 'publicas'
                ? 'No hay rifas publicadas todavía.'
                : 'Aún no has creado rifas.'}
            </div>
          )}

          {!loading && items.length > 0 && (
            <div className={styles.grid}>
              {items.map(r => (
                <article key={r.id} className={styles.card}>
                  <header className={styles.cardHead}>
                    <h3 className={styles.cardTitle}>{r.titulo}</h3>
                    <span className={styles.badge}>
                      {premioEmoji[r.tipo_premio] || '🎟️'} {r.estado}
                    </span>
                  </header>

                  {Array.isArray(r.temas) && r.temas.length > 0 && (
                    <div className={styles.tags}>
                      {r.temas.map(t => (
                        <span key={t} className={styles.tag}>
                          {temaEmoji[t] || '🏷️'} {t}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className={styles.meta}>
                    <span><strong>Precio:</strong> {fmtCLP(r.precio_clp)}</span>
                    <span><strong>Cupos:</strong> {r.cupos}</span>
                    {r.inicio && r.termino && (
                      <span className={styles.datesInline}>
                        Del {r.inicio} al {r.termino}
                      </span>
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



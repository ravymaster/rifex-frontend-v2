// src/pages/eventos/index.jsx
// EVENT-1 (Fase 11) — listado público simple de eventos publicados, sin
// filtros. Consume GET /api/events.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import styles from '@/styles/evento.module.css';

function fmtDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', timeZone: 'America/Santiago' });
  } catch { return ''; }
}

export default function EventosListado() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/events');
        const data = await res.json();
        if (res.ok && data.ok) setItems(data.items || []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <Layout title="Eventos — Rifex" description="Descubre eventos y compra tus entradas." canonicalPath="/eventos">
      <div className={styles.wrap}>
        <h1 className={styles.title}>Eventos</h1>
        {loading && <p>Cargando…</p>}
        {!loading && items.length === 0 && <p className={styles.empty}>Todavía no hay eventos publicados.</p>}
        <div className={styles.listGrid}>
          {items.map((ev) => (
            <Link key={ev.id} href={`/eventos/${ev.id}`} className={styles.listCard}>
              {ev.cover_image_url && <img className={styles.listCover} src={ev.cover_image_url} alt="" />}
              <div className={styles.listBody}>
                <p className={styles.listTitle}>{ev.title}</p>
                <p className={styles.listMeta}>{fmtDate(ev.starts_at)}{ev.venue_name ? ` · ${ev.venue_name}` : ''}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </Layout>
  );
}

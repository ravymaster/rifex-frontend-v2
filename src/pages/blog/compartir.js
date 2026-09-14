// src/pages/blog/compartir.js
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import styles from '@/styles/compartirHistoria.module.css';
import { supabaseBrowser as supabase } from '@/lib/supabaseClient';

function clp(cents) {
  const n = Number(cents || 0) / 100;
  return n.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
}

export default function CompartirHistoria() {
  const router = useRouter();
  const [token, setToken] = useState(null);
  const [raffles, setRaffles] = useState(null);
  const [selected, setSelected] = useState(null);
  const [title, setTitle] = useState('');
  const [story, setStory] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [okSlug, setOkSlug] = useState(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;
      if (!session) { router.push('/login?next=/blog/compartir'); return; }
      setToken(session.access_token);
      try {
        const r = await fetch('/api/panel/raffles?status=closed', { headers: { Authorization: `Bearer ${session.access_token}` } });
        const j = await r.json();
        setRaffles(r.ok ? (j.items || []) : []);
      } catch {
        setRaffles([]);
      }
    })();
  }, [router]);

  async function onSubmit(e) {
    e.preventDefault();
    if (!selected) { setErr('Elegí una rifa cerrada.'); return; }
    if (!title.trim()) { setErr('Ponele un título a tu historia.'); return; }
    if (story.trim().length < 20) { setErr('Contá un poco más — mínimo 20 caracteres.'); return; }
    setSaving(true);
    setErr('');
    try {
      const r = await fetch('/api/blog/historia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ raffle_id: selected.id, title: title.trim(), story: story.trim() }),
      });
      const j = await r.json();
      if (r.status === 409) {
        setErr('Ya compartiste la historia de esta rifa.');
        setOkSlug(j.slug || null);
        return;
      }
      if (!r.ok || !j.ok) throw new Error(j?.error || 'No se pudo publicar tu historia.');
      setOkSlug(j.post.slug);
    } catch (e2) {
      setErr(e2?.message || 'No se pudo publicar tu historia.');
    } finally {
      setSaving(false);
    }
  }

  if (okSlug) {
    return (
      <section className={styles.page}>
        <div className="container" style={{ maxWidth: 640 }}>
          <div className={styles.card}>
            <p className={styles.ok}>¡Listo! Tu historia ya está publicada.</p>
            <Link href={`/blog/${okSlug}`} className="btn btn-primary" style={{ display: 'inline-block', marginTop: 12, textDecoration: 'none' }}>
              Ver mi historia
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <>
      <Head>
        <title>Compartir mi historia — Rifex</title>
        <meta name="robots" content="noindex, nofollow, noarchive" />
      </Head>
      <section className={styles.page}>
        <div className="container" style={{ maxWidth: 640 }}>
          <div className={styles.card}>
            <h1 className={styles.title}>Compartir mi historia</h1>
            <p className={styles.sub}>Elegí una rifa que ya cerraste. Los números vendidos y el monto recaudado se completan solos, con tus datos reales.</p>

            {raffles === null ? (
              <p className={styles.raffleEmpty}>Cargando tus rifas…</p>
            ) : raffles.length === 0 ? (
              <p className={styles.raffleEmpty}>Todavía no tenés rifas cerradas. Cuando cierres una, vas a poder contar tu historia acá.</p>
            ) : (
              <div className={styles.raffleList}>
                {raffles.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className={styles.raffleOption}
                    data-selected={selected?.id === r.id}
                    onClick={() => setSelected(r)}
                  >
                    <div>
                      <b>{r.title}</b>
                      <small>{r.sold}/{r.total_numbers} números vendidos · {clp(r.sold * r.price_cents)}</small>
                    </div>
                    <span>{selected?.id === r.id ? '✓' : ''}</span>
                  </button>
                ))}
              </div>
            )}

            {selected && (
              <form onSubmit={onSubmit}>
                <div className={styles.field}>
                  <label>Título de tu historia</label>
                  <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder='Ej: "Cerré mi rifa en 9 días"' maxLength={140} />
                </div>
                <div className={styles.field}>
                  <label>Contá cómo lo lograste</label>
                  <textarea className="input" value={story} onChange={(e) => setStory(e.target.value)} placeholder="¿Cómo promocionaste tu rifa? ¿Qué funcionó y qué no?" maxLength={3000} />
                  <p className={styles.hint}>{story.trim().length}/3000</p>
                </div>
                {err && <p className={styles.err}>{err}</p>}
                <button className="btn btn-primary" disabled={saving}>{saving ? 'Publicando…' : 'Publicar mi historia'}</button>
              </form>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
CompartirHistoria.getLayout = (page) => <Layout>{page}</Layout>;

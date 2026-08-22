// src/pages/blog/nueva.js
// Publicar Guía/Consejo/Novedad como equipo Rifex. No está linkeada desde
// ningún menú — la autorización real vive en el server (ADMIN_EMAILS).
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import styles from '@/styles/compartirHistoria.module.css';
import { supabaseBrowser as supabase } from '@/lib/supabaseClient';

const CATEGORIES = [
  { value: 'guia', label: 'Guía' },
  { value: 'consejo', label: 'Consejo' },
  { value: 'novedad', label: 'Novedad' },
];
const EMOJIS = ['📰', '💡', '⚡', '✅', '📊', '🎯'];

export default function NuevaPublicacion() {
  const router = useRouter();
  const [token, setToken] = useState(null);
  const [category, setCategory] = useState('guia');
  const [emoji, setEmoji] = useState('📰');
  const [title, setTitle] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [okSlug, setOkSlug] = useState(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;
      if (!session) { router.push('/login?next=/blog/nueva'); return; }
      setToken(session.access_token);
    })();
  }, [router]);

  async function onSubmit(e) {
    e.preventDefault();
    if (!title.trim() || body.trim().length < 20) { setErr('Completá título y un contenido de al menos 20 caracteres.'); return; }
    setSaving(true);
    setErr('');
    try {
      const r = await fetch('/api/blog/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ category, title: title.trim(), excerpt: excerpt.trim(), body: body.trim(), cover_emoji: emoji }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j?.error === 'not_admin' ? 'Tu cuenta no está autorizada para publicar.' : (j?.error || 'No se pudo publicar.'));
      setOkSlug(j.post.slug);
    } catch (e2) {
      setErr(e2?.message || 'No se pudo publicar.');
    } finally {
      setSaving(false);
    }
  }

  if (okSlug) {
    return (
      <section className={styles.page}>
        <div className="container" style={{ maxWidth: 640 }}>
          <div className={styles.card}>
            <p className={styles.ok}>¡Publicado!</p>
            <a href={`/blog/${okSlug}`} className="btn btn-primary" style={{ display: 'inline-block', marginTop: 12, textDecoration: 'none' }}>Ver publicación</a>
          </div>
        </div>
      </section>
    );
  }

  return (
    <>
      <Head><title>Nueva publicación — Rifex</title></Head>
      <section className={styles.page}>
        <div className="container" style={{ maxWidth: 640 }}>
          <div className={styles.card}>
            <h1 className={styles.title}>Nueva publicación</h1>
            <p className={styles.sub}>Se publica como "Equipo Rifex".</p>

            <form onSubmit={onSubmit}>
              <div className={styles.field}>
                <label>Categoría</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {CATEGORIES.map((c) => (
                    <button key={c.value} type="button" className="btn btn-ghost" style={{ opacity: category === c.value ? 1 : 0.5 }} onClick={() => setCategory(c.value)}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.field}>
                <label>Ícono</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {EMOJIS.map((em) => (
                    <button key={em} type="button" className="btn btn-ghost" style={{ opacity: emoji === em ? 1 : 0.5, fontSize: 18 }} onClick={() => setEmoji(em)}>
                      {em}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.field}>
                <label>Título</label>
                <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} />
              </div>
              <div className={styles.field}>
                <label>Bajada (opcional)</label>
                <input className="input" value={excerpt} onChange={(e) => setExcerpt(e.target.value)} maxLength={220} />
              </div>
              <div className={styles.field}>
                <label>Contenido</label>
                <textarea className="input" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Usá ## para subtítulos." style={{ minHeight: 220 }} />
              </div>
              {err && <p className={styles.err}>{err}</p>}
              <button className="btn btn-primary" disabled={saving}>{saving ? 'Publicando…' : 'Publicar'}</button>
            </form>
          </div>
        </div>
      </section>
    </>
  );
}
NuevaPublicacion.getLayout = (page) => <Layout>{page}</Layout>;

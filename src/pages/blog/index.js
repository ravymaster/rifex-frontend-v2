// src/pages/blog/index.js
// RIFEX BLOG PRIVATE PRE-PROD — Blog deja de ser superficie pública: se
// exige sesión igual que /blog/nueva y /blog/compartir ya exigían, y las
// APIs de lectura (list + detalle) ahora también requieren el mismo Bearer
// token, para que el contenido no quede accesible anónimamente por fuera
// de la página.
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import styles from '@/styles/blog.module.css';
import { supabaseBrowser as supabase } from '@/lib/supabaseClient';

const CATEGORY_LABEL = { historia: 'Historia de éxito', guia: 'Guía', consejo: 'Consejo', novedad: 'Novedad' };
const FILTERS = [
  { value: null, label: 'Todos' },
  { value: 'historia', label: 'Historias de éxito' },
  { value: 'guia', label: 'Guías' },
  { value: 'consejo', label: 'Consejos' },
  { value: 'novedad', label: 'Novedades' },
];

function clp(cents) {
  const n = Number(cents || 0) / 100;
  return n.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
}

export default function Blog() {
  const router = useRouter();
  const [category, setCategory] = useState(null);
  const [posts, setPosts] = useState([]);
  const [categoryCounts, setCategoryCounts] = useState(null);
  const [topReacted, setTopReacted] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [viewer, setViewer] = useState(null);
  const [token, setToken] = useState(null);
  const [email, setEmail] = useState('');
  const [subOk, setSubOk] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;
      if (!session) { router.push(`/login?next=${encodeURIComponent('/blog')}`); return; }
      setViewer(session.user);
      setToken(session.access_token);
    })();
  }, [router]);

  async function loadFirstPage(cat, tok) {
    setLoading(true);
    try {
      const url = new URL('/api/blog', window.location.origin);
      if (cat) url.searchParams.set('category', cat);
      const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${tok}` } });
      const j = await r.json();
      if (r.ok && j.ok) {
        setPosts(j.posts || []);
        setHasMore(!!j.hasMore);
        if (j.categoryCounts) setCategoryCounts(j.categoryCounts);
        if (j.topReacted) setTopReacted(j.topReacted);
      }
    } finally {
      setLoading(false);
    }
  }

  // Solo carga una vez que la sesión está confirmada — evita un primer
  // fetch anónimo que ahora devolvería 401.
  useEffect(() => { if (token) loadFirstPage(category, token); }, [category, token]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const url = new URL('/api/blog', window.location.origin);
      if (category) url.searchParams.set('category', category);
      url.searchParams.set('offset', String(posts.length));
      const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
      const j = await r.json();
      if (r.ok && j.ok) {
        setPosts((prev) => [...prev, ...(j.posts || [])]);
        setHasMore(!!j.hasMore);
      }
    } finally {
      setLoadingMore(false);
    }
  }

  async function onSubscribe(e) {
    e.preventDefault();
    if (!email.trim()) return;
    const r = await fetch('/api/blog/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim() }),
    });
    if (r.ok) { setSubOk(true); setEmail(''); }
  }

  const featured = posts[0];
  const rest = posts.slice(1);

  return (
    <>
      <Head>
        <title>Blog — Rifex</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow, noarchive" />
      </Head>

      <section className={styles.page}>
        <div className="container">
          <div className={styles.pageHead}>
            <h1>Blog de Rifex</h1>
            <span className={styles.badgeNew}>Comunidad</span>
          </div>
          <p className={styles.pageSub}>Guías del equipo y, sobre todo, historias reales de creadores que ya cerraron su rifa.</p>

          <div className={styles.filters}>
            {FILTERS.map((f) => (
              <button
                key={f.label}
                type="button"
                className={styles.filterPill}
                data-active={category === f.value}
                onClick={() => setCategory(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className={styles.layout}>
            <div>
              {loading ? (
                <p className={styles.empty}>Cargando publicaciones…</p>
              ) : !posts.length ? (
                <p className={styles.empty}>Todavía no hay publicaciones en esta categoría.</p>
              ) : (
                <>
                  {featured && (
                    <Link href={`/blog/${featured.slug}`} className={styles.featured}>
                      <div>
                        <span className={styles.featTag}>{featured.cover_emoji} {CATEGORY_LABEL[featured.category]}</span>
                        <h2>{featured.title}</h2>
                        {featured.excerpt && <p className={styles.featDesc}>{featured.excerpt}</p>}
                        <div className={styles.featAuthor}>{featured.author_name}</div>
                        {featured.stats?.numbers_sold != null && (
                          <div className={styles.featStats}>
                            <div><b>{featured.stats.numbers_sold}/{featured.stats.total_numbers}</b><small>números vendidos</small></div>
                            <div><b>{clp(featured.stats.amount_cents)}</b><small>recaudados</small></div>
                          </div>
                        )}
                        <div className={styles.featCta}>
                          <span className={styles.btnPrimary}>Leer historia completa →</span>
                          <div className={styles.reactRow}><span>❤ {featured.reaction_count}</span><span>💬 {featured.comment_count}</span></div>
                        </div>
                      </div>
                      <div className={styles.featArt}>{featured.cover_emoji}</div>
                    </Link>
                  )}

                  {rest.length > 0 && (
                    <>
                      <h2 className={styles.sectionLabel}>Últimas publicaciones</h2>
                      <div className={styles.grid}>
                        {rest.map((p) => (
                          <Link key={p.id} href={`/blog/${p.slug}`} className={styles.card}>
                            <div className={styles.cardArt} data-tone={p.category}>
                              <span className={styles.cardTag}>{CATEGORY_LABEL[p.category]}</span>
                              {p.cover_emoji}
                            </div>
                            <div className={styles.cardBody}>
                              <div className={styles.cardTitle}>{p.title}</div>
                              {p.stats?.numbers_sold != null && (
                                <div className={styles.cardStats}>
                                  <span className={styles.chip}>{p.stats.numbers_sold}/{p.stats.total_numbers} vendidos</span>
                                  <span className={styles.chip}>{clp(p.stats.amount_cents)}</span>
                                </div>
                              )}
                              <div className={styles.cardFoot}>
                                <div className={styles.cardAuthor}><small>{p.author_name}</small></div>
                                <div className={styles.cardReact}><span>❤ {p.reaction_count}</span><span>💬 {p.comment_count}</span></div>
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </>
                  )}

                  {hasMore && (
                    <button type="button" className={styles.loadMore} onClick={loadMore} disabled={loadingMore}>
                      {loadingMore ? 'Cargando…' : 'Cargar más publicaciones ↓'}
                    </button>
                  )}
                </>
              )}
            </div>

            <aside className={styles.side}>
              <div className={styles.panel}>
                <h3>Categorías</h3>
                <button type="button" className={styles.catRow} data-active={category === null} onClick={() => setCategory(null)}>
                  <b>Todas</b>
                  <span className={styles.catCount}>
                    {categoryCounts ? Object.values(categoryCounts).reduce((a, b) => a + b, 0) : '—'}
                  </span>
                </button>
                {['historia', 'guia', 'consejo', 'novedad'].map((c) => (
                  <button key={c} type="button" className={styles.catRow} data-active={category === c} onClick={() => setCategory(c)}>
                    <span>{CATEGORY_LABEL[c]}</span>
                    <span className={styles.catCount}>{categoryCounts ? categoryCounts[c] : '—'}</span>
                  </button>
                ))}
              </div>

              {topReacted.length > 0 && (
                <div className={styles.panel}>
                  <h3>Historias destacadas</h3>
                  {topReacted.map((p, i) => (
                    <Link key={p.id} href={`/blog/${p.slug}`} className={styles.rankRow}>
                      <span className={styles.rankNum}>{i + 1}</span>
                      <span className={styles.rankThumb}>{p.cover_emoji}</span>
                      <div className={styles.rankInfo}><b>{p.title}</b><small>❤ {p.reaction_count} reacciones</small></div>
                    </Link>
                  ))}
                </div>
              )}

              {viewer ? (
                <div className={`${styles.panel} ${styles.sharePanel}`}>
                  <h3>¿Tu rifa vendió todo?</h3>
                  <p>Si ya cerraste una rifa, podés convertirla en historia con un clic: tomamos los números y el monto directo de tus datos reales.</p>
                  <Link href="/blog/compartir" legacyBehavior>
                    <a><button type="button">Compartir mi historia</button></a>
                  </Link>
                </div>
              ) : null}

              <div className={styles.panel}>
                <h3>Suscribite al blog</h3>
                {subOk ? (
                  <p className={styles.subOk}>¡Listo! Te vamos a avisar cuando publiquemos algo nuevo.</p>
                ) : (
                  <>
                    <form className={styles.subForm} onSubmit={onSubscribe}>
                      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" required />
                      <button type="submit">Enviar</button>
                    </form>
                    <p className={styles.subHint}>Un correo cuando publicamos algo nuevo. Nada de spam.</p>
                  </>
                )}
              </div>
            </aside>
          </div>
        </div>
      </section>
    </>
  );
}
Blog.getLayout = (page) => <Layout>{page}</Layout>;

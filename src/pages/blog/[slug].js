// src/pages/blog/[slug].js
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import Layout from '@/components/Layout';
import styles from '@/styles/post.module.css';
import { supabaseBrowser as supabase } from '@/lib/supabaseClient';

const CATEGORY_LABEL = { historia: 'Historia de éxito', guia: 'Guía', consejo: 'Consejo', novedad: 'Novedad' };
const GUEST_NAME_KEY = 'rifex_guest_chat_name';

function clp(cents) {
  const n = Number(cents || 0) / 100;
  return n.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
}
function timeLabel(iso) {
  try { return new Date(iso).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}

export default function Post() {
  const { query } = useRouter();
  const slug = query.slug;

  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [reacted, setReacted] = useState(false);
  const [reactionCount, setReactionCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [viewer, setViewer] = useState(null);
  const [token, setToken] = useState(null);

  const [commentText, setCommentText] = useState('');
  const [guestName, setGuestName] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data?.session) { setViewer(data.session.user); setToken(data.session.access_token); }
      else setGuestName(localStorage.getItem(GUEST_NAME_KEY) || '');
    })();
  }, []);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const headers = {};
        const { data: sres } = await supabase.auth.getSession();
        if (sres?.session) headers.Authorization = `Bearer ${sres.session.access_token}`;
        const r = await fetch(`/api/blog/${slug}`, { headers });
        const j = await r.json();
        if (cancelled) return;
        if (!r.ok || !j.ok) { setNotFound(true); return; }
        setPost(j.post);
        setComments(j.comments || []);
        setReacted(!!j.viewerReacted);
        setReactionCount(j.post.reaction_count || 0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => {
    if (!post?.id) return;
    const channel = supabase
      .channel(`blog-comments-${post.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'blog_comments', filter: `post_id=eq.${post.id}` },
        (payload) => {
          const row = payload.new;
          setComments((prev) => (prev.some((c) => c.id === row.id)
            ? prev
            : [...prev, { ...row, is_guest: !row.user_id, nombre: row.user_id ? 'Usuario' : (row.guest_name || 'Invitado'), avatar_url: null }]));
        }
      )
      .subscribe();
    return () => { try { supabase.removeChannel(channel); } catch {} };
  }, [post?.id]);

  async function onToggleReact() {
    if (!token) return;
    const prevReacted = reacted;
    setReacted(!prevReacted);
    setReactionCount((c) => c + (prevReacted ? -1 : 1));
    try {
      const r = await fetch(`/api/blog/${slug}/react`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const j = await r.json();
      if (r.ok && j.ok) { setReacted(j.reacted); setReactionCount(j.reaction_count); }
    } catch {
      setReacted(prevReacted);
      setReactionCount((c) => c + (prevReacted ? 1 : -1));
    }
  }

  async function onSendComment(e) {
    e.preventDefault();
    const body = commentText.trim();
    if (!body || sending) return;
    if (!token && !guestName.trim()) { setErr('Poné tu nombre para poder comentar.'); return; }
    setSending(true);
    setErr('');
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const payload = token ? { body } : { body, guest_name: guestName.trim() };
      if (!token) localStorage.setItem(GUEST_NAME_KEY, guestName.trim());

      const res = await fetch(`/api/blog/${slug}/comments`, { method: 'POST', headers, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'No se pudo comentar.');
      setComments((prev) => (prev.some((c) => c.id === data.comment.id) ? prev : [...prev, data.comment]));
      setCommentText('');
    } catch (e2) {
      setErr(e2?.message || 'No se pudo comentar.');
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return <section className={styles.page}><div className="container"><p style={{ padding: '24px 0' }}>Cargando…</p></div></section>;
  }
  if (notFound || !post) {
    return <section className={styles.page}><div className="container"><p style={{ padding: '24px 0' }}>Publicación no encontrada.</p></div></section>;
  }

  return (
    <>
      <Head>
        <title>{`${post.title} — Blog Rifex`}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <article className={styles.page}>
        <div className="container" style={{ maxWidth: 720 }}>
          <header className={styles.header}>
            <span className={styles.category}>{post.cover_emoji} {CATEGORY_LABEL[post.category]}</span>
            <h1 className={styles.title}>{post.title}</h1>
            <div className={styles.meta}>Por {post.author_name} · {new Date(post.created_at).toLocaleDateString('es-CL')}</div>
          </header>

          {post.stats?.numbers_sold != null && (
            <div className={styles.statsBar}>
              <div><b>{post.stats.numbers_sold}/{post.stats.total_numbers}</b><small>números vendidos</small></div>
              <div><b>{clp(post.stats.amount_cents)}</b><small>recaudados</small></div>
            </div>
          )}

          <div className={styles.content}>
            {post.body.split('\n').map((line, i) =>
              line.startsWith('##') || line.startsWith('###') ? (
                <h3 key={i}>{line.replace(/#+\s?/, '')}</h3>
              ) : line.trim() === '' ? <br key={i} /> : <p key={i}>{line}</p>
            )}
          </div>

          <div className={styles.reactBar}>
            <button type="button" className={styles.reactBtn} data-active={reacted} onClick={onToggleReact} disabled={!token} title={!token ? 'Inicia sesión para reaccionar' : ''}>
              ❤ {reactionCount}
            </button>
            <span className={styles.commentCount}>💬 {comments.length} comentarios</span>
          </div>

          <section className={styles.comments}>
            <h2 className={styles.commentsTitle}>Comentarios</h2>
            <div className={styles.commentsList} ref={listRef}>
              {comments.length ? comments.map((c) => (
                <div key={c.id} className={styles.commentRow}>
                  <div className={styles.commentMeta}>
                    <span className={styles.commentName}>{c.nombre}</span>
                    {c.is_guest && <span className={styles.guestTag}>Invitado</span>}
                    <span className={styles.commentTime}>{timeLabel(c.created_at)}</span>
                  </div>
                  <div className={styles.commentBody}>{c.body}</div>
                </div>
              )) : <p className={styles.commentsEmpty}>Sé el primero en comentar.</p>}
            </div>

            <form className={styles.commentForm} onSubmit={onSendComment}>
              {!token && (
                <input className="input" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Tu nombre" maxLength={40} disabled={sending} />
              )}
              <textarea className="input" value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Escribe un comentario…" maxLength={500} disabled={sending} />
              <button className="btn btn-primary" disabled={sending || !commentText.trim()}>{sending ? '…' : 'Comentar'}</button>
            </form>
            {err && <p className={styles.err}>{err}</p>}
          </section>
        </div>
      </article>
    </>
  );
}
Post.getLayout = (page) => <Layout>{page}</Layout>;

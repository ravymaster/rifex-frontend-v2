// src/pages/blog/[slug].js
import Head from 'next/head';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import styles from '@/styles/post.module.css';
import { posts } from '@/lib/posts';

export default function Post() {
  const { query } = useRouter();
  const post = posts.find(p => p.slug === query.slug);

  if (!post) {
    return (
      <section className={styles.page}>
        <div className="container"><p>Publicación no encontrada.</p></div>
      </section>
    );
  }

  return (
    <>
      <Head>
        <title>{post.title} — Blog Rifex</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <article className={styles.page}>
        <div className="container">
          <header className={styles.header}>
            <div className={styles.emoji}>{post.emoji}</div>
            <h1 className={styles.title}>{post.title}</h1>
            <div className={styles.meta}>{new Date(post.date).toLocaleDateString('es-CL')}</div>
          </header>
          <div className={styles.content}>
            {/* Render ultra simple (markdown-like) */}
            {post.content.split('\n').map((line, i) =>
              line.startsWith('##') || line.startsWith('###') ? (
                <h3 key={i}>{line.replace(/#+\s?/,'')}</h3>
              ) : line.trim() === '' ? <br key={i}/> : <p key={i}>{line}</p>
            )}
          </div>
        </div>
      </article>
    </>
  );
}
Post.getLayout = (page) => <Layout>{page}</Layout>;

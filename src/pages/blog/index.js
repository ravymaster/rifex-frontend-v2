// src/pages/blog/index.js
import Head from 'next/head';
import Link from 'next/link';
import Layout from '@/components/Layout';
import styles from '@/styles/blog.module.css';
import { posts } from '@/lib/posts';

export default function Blog() {
  return (
    <>
      <Head>
        <title>Blog — Rifex</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <section className={styles.page}>
        <div className="container">
          <header className={styles.header}>
            <h1 className={styles.title}>Blog</h1>
            <p className={styles.sub}>Tips, novedades y guías para creadores.</p>
          </header>

          <div className={styles.grid}>
            {posts.map(p => (
              <article key={p.slug} className={styles.card}>
                <div className={styles.emoji}>{p.emoji}</div>
                <h2 className={styles.postTitle}>
                  <Link href={`/blog/${p.slug}`}>{p.title}</Link>
                </h2>
                <div className={styles.meta}>{new Date(p.date).toLocaleDateString('es-CL')}</div>
                <p className={styles.excerpt}>{p.excerpt}</p>
                <div className={styles.tags}>
                  {p.tags.map(t => <span key={t} className={styles.tag}>#{t}</span>)}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
Blog.getLayout = (page) => <Layout>{page}</Layout>;

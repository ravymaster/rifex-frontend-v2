// src/pages/index.js
import Head from 'next/head';
import styles from '@/styles/index.module.css';
import Layout from '@/components/Layout';

export default function Home() {
  return (
    <>
      <Head>
        <title>Rifex — Inicio</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      {/* HERO */}
      <section className={styles.hero}>
        <div className="container">
          <div className={styles.heroInner}>
            <h1 className={styles.heroTitle}>
              Organiza rifas <span>fácil y rápido</span>
            </h1>
            <p className={styles.heroSub}>
              Crea tu rifa en minutos, comparte el enlace y cobra online.
            </p>

            <div className={styles.ctaRow}>
              <a href="/crear-rifa" className={`btn ${styles.ctaPrimary}`}>Crear rifa</a>
              <a href="/rifas" className={`btn ${styles.ctaSecondary}`}>Ver rifas</a>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className={styles.features}>
        <div className="container">
          <div className={styles.featuresGrid}>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>⚡</div>
              <h3 className={styles.featureTitle}>Publica en minutos</h3>
              <p className={styles.featureText}>Formulario simple: título, precio, cupos y listo.</p>
            </div>

            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>🔗</div>
              <h3 className={styles.featureTitle}>Comparte el enlace</h3>
              <p className={styles.featureText}>Comparte por WhatsApp, Instagram o donde quieras.</p>
            </div>

            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>💳</div>
              <h3 className={styles.featureTitle}>Cobra online</h3>
              <p className={styles.featureText}>Pagos seguros y registro automático de participantes.</p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

/* Mantener layout SOLO en Home.
   Si la quieres sin layout, borra la función completa. */
Home.getLayout = function getLayout(page) {
  return <Layout>{page}</Layout>;
};

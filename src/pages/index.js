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
            <span className={styles.eyebrow}><span>🎟️</span> Rifas online, sin complicaciones</span>
            <h1 className={styles.heroTitle}>
              Organiza rifas <span>fácil y rápido</span>
            </h1>
            <p className={styles.heroSub}>
              Crea tu rifa en minutos, comparte el enlace y cobra online. Sin instalar nada, sin planillas.
            </p>

            <div className={styles.ctaRow}>
              <a href="/crear-rifa" className={`btn ${styles.ctaPrimary}`}>Crear rifa</a>
              <a href="/rifas" className={`btn ${styles.ctaSecondary}`}>Ver rifas</a>
            </div>

            <div className={styles.trustRow}>
              <span>⚡ Publicación en minutos</span>
              <span>💳 Pagos con Mercado Pago</span>
              <span>🔒 Cobro seguro</span>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className={styles.features}>
        <div className="container">
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Todo lo que necesitas, en un solo lugar</h2>
            <p className={styles.sectionSub}>Desde crear tu rifa hasta cobrar el último número.</p>
          </div>
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

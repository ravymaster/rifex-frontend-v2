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
      <section className={styles.heroDark}>
        <span className={styles.dot1} aria-hidden="true">07</span>
        <span className={styles.dot2} aria-hidden="true">24</span>

        <div className="container">
          <div className={styles.heroDarkInner}>
            <span className={styles.badgeDark}><span>📡</span> Rifas y campañas de recaudación</span>
            <h1 className={styles.heroTitleDark}>
              Crea. Comparte. <span>Recauda.</span>
            </h1>
            <p className={styles.heroSubDark}>
              Organiza rifas o campañas de recaudación y cobra con Mercado Pago, sin planillas ni complicaciones.
            </p>

            <div className={styles.ctaRowDark}>
              <a href="/crear-rifa" className={`btn ${styles.ctaPrimaryDark}`}>Crear rifa</a>
              <a href="/crear-colecta" className={`btn ${styles.ctaPrimaryDark}`}>Crear campaña</a>
              <a href="/rifas" className={`btn ${styles.ctaGhostDark}`}>Ver rifas en vivo</a>
            </div>
          </div>

          <p className={styles.showcaseLabel}>Así se ve una rifa en Rifex</p>
          <div className={styles.showcase}>
            <div className={styles.showcaseCard}>
              <div className={styles.showcaseIcon} style={{ background: '#FAEEDA' }}>✈️</div>
              <p className={styles.showcaseTitle}>Viaje a Cancún</p>
              <p className={styles.showcasePrice}>$5.000 el número</p>
              <div className={styles.showcaseBar}><div className={styles.showcaseBarFill} style={{ width: '68%', background: 'var(--turquesa)' }} /></div>
            </div>
            <div className={styles.showcaseCard}>
              <div className={styles.showcaseIcon} style={{ background: '#E1F5EE' }}>📱</div>
              <p className={styles.showcaseTitle}>iPhone 15 Pro</p>
              <p className={styles.showcasePrice}>$3.000 el número</p>
              <div className={styles.showcaseBar}><div className={styles.showcaseBarFill} style={{ width: '91%', background: 'var(--trebol)' }} /></div>
            </div>
            <div className={styles.showcaseCard}>
              <div className={styles.showcaseIcon} style={{ background: '#FAECE7' }}>🚗</div>
              <p className={styles.showcaseTitle}>Auto 0km</p>
              <p className={styles.showcasePrice}>$10.000 el número</p>
              <div className={styles.showcaseBar}><div className={styles.showcaseBarFill} style={{ width: '45%', background: 'var(--ultramar)' }} /></div>
            </div>
          </div>
        </div>
      </section>

      {/* PRODUCTOS */}
      <section className={styles.products}>
        <div className="container">
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Dos formas de recaudar con Rifex</h2>
            <p className={styles.sectionSub}>Elige la que mejor se adapte a lo que necesitas.</p>
          </div>
          <div className={styles.productsGrid}>
            <article className={styles.productCard}>
              <div className={styles.productIcon}>🎟️</div>
              <h3 className={styles.productTitle}>Rifas</h3>
              <p className={styles.productText}>Crea una rifa, comparte tus números y administra todo desde Rifex.</p>
              <div className={styles.productCtas}>
                <a href="/crear-rifa" className={`btn btn-primary ${styles.productCtaPrimary}`}>Crear rifa</a>
              </div>
            </article>

            <article className={styles.productCard}>
              <div className={styles.productIcon}>🤝</div>
              <h3 className={styles.productTitle}>Campañas de recaudación</h3>
              <p className={styles.productText}>Crea una campaña, comparte tu historia y recibe aportes directamente en tu Mercado Pago.</p>
              <div className={styles.productCtas}>
                <a href="/crear-colecta" className={`btn btn-primary ${styles.productCtaPrimary}`}>Crear campaña</a>
              </div>
            </article>
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

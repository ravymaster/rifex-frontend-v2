// src/pages/planes.js
import Head from 'next/head';
import Layout from '@/components/Layout';
import styles from '@/styles/planes.module.css';

export default function Planes() {
  const incluido = [
    'Rifas ilimitadas, sin suscripción',
    'Cobra directo en tu propia cuenta de Mercado Pago',
    'Sin monto fijo ni mensualidad',
    'La comisión solo se cobra si vendes',
  ];

  return (
    <>
      <Head>
        <title>Precios — Rifex</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <section className={styles.page}>
        <div className="container">
          <header className={styles.header}>
            <h1 className={styles.title}>Precios</h1>
            <p className={styles.sub}>Un solo modelo, simple y transparente. Sin planes ni suscripciones.</p>
          </header>

          <div className={styles.grid}>
            <article className={`${styles.card} ${styles.cardHi}`} style={{ gridColumn: '1 / -1', maxWidth: 480, margin: '0 auto' }}>
              <div className={styles.badge}>Único modelo</div>
              <h2 className={styles.planName}>7% por número vendido</h2>
              <div className={styles.price}>Solo cuando vendes</div>
              <p className={styles.desc}>Descontado automáticamente por Mercado Pago en cada venta aprobada.</p>
              <ul className={styles.features}>
                {incluido.map((f, i) => <li key={i}>✔ {f}</li>)}
              </ul>
              <a className={styles.cta} href="/register">Crear cuenta gratis</a>
            </article>
          </div>
        </div>
      </section>
    </>
  );
}
Planes.getLayout = (page) => <Layout>{page}</Layout>;

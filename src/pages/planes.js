// src/pages/planes.js
import Head from 'next/head';
import Layout from '@/components/Layout';
import styles from '@/styles/planes.module.css';

export default function Planes() {
  const incluido = [
    'Eventos y entradas digitales',
    'Campañas de recaudación',
    'Cobro mediante tu cuenta conectada con el proveedor de pagos',
    'Sin monto fijo ni mensualidad',
    'La comisión solo se cobra cuando existe una venta o aporte exitoso',
  ];

  return (
    <>
      <Head>
        <title>Comisión — Rifex</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <section className={styles.page}>
        <div className="container">
          <header className={styles.header}>
            <h1 className={styles.title}>Comisión</h1>
            <p className={styles.sub}>Un solo modelo, simple y transparente. Sin planes ni suscripciones.</p>
          </header>

          <div className={styles.grid}>
            <article className={`${styles.card} ${styles.cardHi}`} style={{ gridColumn: '1 / -1', maxWidth: 480, margin: '0 auto' }}>
              <div className={styles.badge}>Único modelo</div>
              <h2 className={styles.planName}>7% por venta o aporte exitoso</h2>
              <div className={styles.price}>$0 por publicar · $0 mensualidad</div>
              <p className={styles.desc}>
                Rifex cobra 7% únicamente cuando consigues una venta o aporte exitoso.
                No hay mensualidad, suscripción ni cobro por publicar — se descuenta
                automáticamente por tu proveedor de pagos en cada operación aprobada.
              </p>
              <ul className={styles.features}>
                {incluido.map((f, i) => <li key={i}>✔ {f}</li>)}
              </ul>
              <a className={styles.cta} href="/register">Crear cuenta gratis</a>
            </article>
          </div>

          <div className={styles.explainGrid}>
            <section className={styles.explain}>
              <h3 className={styles.explainTitle}>¿Por qué Rifex cobra una comisión?</h3>
              <p className={styles.explainText}>
                Mantener Rifex funcionando tiene costos reales: infraestructura y bases
                de datos, almacenamiento de fotos y archivos, envío de correos y
                notificaciones, dominios, seguridad, soporte a usuarios, impuestos, y el
                trabajo de las personas que desarrollan y mantienen la plataforma.
              </p>
              <p className={styles.explainHighlight}>
                Si tú no recibes dinero, Rifex tampoco cobra comisión.
              </p>
            </section>

            <section className={styles.explain}>
              <h3 className={styles.explainTitle}>¿Existen otros costos?</h3>
              <p className={styles.explainText}>
                Tu proveedor de pagos puede cobrar sus propias tarifas de procesamiento
                o retiro. Esas tarifas son independientes de Rifex, dependen del país,
                el proveedor y tu cuenta, y pueden cambiar sin que dependa de nosotros.
              </p>
            </section>
          </div>
        </div>
      </section>
    </>
  );
}
Planes.getLayout = (page) => <Layout>{page}</Layout>;

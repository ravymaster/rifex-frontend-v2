// src/pages/planes.js
// STAGE 2 FINAL — antes esta página tenía su propio <Head> en paralelo al
// de Layout (sin disableAutoMeta): el mismo patrón que causó el bug real
// de colisión de key en Next 14.2.32 en otras páginas (Layout renderiza
// su Head genérico primero, la key repetida "gana" sobre el título/
// descripción específicos de la página). Se migró a las props
// title/description/canonicalPath de Layout, el mismo patrón ya usado y
// certificado en el resto de las páginas públicas de Etapa 2.
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
Planes.getLayout = (page) => (
  <Layout
    title="Comisión — Rifex"
    description="Rifex cobra una comisión única del 7% por venta o aporte exitoso. Sin planes, sin mensualidad, sin cobro por publicar."
    canonicalPath="/planes"
  >
    {page}
  </Layout>
);

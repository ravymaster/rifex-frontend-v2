import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import styles from '@/styles/checkoutReturn.module.css';

export default function Failure() {
  const { query } = useRouter();
  return (
    <>
      <Head><title>Pago rechazado — Rifex</title></Head>
      <section className={styles.wrap}>
        <div className={styles.card}>
          <div className={styles.head}>
            <span className={`${styles.badge} ${styles.err}`}>✗ Rechazado</span>
          </div>
          <h1 className={styles.title}>No pudimos procesar tu pago</h1>
          <p className={styles.sub}>Prueba con otra tarjeta o medio de pago.</p>

          <div className={styles.details}>
            <div className={styles.k}>Motivo</div><div className={styles.v}>{query.status || 'failure'}</div>
            <div className={styles.k}>Payment ID</div><div className={styles.v}>{query.payment_id || query.collection_id || '—'}</div>
          </div>

          <div className={styles.actions}>
            <Link href="/rifas" className={`${styles.btn} ${styles.prim}`}>Volver a intentar</Link>
            <Link href="/" className={styles.btn}>Ir al inicio</Link>
          </div>
        </div>
      </section>
    </>
  );
}

import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import styles from '@/styles/checkoutReturn.module.css';

export default function Pending() {
  const { query } = useRouter();
  return (
    <>
      <Head><title>Pago pendiente — Rifex</title></Head>
      <section className={styles.wrap}>
        <div className={styles.card}>
          <div className={styles.head}>
            <span className={`${styles.badge} ${styles.warn}`}>⏳ En revisión</span>
          </div>
          <h1 className={styles.title}>Tu pago quedó pendiente</h1>
          <p className={styles.sub}>Estamos esperando la confirmación del medio de pago.</p>

          <div className={styles.details}>
            <div className={styles.k}>Payment ID</div><div className={styles.v}>{query.payment_id || query.collection_id || '—'}</div>
            <div className={styles.k}>Estado</div><div className={styles.v}>{query.status || 'pending'}</div>
          </div>

          <div className={styles.actions}>
            <Link href="/" className={`${styles.btn} ${styles.prim}`}>Volver al inicio</Link>
            <Link href="/rifas" className={styles.btn}>Ver más rifas</Link>
          </div>
        </div>
      </section>
    </>
  );
}

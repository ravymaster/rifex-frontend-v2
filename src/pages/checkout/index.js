// src/pages/checkout/index.js
import Head from "next/head";
import Link from "next/link";
import styles from "@/styles/checkoutReturn.module.css";

// Página de acceso directo a /checkout. No crea ni confirma pagos, no llama
// servicios externos: la preferencia de pago se crea desde /api/checkout/mp
// y el usuario llega aquí solo si abrió esta URL directamente, sin ese flujo.
export default function CheckoutIndex() {
  return (
    <>
      <Head><title>Checkout — Rifex</title></Head>
      <section className={styles.wrap}>
        <div className={styles.card}>
          <h1 className={styles.title}>Esta página no se abre directamente</h1>
          <p className={styles.sub}>
            Para comprar números, entrá a una rifa y seguí el flujo de compra desde ahí.
          </p>

          <div className={styles.actions}>
            <Link href="/rifas" className={`${styles.btn} ${styles.prim}`}>
              Ver rifas
            </Link>
            <Link href="/" className={styles.btn}>
              Ir al inicio
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

// src/pages/checkout/success.js
import Head from "next/head";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import styles from "@/styles/checkoutReturn.module.css";

export default function Success() {
  const { query } = useRouter();
  const [status, setStatus] = useState("loading");
  const [confirm, setConfirm] = useState(null);

  // Confirma automáticamente la compra en backend
  useEffect(() => {
    const confirmPayment = async () => {
      try {
        if (!query.preference_id) return;
        const body = {
          payment_id: query.payment_id || query.collection_id || null,
          status: query.status || query.collection_status || "approved",
          preference_id: query.preference_id,
        };
        const res = await fetch("/api/checkout/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        setConfirm(data);
        setStatus(res.ok ? "ok" : "error");
      } catch (e) {
        console.error("[success confirm]", e);
        setStatus("error");
      }
    };
    confirmPayment();
  }, [query]);

  return (
    <>
      <Head><title>Pago exitoso — Rifex</title></Head>
      <section className={styles.wrap}>
        <div className={styles.card}>
          <div className={styles.head}>
            <span className={`${styles.badge} ${styles.ok}`}>✓ Aprobado</span>
          </div>

          <h1 className={styles.title}>¡Pago confirmado!</h1>
          <p className={styles.sub}>
            Gracias por tu compra. Tus números fueron registrados correctamente.
          </p>

          <div className={styles.details}>
            <div className={styles.k}>Payment ID</div>
            <div className={styles.v}>{query.payment_id || query.collection_id || "—"}</div>
            <div className={styles.k}>Estado</div>
            <div className={styles.v}>{query.status || query.collection_status || "approved"}</div>
          </div>

          {status === "loading" && <p>⏳ Confirmando con Rifex...</p>}
          {status === "ok" && (
            <p style={{ color: "#16a34a" }}>
              ✅ Validado en Rifex. ¡Suerte en tu rifa!
            </p>
          )}
          {status === "error" && (
            <p style={{ color: "#b91c1c" }}>
              ⚠️ No pudimos validar el pago automáticamente. Intenta más tarde.
            </p>
          )}

          <div className={styles.actions}>
            <Link href="/" className={`${styles.btn} ${styles.prim}`}>
              Ir al inicio
            </Link>
            <Link href="/rifas" className={styles.btn}>
              Ver más rifas
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

// src/components/rifex/QuantitySelector.jsx
// RIFEX RAFFLE EXPERIENCE 2026 — reemplaza la grilla de números públicos.
// El comprador solo elige CUÁNTOS números quiere; el servidor decide
// SIEMPRE cuáles (ver assignRandomAvailableNumbers en
// src/pages/api/checkout/mp.js). Este componente no conoce ni pide
// números concretos en ningún momento.
import { useEffect, useState } from "react";
import styles from "../../styles/quantitySelector.module.css";

export default function QuantitySelector({
  open,
  onClose,
  onContinue,
  unitPriceCLP = 0, // CLP entero por número
  maxQuantity = 1,  // techo real: números disponibles ahora mismo
}) {
  const [qty, setQty] = useState(1);

  useEffect(() => {
    if (open) setQty(1);
  }, [open]);

  if (!open) return null;

  const clampedMax = Math.max(1, maxQuantity || 1);
  const dec = () => setQty((n) => Math.max(1, n - 1));
  const inc = () => setQty((n) => Math.min(clampedMax, n + 1));

  const totalCLP = (unitPriceCLP * qty).toLocaleString("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  });
  const unitFmt = unitPriceCLP.toLocaleString("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  });

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3>¿Cuántos números quieres?</h3>
          <button className={styles.close} onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        <div className={styles.body}>
          <div className={styles.stepper}>
            <button
              type="button"
              className={styles.stepBtn}
              onClick={dec}
              disabled={qty <= 1}
              aria-label="Menos"
            >
              −
            </button>
            <span className={styles.stepValue}>{qty}</span>
            <button
              type="button"
              className={styles.stepBtn}
              onClick={inc}
              disabled={qty >= clampedMax}
              aria-label="Más"
            >
              +
            </button>
          </div>

          <div className={styles.priceRow}>
            <span>Precio unitario</span>
            <b>{unitFmt}</b>
          </div>
          <div className={styles.priceRowTotal}>
            <span>Total</span>
            <b>{totalCLP}</b>
          </div>

          {clampedMax <= 5 && (
            <p className={styles.lowStockNote}>
              Quedan {clampedMax} {clampedMax === 1 ? "número disponible" : "números disponibles"}.
            </p>
          )}
        </div>

        <div className={styles.footer}>
          <button className={styles.secondary} onClick={onClose}>Cancelar</button>
          <button className={styles.primary} onClick={() => onContinue?.(qty)}>
            Continuar
          </button>
        </div>
      </div>
    </div>
  );
}

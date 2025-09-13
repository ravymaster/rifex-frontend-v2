// src/components/rifex/BuyerForm.jsx
import { useEffect, useMemo, useState } from "react";

import styles from "../../styles/buyerForm.module.css";

export default function BuyerForm({
  open,
  onClose,
  selected = [],
  priceCLP = 0,          // cents
  termsVersion = "v1.0",
  onSubmit,
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAccepted(false);
  }, [open]);

  const qty = selected.length;
  const total = useMemo(() => {
    const n = (Number(priceCLP || 0) / 100) * qty;
    return n.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
  }, [priceCLP, qty]);

  if (!open) return null;

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3>Datos del comprador</h3>
          <button className={styles.close} onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        <div className={styles.body}>
          <div className={styles.summary}>
            <div><b>Números:</b> {selected.join(", ") || "—"}</div>
            <div><b>Total:</b> {total}</div>
          </div>

          <label className={styles.label}>Nombre</label>
          <input
            className={styles.input}
            placeholder="Tu nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <label className={styles.label}>Correo</label>
          <input
            className={styles.input}
            placeholder="tucorreo@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />
            <span>
              Declaro que leí y acepto los{" "}
              <a href="/terminos" target="_blank" rel="noreferrer">Términos de la rifa</a>.
            </span>
          </label>
          <div className={styles.termsVersion}>Versión: {termsVersion}</div>
        </div>

        <div className={styles.footer}>
          <button className={styles.secondary} onClick={onClose}>Cancelar</button>
          <button
            className={styles.primary}
            disabled={!accepted || qty === 0}
            onClick={() => {
              onSubmit?.({
                name,
                email,
                accepted_terms: accepted,
                terms_version: termsVersion,
              });
            }}
          >
            Pagar ahora
          </button>
        </div>
      </div>
    </div>
  );
}


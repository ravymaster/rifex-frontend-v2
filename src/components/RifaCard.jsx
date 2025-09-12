// src/components/RifaCard.jsx
import Link from 'next/link';
import styles from '@/styles/rifaCard.module.css';

export default function RifaCard({ rifa }) {
  const { id, titulo, temaIcon, precioCLP, cupos, vendidos, estado } = rifa;
  const restantes = Math.max(cupos - vendidos, 0);
  const pct = Math.min(Math.round((vendidos / cupos) * 100), 100);

  return (
    <article className={styles.card}>
      <div className={styles.icon}>{temaIcon}</div>

      <h3 className={styles.title}>{titulo}</h3>

      <div className={styles.badges}>
        <span className={styles.chip}>
          {new Intl.NumberFormat('es-CL').format(precioCLP)} CLP
        </span>
        <span className={styles.chip} data-variant="muted">
          {vendidos}/{cupos} vendidos
        </span>
        <span className={styles.state} data-state={estado}>
          {estado}
        </span>
      </div>

      <div className={styles.progress}>
        <div className={styles.bar}>
          <span className={styles.fill} style={{ width: `${pct}%` }} />
        </div>
        <div className={styles.progressText}>
          {pct}% vendido · {restantes} restantes
        </div>
      </div>

      <div className={styles.actions}>
        <Link href="#" className="btn btn-primary">Participar</Link>
        <Link href="#" className="btn btn-ghost">Ver</Link>
      </div>
    </article>
  );
}

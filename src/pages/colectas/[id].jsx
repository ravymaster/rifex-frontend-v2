// src/pages/colectas/[id].jsx
// Página pública de una Colecta. No requiere sesión. C4: el panel de montos
// ya crea una intención de aporte real y redirige al checkout de Mercado
// Pago — pero la aprobación/confirmación (webhook) todavía no existe, eso
// es C5. Hasta entonces, un aporte queda en estado 'pending' sin más.
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import styles from '@/styles/colectaPublica.module.css';

const SUGGESTED_AMOUNTS = [1000, 2000, 5000, 10000, 50000, 100000];
const isValidEmail = (s) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

function clp(n) {
  return Number(n || 0).toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
}

export default function ColectaPublica() {
  const router = useRouter();
  const { id } = router.query;

  const [colecta, setColecta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const [selectedAmount, setSelectedAmount] = useState(null);
  const [customAmount, setCustomAmount] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [idemKey, setIdemKey] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [helpErr, setHelpErr] = useState('');

  function openHelp() {
    setShowHelp(true);
    setIdemKey(crypto.randomUUID());
  }

  async function onContribute() {
    setHelpErr('');
    const amount = useCustom ? Math.round(Number(customAmount)) : selectedAmount;
    if (!amount || !Number.isFinite(amount) || amount < 500) {
      setHelpErr('Elegí un monto válido (mínimo $500).');
      return;
    }
    if (!name.trim()) { setHelpErr('Poné tu nombre.'); return; }
    if (!isValidEmail(email)) { setHelpErr('Ese email no parece válido.'); return; }

    setSubmitting(true);
    try {
      const res = await fetch('/api/checkout/colecta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          colecta_id: colecta.id,
          amount_clp: amount,
          contributor_name: name.trim(),
          contributor_email: email.trim(),
          idempotency_key: idemKey,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'No se pudo iniciar el aporte.');
      window.location.href = data.url;
    } catch (e) {
      setHelpErr(e?.message || 'No se pudo iniciar el aporte.');
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/colectas/${id}`);
        const j = await r.json();
        if (cancelled) return;
        if (!r.ok || !j.ok) { setNotFound(true); return; }
        setColecta(j.colecta);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return <section className={styles.page}><div className={styles.notFound}>Cargando…</div></section>;
  }
  if (notFound || !colecta) {
    return <section className={styles.page}><div className={styles.notFound}>Esta colecta no existe o ya no está disponible.</div></section>;
  }

  const isActive = colecta.status === 'active';

  return (
    <>
      <Head>
        <title>{`${colecta.title} — Rifex`}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <section className={styles.page}>
        <div className={styles.hero}>
          {colecta.cover_image_url ? (
            <img src={colecta.cover_image_url} alt="" />
          ) : (
            <span className={styles.heroFallback}>🤝</span>
          )}
        </div>

        <div className={styles.body}>
          <span className={styles.statusBadge} data-status={colecta.status}>
            {isActive ? '● Activa' : '● Cerrada'}
          </span>

          <h1 className={styles.title}>{colecta.title}</h1>

          <Link href={`/perfil/${colecta.creator.id}`} className={styles.creatorRow}>
            {colecta.creator.avatar_url ? (
              <img className={styles.creatorAvatar} src={colecta.creator.avatar_url} alt="" />
            ) : (
              <div className={styles.creatorFallback}>{(colecta.creator.nombre || '?').charAt(0).toUpperCase()}</div>
            )}
            <span className={styles.creatorName}>Organiza <b>{colecta.creator.nombre}</b></span>
          </Link>

          <p className={styles.description}>{colecta.description}</p>

          {colecta.gallery_urls?.length > 0 && (
            <>
              <h2 className={styles.galleryTitle}>Fotos</h2>
              <div className={styles.gallery}>
                {colecta.gallery_urls.map((url, i) => (
                  <div key={i} className={styles.galleryTile}>
                    <img src={url} alt="" />
                  </div>
                ))}
              </div>
            </>
          )}

          <div className={styles.ctaWrap}>
            {isActive ? (
              !showHelp && (
                <button type="button" className={styles.ctaBtn} onClick={openHelp}>
                  🤝 Ir a ayudar
                </button>
              )
            ) : (
              <>
                <button type="button" className={styles.ctaBtn} disabled>Esta colecta ya cerró</button>
                <p className={styles.closedNote}>Ya no acepta más aportes.</p>
              </>
            )}
          </div>

          {isActive && showHelp && (
            <div className={styles.helpPanel}>
              <h3>¿Cuánto querés aportar?</h3>
              <div className={styles.amountsGrid}>
                {SUGGESTED_AMOUNTS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    className={styles.amountPill}
                    data-selected={!useCustom && selectedAmount === a}
                    onClick={() => { setSelectedAmount(a); setUseCustom(false); }}
                  >
                    {clp(a)}
                  </button>
                ))}
                <button
                  type="button"
                  className={styles.amountPill}
                  data-other="true"
                  data-selected={useCustom}
                  onClick={() => setUseCustom(true)}
                >
                  Otro monto
                </button>
              </div>

              {useCustom && (
                <div className={styles.helpField}>
                  <label>Monto (CLP)</label>
                  <input
                    className="input"
                    type="number"
                    min="500"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    placeholder="Ej: 15000"
                  />
                </div>
              )}

              <div className={styles.helpField}>
                <label>Tu nombre</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre y apellido" />
              </div>
              <div className={styles.helpField}>
                <label>Tu email</label>
                <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" />
              </div>

              {helpErr && <p className={styles.helpErr}>{helpErr}</p>}

              <button type="button" className={styles.submitBtn} onClick={onContribute} disabled={submitting}>
                {submitting ? 'Redirigiendo a Mercado Pago…' : 'Aportar'}
              </button>
              <p className={styles.feeNote}>No necesitás cuenta en Rifex para aportar.</p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
ColectaPublica.getLayout = (page) => <Layout>{page}</Layout>;

// src/pages/colectas/[id].jsx
// Página pública de una Colecta. No requiere sesión. Layout de dos
// columnas: historia a la izquierda, tarjeta de "Recaudado" + QR a la
// derecha (se apilan en mobile). Meta es opcional — sin ella se muestra
// el recaudado sin barra de progreso, sigue siendo aporte libre.
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import styles from '@/styles/colectaPublica.module.css';
import { STATUS_LABEL_ES } from '@/lib/colectaStatus';

const SUGGESTED_AMOUNTS = [1000, 2000, 5000, 10000, 50000, 100000];
const isValidEmail = (s) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

function clp(n) {
  return Number(n || 0).toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
}

function daysLeft(endAt) {
  if (!endAt) return null;
  const ms = new Date(endAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86400000));
}

export default function ColectaPublica() {
  const router = useRouter();
  const { id } = router.query;

  const [colecta, setColecta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [copied, setCopied] = useState(false);

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
  const base = (process.env.NEXT_PUBLIC_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/+$/, '');
  const publicUrl = `${base}/colectas/${colecta.id}`;
  const displayUrl = publicUrl.replace(/^https?:\/\//, '');
  const qrUrl = `/api/colectas/${colecta.id}/qr.png`;
  const hasGoal = Number(colecta.goal_cents) > 0;
  const pct = hasGoal ? Math.min(100, Math.round((colecta.raised_cents / colecta.goal_cents) * 100)) : 0;
  const remainingDays = daysLeft(colecta.end_at);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }

  const helpPanel = isActive && showHelp && (
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
  );

  return (
    <>
      <Head>
        <title>{`${colecta.title} — Rifex`}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <section className={styles.page}>
        <div className={styles.layout}>
          <div className={styles.leftCard}>
            <div className={styles.hero}>
              {colecta.cover_image_url ? (
                <img src={colecta.cover_image_url} alt="" />
              ) : (
                <span className={styles.heroFallback}>🤝</span>
              )}
            </div>

            <div className={styles.body}>
              <span className={styles.statusBadge} data-status={colecta.status}>
                ● {STATUS_LABEL_ES[colecta.status] || colecta.status}
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
            </div>
          </div>

          <div className={styles.rightCol}>
            <div className={styles.sideCard}>
              <p className={styles.raisedLabel}>Recaudado</p>
              <p className={styles.raisedAmount}>{clp(colecta.raised_cents / 100)}</p>
              {hasGoal && <p className={styles.raisedGoal}>de {clp(colecta.goal_cents / 100)}</p>}

              {hasGoal && (
                <div className={styles.progressTrack}>
                  <div className={styles.progressFill} style={{ width: `${pct}%` }} />
                </div>
              )}

              <div className={styles.statsRow}>
                <div className={styles.statBlock}>
                  <p className={styles.statValue}>{isActive ? remainingDays : 0}</p>
                  <p className={styles.statLabel}>{isActive ? 'Quedan días' : 'Finalizada'}</p>
                  <p className={styles.statSub}>para finalizar</p>
                </div>
                <div className={styles.statBlock} data-align="right">
                  <p className={styles.statValue}>{colecta.contributor_count}</p>
                  <p className={styles.statLabel}>Aportes</p>
                  <p className={styles.statSub}>personas</p>
                </div>
              </div>

              {isActive ? (
                !showHelp && (
                  <button type="button" className={styles.sideCta} onClick={openHelp}>
                    🤝 Quiero ayudar
                  </button>
                )
              ) : (
                <>
                  <button type="button" className={styles.sideCta} disabled>
                    {colecta.status === 'finished' ? 'Esta campaña ya venció' : 'Esta campaña ya cerró'}
                  </button>
                  <p className={styles.closedNote}>Ya no acepta más aportes.</p>
                </>
              )}

              {helpPanel}
            </div>

            <div className={styles.sideCard}>
              <p className={styles.qrCardTitle}>Escanea para ayudar</p>
              <div className={styles.qrImgWrap}>
                <img src={qrUrl} alt="Código QR de la campaña" />
              </div>
              <p className={styles.qrCaption}>Escanea este código con tu celular para ir a la campaña y realizar tu aporte.</p>
              <div className={styles.linkBox}>
                <div>
                  <span className={styles.linkLabel}>Enlace</span>
                  <span className={styles.linkUrl}>{displayUrl}</span>
                </div>
                <button type="button" className={styles.copyBtn} onClick={copyLink} aria-label="Copiar enlace" title="Copiar enlace">
                  {copied ? '✓' : '📋'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
ColectaPublica.getLayout = (page) => <Layout>{page}</Layout>;

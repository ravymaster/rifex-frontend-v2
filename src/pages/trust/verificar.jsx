// src/pages/trust/verificar.jsx
// TRUST-3A — verificación documental de identidad (solo personas
// naturales, solo cédula chilena, solo revisión humana). Requiere
// sesión, mismo criterio que /registro/continuar. Nunca envía el
// documento crudo del navegador a otro lugar que no sea
// POST /api/trust/identity-verification/documents — server-side es
// quien decide si el archivo es una imagen real (magic bytes + sharp).
import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import styles from '@/styles/onboarding.module.css';
import { supabaseBrowser as supabase } from '@/lib/supabaseClient';

const CORRECTION_MESSAGES = {
  image_unreadable: 'La imagen no se ve con claridad. Vuelve a fotografiarla con buena luz, sin reflejos.',
  document_expired: 'Tu cédula parece estar vencida.',
  name_mismatch: 'El nombre del documento no coincide con el que declaraste.',
  document_shows_minor: 'El documento indica que eres menor de 18 años.',
  missing_side: 'Falta uno de los lados de tu cédula.',
  document_type_not_supported: 'Este documento no es una cédula chilena vigente.',
  other: 'Necesitamos que revises y vuelvas a enviar tu documento.',
};

const REJECTION_MESSAGES = {
  document_appears_altered: 'No pudimos validar tu documento.',
  identity_mismatch: 'No pudimos validar tu documento.',
  document_shows_minor: 'El documento indica que eres menor de 18 años.',
  document_type_not_supported: 'Este documento no es una cédula chilena vigente.',
  unable_to_verify: 'No pudimos validar tu documento.',
  other: 'No pudimos validar tu documento.',
};

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function TrustVerificar() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [supported, setSupported] = useState(true);
  const [status, setStatus] = useState('not_started');
  const [reasonCode, setReasonCode] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [expiresAt, setExpiresAt] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [previews, setPreviews] = useState({ front: null, back: null });
  const [pendingFiles, setPendingFiles] = useState({ front: null, back: null });

  async function refreshStatus(accessToken) {
    const res = await fetch('/api/trust/identity-verification/status', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    if (!res.ok || !data.ok) return;
    setSupported(data.supported !== false);
    if (data.supported === false) return;
    setStatus(data.status || 'not_started');
    setReasonCode(data.reason_code || null);
    setDocuments(data.documents || []);
    setExpiresAt(data.expires_at || null);
  }

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;
      if (!session) {
        router.replace(`/login?next=${encodeURIComponent('/trust/verificar')}`);
        return;
      }
      setToken(session.access_token);
      setReady(true);
      try {
        await refreshStatus(session.access_token);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleStart() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/trust/identity-verification/start', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error();
      if (data.supported === false) {
        setSupported(false);
      } else {
        setStatus(data.status);
      }
    } catch {
      setError('No se pudo iniciar la verificación. Intenta nuevamente.');
    } finally {
      setBusy(false);
    }
  }

  function onPickFile(side, file) {
    if (!file) return;
    setPendingFiles((p) => ({ ...p, [side]: file }));
    const url = URL.createObjectURL(file);
    setPreviews((p) => ({ ...p, [side]: url }));
  }

  async function handleUpload(side) {
    const file = pendingFiles[side];
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const dataBase64 = await fileToBase64(file);
      const res = await fetch('/api/trust/identity-verification/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ side, contentType: file.type, dataBase64 }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError('No pudimos leer esa imagen. Prueba con otra foto, con buena luz y sin recortes.');
        return;
      }
      await refreshStatus(token);
    } catch {
      setError('No se pudo subir el documento. Intenta nuevamente.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/trust/identity-verification/submit', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError('Faltan documentos por subir antes de enviar a revisión.');
        return;
      }
      await refreshStatus(token);
    } catch {
      setError('No se pudo enviar a revisión. Intenta nuevamente.');
    } finally {
      setBusy(false);
    }
  }

  if (!ready || loading) return null;

  const hasFront = documents.some((d) => d.side === 'front');
  const hasBack = documents.some((d) => d.side === 'back');

  return (
    <>
      <Head><title>Verificación de identidad — Rifex</title></Head>
      <main className={styles.page}>
        <section className={styles.shell}>
          <div className={styles.inner}>
            <h1 className={styles.title}>Verificación de identidad</h1>

            {!supported ? (
              <>
                <p className={styles.sub}>Verificación de organizaciones próximamente.</p>
                <p className={styles.notice}>
                  Hoy la verificación documental de Rifex Trust solo está disponible para cuentas de persona natural.
                </p>
              </>
            ) : (
              <>
                <p className={styles.sub}>
                  Para algunas operaciones de Rifex necesitamos confirmar tu identidad con tu cédula chilena vigente.
                  Tu documento será revisado de forma privada. Completar el registro no equivale a aprobación inmediata.
                  Rifex nunca mostrará públicamente tu documento, tu RUN ni tu fecha de nacimiento.
                </p>

                {status === 'not_started' && (
                  <>
                    <p className={styles.notice}>Aceptamos cédula chilena vigente, frente y reverso. No aceptamos otros documentos por ahora.</p>
                    <div className={styles.actions}>
                      <button className="btn btn-primary btnPrimary" onClick={handleStart} disabled={busy}>
                        {busy ? 'Iniciando…' : 'Comenzar verificación'}
                      </button>
                    </div>
                  </>
                )}

                {(status === 'draft' || status === 'correction_required') && (
                  <>
                    {status === 'correction_required' && (
                      <p className={styles.err}>
                        {CORRECTION_MESSAGES[reasonCode] || CORRECTION_MESSAGES.other}
                      </p>
                    )}
                    <div className={styles.docGrid}>
                      {['front', 'back'].map((side) => {
                        const already = side === 'front' ? hasFront : hasBack;
                        return (
                          <div key={side} className={already && !previews[side] ? styles.docSlotFilled : styles.docSlot}>
                            <span className={styles.docLabel}>{side === 'front' ? 'Frente' : 'Reverso'}</span>
                            {previews[side] && <img src={previews[side]} alt="" className={styles.docPreview} />}
                            <input
                              type="file"
                              accept="image/jpeg,image/png"
                              onChange={(e) => onPickFile(side, e.target.files?.[0])}
                            />
                            {pendingFiles[side] && (
                              <div className={styles.actions} style={{ justifyContent: 'center', marginTop: 8 }}>
                                <button className="btn btn-primary btnPrimary" onClick={() => handleUpload(side)} disabled={busy}>
                                  Confirmar {side === 'front' ? 'frente' : 'reverso'}
                                </button>
                              </div>
                            )}
                            {already && !pendingFiles[side] && <p className={styles.fieldHelp}>Ya cargado.</p>}
                          </div>
                        );
                      })}
                    </div>
                    {error && <p className={styles.err}>{error}</p>}
                    <div className={styles.actions}>
                      <button
                        className="btn btn-primary btnPrimary"
                        onClick={handleSubmit}
                        disabled={busy || !hasFront || !hasBack}
                      >
                        {busy ? 'Enviando…' : 'Enviar a revisión'}
                      </button>
                    </div>
                  </>
                )}

                {(status === 'submitted' || status === 'under_review') && (
                  <span className={styles.statusBadgeReview} style={{ display: 'block' }}>
                    Tu documento está siendo revisado de forma privada.
                  </span>
                )}

                {status === 'approved' && (
                  <span className={styles.statusBadgeGood} style={{ display: 'block' }}>
                    Identidad verificada{expiresAt ? ` (vigente hasta ${new Date(expiresAt).toLocaleDateString('es-CL')})` : ''}.
                  </span>
                )}

                {status === 'rejected' && (
                  <>
                    <span className={styles.statusBadgeBad} style={{ display: 'block' }}>
                      {REJECTION_MESSAGES[reasonCode] || REJECTION_MESSAGES.other}
                    </span>
                    <p className={styles.notice}>Un canal de apelación estará disponible más adelante.</p>
                  </>
                )}

                {status === 'revoked' && (
                  <span className={styles.statusBadgeBad} style={{ display: 'block' }}>
                    Tu verificación de identidad fue revocada.
                  </span>
                )}
              </>
            )}
          </div>
        </section>
      </main>
    </>
  );
}

TrustVerificar.getLayout = (page) => <Layout>{page}</Layout>;

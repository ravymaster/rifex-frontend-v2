// src/pages/panel/admin/trust/[userId].jsx
// TRUST-3A — detalle de un caso: datos declarados + evidencia (vía URL
// firmada de corta duración) + decisión. Toda la autoridad real vive en
// las rutas API (resolveAdmin + recordDecision) — esto es solo UX.
import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import { supabaseBrowser as supabase } from '@/lib/supabaseClient';

const CORRECTION_REASON_CODES = [
  'image_unreadable', 'document_expired', 'name_mismatch',
  'document_shows_minor', 'missing_side', 'document_type_not_supported', 'other',
];
const REJECTION_REASON_CODES = [
  'document_appears_altered', 'identity_mismatch', 'document_shows_minor', 'document_type_not_supported', 'unable_to_verify', 'other',
];

export default function AdminTrustCaseDetail() {
  const router = useRouter();
  const { userId } = router.query;
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState(null);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmedDataMatches, setConfirmedDataMatches] = useState(false);
  const [confirmedAgeAdult, setConfirmedAgeAdult] = useState(false);
  const [reasonCode, setReasonCode] = useState('');
  const [comment, setComment] = useState('');

  async function load(accessToken) {
    const res = await fetch(`/api/admin/trust/case/${userId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setError(res.status === 403 ? 'No tienes acceso a esta sección.' : 'No se pudo cargar el caso.');
      return;
    }
    setDetail(data);
  }

  useEffect(() => {
    if (!router.isReady || !userId) return;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;
      if (!session) {
        router.replace(`/login?next=${encodeURIComponent(router.asPath)}`);
        return;
      }
      setToken(session.access_token);
      try {
        await load(session.access_token);
      } finally {
        setReady(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, userId]);

  async function decide(action) {
    setBusy(true);
    setMessage('');
    try {
      const body = { action };
      if (action === 'approve') {
        body.confirmedDataMatches = confirmedDataMatches;
        body.confirmedAgeAdult = confirmedAgeAdult;
      } else {
        body.reasonCode = reasonCode;
        body.comment = comment;
      }
      const res = await fetch(`/api/admin/trust/case/${userId}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setMessage(`No se pudo registrar la decisión (${data.error || 'error'}).`);
        return;
      }
      setMessage(`Decisión registrada: ${data.status}.`);
      await load(token);
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return null;
  if (error) return <main style={{ padding: 24 }}><p style={{ color: '#b91c1c' }}>{error}</p></main>;
  if (!detail) return null;

  const reasonCodes = CORRECTION_REASON_CODES; // default selector list, swapped below for reject

  return (
    <>
      <Head><title>Revisión de identidad — Rifex Admin</title></Head>
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>
        <h1 style={{ fontWeight: 800, marginBottom: 8 }}>Revisión de identidad</h1>
        <p style={{ fontFamily: 'monospace', fontSize: 12, color: '#64748b' }}>{userId}</p>
        <p><strong>Estado:</strong> {detail.case.status}</p>

        <h2 style={{ fontSize: 15, fontWeight: 800, marginTop: 20 }}>Datos declarados</h2>
        <ul>
          <li>Nombre declarado: {detail.declared?.declared_name || '—'}</li>
          <li>RUT declarado: {detail.declared?.rut_normalized || '—'}</li>
        </ul>

        <h2 style={{ fontSize: 15, fontWeight: 800, marginTop: 20 }}>Evidencia (enlace válido ~2 minutos)</h2>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {detail.evidence.length === 0 && <p>Sin documentos cargados.</p>}
          {detail.evidence.map((ev) => (
            <div key={ev.id}>
              <p style={{ fontSize: 12, fontWeight: 700 }}>{ev.side === 'front' ? 'Frente' : 'Reverso'}</p>
              <img src={ev.signed_url} alt="" style={{ maxWidth: 260, borderRadius: 8, border: '1px solid #e5e7eb' }} />
            </div>
          ))}
        </div>

        {detail.case.status === 'under_review' && (
          <>
            <h2 style={{ fontSize: 15, fontWeight: 800, marginTop: 24 }}>Decisión</h2>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13 }}>
                <input type="checkbox" checked={confirmedDataMatches} onChange={(e) => setConfirmedDataMatches(e.target.checked)} />
                {' '}Confirmo que el nombre y RUT del documento coinciden con los datos declarados.
              </label>
              <label style={{ display: 'block', fontSize: 13 }}>
                <input type="checkbox" checked={confirmedAgeAdult} onChange={(e) => setConfirmedAgeAdult(e.target.checked)} />
                {' '}Confirmo que la fecha de nacimiento del documento implica 18 años o más.
              </label>
              <button
                onClick={() => decide('approve')}
                disabled={busy || !confirmedDataMatches || !confirmedAgeAdult}
                style={{ marginTop: 8 }}
              >
                Aprobar
              </button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
                <option value="">— motivo —</option>
                {[...new Set([...CORRECTION_REASON_CODES, ...REJECTION_REASON_CODES])].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Comentario (opcional)"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                style={{ marginLeft: 8, width: 220 }}
              />
              <div style={{ marginTop: 8 }}>
                <button onClick={() => decide('request_correction')} disabled={busy || !reasonCode}>Solicitar corrección</button>
                <button onClick={() => decide('reject')} disabled={busy || !reasonCode} style={{ marginLeft: 8 }}>Rechazar</button>
              </div>
            </div>
          </>
        )}

        {message && <p>{message}</p>}
      </main>
    </>
  );
}

AdminTrustCaseDetail.getLayout = (page) => <Layout>{page}</Layout>;

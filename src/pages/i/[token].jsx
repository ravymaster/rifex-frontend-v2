// src/pages/i/[token].jsx
// INSCRIPCIONES V1 — resolución pública del QR de un participante,
// hermano de t/[token].jsx. PSCG: PUBLIC_NOINDEX. GET puro, NUNCA
// consume/modifica la inscripción (el escaneo no es check-in). Sin
// email/teléfono del participante — solo lo necesario para confirmar
// que es una inscripción real.
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';

const MODALITY_LABEL = { presencial: 'Presencial', online: 'Online', hibrida: 'Híbrida' };

function fmtDateTime(iso, timezone) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('es-CL', {
      weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: timezone || 'America/Santiago',
    });
  } catch { return ''; }
}

export default function InscripcionQrResolver() {
  const router = useRouter();
  const { token } = router.query;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`/api/inscripciones/i/${token}`);
        const body = await res.json();
        if (!res.ok || !body.ok) { setError('not_found'); } else { setData(body); }
      } catch {
        setError('error');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) {
    return (
      <Layout title="Inscripción — Rifex" noindex noarchive>
        <div style={{ maxWidth: 420, margin: '48px auto', textAlign: 'center' }}><p>Cargando…</p></div>
      </Layout>
    );
  }

  if (error || !data) {
    return (
      <Layout title="Inscripción no encontrada — Rifex" noindex noarchive>
        <div style={{ maxWidth: 420, margin: '48px auto', textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>Inscripción no encontrada</h1>
          <p style={{ color: '#64748b', fontSize: 14, marginTop: 8 }}>Este código no corresponde a ninguna inscripción válida.</p>
        </div>
      </Layout>
    );
  }

  const { participant, activity } = data;
  const placeText = activity?.modality === 'online'
    ? (MODALITY_LABEL[activity.modality] || activity.modality)
    : [activity?.venue_name, activity?.address].filter(Boolean).join(' — ');

  return (
    <Layout title="Mi inscripción — Rifex" noindex noarchive>
      <div style={{ maxWidth: 420, margin: '32px auto', padding: '0 16px' }}>
        <div style={{ border: '2px solid #e5e7eb', borderRadius: 20, padding: 24, textAlign: 'center' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#1e3a8a', margin: 0 }}>Rifex Inscripciones</p>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: '10px 0 4px' }}>{activity?.title || 'Actividad'}</h1>
          {activity?.starts_at && <p style={{ fontSize: 13.5, color: '#64748b', margin: '0 0 4px' }}>{fmtDateTime(activity.starts_at, activity.timezone)}</p>}
          {placeText && <p style={{ fontSize: 13.5, color: '#64748b', margin: 0 }}>{placeText}</p>}

          <div style={{
            marginTop: 18, padding: '10px 16px', borderRadius: 999, display: 'inline-block', fontWeight: 700, fontSize: 14,
            background: participant.checked_in ? '#dcfce7' : '#eff6ff', color: participant.checked_in ? '#15803d' : '#1e3a8a',
          }}>
            {participant.checked_in ? '✓ Asistencia registrada' : 'Inscripción confirmada'}
          </div>

          <p style={{ marginTop: 18, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{participant.full_name}</p>

          {token && (
            <img
              src={`/api/inscripciones/i/${token}/qr.png`}
              alt="Código QR"
              style={{ width: 220, height: 220, margin: '18px auto 0', borderRadius: 16, border: '2px solid #e5e7eb', display: 'block' }}
            />
          )}
        </div>
      </div>
    </Layout>
  );
}

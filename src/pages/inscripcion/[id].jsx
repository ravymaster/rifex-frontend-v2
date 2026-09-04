// src/pages/inscripcion/[id].jsx
// INSCRIPCIONES V1 — página pública de UNA actividad + formulario de
// inscripción. PSCG: PUBLIC_NOINDEX (noindex+nofollow, fuera de
// sitemap) — página compartible por link, nunca pensada para que Google
// convierta las actividades de los usuarios en un catálogo indexable
// (sección 5/14 del mandato). Nunca exige login al participante.
import { useRouter } from 'next/router';
import { useEffect, useState, useCallback } from 'react';
import Layout from '@/components/Layout';

const MODALITY_LABEL = { presencial: 'Presencial', online: 'Online', hibrida: 'Híbrida' };

function fmtDate(iso, timezone) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: timezone || 'America/Santiago' });
  } catch { return ''; }
}
function fmtTime(iso, timezone) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: timezone || 'America/Santiago' });
  } catch { return ''; }
}
const isValidEmail = (s) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

const REGISTER_ERROR_LABEL = {
  invalid_name: 'Ingresa tu nombre completo.',
  invalid_email: 'Ingresa un email válido.',
  invalid_phone: 'Teléfono inválido.',
  capacity_full: 'Cupos agotados.',
  already_registered: 'Ya estás inscrito en esta actividad. Revisa tu correo para ver tu QR.',
};

export default function InscripcionPublica() {
  const router = useRouter();
  const { id } = router.query;

  const [activity, setActivity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [success, setSuccess] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/inscripciones/${id}`);
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error('not_found');
      setActivity(data.activity);
    } catch {
      setError('Actividad no encontrada.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { if (id) load(); }, [id, load]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitError(null);
    if (!fullName.trim()) { setSubmitError('Ingresa tu nombre completo.'); return; }
    if (!isValidEmail(email)) { setSubmitError('Ingresa un email válido.'); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/inscripciones/${id}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName.trim(), email: email.trim(), phone: phone.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(REGISTER_ERROR_LABEL[data.error] || 'No se pudo completar la inscripción.');
      }
      setSuccess(data.qr_link);
      await load();
    } catch (e) {
      setSubmitError(e.message || 'No se pudo completar la inscripción.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <Layout title="Inscripción — Rifex" noindex noarchive>
        <div style={{ maxWidth: 560, margin: '48px auto', textAlign: 'center' }}><p>Cargando…</p></div>
      </Layout>
    );
  }
  if (error || !activity) {
    return (
      <Layout title="Actividad no encontrada — Rifex" noindex noarchive>
        <div style={{ maxWidth: 560, margin: '48px auto', textAlign: 'center', padding: '0 16px' }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>Actividad no encontrada</h1>
          <p style={{ color: '#64748b', fontSize: 14, marginTop: 8 }}>Este enlace no corresponde a ninguna actividad activa.</p>
        </div>
      </Layout>
    );
  }

  const soldOut = activity.available_slots <= 0;
  const placeText = activity.modality === 'online'
    ? (MODALITY_LABEL[activity.modality] || activity.modality)
    : [activity.venue_name, activity.address].filter(Boolean).join(' — ');

  return (
    <Layout title={`${activity.title} — Rifex Inscripciones`} description={activity.description || 'Inscripción gratuita en Rifex.'} noindex noarchive>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '0 16px' }}>
        {activity.cover_image_url && (
          <img src={activity.cover_image_url} alt="" style={{ width: '100%', borderRadius: 16, marginBottom: 20, display: 'block' }} />
        )}
        <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', margin: '0 0 10px' }}>{activity.title}</h1>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 13.5, color: '#475569', marginBottom: 12 }}>
          <span>📅 {fmtDate(activity.starts_at, activity.timezone)}</span>
          <span>🕐 {fmtTime(activity.starts_at, activity.timezone)} hrs</span>
          {placeText && <span>📍 {placeText}</span>}
        </div>
        {activity.organizer_name_snapshot && (
          <p style={{ fontSize: 13.5, color: '#64748b', margin: '0 0 12px' }}>Organiza: <b>{activity.organizer_name_snapshot}</b></p>
        )}
        {activity.description && <p style={{ fontSize: 14.5, color: '#334155', lineHeight: 1.6, marginBottom: 20 }}>{activity.description}</p>}

        <p style={{ fontSize: 13.5, fontWeight: 700, color: soldOut ? '#b91c1c' : '#15803d', marginBottom: 20 }}>
          {soldOut ? 'Cupos agotados' : `${activity.available_slots} de ${activity.capacity} cupos disponibles`}
        </p>

        {success ? (
          <div style={{ border: '2px solid #bbf7d0', background: '#f0fdf4', borderRadius: 16, padding: 20, textAlign: 'center' }}>
            <p style={{ fontWeight: 800, color: '#15803d', fontSize: 16, margin: '0 0 8px' }}>¡Inscripción confirmada!</p>
            <p style={{ fontSize: 13.5, color: '#334155', margin: '0 0 14px' }}>Te enviamos un correo con tu código QR de acceso.</p>
            <a href={success} style={{ display: 'inline-block', padding: '10px 18px', borderRadius: 999, background: '#111827', color: '#fff', fontWeight: 700, fontSize: 13.5, textDecoration: 'none' }}>
              Ver mi código QR
            </a>
          </div>
        ) : soldOut ? (
          <div style={{ border: '1px solid #fecaca', background: '#fef2f2', borderRadius: 16, padding: 18, textAlign: 'center' }}>
            <p style={{ color: '#b91c1c', fontWeight: 700, fontSize: 14, margin: 0 }}>Ya no quedan cupos disponibles para esta actividad.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ border: '1px solid #e5e7eb', borderRadius: 16, padding: 20 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: '0 0 14px' }}>Inscribirme</h2>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Nombre completo *</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={140} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14 }} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Email *</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14 }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Teléfono (opcional)</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14 }} />
            </div>
            {submitError && <p style={{ color: '#b91c1c', fontSize: 13, marginBottom: 12 }}>{submitError}</p>}
            <button type="submit" disabled={submitting} style={{ width: '100%', padding: '12px 0', borderRadius: 999, border: 'none', background: 'linear-gradient(135deg, #1e3a8a 0%, #18a957 100%)', color: '#fff', fontWeight: 800, fontSize: 14.5, cursor: submitting ? 'wait' : 'pointer' }}>
              {submitting ? 'Enviando…' : 'Confirmar inscripción'}
            </button>
          </form>
        )}

        {activity.instructions && (
          <div style={{ marginTop: 20, padding: '14px 16px', background: '#f8fafc', borderRadius: 12 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: '0 0 6px' }}>Información importante</p>
            <p style={{ fontSize: 13, color: '#475569', margin: 0, lineHeight: 1.5 }}>{activity.instructions}</p>
          </div>
        )}
      </div>
    </Layout>
  );
}

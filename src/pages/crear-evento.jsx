// src/pages/crear-evento.jsx
// EVENT-1 — Creación de evento (dominio nuevo, sin checkout). Flujo:
// completar datos básicos -> guardar borrador -> agregar tipos de entrada
// -> publicar. Identidad siempre desde la sesión (auth.getSession()),
// mismo patrón que crear-colecta.jsx/crear-rifa.jsx.
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import styles from '@/styles/crearEvento.module.css';
import { supabaseBrowser as supabase } from '@/lib/supabaseClient';
import { resolveCreationGate } from '@/lib/creationGate';

// AUTH UX 2026 — auth boundary real, mismo patrón que crear-rifa.jsx y
// crear-colecta.jsx: sin esto, el formulario completo se renderizaba en
// el HTML inicial para cualquier anónimo o crawler.
// PROGRESSIVE ONBOARDING — extiende ese boundary de "solo sesión" a
// elegibilidad real de creador (assertCreatorEligible, vía
// resolveCreationGate).
export async function getServerSideProps(ctx) {
  return resolveCreationGate(ctx, '/crear-evento');
}

const ALLOWED_PHOTO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const COVER_TARGET = { w: 1600, h: 700 };

function resizeToBlob(file, { w, h, quality = 0.82 }) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      const srcRatio = img.width / img.height;
      const dstRatio = w / h;
      let sx, sy, sw, sh;
      if (srcRatio > dstRatio) { sh = img.height; sw = sh * dstRatio; sy = 0; sx = (img.width - sw) / 2; }
      else { sw = img.width; sh = sw / dstRatio; sx = 0; sy = (img.height - sh) / 2; }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
      URL.revokeObjectURL(img.src);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo procesar la imagen'))), 'image/jpeg', quality);
    };
    img.onerror = () => reject(new Error('Archivo de imagen inválido'));
    img.src = URL.createObjectURL(file);
  });
}
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function toLocalInputValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// EVENT-8: mensajes legibles para los errores server-side de aforo —
// mismo criterio que el mapeo de errores de personal en
// panel/eventos/[id].jsx.
const EVENT_ERROR_LABEL = {
  invalid_capacity: 'El aforo debe ser un número entero mayor a 0.',
  event_capacity_exceeded: 'La suma de cupos de tus tipos de entrada activos supera el aforo definido. Sube el aforo o reduce los cupos.',
};

const emptyTicketType = () => ({
  key: Math.random().toString(36).slice(2),
  id: null,
  name: '',
  price_cents: '',
  quantity_total: '',
  max_per_order: 10,
  saving: false,
  error: null,
});

export default function CrearEvento() {
  const router = useRouter();
  const [token, setToken] = useState(null);

  const [event, setEvent] = useState(null); // null hasta que se guarda el borrador
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [venueName, setVenueName] = useState('');
  const [address, setAddress] = useState('');
  const [capacity, setCapacity] = useState('');

  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [coverUrl, setCoverUrl] = useState(null);
  const [uploadingCover, setUploadingCover] = useState(false);

  const [ticketTypes, setTicketTypes] = useState([]);

  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [err, setErr] = useState(null);
  const [notice, setNotice] = useState(null);

  // PROGRESSIVE ONBOARDING — el chequeo de sesión + onboarding + Trust +
  // Mercado Pago ahora ocurre server-side (ver getServerSideProps/
  // resolveCreationGate arriba); este efecto solo sigue resolviendo el
  // token para las llamadas autenticadas del formulario — el fallback de
  // sesión ausente queda como defensa adicional ante una sesión que
  // expire justo entre el render SSR y la hidratación, nunca la
  // autoridad real.
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;
      if (!session) { router.push('/login?next=/crear-evento'); return; }
      setToken(session.access_token);
    })();
  }, [router]);

  useEffect(() => {
    if (!coverFile) { setCoverPreview(null); return; }
    const url = URL.createObjectURL(coverFile);
    setCoverPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [coverFile]);

  async function onCoverChange(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!ALLOWED_PHOTO_TYPES.has(file.type)) { setErr(`Formato no permitido: ${file.name}`); return; }
    setErr(null);
    setCoverFile(file);

    if (!token) return;
    setUploadingCover(true);
    try {
      const blob = await resizeToBlob(file, COVER_TARGET);
      const dataBase64 = await blobToBase64(blob);
      const res = await fetch('/api/events/upload-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ filename: file.name.replace(/\.[a-zA-Z0-9]+$/, '.jpg'), contentType: 'image/jpeg', dataBase64, kind: 'cover' }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'No se pudo subir la portada');
      setCoverUrl(data.url);
    } catch (e) {
      setErr(e.message || 'No se pudo subir la portada');
    } finally {
      setUploadingCover(false);
    }
  }

  async function saveDraft() {
    setErr(null);
    if (!title.trim()) { setErr('El nombre del evento es obligatorio.'); return; }
    if (!startsAt) { setErr('La fecha/hora de inicio es obligatoria.'); return; }
    if (!endsAt) { setErr('La fecha/hora de término es obligatoria.'); return; }
    if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
      setErr('La hora de término debe ser después del inicio.'); return;
    }

    setSaving(true);
    try {
      const isUpdate = !!event;
      const url = isUpdate ? `/api/events/${event.id}` : '/api/events';
      const res = await fetch(url, {
        method: isUpdate ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          cover_image_url: coverUrl,
          starts_at: new Date(startsAt).toISOString(),
          ends_at: new Date(endsAt).toISOString(),
          timezone: 'America/Santiago',
          venue_name: venueName.trim() || null,
          address: address.trim() || null,
          capacity: capacity.trim() === '' ? null : capacity.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(EVENT_ERROR_LABEL[data.error] || data.error || 'No se pudo guardar el evento');
      setEvent(data.event);
      setNotice('Borrador guardado.');
    } catch (e) {
      setErr(e.message || 'No se pudo guardar el evento');
    } finally {
      setSaving(false);
    }
  }

  function addTicketType() {
    setTicketTypes((prev) => [...prev, emptyTicketType()]);
  }

  function updateTicketType(key, patch) {
    setTicketTypes((prev) => prev.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  }

  async function saveTicketType(key) {
    const t = ticketTypes.find((x) => x.key === key);
    if (!t || !event) return;
    if (!t.name.trim()) { updateTicketType(key, { error: 'El nombre es obligatorio.' }); return; }
    const priceCents = Math.round(Number(t.price_cents) * 100);
    if (!Number.isFinite(priceCents) || priceCents < 0) { updateTicketType(key, { error: 'Precio inválido.' }); return; }
    const quantityTotal = Math.round(Number(t.quantity_total));
    if (!Number.isInteger(quantityTotal) || quantityTotal <= 0) { updateTicketType(key, { error: 'Cupo inválido.' }); return; }

    updateTicketType(key, { saving: true, error: null });
    try {
      const isUpdate = !!t.id;
      const url = isUpdate ? `/api/events/${event.id}/ticket-types/${t.id}` : `/api/events/${event.id}/ticket-types`;
      const res = await fetch(url, {
        method: isUpdate ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: t.name.trim(),
          price_cents: priceCents,
          quantity_total: quantityTotal,
          max_per_order: Math.round(Number(t.max_per_order)) || 10,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(EVENT_ERROR_LABEL[data.error] || data.error || 'No se pudo guardar el tipo de entrada');
      updateTicketType(key, { id: data.ticket_type.id, saving: false });
    } catch (e) {
      updateTicketType(key, { saving: false, error: e.message || 'No se pudo guardar' });
    }
  }

  async function removeTicketType(key) {
    const t = ticketTypes.find((x) => x.key === key);
    if (t?.id && event) {
      try {
        await fetch(`/api/events/${event.id}/ticket-types/${t.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {}
    }
    setTicketTypes((prev) => prev.filter((x) => x.key !== key));
  }

  async function publish() {
    if (!event) return;
    setErr(null);
    setPublishing(true);
    try {
      const res = await fetch(`/api/events/${event.id}/publish`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'No se pudo publicar');
      setEvent(data.event);
      router.push(`/eventos/${event.id}`);
    } catch (e) {
      setErr(e.message || 'No se pudo publicar');
    } finally {
      setPublishing(false);
    }
  }

  const hasUnsavedTicketType = ticketTypes.some((t) => !t.id);
  const canPublish = !!event && ticketTypes.some((t) => t.id) && !hasUnsavedTicketType;

  return (
    <Layout title="Crear evento — Rifex" description="Crea y publica un evento con entradas en minutos.">
      <Head><meta name="robots" content="noindex" /></Head>
      <div className={styles.wrap}>
        <h1 className={styles.title}>Crear evento</h1>
        <p className={styles.subtitle}>Completa los datos, agrega tipos de entrada y publica cuando esté listo.</p>

        {err && <div className={styles.error}>{err}</div>}
        {notice && <div className={styles.success}>{notice}</div>}

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Datos del evento</h2>

          <div className={styles.field}>
            <label className={styles.label}>Portada</label>
            {(coverPreview || coverUrl) && (
              <img className={styles.coverPreview} src={coverPreview || coverUrl} alt="" />
            )}
            <label className={styles.uploadBtn}>
              {uploadingCover ? 'Subiendo…' : 'Elegir portada'}
              <input type="file" accept="image/*" hidden onChange={onCoverChange} disabled={uploadingCover} />
            </label>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Nombre del evento *</label>
            <input className={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} placeholder="Ej: Fonda Comunitaria Los Aromos" />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Descripción</label>
            <textarea className={styles.textarea} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} placeholder="Cuéntale a la gente de qué se trata." />
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Inicio *</label>
              <input type="datetime-local" className={styles.input} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
              <p className={styles.hint}>Hora de Chile (America/Santiago).</p>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Término *</label>
              <input type="datetime-local" className={styles.input} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Lugar</label>
              <input className={styles.input} value={venueName} onChange={(e) => setVenueName(e.target.value)} placeholder="Ej: Sede Vecinal" />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Dirección</label>
              <input className={styles.input} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Calle y número" />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Aforo (capacidad máxima)</label>
            <input
              className={styles.input}
              type="number"
              min="1"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              placeholder="Ej: 200"
            />
            <p className={styles.hint}>
              Opcional. Si lo defines, la suma de cupos de tus tipos de entrada activos nunca podrá superarlo.
              Déjalo vacío si aún no tienes un aforo definido.
            </p>
          </div>

          <div className={styles.actions}>
            <button className={styles.btnPrimary} onClick={saveDraft} disabled={saving}>
              {saving ? 'Guardando…' : event ? 'Guardar cambios' : 'Guardar borrador'}
            </button>
          </div>
        </div>

        {event && (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Tipos de entrada</h2>
            {ticketTypes.length === 0 && <p className={styles.hint}>Agrega al menos un tipo de entrada para poder publicar.</p>}
            {ticketTypes.map((t) => (
              <div key={t.key} className={styles.ticketType}>
                <div className={styles.ticketTypeHeader}>
                  <span className={styles.ticketTypeName}>{t.name || 'Nuevo tipo'}</span>
                  <button className={styles.removeBtn} onClick={() => removeTicketType(t.key)}>Quitar</button>
                </div>
                {t.error && <div className={styles.error}>{t.error}</div>}
                <div className={styles.row}>
                  <div className={styles.field}>
                    <label className={styles.label}>Nombre</label>
                    <input className={styles.input} value={t.name} onChange={(e) => updateTicketType(t.key, { name: e.target.value })} placeholder="Ej: General" />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Precio (CLP)</label>
                    <input className={styles.input} type="number" min="0" value={t.price_cents} onChange={(e) => updateTicketType(t.key, { price_cents: e.target.value })} placeholder="5000" />
                  </div>
                </div>
                <div className={styles.row}>
                  <div className={styles.field}>
                    <label className={styles.label}>Cupo total</label>
                    <input className={styles.input} type="number" min="1" value={t.quantity_total} onChange={(e) => updateTicketType(t.key, { quantity_total: e.target.value })} placeholder="100" />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Máx. por compra</label>
                    <input className={styles.input} type="number" min="1" value={t.max_per_order} onChange={(e) => updateTicketType(t.key, { max_per_order: e.target.value })} />
                  </div>
                </div>
                <button className={styles.btnSecondary} onClick={() => saveTicketType(t.key)} disabled={t.saving}>
                  {t.saving ? 'Guardando…' : t.id ? 'Actualizar tipo' : 'Guardar tipo'}
                </button>
              </div>
            ))}
            <button className={styles.addTypeBtn} onClick={addTicketType}>+ Agregar tipo de entrada</button>
          </div>
        )}

        {event && (
          <div className={styles.actions}>
            <button className={styles.btnPrimary} onClick={publish} disabled={!canPublish || publishing}>
              {publishing ? 'Publicando…' : 'Publicar evento'}
            </button>
          </div>
        )}
        {event && !canPublish && (
          <p className={styles.hint}>Agrega y guarda al menos un tipo de entrada para poder publicar.</p>
        )}
      </div>
    </Layout>
  );
}

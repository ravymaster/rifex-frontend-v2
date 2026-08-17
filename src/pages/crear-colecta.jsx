// src/pages/crear-colecta.jsx
// Formulario de creación (arriba) + panel "Mis campañas" (abajo). Identidad
// del creador siempre desde la sesión; recaudado y estado vienen ya
// calculados y resueltos por /api/colectas/mine, no se recalculan acá.
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState, useCallback } from 'react';
import Layout from '@/components/Layout';
import styles from '@/styles/crearColecta.module.css';
import { supabaseBrowser as supabase } from '@/lib/supabaseClient';
import { STATUS_LABEL_ES } from '@/lib/colectaStatus';

// Tope solo para que el navegador no se cuelgue decodificando algo absurdo.
// No es un rechazo de "archivo muy pesado": toda foto se recorta y
// comprime acá mismo antes de salir del navegador, así que aunque llegue
// una foto de 50MB nunca se le muestra un error al usuario por el peso.
const MAX_RAW_INPUT_BYTES = 40 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const MAX_GALLERY = 10;
const DURATIONS = [15, 30, 60];

// Recorta y comprime la foto en un <canvas> antes de subirla. Como el
// canvas solo puede reexportar los píxeles que realmente decodificó, esto
// también descarta cualquier dato ajeno pegado al archivo original (el
// servidor vuelve a hacer lo mismo con sharp, que es el límite real de
// seguridad — esto es solo para no mandar 50MB por la red).
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

async function uploadPhoto(file, token, kind) {
  if (!ALLOWED_PHOTO_TYPES.has(file.type)) throw new Error(`Formato no permitido: ${file.name}`);
  if (file.size > MAX_RAW_INPUT_BYTES) throw new Error(`${file.name} es demasiado grande para procesar.`);

  const target = kind === 'cover' ? { w: 1600, h: 700 } : { w: 900, h: 900 };
  const resized = await resizeToBlob(file, target);
  const dataBase64 = await blobToBase64(resized);
  const res = await fetch('/api/colectas/upload-photo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ filename: file.name, contentType: 'image/jpeg', dataBase64, kind: kind === 'cover' ? 'cover' : 'gallery' }),
  });
  let data;
  try { data = await res.json(); } catch { throw new Error(`No se pudo subir ${file.name}`); }
  if (!res.ok || !data?.ok) throw new Error(data?.error || `No se pudo subir ${file.name}`);
  return data.url;
}

function clp(cents) {
  return (Number(cents || 0) / 100).toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
}
function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit' }); }
  catch { return '—'; }
}

export default function CrearColecta() {
  const router = useRouter();
  const [token, setToken] = useState(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [durationDays, setDurationDays] = useState(30);
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [galleryFiles, setGalleryFiles] = useState([]);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [justCreatedTitle, setJustCreatedTitle] = useState('');

  const [mine, setMine] = useState(null);
  const [mpConnected, setMpConnected] = useState(true);
  const [mineLoading, setMineLoading] = useState(true);

  const loadMine = useCallback(async (tok) => {
    if (!tok) return;
    setMineLoading(true);
    try {
      const r = await fetch('/api/colectas/mine', { headers: { Authorization: `Bearer ${tok}` } });
      const j = await r.json();
      if (r.ok && j.ok) { setMine(j.items); setMpConnected(!!j.mp_connected); }
    } finally {
      setMineLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;
      if (!session) { router.push('/login?next=/crear-colecta'); return; }
      setToken(session.access_token);
      loadMine(session.access_token);
    })();
  }, [router, loadMine]);

  useEffect(() => {
    if (!coverFile) { setCoverPreview(null); return; }
    const url = URL.createObjectURL(coverFile);
    setCoverPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [coverFile]);

  function onCoverChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_PHOTO_TYPES.has(file.type)) { setErr(`Formato no permitido: ${file.name}`); return; }
    if (file.size > MAX_RAW_INPUT_BYTES) { setErr(`${file.name} es demasiado grande para procesar.`); return; }
    setErr('');
    setCoverFile(file);
  }

  function onGalleryChange(e) {
    const incoming = Array.from(e.target.files || []);
    e.target.value = '';
    if (!incoming.length) return;

    const room = MAX_GALLERY - galleryFiles.length;
    if (room <= 0) { setErr(`Ya tenés el máximo de ${MAX_GALLERY} fotos adicionales.`); return; }

    const accepted = [];
    for (const file of incoming) {
      if (!ALLOWED_PHOTO_TYPES.has(file.type)) { setErr(`Formato no permitido: ${file.name}`); continue; }
      if (file.size > MAX_RAW_INPUT_BYTES) { setErr(`${file.name} es demasiado grande para procesar.`); continue; }
      accepted.push(file);
      if (accepted.length >= room) break;
    }
    if (accepted.length) setErr('');
    setGalleryFiles((prev) => [...prev, ...accepted].slice(0, MAX_GALLERY));
  }

  function removeGalleryFile(idx) {
    setGalleryFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!title.trim()) { setErr('Ponele un título a tu campaña.'); return; }
    if (!description.trim()) { setErr('Contá de qué se trata.'); return; }
    if (!token) return;

    setSaving(true);
    setErr('');
    setJustCreatedTitle('');
    try {
      let coverUrl = null;
      if (coverFile) coverUrl = await uploadPhoto(coverFile, token, 'cover');

      const galleryUrls = [];
      for (const file of galleryFiles) {
        galleryUrls.push(await uploadPhoto(file, token, 'gallery'));
      }

      const res = await fetch('/api/colectas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          cover_image_url: coverUrl,
          gallery_urls: galleryUrls,
          duration_days: durationDays,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'No se pudo crear la campaña.');

      setJustCreatedTitle(data.colecta.title);
      setTitle(''); setDescription(''); setCoverFile(null); setGalleryFiles([]); setDurationDays(30);
      loadMine(token);
    } catch (e2) {
      setErr(e2?.message || 'No se pudo crear la campaña.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Head><title>Mis campañas — Rifex</title></Head>
      <section className={styles.page}>
        <div className="container" style={{ maxWidth: 900 }}>
          <div className={styles.card}>
            <h1 className={styles.title}>Crear campaña</h1>
            <p className={styles.sub}>Aporte libre, sin meta ni premio — contá tu historia y la gente decide cuánto ayudar.</p>

            <form onSubmit={onSubmit}>
              <div className={styles.field}>
                <label>Título</label>
                <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} placeholder='Ej: "Ayuda para la operación de Rocco"' />
              </div>

              <div className={styles.field}>
                <label>Descripción / historia</label>
                <textarea className="input" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} placeholder="Contá de qué se trata, para qué es la plata, y cualquier detalle que ayude a que confíen." />
                <p className={styles.hint}>{description.trim().length}/5000</p>
              </div>

              <div className={styles.field}>
                <label>Duración de la campaña</label>
                <div className={styles.durationRow}>
                  {DURATIONS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={styles.durationPill}
                      data-selected={durationDays === d}
                      onClick={() => setDurationDays(d)}
                    >
                      {d} días
                    </button>
                  ))}
                </div>
                <p className={styles.hint}>Máximo 60 días. Después de vencer, deja de aceptar aportes automáticamente.</p>
              </div>

              <div className={styles.field}>
                <label>Foto principal</label>
                <label className={styles.uploadBtn}>
                  📷 {coverFile ? 'Cambiar foto' : 'Elegir foto'}
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={onCoverChange} />
                </label>
                {coverPreview && <img src={coverPreview} alt="" className={styles.coverPreview} />}
              </div>

              <div className={styles.field}>
                <label>Fotos adicionales ({galleryFiles.length}/{MAX_GALLERY})</label>
                <label className={styles.uploadBtn} data-disabled={galleryFiles.length >= MAX_GALLERY}>
                  🖼️ Agregar fotos
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple onChange={onGalleryChange} disabled={galleryFiles.length >= MAX_GALLERY} />
                </label>
                {galleryFiles.length > 0 && (
                  <div className={styles.previewGrid}>
                    {galleryFiles.map((file, i) => (
                      <GalleryThumb key={i} file={file} onRemove={() => removeGalleryFile(i)} />
                    ))}
                  </div>
                )}
              </div>

              {justCreatedTitle && <p className={styles.ok}>¡Listo! "{justCreatedTitle}" ya está activa y visible públicamente.</p>}
              {err && <p className={styles.err}>{err}</p>}
              <button className="btn btn-primary" disabled={saving}>{saving ? 'Creando…' : 'Crear campaña'}</button>
            </form>
          </div>

          {!mineLoading && !mpConnected && (
            <div className={styles.mpBanner}>
              <span>⚠️ Conecta Mercado Pago para recibir aportes</span>
              <Link href="/panel/bancos" className={styles.mpBannerBtn}>Ir a Banco</Link>
            </div>
          )}

          <div className={styles.dashCard}>
            <h2 className={styles.dashTitle}>Mis campañas</h2>

            {mineLoading ? (
              <p className={styles.dashEmpty}>Cargando…</p>
            ) : !mine?.length ? (
              <p className={styles.dashEmpty}>Todavía no creaste ninguna campaña.</p>
            ) : (
              <>
                <div data-dash="hdr" className={styles.dashRow}>
                  <div>Campaña</div>
                  <div>Inicio</div>
                  <div>Fin</div>
                  <div>Recaudado</div>
                  <div>Estado</div>
                  <div>QR</div>
                </div>
                {mine.map((c) => (
                  <div key={c.id} data-dash="row" className={styles.dashRow}>
                    <div data-label="Campaña"><Link href={`/colectas/${c.id}`} className={styles.dashCampaignLink}>{c.title}</Link></div>
                    <div data-label="Inicio">{fmtDate(c.start_at)}</div>
                    <div data-label="Fin">{fmtDate(c.end_at)}</div>
                    <div data-label="Recaudado">{clp(c.raised_cents)}</div>
                    <div data-label="Estado"><span className={styles.statusPill} data-status={c.status}>{STATUS_LABEL_ES[c.status] || c.status}</span></div>
                    <div data-label="QR"><a className={styles.qrLink} href={`/api/colectas/${c.id}/qr.png`} download>Descargar QR</a></div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </section>

      <style jsx global>{`
        @media (max-width: 720px) {
          main.container [data-dash="hdr"] { display: none !important; }
          main.container [data-dash="row"] {
            grid-template-columns: 1fr !important;
            row-gap: 6px;
            padding: 14px !important;
            margin: 10px 0;
            border: 1px solid #E5E7EB;
            border-radius: 14px;
            background: #fff;
          }
          main.container [data-dash="row"] > div { display: flex; justify-content: space-between; gap: 10px; }
          main.container [data-dash="row"] > div[data-label]::before {
            content: attr(data-label);
            color: #6B7280; font-size: 11.5px; font-weight: 700; flex-shrink: 0;
          }
        }
      `}</style>
    </>
  );
}
CrearColecta.getLayout = (page) => <Layout>{page}</Layout>;

function GalleryThumb({ file, onRemove }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return (
    <div className={styles.previewTile}>
      {url && <img src={url} alt="" />}
      <button type="button" className={styles.previewRemove} onClick={onRemove} aria-label="Quitar foto">✕</button>
    </div>
  );
}

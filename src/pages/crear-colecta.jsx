// src/pages/crear-colecta.jsx
// Fase C2: solo el flujo de creación. Todavía no hay página pública,
// montos, aportes ni checkout — al crear, se muestra una confirmación
// en vez de redirigir a una página pública que no existe todavía.
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import styles from '@/styles/crearColecta.module.css';
import { supabaseBrowser as supabase } from '@/lib/supabaseClient';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const MAX_GALLERY = 10;

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadPhoto(file, token) {
  if (!ALLOWED_PHOTO_TYPES.has(file.type)) throw new Error(`Formato no permitido: ${file.name}`);
  if (file.size > MAX_PHOTO_BYTES) throw new Error(`${file.name} pesa más de 5MB.`);
  const dataBase64 = await fileToBase64(file);
  const res = await fetch('/api/colectas/upload-photo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ filename: file.name, contentType: file.type, dataBase64 }),
  });
  const data = await res.json();
  if (!res.ok || !data?.ok) throw new Error(data?.error || `No se pudo subir ${file.name}`);
  return data.url;
}

export default function CrearColecta() {
  const router = useRouter();
  const [token, setToken] = useState(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [galleryFiles, setGalleryFiles] = useState([]);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [created, setCreated] = useState(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;
      if (!session) { router.push('/login?next=/crear-colecta'); return; }
      setToken(session.access_token);
    })();
  }, [router]);

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
    if (file.size > MAX_PHOTO_BYTES) { setErr(`${file.name} pesa más de 5MB.`); return; }
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
      if (file.size > MAX_PHOTO_BYTES) { setErr(`${file.name} pesa más de 5MB.`); continue; }
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
    if (!title.trim()) { setErr('Ponele un título a tu colecta.'); return; }
    if (!description.trim()) { setErr('Contá de qué se trata.'); return; }
    if (!token) return;

    setSaving(true);
    setErr('');
    try {
      let coverUrl = null;
      if (coverFile) coverUrl = await uploadPhoto(coverFile, token);

      const galleryUrls = [];
      for (const file of galleryFiles) {
        galleryUrls.push(await uploadPhoto(file, token));
      }

      const res = await fetch('/api/colectas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          cover_image_url: coverUrl,
          gallery_urls: galleryUrls,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'No se pudo crear la colecta.');
      setCreated(data.colecta);
    } catch (e2) {
      setErr(e2?.message || 'No se pudo crear la colecta.');
    } finally {
      setSaving(false);
    }
  }

  if (created) {
    return (
      <section className={styles.page}>
        <div className="container" style={{ maxWidth: 640 }}>
          <div className={styles.card}>
            <p className={styles.ok}>¡Listo! Tu colecta "{created.title}" quedó creada.</p>
            <p className={styles.sub}>
              Por ahora queda guardada como borrador — la parte pública (donde la gente puede ir a ayudar) todavía no está lista, es el siguiente paso.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <>
      <Head><title>Crear colecta — Rifex</title></Head>
      <section className={styles.page}>
        <div className="container" style={{ maxWidth: 640 }}>
          <div className={styles.card}>
            <h1 className={styles.title}>Crear colecta</h1>
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

              {err && <p className={styles.err}>{err}</p>}
              <button className="btn btn-primary" disabled={saving}>{saving ? 'Creando…' : 'Crear colecta'}</button>
            </form>
          </div>
        </div>
      </section>
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

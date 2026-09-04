// src/pages/panel/inscripciones/[id]/scanner.jsx
// INSCRIPCIONES V1 — scanner mobile-first para portería, ADAPT de
// panel/eventos/[id]/scanner.jsx. Misma máquina de guardas
// (createScannerController): "locked" solo se libera con "Siguiente
// escaneo" explícito, nunca un temporizador — mismo hallazgo real que
// documenta scannerController.js. GET /api/inscripciones/[id]/check-in
// solo decide si se muestra la UI; la autoridad real vive en la RPC
// check_in_registration_participant, invocada vía POST al mismo
// endpoint. V1 es owner-only (sección 20 del mandato) — decidido y
// aplicado exclusivamente server-side, en la RPC, nunca acá.
//
// SSR AUTH HARDENING (2026-09-04): getServerSideProps demuestra SESIÓN
// antes de renderizar (307 real para anónimos) — nunca se envía el
// shell del scanner (cámara, botón manual, controlador) a un cliente
// sin sesión. Autenticado-pero-no-dueño sigue siendo rechazado
// exactamente igual que antes: el ping GET/`check-in` (fase
// "unauthorized") y, de forma real e inescapable, la propia RPC
// check_in_registration_participant (`not_authorized`) — este boundary
// SSR es autenticación, nunca autorización, y no reemplaza ninguna de
// esas dos capas existentes.
import { useRouter } from 'next/router';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import jsQR from 'jsqr';
import Layout from '@/components/Layout';
import { supabaseBrowser as supabase } from '@/lib/supabaseClient';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { sanitizeNextPath } from '@/lib/countryPolicy';
import { parseRegistrationQrPayload } from '@/lib/parseRegistrationQr';
import { createScannerController } from '@/lib/scannerController';

export async function getServerSideProps(ctx) {
  const s = getSupabaseServer(ctx.req, ctx.res);
  const id = String(ctx.params?.id || '');
  const next = sanitizeNextPath(`/panel/inscripciones/${id}/scanner`, '/panel/inscripciones');
  let user = null;
  try {
    const { data } = await s.auth.getUser();
    user = data?.user || null;
  } catch (_) {
    user = null;
  }
  if (!user) {
    return { redirect: { destination: `/login?next=${encodeURIComponent(next)}`, permanent: false } };
  }
  return { props: {} };
}

const REJECT_LABEL = {
  invalid_token: 'QR no válido.',
  participant_not_found: 'Inscripción no encontrada.',
  wrong_activity: 'QR de otra actividad.',
  activity_not_found: 'Actividad no encontrada.',
  not_authorized: 'No autorizado para operar este scanner.',
  missing_actor: 'Sesión inválida — vuelve a iniciar sesión.',
  missing_activity: 'Actividad no especificada.',
  qr_malformed: 'QR no válido.',
  network: 'Sin conexión. No se pudo validar la inscripción.',
};

function fmtHour(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' }); }
  catch { return ''; }
}

function resultFromResponse({ body }) {
  if (body?.ok && body.result === 'pass') {
    return { kind: 'pass', title: 'PASA', detail: `${body.participant?.full_name || ''} · ${fmtHour(body.participant?.checked_in_at)}` };
  }
  if (body?.error === 'already_used') {
    return {
      kind: 'reject',
      title: 'YA REGISTRADO',
      detail: `${body.participant?.full_name || ''}${body.checked_in_at ? ` · ingresó a las ${fmtHour(body.checked_in_at)}` : ''}`,
    };
  }
  return { kind: 'reject', title: 'NO PASA', detail: REJECT_LABEL[body?.error] || 'Inscripción no válida.' };
}

export default function InscripcionScanner() {
  const router = useRouter();
  const { id } = router.query;

  const [phase, setPhase] = useState('loading'); // loading | unauthorized | ready | camera-error
  const [activityInfo, setActivityInfo] = useState(null);
  const [attendance, setAttendance] = useState(null); // { checked_in, capacity } | null
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualValue, setManualValue] = useState('');
  const [manualError, setManualError] = useState(null);

  const tokenRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);

  const controllerRef = useRef(null);
  if (!controllerRef.current) {
    controllerRef.current = createScannerController({
      submit: async (payload) => {
        const res = await fetch(`/api/inscripciones/${id}/check-in`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenRef.current}` },
          body: JSON.stringify(payload),
        });
        const body = await res.json().catch(() => null);
        return { status: res.status, body };
      },
    });
  }

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;
      if (!session) { router.push(`/login?next=/panel/inscripciones/${id}/scanner`); return; }
      tokenRef.current = session.access_token;
      try {
        const res = await fetch(`/api/inscripciones/${id}/check-in`, { headers: { Authorization: `Bearer ${session.access_token}` } });
        const body = await res.json();
        if (!res.ok || !body.ok) { setPhase('unauthorized'); return; }
        setActivityInfo(body.activity);
        if (body.attendance) setAttendance(body.attendance);
        setPhase(body.authorized ? 'ready' : 'unauthorized');
      } catch {
        setPhase('unauthorized');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, router]);

  const stopDecodeLoop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  const stopCamera = useCallback(() => {
    stopDecodeLoop();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setScanning(false);
  }, [stopDecodeLoop]);

  useEffect(() => stopCamera, [stopCamera]);

  const runDetection = useCallback(async (payload) => {
    if (controllerRef.current.isLocked()) return;
    stopDecodeLoop();
    setBusy(true);
    const outcome = await controllerRef.current.handleDetection(payload);
    setBusy(false);
    if (!outcome.accepted) return;
    if (outcome.error) {
      setResult({ kind: 'reject', title: 'NO PASA', detail: REJECT_LABEL.network });
      return;
    }
    if (outcome.result?.body?.attendance) setAttendance(outcome.result.body.attendance);
    setResult(resultFromResponse(outcome.result));
  }, [stopDecodeLoop]);

  const handleDecoded = useCallback((text) => {
    if (controllerRef.current.isLocked()) return;
    const origin = typeof window !== 'undefined' ? window.location.origin : null;
    const qrToken = parseRegistrationQrPayload(text, origin);
    if (!qrToken) {
      if (!controllerRef.current.lockForLocalReject()) return;
      stopDecodeLoop();
      setResult({ kind: 'reject', title: 'NO PASA', detail: REJECT_LABEL.qr_malformed });
      return;
    }
    runDetection({ qr_token: qrToken });
  }, [runDetection, stopDecodeLoop]);

  const scanLoop = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(scanLoop);
      return;
    }
    const w = Math.min(video.videoWidth || 640, 640);
    const h = Math.round((video.videoHeight || 480) * (w / (video.videoWidth || 640)));
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    const code = jsQR(imageData.data, w, h, { inversionAttempts: 'dontInvert' });
    if (code && code.data && !controllerRef.current.isLocked()) {
      handleDecoded(code.data);
      return;
    }
    rafRef.current = requestAnimationFrame(scanLoop);
  }, [handleDecoded]);

  const startCamera = useCallback(async () => {
    setPhase('ready');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanning(true);
      rafRef.current = requestAnimationFrame(scanLoop);
    } catch {
      setPhase('camera-error');
      setManualOpen(true);
    }
  }, [scanLoop]);

  useEffect(() => {
    if (phase === 'ready' && !scanning) startCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function nextScan() {
    if (!controllerRef.current.isLocked()) return;
    controllerRef.current.reset();
    setResult(null);
    setManualValue('');
    setManualError(null);
    if (scanning && !rafRef.current) rafRef.current = requestAnimationFrame(scanLoop);
  }

  function submitManual(e) {
    e.preventDefault();
    if (controllerRef.current.isLocked()) return;
    setManualError(null);
    const v = manualValue.trim();
    if (!v) { setManualError('Ingresa el código QR.'); return; }
    runDetection({ qr_token: v });
  }

  const locked = controllerRef.current?.isLocked() || false;

  if (phase === 'loading') {
    return <Layout noindex title="Scanner — Rifex"><div style={{ maxWidth: 480, margin: '48px auto', textAlign: 'center' }}><p>Cargando…</p></div></Layout>;
  }

  if (phase === 'unauthorized') {
    return (
      <Layout noindex title="Scanner — Rifex">
        <div style={{ maxWidth: 480, margin: '48px auto', textAlign: 'center', padding: '0 16px' }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>No autorizado</h1>
          <p style={{ color: '#64748b', fontSize: 14, marginTop: 8 }}>No tienes autorización para operar el scanner de esta actividad.</p>
          <p style={{ marginTop: 16 }}><Link href={`/panel/inscripciones/${id}`} style={{ color: '#1e3a8a', fontWeight: 700, textDecoration: 'none' }}>← Volver</Link></p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout noindex title={`Scanner — ${activityInfo?.title || 'Actividad'}`}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 12px' }}>
        <p style={{ margin: '8px 0 12px' }}>
          <Link href={`/panel/inscripciones/${id}`} style={{ color: '#1e3a8a', fontWeight: 600, fontSize: 13.5, textDecoration: 'none' }}>← Panel de la actividad</Link>
        </p>
        <h1 style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', margin: '0 0 4px', textAlign: 'center' }}>{activityInfo?.title}</h1>
        {attendance && (
          <p style={{ textAlign: 'center', fontSize: 14, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>
            Asistieron: {attendance.checked_in}{attendance.capacity != null ? ` / ${attendance.capacity}` : ''}
          </p>
        )}

        <div style={{ position: 'relative', borderRadius: 18, overflow: 'hidden', background: '#000', aspectRatio: '3 / 4', maxHeight: '58vh' }}>
          <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', display: phase === 'camera-error' ? 'none' : 'block' }} />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          {phase === 'camera-error' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', textAlign: 'center', padding: 20 }}>
              <p>No se pudo acceder a la cámara.<br />Usa el ingreso manual abajo.</p>
            </div>
          )}

          {result && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              background: result.kind === 'pass' ? 'rgba(21,128,61,0.96)' : 'rgba(185,28,28,0.96)', color: '#fff', textAlign: 'center', padding: 20,
            }}>
              <div style={{ fontSize: 40, fontWeight: 900, lineHeight: 1.1 }}>{result.kind === 'pass' ? '✓' : '✕'}</div>
              <div style={{ fontSize: 22, fontWeight: 900, marginTop: 6 }}>{result.title}</div>
              {result.detail && <div style={{ fontSize: 14, marginTop: 8, opacity: 0.95 }}>{result.detail}</div>}
              <button onClick={nextScan} style={{ marginTop: 20, padding: '10px 22px', borderRadius: 999, border: '2px solid #fff', background: 'transparent', color: '#fff', fontWeight: 800, fontSize: 14 }}>
                Siguiente escaneo
              </button>
            </div>
          )}

          {busy && !result && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,0.55)', color: '#fff', fontWeight: 700 }}>
              Validando…
            </div>
          )}
        </div>

        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <button onClick={() => setManualOpen((v) => !v)} disabled={locked} style={{ background: 'none', border: 'none', color: locked ? '#cbd5e1' : '#1e3a8a', fontWeight: 700, fontSize: 13.5, cursor: locked ? 'default' : 'pointer', padding: 8 }}>
            {manualOpen ? 'Ocultar ingreso manual' : 'Ingresar código manualmente'}
          </button>
        </div>

        {manualOpen && !locked && (
          <form onSubmit={submitManual} style={{ display: 'flex', gap: 8, marginTop: 6, marginBottom: 24 }}>
            <input
              value={manualValue}
              onChange={(e) => setManualValue(e.target.value)}
              placeholder="Código QR"
              disabled={locked}
              style={{ flex: 1, padding: '12px 14px', borderRadius: 12, border: '1px solid #d1d5db', fontSize: 15 }}
            />
            <button type="submit" disabled={locked} style={{ padding: '12px 18px', borderRadius: 12, border: 'none', background: '#1e3a8a', color: '#fff', fontWeight: 700, fontSize: 14 }}>
              Validar
            </button>
          </form>
        )}
        {manualError && <p style={{ color: '#b91c1c', fontSize: 13, textAlign: 'center' }}>{manualError}</p>}
      </div>
    </Layout>
  );
}

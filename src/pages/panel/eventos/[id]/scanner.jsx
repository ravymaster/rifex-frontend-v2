// src/pages/panel/eventos/[id]/scanner.jsx
// EVENT-4 — scanner mobile-first para portería. Ruta:
// /panel/eventos/[id]/scanner. GET /api/events/[id]/check-in solo decide
// si se muestra la UI (ping); la autoridad real de acceso y de check-in
// vive en la RPC check_in_event_ticket, invocada vía POST al mismo
// endpoint. La cámara solo decodifica texto — nunca navega a lo leído,
// nunca ejecuta URLs; el parseo estricto vive en @/lib/parseEventQr.
import { useRouter } from 'next/router';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import jsQR from 'jsqr';
import Layout from '@/components/Layout';
import { supabaseBrowser as supabase } from '@/lib/supabaseClient';
import { parseEventQrPayload } from '@/lib/parseEventQr';

const RESULT_AUTO_RESET_MS = 2800;

const REJECT_LABEL = {
  invalid_token: 'QR no válido.',
  ticket_not_found: 'Entrada anulada / inválida.',
  ticket_wrong_event: 'Entrada de otro evento.',
  event_not_found: 'Evento no encontrado.',
  event_cancelled: 'Evento cancelado — no se permite el ingreso.',
  ticket_void: 'Entrada anulada.',
  not_authorized: 'No autorizado para operar este scanner.',
  missing_actor: 'Sesión inválida — vuelve a iniciar sesión.',
  missing_event: 'Evento no especificado.',
  qr_malformed: 'QR no válido.',
  network: 'Sin conexión. No se pudo validar la entrada.',
};

function fmtHour(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' }); }
  catch { return ''; }
}

export default function EventScanner() {
  const router = useRouter();
  const { id } = router.query;

  const [token, setToken] = useState(null);
  const [phase, setPhase] = useState('loading'); // loading | unauthorized | ready | camera-error
  const [eventInfo, setEventInfo] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { kind: 'pass'|'reject', title, detail }
  const [manualOpen, setManualOpen] = useState(false);
  const [manualValue, setManualValue] = useState('');
  const [manualError, setManualError] = useState(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const resetTimerRef = useRef(null);
  const processingRef = useRef(false);

  // Sesión + ping de autorización.
  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;
      if (!session) { router.push(`/login?next=/panel/eventos/${id}/scanner`); return; }
      setToken(session.access_token);
      try {
        const res = await fetch(`/api/events/${id}/check-in`, { headers: { Authorization: `Bearer ${session.access_token}` } });
        const body = await res.json();
        if (!res.ok || !body.ok) { setPhase('unauthorized'); return; }
        setEventInfo(body.event);
        setPhase(body.authorized ? 'ready' : 'unauthorized');
      } catch {
        setPhase('unauthorized');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, router]);

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setScanning(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const submitCheckIn = useCallback(async (payload) => {
    if (processingRef.current) return;
    processingRef.current = true;
    setBusy(true);
    try {
      const res = await fetch(`/api/events/${id}/check-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => null);
      if (body?.ok && body.result === 'pass') {
        setResult({
          kind: 'pass',
          title: 'PASA',
          detail: `Entrada válida · ${body.ticket?.ticket_type_name || ''} · ${body.ticket?.ticket_number || ''} · ${fmtHour(body.ticket?.used_at)}`,
        });
      } else if (body?.error === 'already_used') {
        setResult({
          kind: 'reject',
          title: 'NO PASA — YA UTILIZADA',
          detail: body.used_at ? `Ingresó a las ${fmtHour(body.used_at)}` : '',
        });
      } else {
        setResult({
          kind: 'reject',
          title: 'NO PASA',
          detail: REJECT_LABEL[body?.error] || 'Entrada no válida.',
        });
      }
    } catch {
      setResult({ kind: 'reject', title: 'NO PASA', detail: REJECT_LABEL.network });
    } finally {
      setBusy(false);
      resetTimerRef.current = setTimeout(() => {
        setResult(null);
        processingRef.current = false;
      }, RESULT_AUTO_RESET_MS);
    }
  }, [id, token]);

  const handleDecoded = useCallback((text) => {
    if (processingRef.current) return;
    const origin = typeof window !== 'undefined' ? window.location.origin : null;
    const qrToken = parseEventQrPayload(text, origin);
    if (!qrToken) {
      processingRef.current = true;
      setResult({ kind: 'reject', title: 'NO PASA', detail: REJECT_LABEL.qr_malformed });
      setBusy(false);
      resetTimerRef.current = setTimeout(() => {
        setResult(null);
        processingRef.current = false;
      }, RESULT_AUTO_RESET_MS);
      return;
    }
    submitCheckIn({ qr_token: qrToken });
  }, [submitCheckIn]);

  const scanLoop = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(scanLoop);
      return;
    }
    const w = Math.min(video.videoWidth || 640, 640);
    const h = Math.round((video.videoHeight || 480) * (w / (video.videoWidth || 640)));
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    const code = jsQR(imageData.data, w, h, { inversionAttempts: 'dontInvert' });
    if (code && code.data && !processingRef.current) {
      handleDecoded(code.data);
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
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    setResult(null);
    processingRef.current = false;
  }

  function submitManual(e) {
    e.preventDefault();
    setManualError(null);
    const v = manualValue.trim();
    if (!v) { setManualError('Ingresa un número de entrada.'); return; }
    setManualValue('');
    submitCheckIn({ ticket_number: v });
  }

  if (phase === 'loading') {
    return (
      <Layout title="Scanner — Rifex"><div style={{ maxWidth: 480, margin: '48px auto', textAlign: 'center' }}><p>Cargando…</p></div></Layout>
    );
  }

  if (phase === 'unauthorized') {
    return (
      <Layout title="Scanner — Rifex">
        <div style={{ maxWidth: 480, margin: '48px auto', textAlign: 'center', padding: '0 16px' }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>No autorizado</h1>
          <p style={{ color: '#64748b', fontSize: 14, marginTop: 8 }}>No tienes autorización para operar el scanner de este evento.</p>
          <p style={{ marginTop: 16 }}><Link href={`/panel/eventos/${id}`} style={{ color: '#1e3a8a', fontWeight: 700, textDecoration: 'none' }}>← Volver</Link></p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={`Scanner — ${eventInfo?.title || 'Evento'}`}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 12px' }}>
        <p style={{ margin: '8px 0 12px' }}>
          <Link href={`/panel/eventos/${id}`} style={{ color: '#1e3a8a', fontWeight: 600, fontSize: 13.5, textDecoration: 'none' }}>← Panel del evento</Link>
        </p>
        <h1 style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', margin: '0 0 4px', textAlign: 'center' }}>{eventInfo?.title}</h1>
        {eventInfo?.status === 'cancelled' && (
          <p style={{ textAlign: 'center', color: '#b91c1c', fontWeight: 700, fontSize: 13.5, margin: '0 0 10px' }}>Evento cancelado — el check-in siempre será rechazado.</p>
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
          <button onClick={() => setManualOpen((v) => !v)} style={{ background: 'none', border: 'none', color: '#1e3a8a', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', padding: 8 }}>
            {manualOpen ? 'Ocultar ingreso manual' : 'Ingresar código manualmente'}
          </button>
        </div>

        {manualOpen && (
          <form onSubmit={submitManual} style={{ display: 'flex', gap: 8, marginTop: 6, marginBottom: 24 }}>
            <input
              value={manualValue}
              onChange={(e) => setManualValue(e.target.value)}
              placeholder="RFX-EVT-XXXXXX"
              style={{ flex: 1, padding: '12px 14px', borderRadius: 12, border: '1px solid #d1d5db', fontSize: 15 }}
            />
            <button type="submit" disabled={busy} style={{ padding: '12px 18px', borderRadius: 12, border: 'none', background: '#1e3a8a', color: '#fff', fontWeight: 700, fontSize: 14 }}>
              Validar
            </button>
          </form>
        )}
        {manualError && <p style={{ color: '#b91c1c', fontSize: 13, textAlign: 'center' }}>{manualError}</p>}
      </div>
    </Layout>
  );
}

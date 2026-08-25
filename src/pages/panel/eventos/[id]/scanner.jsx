// src/pages/panel/eventos/[id]/scanner.jsx
// EVENT-4 — scanner mobile-first para portería. Ruta:
// /panel/eventos/[id]/scanner. GET /api/events/[id]/check-in solo decide
// si se muestra la UI (ping); la autoridad real de acceso y de check-in
// vive en la RPC check_in_event_ticket, invocada vía POST al mismo
// endpoint. La cámara solo decodifica texto — nunca navega a lo leído,
// nunca ejecuta URLs; el parseo estricto vive en @/lib/parseEventQr.
//
// Hallazgo de la primera prueba manual real (2026-08-25): un auto-reset
// por temporizador reactivaba el loop de cámara mientras el teléfono
// seguía apuntando al mismo QR ya consumido, generando un segundo
// check-in real que sobrescribía PASA con already_used antes de que el
// portero pudiera reaccionar. Corregido de raíz: toda la lógica de
// "¿puede aceptarse una detección nueva ahora mismo?" vive en
// @/lib/scannerController (probado en tests/scannerController.test.mjs),
// y la ÚNICA forma de volver a habilitar detecciones es que el portero
// pulse "Siguiente escaneo" — nunca un temporizador, nunca automático.
import { useRouter } from 'next/router';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import jsQR from 'jsqr';
import Layout from '@/components/Layout';
import { supabaseBrowser as supabase } from '@/lib/supabaseClient';
import { parseEventQrPayload } from '@/lib/parseEventQr';
import { createScannerController } from '@/lib/scannerController';

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

function resultFromResponse({ status, body }) {
  if (body?.ok && body.result === 'pass') {
    return {
      kind: 'pass',
      title: 'PASA',
      detail: `Entrada válida · ${body.ticket?.ticket_type_name || ''} · ${body.ticket?.ticket_number || ''} · ${fmtHour(body.ticket?.used_at)}`,
    };
  }
  if (body?.error === 'already_used') {
    return {
      kind: 'reject',
      title: 'NO PASA — YA UTILIZADA',
      detail: body.used_at ? `Ingresó a las ${fmtHour(body.used_at)}` : '',
    };
  }
  return { kind: 'reject', title: 'NO PASA', detail: REJECT_LABEL[body?.error] || 'Entrada no válida.' };
}

export default function EventScanner() {
  const router = useRouter();
  const { id } = router.query;

  const [phase, setPhase] = useState('loading'); // loading | unauthorized | ready | camera-error
  const [eventInfo, setEventInfo] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { kind: 'pass'|'reject', title, detail }
  const [manualOpen, setManualOpen] = useState(false);
  const [manualValue, setManualValue] = useState('');
  const [manualError, setManualError] = useState(null);

  const tokenRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);

  // Una sola instancia por página — el submit real lee siempre el token
  // vigente vía tokenRef (nunca queda "atrapada" con un token viejo).
  const controllerRef = useRef(null);
  if (!controllerRef.current) {
    controllerRef.current = createScannerController({
      submit: async (payload) => {
        const res = await fetch(`/api/events/${id}/check-in`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenRef.current}` },
          body: JSON.stringify(payload),
        });
        const body = await res.json().catch(() => null);
        return { status: res.status, body };
      },
    });
  }

  // Sesión + ping de autorización.
  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;
      if (!session) { router.push(`/login?next=/panel/eventos/${id}/scanner`); return; }
      tokenRef.current = session.access_token;
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

  // Punto único de entrada para CUALQUIER detección real (cámara o
  // fallback manual) que deba convertirse en una solicitud de check-in.
  // El control de "¿se puede aceptar ahora?" vive enteramente en
  // controllerRef — acá solo se refleja en la UI.
  const runDetection = useCallback(async (payload) => {
    if (controllerRef.current.isLocked()) return; // guarda redundante, ver scannerController
    stopDecodeLoop(); // corta el loop ANTES de awaitear nada — ninguna detección más hasta "Siguiente escaneo"
    setBusy(true);
    const outcome = await controllerRef.current.handleDetection(payload);
    setBusy(false);
    if (!outcome.accepted) return; // otra detección ganó la carrera — no hacer nada
    if (outcome.error) {
      setResult({ kind: 'reject', title: 'NO PASA', detail: REJECT_LABEL.network });
      return;
    }
    setResult(resultFromResponse(outcome.result));
  }, [stopDecodeLoop]);

  const handleDecoded = useCallback((text) => {
    if (controllerRef.current.isLocked()) return;
    const origin = typeof window !== 'undefined' ? window.location.origin : null;
    const qrToken = parseEventQrPayload(text, origin);
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
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    const code = jsQR(imageData.data, w, h, { inversionAttempts: 'dontInvert' });
    if (code && code.data && !controllerRef.current.isLocked()) {
      handleDecoded(code.data);
      return; // handleDecoded (vía runDetection) ya decidió si corta el loop
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

  // ÚNICA forma de volver a habilitar detecciones. Guarda contra doble
  // toque: si ya no hay nada bloqueado (p.ej. el usuario tocó dos veces
  // muy rápido), la segunda pulsación no hace nada.
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
    if (controllerRef.current.isLocked()) return; // resultado visible pendiente de "Siguiente escaneo"
    setManualError(null);
    const v = manualValue.trim();
    if (!v) { setManualError('Ingresa un número de entrada.'); return; }
    runDetection({ ticket_number: v });
  }

  const locked = controllerRef.current?.isLocked() || false;

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
          <button onClick={() => setManualOpen((v) => !v)} disabled={locked} style={{ background: 'none', border: 'none', color: locked ? '#cbd5e1' : '#1e3a8a', fontWeight: 700, fontSize: 13.5, cursor: locked ? 'default' : 'pointer', padding: 8 }}>
            {manualOpen ? 'Ocultar ingreso manual' : 'Ingresar código manualmente'}
          </button>
        </div>

        {manualOpen && !locked && (
          <form onSubmit={submitManual} style={{ display: 'flex', gap: 8, marginTop: 6, marginBottom: 24 }}>
            <input
              value={manualValue}
              onChange={(e) => setManualValue(e.target.value)}
              placeholder="RFX-EVT-XXXXXX"
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

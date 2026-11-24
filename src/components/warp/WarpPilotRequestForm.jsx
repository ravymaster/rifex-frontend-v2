// src/components/warp/WarpPilotRequestForm.jsx
// Formulario "Solicitar piloto" de /warp-conversacional.
// - La página es pública; ENVIAR requiere sesión de Rifex. Sin sesión se
//   guardan en sessionStorage solo los campos no personales
//   (WARP_PILOT_DRAFT_FIELDS: nunca nombre, correo ni teléfono), se pide
//   iniciar sesión y se vuelve aquí con el formulario restaurado.
// - Misma validación que el servidor (src/lib/warpPilotRequest.js); la
//   autoridad final es la API y la base (RLS).
// - No cobra, no crea claves de Warp y no activa nada.
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { supabaseBrowser as supabase } from '@/lib/supabaseClient';
import {
  validatePilotRequest,
  WARP_PILOT_DRAFT_FIELDS,
  WARP_PILOT_ERROR_MESSAGE,
  WARP_PILOT_LIMITS,
  WARP_SITE_TYPES,
  WARP_TRAFFIC_OPTIONS,
} from '@/lib/warpPilotRequest';
import styles from '@/styles/warpConversacional.module.css';

export const DRAFT_KEY = 'rifex:warp-pilot-draft';
export const LOGIN_NEXT = '/warp-conversacional#solicitar';

const EMPTY = {
  company: '', domain: '', contactName: '', email: '', phone: '', siteType: '', objective: '',
  authorizedInformation: '', estimatedTraffic: '', acceptTerms: false, acceptCompatibility: false, website: '',
};

function readDraft() {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const out = {};
    for (const k of WARP_PILOT_DRAFT_FIELDS) if (typeof parsed?.[k] === 'string') out[k] = parsed[k].slice(0, 2000);
    return out;
  } catch {
    return null;
  }
}

function saveDraft(values) {
  try {
    const out = {};
    for (const k of WARP_PILOT_DRAFT_FIELDS) out[k] = values[k] || '';
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(out));
  } catch {
    /* sin almacenamiento: la persona vuelve a escribir */
  }
}

function clearDraft() {
  try {
    window.sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* nada */
  }
}

export default function WarpPilotRequestForm() {
  const [values, setValues] = useState(EMPTY);
  const [session, setSession] = useState({ checked: false, token: null });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const formRef = useRef(null);
  const errorRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const draft = readDraft();
    if (draft) {
      setValues((v) => ({ ...v, ...draft }));
      window.setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    }
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const s = data?.session || null;
      setSession({ checked: true, token: s?.access_token || null });
      if (s?.user?.email) setValues((v) => (v.email ? v : { ...v, email: s.user.email }));
    }).catch(() => !cancelled && setSession({ checked: true, token: null }));
    return () => {
      cancelled = true;
    };
  }, []);

  const set = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setValues((v) => ({ ...v, [field]: value }));
    if (error?.field === field) setError(null);
  };

  const showError = (code, field = null) => {
    setError({ code, field, message: WARP_PILOT_ERROR_MESSAGE[code] || WARP_PILOT_ERROR_MESSAGE.invalid_request });
    window.setTimeout(() => {
      if (field) document.getElementById(`wp-${field}`)?.focus();
      else errorRef.current?.focus();
    }, 0);
  };

  const goLogin = () => {
    saveDraft(values);
    window.location.assign(`/login?next=${encodeURIComponent(LOGIN_NEXT)}`);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    if (!session.token) {
      goLogin();
      return;
    }
    const v = validatePilotRequest(values);
    if (!v.ok) {
      showError(v.error, v.field);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/warp-conversacional/solicitudes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
        body: JSON.stringify(values),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 401) {
        goLogin();
        return;
      }
      if (!res.ok || !json?.ok) {
        showError(json?.error || 'server_error', json?.field || null);
        return;
      }
      clearDraft();
      setResult(json.request);
    } catch {
      showError('server_error');
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <div className={styles.formCard} role="status" aria-live="polite">
        <p className={styles.formSuccessTitle}>Solicitud recibida</p>
        <dl className={styles.resultList}>
          <div><dt>Identificador</dt><dd>{result.shortId}</dd></div>
          <div><dt>Dominio</dt><dd>{result.domain}</dd></div>
          <div><dt>Estado</dt><dd>{result.statusLabel}</dd></div>
        </dl>
        <p className={styles.formNote}>{result.nextStep}</p>
        <p className={styles.formNote}>Te enviamos una confirmación al correo de contacto. Todavía no existe ningún cobro ni activación.</p>
        <Link href="/panel/warp" className={styles.btnInline}>Ver mis solicitudes de Warp</Link>
      </div>
    );
  }

  const invalid = (field) => error?.field === field;
  const describedBy = (field) => (invalid(field) ? 'wp-error' : undefined);

  return (
    <form ref={formRef} className={styles.formCard} onSubmit={onSubmit} noValidate aria-labelledby="solicitar-title">
      {session.checked && !session.token && (
        <p className={styles.formNotice}>
          Puedes completar el formulario ahora. Para enviarlo te pediremos iniciar sesión en Rifex; guardaremos la empresa, el dominio y las respuestas (nunca tu nombre, correo ni teléfono) para que no tengas que escribirlas de nuevo.
        </p>
      )}
      {error && (
        <p id="wp-error" ref={errorRef} tabIndex={-1} className={styles.formError} role="alert">{error.message}</p>
      )}

      <div className={styles.formGrid}>
        <label className={styles.field}>
          <span>Empresa *</span>
          <input id="wp-company" value={values.company} onChange={set('company')} maxLength={WARP_PILOT_LIMITS.company[1]} autoComplete="organization" required aria-invalid={invalid('company')} aria-describedby={describedBy('company')} />
        </label>
        <label className={styles.field}>
          <span>Dominio del sitio *</span>
          <input id="wp-domain" value={values.domain} onChange={set('domain')} maxLength={300} placeholder="tuempresa.cl" inputMode="url" autoComplete="url" required aria-invalid={invalid('domain')} aria-describedby={describedBy('domain')} />
        </label>
        <label className={styles.field}>
          <span>Nombre del responsable *</span>
          <input id="wp-contactName" value={values.contactName} onChange={set('contactName')} maxLength={WARP_PILOT_LIMITS.contactName[1]} autoComplete="name" required aria-invalid={invalid('contactName')} aria-describedby={describedBy('contactName')} />
        </label>
        <label className={styles.field}>
          <span>Correo de contacto *</span>
          <input id="wp-email" type="email" value={values.email} onChange={set('email')} maxLength={WARP_PILOT_LIMITS.email} autoComplete="email" required aria-invalid={invalid('email')} aria-describedby={describedBy('email')} />
        </label>
        <label className={styles.field}>
          <span>Teléfono (opcional)</span>
          <input id="wp-phone" type="tel" value={values.phone} onChange={set('phone')} maxLength={WARP_PILOT_LIMITS.phone[1]} autoComplete="tel" aria-invalid={invalid('phone')} aria-describedby={describedBy('phone')} />
        </label>
        <label className={styles.field}>
          <span>Tipo de sitio *</span>
          <select id="wp-siteType" value={values.siteType} onChange={set('siteType')} required aria-invalid={invalid('siteType')} aria-describedby={describedBy('siteType')}>
            <option value="">Selecciona una opción</option>
            {WARP_SITE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <label className={`${styles.field} ${styles.fieldWide}`}>
          <span>Objetivo del asistente *</span>
          <textarea id="wp-objective" rows={3} value={values.objective} onChange={set('objective')} maxLength={WARP_PILOT_LIMITS.objective[1]} placeholder="Por ejemplo: orientar a los visitantes hacia nuestros servicios y responder preguntas frecuentes." required aria-invalid={invalid('objective')} aria-describedby={describedBy('objective')} />
        </label>
        <label className={`${styles.field} ${styles.fieldWide}`}>
          <span>Información que debería responder *</span>
          <textarea id="wp-authorizedInformation" rows={4} value={values.authorizedInformation} onChange={set('authorizedInformation')} maxLength={WARP_PILOT_LIMITS.authorizedInformation[1]} placeholder="Por ejemplo: servicios, horarios, cobertura, preguntas frecuentes y cómo contactarnos." required aria-invalid={invalid('authorizedInformation')} aria-describedby={describedBy('authorizedInformation')} />
          <small>No incluyas contraseñas, claves ni datos privados. Nunca te los pediremos por aquí.</small>
        </label>
        <label className={styles.field}>
          <span>Tráfico aproximado (opcional)</span>
          <select id="wp-estimatedTraffic" value={values.estimatedTraffic} onChange={set('estimatedTraffic')} aria-invalid={invalid('estimatedTraffic')}>
            <option value="">Prefiero no indicarlo</option>
            {WARP_TRAFFIC_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
      </div>

      {/* Honeypot: invisible para personas y lectores de pantalla. */}
      <div className={styles.honeypot} aria-hidden="true">
        <label>
          Sitio web
          <input tabIndex={-1} autoComplete="off" value={values.website} onChange={set('website')} />
        </label>
      </div>

      <label className={styles.check}>
        <input id="wp-acceptTerms" type="checkbox" checked={values.acceptTerms} onChange={set('acceptTerms')} aria-invalid={invalid('acceptTerms')} aria-describedby={describedBy('acceptTerms')} />
        <span>Acepto los <Link href="/terminos">términos de Rifex</Link> y la <Link href="/privacidad">política de privacidad</Link>. *</span>
      </label>
      <label className={styles.check}>
        <input id="wp-acceptCompatibility" type="checkbox" checked={values.acceptCompatibility} onChange={set('acceptCompatibility')} aria-invalid={invalid('acceptCompatibility')} aria-describedby={describedBy('acceptCompatibility')} />
        <span>Entiendo que el piloto está sujeto a una revisión de compatibilidad de mi sitio y que enviar esta solicitud no genera cobros ni activa nada. *</span>
      </label>

      <button type="submit" className={styles.btnSubmit} disabled={submitting || !session.checked}>
        {submitting ? 'Enviando…' : session.checked && !session.token ? 'Iniciar sesión para enviar' : 'Solicitar piloto'}
      </button>
      <p className={styles.formNote}>Enviar la solicitud no genera cobros ni activa el asistente. Antes de cualquier pago revisamos la compatibilidad y te enviamos la propuesta.</p>
    </form>
  );
}

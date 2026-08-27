// src/pages/registro/continuar.jsx
// TRUST-1 — onboarding universal obligatorio, para correo o Google
// OAuth. Requiere sesión (igual que /onboarding/pais) — si no hay
// sesión, manda a login y vuelve acá. Guarda avance en cada campo
// (reanudable si el usuario abandona) y valida todo junto al completar.
import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import styles from '@/styles/onboarding.module.css';
import { supabaseBrowser as supabase } from '@/lib/supabaseClient';
import { sanitizeNextPath } from '@/lib/countryPolicy';

const FIELD_ERROR_MESSAGES = {
  invalid_legal_name: 'Ingresa tu nombre completo tal como aparece en tu documento de identidad.',
  invalid_birth_date: 'Ingresa una fecha de nacimiento válida.',
  birth_date_in_future: 'La fecha de nacimiento no puede ser futura.',
  birth_date_implausible: 'Revisa la fecha de nacimiento ingresada.',
  invalid_phone: 'Ingresa un teléfono válido, con código de país si corresponde.',
  invalid_account_type: 'Selecciona si es una cuenta personal o de una organización.',
  terms_not_accepted: 'Debes aceptar los Términos de Uso para continuar.',
  privacy_not_accepted: 'Debes aceptar la Política de Privacidad para continuar.',
};

const TOTAL_STEPS = 6; // legal_name, birth_date, phone, account_type, terms, privacy

export default function RegistroContinuar() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [missing, setMissing] = useState([]);
  const [globalError, setGlobalError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const [legalName, setLegalName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [phone, setPhone] = useState('');
  const [accountType, setAccountType] = useState('person');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [alreadyAcceptedTerms, setAlreadyAcceptedTerms] = useState(false);
  const [alreadyAcceptedPrivacy, setAlreadyAcceptedPrivacy] = useState(false);

  const nextPath = sanitizeNextPath(
    router.isReady ? router.query?.next?.toString() : '',
    '/panel'
  );

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;
      if (!session) {
        router.replace(`/login?next=${encodeURIComponent(router.asPath || '/registro/continuar')}`);
        return;
      }
      setToken(session.access_token);
      setReady(true);

      try {
        const res = await fetch('/api/onboarding/trust/status', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const data2 = await res.json();
        if (res.ok && data2.ok) {
          if (data2.complete) {
            router.replace(nextPath);
            return;
          }
          setMissing(data2.missing || []);
          if (data2.fields) {
            if (data2.fields.legal_name) setLegalName(data2.fields.legal_name);
            if (data2.fields.birth_date) setBirthDate(data2.fields.birth_date);
            if (data2.fields.phone) setPhone(data2.fields.phone);
            if (data2.fields.account_type) setAccountType(data2.fields.account_type);
            if (data2.fields.terms_version) setAlreadyAcceptedTerms(true);
            if (data2.fields.privacy_version) setAlreadyAcceptedPrivacy(true);
          }
        }
      } catch {
        // silencioso — el formulario igual se puede completar desde cero
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  const stepsDone = useMemo(() => {
    let done = 0;
    if (legalName.trim().length >= 3) done += 1;
    if (birthDate) done += 1;
    if (phone.trim().length >= 6) done += 1;
    if (accountType) done += 1;
    if (termsAccepted || alreadyAcceptedTerms) done += 1;
    if (privacyAccepted || alreadyAcceptedPrivacy) done += 1;
    return done;
  }, [legalName, birthDate, phone, accountType, termsAccepted, alreadyAcceptedTerms, privacyAccepted, alreadyAcceptedPrivacy]);

  async function saveProgress(partial) {
    if (!token) return;
    try {
      await fetch('/api/onboarding/trust/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(partial),
      });
    } catch {
      // el guardado de avance es best-effort — el envío final valida todo de nuevo
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (saving) return;
    setGlobalError('');
    setFieldErrors({});
    setSaving(true);
    try {
      const payload = {
        legal_name: legalName.trim(),
        birth_date: birthDate,
        phone: phone.trim(),
        account_type: accountType,
      };
      if (termsAccepted) payload.terms_accepted = true;
      if (privacyAccepted) payload.privacy_accepted = true;

      const res = await fetch('/api/onboarding/trust/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (data.fields) {
          setFieldErrors(data.fields);
          setGlobalError('Revisa los datos marcados abajo.');
        } else {
          setGlobalError('No se pudo guardar tu registro. Intenta nuevamente.');
        }
        return;
      }
      if (!data.complete) {
        setMissing(data.missing || []);
        setGlobalError('Faltan datos por completar antes de continuar.');
        return;
      }
      router.replace(nextPath);
    } catch (err) {
      console.error('[registro/continuar]', err);
      setGlobalError('No se pudo guardar tu registro. Intenta nuevamente.');
    } finally {
      setSaving(false);
    }
  }

  if (!ready || loading) return null;

  return (
    <>
      <Head><title>Completa tu registro — Rifex</title></Head>
      <main className={styles.page}>
        <section className={styles.shell}>
          <div className={styles.inner}>
            <div className={styles.progress}>
              {Array.from({ length: TOTAL_STEPS }, (_, i) => (
                <div key={i} className={i < stepsDone ? styles.progressStepDone : styles.progressStep} />
              ))}
            </div>

            <h1 className={styles.title}>Completa tu registro</h1>
            <p className={styles.sub}>
              Necesitamos estos datos para que puedas crear rifas, colectas o eventos en Rifex. Esto no reemplaza
              una verificación de identidad — es el paso base para operar en la plataforma.
            </p>

            <form onSubmit={onSubmit}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="legal_name">Nombre completo</label>
                <input
                  id="legal_name"
                  className={fieldErrors.legal_name ? styles.inputError : styles.input}
                  type="text"
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  onBlur={() => legalName.trim().length >= 3 && saveProgress({ legal_name: legalName.trim() })}
                  maxLength={140}
                  autoComplete="name"
                />
                {fieldErrors.legal_name ? (
                  <p className={styles.fieldError}>{FIELD_ERROR_MESSAGES[fieldErrors.legal_name] || 'Revisa este campo.'}</p>
                ) : (
                  <p className={styles.fieldHelp}>Este dato es privado — nunca se muestra en tu perfil público.</p>
                )}
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="birth_date">Fecha de nacimiento</label>
                <input
                  id="birth_date"
                  className={fieldErrors.birth_date ? styles.inputError : styles.input}
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  onBlur={() => birthDate && saveProgress({ birth_date: birthDate })}
                  autoComplete="bday"
                />
                {fieldErrors.birth_date ? (
                  <p className={styles.fieldError}>{FIELD_ERROR_MESSAGES[fieldErrors.birth_date] || 'Revisa este campo.'}</p>
                ) : (
                  <p className={styles.fieldHelp}>Privado. Necesario para operar en Rifex.</p>
                )}
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="phone">Teléfono</label>
                <input
                  id="phone"
                  className={fieldErrors.phone ? styles.inputError : styles.input}
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onBlur={() => phone.trim().length >= 6 && saveProgress({ phone: phone.trim() })}
                  placeholder="+56 9 1234 5678"
                  autoComplete="tel"
                />
                {fieldErrors.phone && <p className={styles.fieldError}>{FIELD_ERROR_MESSAGES[fieldErrors.phone] || 'Revisa este campo.'}</p>}
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="account_type">Tipo de cuenta</label>
                <select
                  id="account_type"
                  className={fieldErrors.account_type ? styles.inputError : styles.input}
                  value={accountType}
                  onChange={(e) => { setAccountType(e.target.value); saveProgress({ account_type: e.target.value }); }}
                >
                  <option value="person">Persona</option>
                  <option value="organization">Organización</option>
                </select>
              </div>

              {!alreadyAcceptedTerms && (
                <div className={styles.checkboxRow}>
                  <input id="terms" type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} />
                  <label className={styles.checkboxLabel} htmlFor="terms">
                    Acepto los <a href="/terminos" target="_blank" rel="noreferrer">Términos de Uso</a> de Rifex.
                  </label>
                </div>
              )}
              {fieldErrors.terms_accepted && <p className={styles.fieldError}>{FIELD_ERROR_MESSAGES[fieldErrors.terms_accepted]}</p>}

              {!alreadyAcceptedPrivacy && (
                <div className={styles.checkboxRow}>
                  <input id="privacy" type="checkbox" checked={privacyAccepted} onChange={(e) => setPrivacyAccepted(e.target.checked)} />
                  <label className={styles.checkboxLabel} htmlFor="privacy">
                    Acepto la <a href="/terminos#privacidad" target="_blank" rel="noreferrer">Política de Privacidad</a> de Rifex.
                  </label>
                </div>
              )}
              {fieldErrors.privacy_accepted && <p className={styles.fieldError}>{FIELD_ERROR_MESSAGES[fieldErrors.privacy_accepted]}</p>}

              {globalError && <p className={styles.err}>{globalError}</p>}

              <div className={styles.actions}>
                <button type="submit" className="btn btn-primary btnPrimary" disabled={saving}>
                  {saving ? 'Guardando…' : 'Completar registro'}
                </button>
              </div>
            </form>

            <p className={styles.notice}>
              Completar este registro te permite crear iniciativas en Rifex. No implica todavía una verificación de tu
              identidad — eso podría pedirse más adelante para operaciones específicas.
            </p>
          </div>
        </section>
      </main>
    </>
  );
}

RegistroContinuar.getLayout = (page) => <Layout>{page}</Layout>;

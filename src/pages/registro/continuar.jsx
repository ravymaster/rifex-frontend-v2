// src/pages/registro/continuar.jsx
// TRUST-1 — onboarding universal obligatorio, para correo o Google
// OAuth. Requiere sesión (igual que /onboarding/pais) — si no hay
// sesión, manda a login y vuelve acá. Guarda avance en cada campo
// (reanudable si el usuario abandona) y valida todo junto al completar.
//
// TRUST-2 — agrega, solo cuando el país guardado del usuario es Chile,
// un paso más para declarar el RUT.
//
// Corrección canónica (2026-08-27) — Mercado Pago como control
// principal: reemplaza el campo "Nombre completo" + selector de tipo de
// cuenta por dos campos (persona/organización, exactamente uno lleno),
// reemplaza fecha de nacimiento por una declaración booleana versionada
// ("Declaro que soy mayor de 18 años" — nunca age_verified), simplifica
// el teléfono a un componente chileno de 9 dígitos, y agrega el cierre
// real del onboarding: conectar Mercado Pago y que su titular coincida
// con el RUT declarado. El proceso es reanudable — al volver, el
// usuario continúa exactamente donde quedó.
import Head from 'next/head';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import styles from '@/styles/onboarding.module.css';
import { supabaseBrowser as supabase } from '@/lib/supabaseClient';
import { sanitizeNextPath } from '@/lib/countryPolicy';

const FIELD_ERROR_MESSAGES = {
  invalid_person_name: 'Ingresa tu nombre completo tal como aparece en tu documento de identidad.',
  invalid_organization_name: 'Ingresa el nombre de la empresa u organización.',
  both_names_provided: 'Completa solamente una opción: persona natural u organización, no ambas.',
  invalid_phone: 'Ingresa tu número, 9 dígitos, comenzando en 9 (ej: 959904311).',
  adult_declaration_required: 'Debes declarar que eres mayor de 18 años para continuar.',
  terms_not_accepted: 'Debes aceptar los Términos de Uso para continuar.',
  privacy_not_accepted: 'Debes aceptar la Política de Privacidad para continuar.',
};

const RUT_ERROR_MESSAGES = {
  rut_required: 'Ingresa tu RUT.',
  invalid_rut: 'Ese RUT no parece válido. Revisa los números y el dígito verificador.',
  rut_conflict: 'No pudimos guardar este RUT. Verifica los datos e intenta nuevamente.',
};

const TOTAL_STEPS = 5; // nombre, teléfono, mayoría de edad, términos, privacidad

export default function RegistroContinuar() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [missing, setMissing] = useState([]);
  const [globalError, setGlobalError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const [personName, setPersonName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [phone, setPhone] = useState('');
  const [adultDeclared, setAdultDeclared] = useState(false);
  const [alreadyDeclaredAdult, setAlreadyDeclaredAdult] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [alreadyAcceptedTerms, setAlreadyAcceptedTerms] = useState(false);
  const [alreadyAcceptedPrivacy, setAlreadyAcceptedPrivacy] = useState(false);

  // TRUST-2 — solo se usa/exige cuando rutRequired es true (país CL).
  const [rutRequired, setRutRequired] = useState(false);
  const [rut, setRut] = useState('');
  const [rutMasked, setRutMasked] = useState(null);
  const [rutError, setRutError] = useState('');

  // Corrección canónica — cierre real del onboarding vía Mercado Pago.
  const [localComplete, setLocalComplete] = useState(false);
  const [mpState, setMpState] = useState(null); // { required, connected, identity_match }
  const [readyForWelcome, setReadyForWelcome] = useState(false);
  const [checkingMp, setCheckingMp] = useState(false);

  const nextPath = sanitizeNextPath(
    router.isReady ? router.query?.next?.toString() : '',
    '/panel'
  );

  const refreshStatus = useCallback(async (accessToken) => {
    const res = await fetch('/api/onboarding/trust/status', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data2 = await res.json();
    if (!res.ok || !data2.ok) return null;

    setMissing(data2.missing || []);
    if (data2.fields) {
      if (data2.fields.person_name) setPersonName(data2.fields.person_name);
      if (data2.fields.organization_name) setOrganizationName(data2.fields.organization_name);
      if (data2.fields.phone) setPhone(data2.fields.phone.replace(/^\+56/, ''));
      if (data2.fields.adult_declared) setAlreadyDeclaredAdult(true);
      if (data2.fields.terms_version) setAlreadyAcceptedTerms(true);
      if (data2.fields.privacy_version) setAlreadyAcceptedPrivacy(true);
    }
    if (data2.identity) {
      setRutRequired(Boolean(data2.identity.rut_required));
      if (data2.identity.rut_declared) setRutMasked(data2.identity.rut_masked || null);
    }
    setLocalComplete(Boolean(data2.complete));
    setMpState(data2.mp || null);
    setReadyForWelcome(Boolean(data2.onboarding_complete_for_creators));
    return data2;
  }, []);

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
        await refreshStatus(session.access_token);
      } catch {
        // silencioso — el formulario igual se puede completar desde cero
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  const totalSteps = rutRequired ? TOTAL_STEPS + 1 : TOTAL_STEPS;

  const stepsDone = useMemo(() => {
    let done = 0;
    if (personName.trim().length >= 3 || organizationName.trim().length >= 3) done += 1;
    if (phone.replace(/[^0-9]/g, '').length === 9) done += 1;
    if (adultDeclared || alreadyDeclaredAdult) done += 1;
    if (termsAccepted || alreadyAcceptedTerms) done += 1;
    if (privacyAccepted || alreadyAcceptedPrivacy) done += 1;
    if (rutRequired && (rutMasked || rut.trim().length >= 8)) done += 1;
    return done;
  }, [personName, organizationName, phone, adultDeclared, alreadyDeclaredAdult, termsAccepted, alreadyAcceptedTerms, privacyAccepted, alreadyAcceptedPrivacy, rutRequired, rutMasked, rut]);

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

  // TRUST-2 — guarda el RUT declarado. Devuelve true si quedó guardado
  // (o si ya estaba guardado y no había nada nuevo que enviar), false si
  // falta o es inválido — el llamador decide si eso bloquea el envío
  // final.
  async function saveRut() {
    if (!rutRequired) return true;
    if (!rut.trim()) return Boolean(rutMasked);
    if (!token) return false;
    try {
      const res = await fetch('/api/onboarding/identity/rut', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rut: rut.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setRutError(RUT_ERROR_MESSAGES[data.error] || 'No se pudo guardar el RUT. Intenta nuevamente.');
        return false;
      }
      setRutError('');
      setRutMasked(data.rut_masked || null);
      return true;
    } catch {
      setRutError('No se pudo guardar el RUT. Intenta nuevamente.');
      return false;
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
        person_name: personName.trim() || undefined,
        organization_name: organizationName.trim() || undefined,
        phone: phone.trim() ? `9${phone.trim().replace(/[^0-9]/g, '').replace(/^9/, '')}` : undefined,
      };
      if (adultDeclared) payload.adult_declared = true;
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

      // TRUST-2: onboarding universal ya completo, pero para Chile
      // todavía falta el RUT — nunca se navega lejos sin haberlo
      // guardado.
      const rutOk = await saveRut();
      if (!rutOk) {
        setGlobalError('Revisa los datos marcados abajo.');
        return;
      }

      await refreshStatus(token);
    } catch (err) {
      console.error('[registro/continuar]', err);
      setGlobalError('No se pudo guardar tu registro. Intenta nuevamente.');
    } finally {
      setSaving(false);
    }
  }

  async function handleCheckMp() {
    if (!token) return;
    setCheckingMp(true);
    try {
      await refreshStatus(token);
    } finally {
      setCheckingMp(false);
    }
  }

  if (!ready || loading) return null;

  // Paso final: bienvenida real, solo cuando TODO (incluido Mercado
  // Pago) está listo.
  if (readyForWelcome) {
    return (
      <>
        <Head><title>¡Bienvenido a Rifex!</title></Head>
        <main className={styles.page}>
          <section className={styles.shell}>
            <div className={styles.inner}>
              <h1 className={styles.title}>🎉 ¡Bienvenido a Rifex!</h1>
              <p className={styles.sub}>Tu cuenta está lista. Ya puedes crear tu primera iniciativa.</p>
              <div className={styles.actions}>
                <button className="btn btn-primary btnPrimary" onClick={() => router.replace(nextPath)}>
                  Continuar
                </button>
              </div>
            </div>
          </section>
        </main>
      </>
    );
  }

  // Registro local completo pero falta Mercado Pago — paso de cierre.
  if (localComplete && mpState?.required && !readyForWelcome) {
    const identityMatch = mpState.identity_match;
    return (
      <>
        <Head><title>Conecta Mercado Pago — Rifex</title></Head>
        <main className={styles.page}>
          <section className={styles.shell}>
            <div className={styles.inner}>
              <h1 className={styles.title}>Un último paso</h1>
              <p className={styles.sub}>
                Conecta la cuenta de Mercado Pago donde recibirás el dinero de tus iniciativas. Verificamos que el
                titular coincida con el RUT que declaraste, para proteger a los compradores.
              </p>

              {!mpState.connected && (
                <div className={styles.actions} style={{ justifyContent: 'flex-start' }}>
                  <a className="btn btn-primary btnPrimary" href="/api/mp/oauth/start">
                    Conectar Mercado Pago
                  </a>
                </div>
              )}

              {mpState.connected && identityMatch === 'matched' && (
                <p className={styles.notice} style={{ color: '#166534', fontWeight: 700 }}>
                  ✅ Cuenta de Mercado Pago validada.
                </p>
              )}
              {mpState.connected && (identityMatch === 'mismatch' || identityMatch === 'needs_review') && (
                <p className={styles.err}>
                  No pudimos validar tu cuenta de Mercado Pago. Los datos del titular no coinciden con los
                  registrados en Rifex. Revisa tus datos o conecta una cuenta que te pertenezca.
                </p>
              )}
              {mpState.connected && identityMatch === 'unavailable' && (
                <p className={styles.notice}>
                  No pudimos confirmar automáticamente la titularidad — tu cuenta puede quedar sujeta a revisión
                  adicional antes de operar.
                </p>
              )}
              {mpState.connected && identityMatch === 'checking' && (
                <p className={styles.notice}>Validando tu cuenta de Mercado Pago…</p>
              )}

              <div className={styles.actions}>
                <button type="button" className="btn btn-primary btnPrimary" onClick={handleCheckMp} disabled={checkingMp}>
                  {checkingMp ? 'Verificando…' : 'Ya conecté, verificar'}
                </button>
              </div>
            </div>
          </section>
        </main>
      </>
    );
  }

  return (
    <>
      <Head><title>Completa tu registro — Rifex</title></Head>
      <main className={styles.page}>
        <section className={styles.shell}>
          <div className={styles.inner}>
            <div className={styles.progress}>
              {Array.from({ length: totalSteps }, (_, i) => (
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
                <label className={styles.label} htmlFor="person_name">Nombre de persona natural</label>
                <input
                  id="person_name"
                  className={fieldErrors.person_name ? styles.inputError : styles.input}
                  type="text"
                  value={personName}
                  onChange={(e) => setPersonName(e.target.value)}
                  onBlur={() => personName.trim().length >= 3 && saveProgress({ person_name: personName.trim() })}
                  placeholder="Escribe tu nombre si eres persona natural o déjalo vacío."
                  maxLength={140}
                  autoComplete="name"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="organization_name">Empresa u organización</label>
                <input
                  id="organization_name"
                  className={fieldErrors.organization_name ? styles.inputError : styles.input}
                  type="text"
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  onBlur={() => organizationName.trim().length >= 3 && saveProgress({ organization_name: organizationName.trim() })}
                  placeholder="Escribe el nombre si representas una empresa u organización o déjalo vacío."
                  maxLength={140}
                />
                {fieldErrors.person_name === 'both_names_provided' || fieldErrors.organization_name === 'both_names_provided' ? (
                  <p className={styles.fieldError}>{FIELD_ERROR_MESSAGES.both_names_provided}</p>
                ) : (
                  <p className={styles.fieldHelp}>Completa solamente una opción según cómo utilizarás Rifex. Estos datos son privados.</p>
                )}
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="phone">Teléfono de contacto</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>🇨🇱 +56</span>
                  <input
                    id="phone"
                    className={fieldErrors.phone ? styles.inputError : styles.input}
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, '').slice(0, 9))}
                    onBlur={() => {
                      const digits = phone.replace(/[^0-9]/g, '');
                      if (digits.length === 9) saveProgress({ phone: `9${digits.replace(/^9/, '')}` });
                    }}
                    placeholder="9 5990 4311"
                    autoComplete="tel-national"
                  />
                </div>
                {fieldErrors.phone ? (
                  <p className={styles.fieldError}>{FIELD_ERROR_MESSAGES.invalid_phone}</p>
                ) : (
                  <p className={styles.fieldHelp}>
                    Usaremos este número únicamente para contactarte por asuntos operativos, seguridad, entrega de
                    premios o resolución de problemas relacionados con tus iniciativas. No lo mostramos públicamente.
                  </p>
                )}
              </div>

              {rutRequired && (
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="rut">RUT</label>
                  {rutMasked && !rut ? (
                    <>
                      <input id="rut" className={styles.input} type="text" value={rutMasked} disabled readOnly />
                      <p className={styles.fieldHelp}>
                        Ya declaraste tu RUT.{' '}
                        <button
                          type="button"
                          style={{ background: 'none', border: 'none', padding: 0, color: 'var(--ultramar)', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}
                          onClick={() => setRut(' ')}
                        >
                          Cambiar
                        </button>
                      </p>
                    </>
                  ) : (
                    <>
                      <input
                        id="rut"
                        className={rutError ? styles.inputError : styles.input}
                        type="text"
                        value={rut}
                        onChange={(e) => setRut(e.target.value)}
                        onBlur={() => { if (rut.trim()) saveRut(); }}
                        placeholder="14.182.309-4"
                        autoComplete="off"
                      />
                      {rutError ? (
                        <p className={styles.fieldError}>{rutError}</p>
                      ) : (
                        <p className={styles.fieldHelp}>Lo validamos con el dígito verificador. Más adelante comprobamos que coincida con tu cuenta de Mercado Pago.</p>
                      )}
                    </>
                  )}
                </div>
              )}

              {!alreadyDeclaredAdult && (
                <div className={styles.checkboxRow}>
                  <input id="adult" type="checkbox" checked={adultDeclared} onChange={(e) => setAdultDeclared(e.target.checked)} />
                  <label className={styles.checkboxLabel} htmlFor="adult">
                    Declaro que soy mayor de 18 años.
                  </label>
                </div>
              )}
              {fieldErrors.adult_declared && <p className={styles.fieldError}>{FIELD_ERROR_MESSAGES.adult_declaration_required}</p>}

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
                  {saving ? 'Guardando…' : 'Continuar'}
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

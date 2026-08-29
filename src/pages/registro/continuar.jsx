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
// cuenta, reemplaza fecha de nacimiento por una declaración booleana
// versionada ("Declaro que soy mayor de 18 años" — nunca age_verified),
// simplifica el teléfono a un componente chileno de 9 dígitos, y agrega
// el cierre real del onboarding: conectar Mercado Pago y que su titular
// coincida con el RUT declarado. El proceso es reanudable — al volver,
// el usuario continúa exactamente donde quedó.
//
// Simplificación UX (2026-08-29): el par de campos simultáneos
// (persona/organización, "completa solo uno y deja el otro vacío") se
// reemplaza por un selector "Tipo de cuenta" (radio Persona/Empresa,
// obligatorio) + un único input dinámico. La persistencia real no
// cambió — sigue siendo person_name/organization_name/account_type en
// trust_onboarding, exactamente uno lleno, account_type siempre
// derivado server-side (ver trustOnboardingPolicy.js/trustOnboarding
// Gate.js) — este cambio es solo de interacción: el cliente ahora
// manda explícitamente el campo inactivo como '' para limpiarlo,
// porque upsertOnboardingFields solo toca las columnas presentes en el
// body (omitir una clave la deja intacta).
import Head from 'next/head';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import styles from '@/styles/onboarding.module.css';
import { supabaseBrowser as supabase } from '@/lib/supabaseClient';
import { sanitizeNextPath } from '@/lib/countryPolicy';

const FIELD_ERROR_MESSAGES = {
  invalid_person_name: 'Ingresa tu nombre.',
  invalid_organization_name: 'Ingresa el nombre de tu empresa.',
  both_names_provided: 'Completa solamente una opción: persona u empresa, no ambas.',
  invalid_phone: 'Ingresa tu número, 9 dígitos, comenzando en 9 (ej: 959904311).',
  adult_declaration_required: 'Debes declarar que eres mayor de 18 años para continuar.',
  terms_not_accepted: 'Debes aceptar los Términos de Uso para continuar.',
  privacy_not_accepted: 'Debes aceptar la Política de Privacidad para continuar.',
  account_type_required: 'Selecciona si operarás como persona o como empresa.',
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

  // accountType: 'person' | 'organization' | '' (nada elegido todavía).
  // Reemplaza los dos campos simultáneos por un selector + un único
  // input dinámico — nunca se muestran ambos nombres a la vez. Ambos
  // valores (personName/organizationName) se conservan en memoria al
  // cambiar de tipo (para no perder lo escrito si el usuario alterna
  // antes de guardar), pero solo el del tipo activo se envía como valor
  // real — el otro se envía explícitamente vacío para limpiarlo server-
  // side (ver onSubmit/saveIdentityName).
  const [accountType, setAccountType] = useState('');
  const [personName, setPersonName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  // Ambos nombres llegaron con contenido desde el registro ya guardado
  // (dato histórico, nunca debería pasar con este formulario) — se
  // reporta, nunca se decide una normalización en silencio.
  const [bothNamesAnomaly, setBothNamesAnomaly] = useState(false);
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
      const hasPerson = Boolean(data2.fields.person_name);
      const hasOrg = Boolean(data2.fields.organization_name);
      if (hasPerson) setPersonName(data2.fields.person_name);
      if (hasOrg) setOrganizationName(data2.fields.organization_name);
      // Reentrada: preseleccionar el tipo según cuál nombre ya existe.
      // Si por algún dato histórico existieran ambos, no elegir por el
      // usuario — solo reportarlo (bothNamesAnomaly) y dejar que su
      // próxima selección explícita decida cuál se conserva.
      if (hasPerson && hasOrg) {
        setBothNamesAnomaly(true);
      } else if (hasPerson) {
        setAccountType('person');
      } else if (hasOrg) {
        setAccountType('organization');
      }
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
    const nameOk =
      accountType === 'person'
        ? personName.trim().length >= 3
        : accountType === 'organization'
        ? organizationName.trim().length >= 3
        : false;
    if (nameOk) done += 1;
    if (phone.replace(/[^0-9]/g, '').length === 9) done += 1;
    if (adultDeclared || alreadyDeclaredAdult) done += 1;
    if (termsAccepted || alreadyAcceptedTerms) done += 1;
    if (privacyAccepted || alreadyAcceptedPrivacy) done += 1;
    if (rutRequired && (rutMasked || rut.trim().length >= 8)) done += 1;
    return done;
  }, [accountType, personName, organizationName, phone, adultDeclared, alreadyDeclaredAdult, termsAccepted, alreadyAcceptedTerms, privacyAccepted, alreadyAcceptedPrivacy, rutRequired, rutMasked, rut]);

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

  // Guarda el nombre del tipo activo y limpia explícitamente el del otro
  // tipo — nunca deja el campo inactivo con un valor viejo. upsertOnboarding
  // Fields (backend) solo toca las columnas presentes en el body: omitir
  // una clave la deja intacta, así que limpiar de verdad requiere mandar
  // '' explícitamente (el backend ya convierte '' -> null).
  function saveIdentityName(value) {
    if (!accountType) return;
    const trimmed = value.trim();
    if (trimmed.length < 3) return; // mismo umbral que antes del guardado onBlur
    if (accountType === 'person') {
      saveProgress({ person_name: trimmed, organization_name: '' });
    } else {
      saveProgress({ organization_name: trimmed, person_name: '' });
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

    // Tipo obligatorio — chequeo cliente antes de tocar la API. El
    // servidor lo exige igual de forma indirecta (deriveAccountType
    // devuelve null sin un nombre válido), pero acá damos el mensaje
    // específico correcto en vez de un error genérico de nombre.
    if (!accountType) {
      setFieldErrors({ account_type: 'account_type_required' });
      setGlobalError('Revisa los datos marcados abajo.');
      return;
    }

    // Nombre obligatorio (trim, sin solo-espacios) — mismo umbral que
    // validatePersonName/validateOrganizationName en el backend
    // (MIN_NAME_LENGTH=3), verificado acá primero para dar el error
    // específico bajo el campo en vez del flujo genérico de "missing".
    const activeName = accountType === 'person' ? personName : organizationName;
    if (activeName.trim().length < 3) {
      setFieldErrors(
        accountType === 'person'
          ? { person_name: 'invalid_person_name' }
          : { organization_name: 'invalid_organization_name' }
      );
      setGlobalError('Revisa los datos marcados abajo.');
      return;
    }

    setSaving(true);
    try {
      // Nombre del tipo activo -> valor real; el del tipo inactivo -> ''
      // explícito, para limpiarlo server-side aunque tuviera un valor
      // viejo guardado de una selección anterior.
      const payload = {
        person_name: accountType === 'person' ? personName.trim() : '',
        organization_name: accountType === 'organization' ? organizationName.trim() : '',
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
              {bothNamesAnomaly && (
                <p className={styles.err}>
                  Detectamos un nombre de persona y de empresa guardados en tu cuenta. Elige abajo cuál corresponde —
                  al guardar, conservamos solo esa opción.
                </p>
              )}

              <div className={styles.field}>
                <label className={styles.label}>Tipo de cuenta</label>
                <div className={styles.checkboxRow}>
                  <input
                    id="account_type_person"
                    type="radio"
                    name="account_type"
                    checked={accountType === 'person'}
                    onChange={() => setAccountType('person')}
                  />
                  <label className={styles.checkboxLabel} htmlFor="account_type_person">Persona</label>
                </div>
                <div className={styles.checkboxRow}>
                  <input
                    id="account_type_organization"
                    type="radio"
                    name="account_type"
                    checked={accountType === 'organization'}
                    onChange={() => setAccountType('organization')}
                  />
                  <label className={styles.checkboxLabel} htmlFor="account_type_organization">Empresa</label>
                </div>
                {fieldErrors.account_type && (
                  <p className={styles.fieldError}>{FIELD_ERROR_MESSAGES[fieldErrors.account_type]}</p>
                )}
              </div>

              {accountType && (
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="identity_name">
                    {accountType === 'person' ? 'Nombre' : 'Nombre de empresa'}
                  </label>
                  <input
                    id="identity_name"
                    className={
                      fieldErrors.person_name || fieldErrors.organization_name ? styles.inputError : styles.input
                    }
                    type="text"
                    value={accountType === 'person' ? personName : organizationName}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (accountType === 'person') setPersonName(value);
                      else setOrganizationName(value);
                    }}
                    onBlur={(e) => saveIdentityName(e.target.value)}
                    placeholder={accountType === 'person' ? 'Ingresa tu nombre' : 'Ingresa el nombre de tu empresa'}
                    maxLength={140}
                    autoComplete={accountType === 'person' ? 'name' : 'organization'}
                  />
                  {fieldErrors.person_name && (
                    <p className={styles.fieldError}>{FIELD_ERROR_MESSAGES[fieldErrors.person_name]}</p>
                  )}
                  {fieldErrors.organization_name && (
                    <p className={styles.fieldError}>{FIELD_ERROR_MESSAGES[fieldErrors.organization_name]}</p>
                  )}
                </div>
              )}

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

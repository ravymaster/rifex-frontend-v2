// src/pages/panel/mercado-pago.jsx
import Head from 'next/head';
import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import styles from '@/styles/mpSetup.module.css';



// === Región Mercado Pago (elige país con .env) ===
const REGION = process.env.NEXT_PUBLIC_MP_REGION || 'cl';
const PANEL_BY_REGION = {
  ar: 'https://www.mercadopago.com.ar/developers/panel',
  br: 'https://www.mercadopago.com.br/developers/panel',
  cl: 'https://www.mercadopago.cl/developers/panel',
  mx: 'https://www.mercadopago.com.mx/developers/panel',
  co: 'https://www.mercadopago.com.co/developers/panel',
  uy: 'https://www.mercadopago.com.uy/developers/panel',
  pe: 'https://www.mercadopago.com.pe/developers/panel',
};
const MP_PANEL = PANEL_BY_REGION[REGION] || PANEL_BY_REGION.cl;

export default function MercadoPagoSetup() {
  const [pk, setPk] = useState('');           // public key
  const [at, setAt] = useState('');           // access token
  const [status, setStatus] = useState('');   // not_started | in_progress | verified
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyTest, setBusyTest] = useState(false);
  const [msg, setMsg] = useState('');

  // Cargar credenciales guardadas
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/merchant/mp/get');
        const j = await r.json();
        if (j.ok && j.data) {
          setPk(j.data.public_key || '');
          setAt(j.data.access_token || '');
          setStatus(j.data.status || 'not_started');
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Guardar claves en Supabase
  async function onSave(e) {
    e.preventDefault();
    setMsg('');
    if (!pk.trim() || !at.trim()) {
      setMsg('Faltan campos: Public Key y Access Token son obligatorios.');
      return;
    }
    setSaving(true);
    try {
      const r = await fetch('/api/merchant/mp/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          public_key: pk.trim(),
          access_token: at.trim(),
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || 'Error guardando claves');
      setStatus(j.data?.status || 'in_progress');
      setMsg('Claves guardadas correctamente.');
    } catch (err) {
      console.error(err);
      setMsg(err.message || 'Error guardando claves.');
    } finally {
      setSaving(false);
    }
  }

  // Abrir un checkout de prueba
  async function onTestCheckout() {
    setBusyTest(true);
    setMsg('');
    try {
      const r = await fetch('/api/checkout/mp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const j = await r.json();
      if (!r.ok || !j.ok || !j.url) throw new Error(j.error || 'No se pudo generar el checkout');
      window.open(j.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error(err);
      setMsg(err.message || 'Error al generar el checkout.');
    } finally {
      setBusyTest(false);
    }
  }

  return (
    <Layout>
      <Head>
        <title>Configurar Mercado Pago — Rifex</title>
      </Head>

      <section className={styles.wrap}>
        <h1 className={styles.h1}>Configurar Mercado Pago</h1>
        <p className={styles.sub}>
          Asistente paso a paso para obtener tus claves y probar un pago en <b>Sandbox</b>.
        </p>

        {/* Estado del plan / integración */}
        <div className={styles.planBadge}>
          Tu plan actual es <b>free</b>. Esta integración completa está disponible en <b>Plan Pro</b>.
        </div>

        {/* Paso 1 */}
        <div className={styles.card}>
          <div className={styles.step}>1</div>
          <div className={styles.cardBody}>
            <h3>Crea tu cuenta de Mercado Pago (o inicia sesión)</h3>
            <p>Abre el panel de desarrolladores y asegúrate de estar en <b>modo Sandbox</b>.</p>
            <div className={styles.row}>
              <a href={MP_PANEL} target="_blank" rel="noreferrer" className="btn btn-ghost">
                Ir al panel MP
              </a>
              <a
                href="https://www.mercadopago[.]com/developers/es/docs"
                target="_blank"
                rel="noreferrer"
                className="btn btn-ghost"
              >
                Ver documentación
              </a>
            </div>
          </div>
        </div>

        {/* Paso 2 */}
        <div className={styles.card}>
          <div className={styles.step}>2</div>
          <div className={styles.cardBody}>
            <h3>Crea una “Aplicación” en MP</h3>
            <ol>
              <li>En el panel, ve a <b>Your Integrations → Create application</b>.</li>
              <li>Activa <b>Checkout Pro / Payments</b>.</li>
              <li>(Opcional) Configura <b>Webhooks</b> cuando tengamos URL pública.</li>
            </ol>
          </div>
        </div>

        {/* Paso 3: Guardar claves */}
        <div className={styles.card}>
          <div className={styles.step}>3</div>
          <div className={styles.cardBody}>
            <h3>Obtén tus claves (Sandbox)</h3>
            <p>
              Copia la <b>Public Key</b> y el <b>Access Token</b> de <i>tu aplicación</i> en Mercado Pago.
            </p>

            {loading ? (
              <div className={styles.dim}>Cargando…</div>
            ) : (
              <form onSubmit={onSave} className={styles.formGrid}>
                <label>
                  Public Key
                  <textarea
                    value={pk}
                    onChange={(e) => setPk(e.target.value)}
                    placeholder="TEST-xxxxxxxxxxxxxxxxxxxxxxxx"
                    rows={2}
                  />
                </label>

                <label>
                  Access Token
                  <textarea
                    value={at}
                    onChange={(e) => setAt(e.target.value)}
                    placeholder="TEST-xxxxxxxxxxxxxxxxxxxxxxxx"
                    rows={2}
                  />
                </label>

                <div className={styles.row}>
                  <button type="submit" disabled={saving} className="btn btn-primary">
                    {saving ? 'Guardando…' : 'Guardar claves'}
                  </button>
                  {status && (
                    <span className={styles.status}>
                      Estado integración: <b>{status}</b>
                    </span>
                  )}
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Paso 4: Prueba */}
        <div className={styles.card}>
          <div className={styles.step}>4</div>
          <div className={styles.cardBody}>
            <h3>Prueba de conexión</h3>
            <p>Generaremos un checkout de prueba para validar que tus claves funcionan.</p>
            <button onClick={onTestCheckout} disabled={busyTest} className="btn btn-ghost">
              {busyTest ? 'Generando…' : 'Abrir checkout de prueba'}
            </button>
          </div>
        </div>

        {/* Mensajes */}
        {msg ? <div className={styles.msg}>{msg}</div> : null}
      </section>
    </Layout>
  );
}



// src/pages/contacto.js
// RIFEX V4 A4 — formulario funcional (antes el botón "Enviar" no hacía
// nada), enlaces legales completos, país declarado. La identidad legal
// completa del operador (razón social, RUT empresa, domicilio) se
// publicará aquí una vez confirmada — no se inventa mientras tanto.
import { useState } from 'react';
import Layout from '@/components/Layout';
import styles from '@/styles/contacto.module.css';

export default function Contacto() {
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [status, setStatus] = useState('idle');

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    setStatus('sending');
    try {
      const r = await fetch('/api/contacto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!r.ok) throw new Error('failed');
      setStatus('sent');
    } catch {
      setStatus('error');
    }
  }

  return (
    <>
      <section className={styles.page}>
        <div className="container">
          <header className={styles.header}>
            <h1 className={styles.title}>Contacto</h1>
            <p className={styles.sub}>¿Tienes dudas o ideas? Escríbenos y te respondemos.</p>
          </header>

          <div className={styles.grid}>
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Envíanos un mensaje</h2>

              {status === 'sent' ? (
                <p>Gracias, recibimos tu mensaje.</p>
              ) : (
                <form onSubmit={submit}>
                  <label className="label">Nombre</label>
                  <input className="input" required value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Tu nombre" />

                  <label className="label" style={{ marginTop: 10 }}>Email</label>
                  <input className="input" required type="email" value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="tucorreo@dominio.com" />

                  <label className="label" style={{ marginTop: 10 }}>Asunto</label>
                  <input className="input" required value={form.subject} onChange={(e) => update('subject', e.target.value)} placeholder="Tema del mensaje" />

                  <label className="label" style={{ marginTop: 10 }}>Mensaje</label>
                  <textarea className="input" required rows={6} value={form.message} onChange={(e) => update('message', e.target.value)} placeholder="Cuéntanos en detalle..." />

                  <div className={styles.actions}>
                    <button className="btn btn-primary" type="submit" disabled={status === 'sending'}>
                      {status === 'sending' ? 'Enviando…' : 'Enviar'}
                    </button>
                    <a className="btn btn-ghost" href="mailto:contacto@rifex.pro">Escribir a soporte</a>
                  </div>
                  {status === 'error' && <p style={{ color: '#B91C1C', marginTop: 8 }}>No pudimos enviar tu mensaje. Escríbenos directo a contacto@rifex.pro.</p>}
                </form>
              )}
            </section>

            <aside className={styles.card}>
              <h2 className={styles.cardTitle}>Información</h2>
              <ul className={styles.list}>
                <li>🌎 Chile</li>
                <li>📧 <a href="mailto:contacto@rifex.pro">contacto@rifex.pro</a> (soporte, privacidad y reportes)</li>
                <li>🕑 Lun a Vie · 09:00–18:00</li>
                <li>🛡️ <a href="/seguridad">Seguridad</a></li>
                <li>🔒 <a href="/privacidad">Privacidad</a></li>
                <li>📄 <a href="/terminos">Términos y condiciones</a></li>
                <li>🚩 <a href="/reportar">Reportar</a></li>
              </ul>
              <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 12 }}>
                Identidad legal completa del operador: pendiente de confirmación.
              </p>
            </aside>
          </div>
        </div>
      </section>
    </>
  );
}
Contacto.getLayout = (page) => (
  <Layout
    title="Contacto y soporte oficial — Rifex"
    description="Contacta al equipo de Rifex para soporte, privacidad, seguridad o reportes relacionados con una iniciativa."
    canonicalPath="/contacto"
  >
    {page}
  </Layout>
);

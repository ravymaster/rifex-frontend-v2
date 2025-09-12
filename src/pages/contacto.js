// src/pages/contacto.js
import Head from 'next/head';
import Layout from '@/components/Layout';
import styles from '@/styles/contacto.module.css';

export default function Contacto() {
  return (
    <>
      <Head>
        <title>Contacto — Rifex</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <section className={styles.page}>
        <div className="container">
          <header className={styles.header}>
            <h1 className={styles.title}>Contacto</h1>
            <p className={styles.sub}>¿Tienes dudas o ideas? Escríbenos y te respondemos.</p>
          </header>

          <div className={styles.grid}>
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Envíanos un mensaje</h2>

              <label className="label">Nombre</label>
              <input className="input" placeholder="Tu nombre" />

              <label className="label" style={{marginTop:10}}>Email</label>
              <input className="input" type="email" placeholder="tucorreo@dominio.com" />

              <label className="label" style={{marginTop:10}}>Asunto</label>
              <input className="input" placeholder="Tema del mensaje" />

              <label className="label" style={{marginTop:10}}>Mensaje</label>
              <textarea className="input" rows={6} placeholder="Cuéntanos en detalle..." />

              <div className={styles.actions}>
                <button className="btn btn-primary">Enviar</button>
                <a className="btn btn-ghost" href="mailto:hola@rifex.app">Escribir a soporte</a>
              </div>
            </section>

            <aside className={styles.card}>
              <h2 className={styles.cardTitle}>Información</h2>
              <ul className={styles.list}>
                <li>📧 <a href="mailto:hola@rifex.app">hola@rifex.app</a></li>
                <li>🕑 Lun a Vie · 09:00–18:00</li>
                <li>📄 <a href="/terminos">Términos y condiciones</a></li>
                <li>💳 <a href="/panel/bancos">Pagos & bancos</a></li>
              </ul>
            </aside>
          </div>
        </div>
      </section>
    </>
  );
}
Contacto.getLayout = (page) => <Layout>{page}</Layout>;

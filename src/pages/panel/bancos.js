// src/pages/panel/bancos.js
import Head from 'next/head';
import Layout from '@/components/Layout';
import styles from '@/styles/bancos.module.css';

export default function Bancos() {
  // Mock de estados de conexión
  const mpConnected = false;
  const flowConnected = true;

  return (
    <>
      <Head>
        <title>Bancos & Pagos — Rifex</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <section className={styles.page}>
        <div className="container">
          <header className={styles.header}>
            <div>
              <h1 className={styles.title}>Bancos & Pagos</h1>
              <p className={styles.sub}>Configura tus datos bancarios y conecta proveedores de pago.</p>
            </div>
          </header>

          <div className={styles.grid}>
            {/* Datos bancarios */}
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Datos bancarios</h2>
              <p className={styles.cardSub}>Se usarán para tus retiros.</p>

              <label className="label">Titular</label>
              <input className="input" placeholder="Nombre del titular" />

              <label className="label" style={{ marginTop: 10 }}>ID fiscal</label>
              <input className="input" placeholder="RUT / DNI / CUIT" />

              <label className="label" style={{ marginTop: 10 }}>Banco</label>
              <input className="input" placeholder="Nombre de banco" />

              <label className="label" style={{ marginTop: 10 }}>Tipo de cuenta</label>
              <select className="input" defaultValue="corriente">
                <option value="corriente">Cuenta Corriente</option>
                <option value="vista">Cuenta Vista</option>
                <option value="ahorro">Cuenta de Ahorro</option>
              </select>

              <label className="label" style={{ marginTop: 10 }}>Número de cuenta</label>
              <input className="input" placeholder="0000 0000 0000" inputMode="numeric" />

              <label className="label" style={{ marginTop: 10 }}>Email para liquidaciones</label>
              <input className="input" type="email" placeholder="tucorreo@dominio.com" />

              <div className={styles.actions}>
                <button className="btn btn-primary">Guardar</button>
                <button className="btn btn-ghost">Cancelar</button>
              </div>
            </section>

            {/* Integraciones de pago */}
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Proveedores de pago</h2>
              <p className={styles.cardSub}>Conecta tu cuenta para recibir pagos automáticamente.</p>

              <div className={styles.providers}>
                {/* Mercado Pago */}
                <div className={styles.providerCard}>
                  <div className={styles.providerHead}>
                    <div className={styles.providerInfo}>
                      <div className={styles.providerLogo}>MP</div>
                      <div>
                        <div className={styles.providerName}>Mercado Pago</div>
                        <div className={styles.providerDesc}>Pagos rápidos en CLP.</div>
                      </div>
                    </div>
                    <span
                      className={styles.status}
                      data-state={mpConnected ? 'ok' : 'off'}
                    >{mpConnected ? 'Conectado' : 'No conectado'}</span>
                  </div>

                  <div className={styles.providerActions}>
                    {mpConnected ? (
                      <>
                        <a className={styles.btnManage} href="#">Gestionar</a>
                        <button className={styles.btnDanger}>Desconectar</button>
                      </>
                    ) : (
                      <a className={styles.btnConnect} href="#">Conectar</a>
                    )}
                  </div>
                </div>

                {/* Flow */}
                <div className={styles.providerCard}>
                  <div className={styles.providerHead}>
                    <div className={styles.providerInfo}>
                      <div className={styles.providerLogo}>F</div>
                      <div>
                        <div className={styles.providerName}>Flow</div>
                        <div className={styles.providerDesc}>Pagos locales y link de pago.</div>
                      </div>
                    </div>
                    <span
                      className={styles.status}
                      data-state={flowConnected ? 'ok' : 'off'}
                    >{flowConnected ? 'Conectado' : 'No conectado'}</span>
                  </div>

                  <div className={styles.providerActions}>
                    {flowConnected ? (
                      <>
                        <a className={styles.btnManage} href="#">Gestionar</a>
                        <button className={styles.btnDanger}>Desconectar</button>
                      </>
                    ) : (
                      <a className={styles.btnConnect} href="#">Conectar</a>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </section>
    </>
  );
}

Bancos.getLayout = (page) => <Layout>{page}</Layout>;

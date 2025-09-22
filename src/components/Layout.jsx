// src/components/Layout.jsx
import Head from "next/head";
import { useEffect, useState } from "react";
import Header from "@/components/Header";

/** Banner visible solo fuera de producción.
 *  - Se puede cerrar y queda recordado en localStorage
 *  - Colores suaves, sticky arriba
 */
function DevBanner() {
  const KEY = "rf-dev-banner-dismissed";
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Evita mostrar en producción
    const isProd =
      process.env.NEXT_PUBLIC_STAGE === "prod" ||
      process.env.NODE_ENV === "production";
    if (isProd) return;

    const dismissed =
      typeof window !== "undefined" && localStorage.getItem(KEY) === "1";
    if (!dismissed) setShow(true);
  }, []);

  if (!show) return null;

  function close() {
    try {
      localStorage.setItem("rf-dev-banner-dismissed", "1");
    } catch {}
    setShow(false);
  }

  return (
    <div className="dev-banner" role="status" aria-live="polite">
      <strong>🚧 En desarrollo:</strong>
      <span>
        Esta versión es de pruebas. Algunos datos y pagos pueden ser de test.
      </span>
      <button onClick={close} aria-label="Cerrar aviso">
        ×
      </button>

      <style jsx>{`
        .dev-banner {
          position: sticky;
          top: 0;
          z-index: 50;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 12px;
          border-bottom: 1px solid #fde68a;
          background: #fffbeb; /* amarillo suave */
          color: #92400e;
          font-weight: 600;
        }
        .dev-banner button {
          margin-left: auto;
          background: transparent;
          border: 0;
          cursor: pointer;
          font-size: 20px;
          line-height: 1;
          color: #92400e;
          padding: 2px 6px;
          border-radius: 8px;
        }
        .dev-banner button:hover {
          background: #fde68a;
        }
      `}</style>
    </div>
  );
}

export default function Layout({
  title = "Rifex",
  description = "Crea rifas en minutos, comparte el enlace y cobra online.",
  children,
}) {
  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      {/* Header global */}
      <Header />

      {/* Banner solo en entornos no productivos (controlado por DevBanner) */}
      <DevBanner />

      {/* Contenido principal */}
      <main className="container">{children}</main>

      {/* Footer mínimo (opcional) */}
      <footer className="foot">
        <div className="inner">
          <span>© {new Date().getFullYear()} Rifex</span>
          <nav>
            <a href="/terminos">Términos</a>
            <a href="/contacto">Contacto</a>
          </nav>
        </div>
      </footer>

      <style jsx>{`
        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 24px 16px;
          min-height: 60vh;
        }
        .foot {
          border-top: 1px solid #e5e7eb;
          margin-top: 24px;
          background: #fff;
        }
        .inner {
          max-width: 1200px;
          margin: 0 auto;
          padding: 14px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          font-size: 14px;
          color: #6b7280;
        }
        .inner nav {
          display: flex;
          gap: 12px;
        }
        .inner a {
          color: #1e3a8a;
          text-decoration: none;
        }
        .inner a:hover {
          text-decoration: underline;
        }
      `}</style>
    </>
  );
}

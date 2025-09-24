// src/components/Layout.jsx
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

export default function Layout({ children }) {
  const { pathname } = useRouter();
  const [open, setOpen] = useState(false);

  const items = [
    { label: 'Inicio',     href: '/' },
    { label: 'Rifas',      href: '/rifas' },
    { label: 'Crear rifa', href: '/crear-rifa' },
    { label: 'Planes',     href: '/planes' },
    { label: 'Blog',       href: '/blog' },
    { label: 'Contacto',   href: '/contacto' },
    { label: 'Términos',   href: '/terminos' },
    { label: 'Panel',      href: '/panel' },
    { label: 'Bancos',     href: '/panel/bancos' },
    { label: 'Perfil',     href: '/perfil' },
    { label: 'Chat (demo)',href: '/chat/123' },
    { label: 'Login',      href: '/login' },
    { label: 'Registro',   href: '/register' },
    { label: 'MP Setup',   href: '/panel/mercado-pago' },
  ];

  const isActive = (href) => {
    if (href.startsWith('/chat')) return pathname.startsWith('/chat');
    return pathname === href;
  };

  // Cierra el menú al navegar o pulsar ESC
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <header className="rf-header" role="banner">
        <div className="rf-header-inner">
          {/* Marca (logo izquierda) */}
          <Link href="/" className="rf-logo" aria-label="Ir al inicio">
            <img src="/rifex-logo.png" alt="" width={28} height={28} />
            <span>Rifex</span>
          </Link>

          {/* Navegación de escritorio (todas las páginas a la vista) */}
          <nav className="rf-nav rf-nav-desktop" aria-label="Principal">
            {items.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                className="rf-nav__link"
                data-active={isActive(it.href)}
              >
                {it.label}
              </Link>
            ))}
          </nav>

          {/* Botón hamburguesa (solo móvil) */}
          <button
            className="rf-hamburger"
            aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={open}
            aria-controls="rf-mobile-menu"
            onClick={() => setOpen((v) => !v)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>

        {/* Menú móvil desplegable (mismo set de páginas) */}
        <div
          id="rf-mobile-menu"
          className="rf-mobile"
          hidden={!open}
          aria-hidden={!open}
        >
          <nav className="rf-mobile-nav" aria-label="Menú móvil">
            {items.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                className="rf-mobile-link"
                data-active={isActive(it.href)}
              >
                {it.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main>{children}</main>

      {/* Styles */}
      <style jsx>{`
        .rf-header {
          position: sticky;
          top: 0;
          z-index: 40;
          background: #ffffffcc;
          backdrop-filter: blur(8px);
          border-bottom: 1px solid #eef2f7;
        }
        .rf-header-inner {
          max-width: 1100px;
          margin: 0 auto;
          padding: 10px 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .rf-logo {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-weight: 900;
          font-size: 18px;
          color: #0f172a;
          text-decoration: none;
          letter-spacing: .2px;
        }
        .rf-nav {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }
        .rf-nav__link {
          text-decoration: none;
          padding: 8px 10px;
          border-radius: 10px;
          color: #0f172a;
          font-weight: 600;
          transition: background .15s ease;
        }
        .rf-nav__link:hover { background: #f1f5f9; }
        .rf-nav__link[data-active="true"] {
          background: #0f172a;
          color: #fff;
        }

        /* Hamburger */
        .rf-hamburger {
          display: none;
          width: 40px;
          height: 40px;
          border: 0;
          background: transparent;
          border-radius: 10px;
          cursor: pointer;
        }
        .rf-hamburger:hover { background: #f1f5f9; }
        .rf-hamburger span {
          display: block;
          width: 22px;
          height: 3px;
          border-radius: 999px;
          background: #0f172a;
          margin: 4px auto;
        }

        /* Mobile menu container */
        .rf-mobile {
          border-top: 1px solid #eef2f7;
          background: #fff;
        }
        .rf-mobile-nav {
          display: grid;
          gap: 6px;
          padding: 10px 12px 14px;
        }
        .rf-mobile-link {
          text-decoration: none;
          padding: 10px 12px;
          border-radius: 10px;
          font-weight: 700;
          color: #0f172a;
          background: #f8fafc;
        }
        .rf-mobile-link[data-active="true"] {
          background: #0f172a;
          color: #fff;
        }

        /* Breakpoints */
        @media (max-width: 900px) {
          .rf-nav-desktop { display: none; }   /* Oculta todo el menú ancho */
          .rf-hamburger { display: inline-grid; place-items: center; } /* Muestra el botón */
        }
      `}</style>
    </>
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

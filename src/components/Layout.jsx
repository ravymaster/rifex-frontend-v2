// src/components/Layout.jsx
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import { supabaseBrowser as supabase } from '@/lib/supabaseClient';
import { DEFAULT_OG_IMAGE, canonicalUrl } from '@/lib/publicMetadata';

export default function Layout({
  title = 'Rifex',
  description = 'Crea eventos, vende entradas digitales y administra campañas de recaudación desde una sola plataforma.',
  // RIFEX V4 A1 — metadata pública opcional. canonicalPath acepta un path
  // ("/eventos") o una URL absoluta ya resuelta por la página (landings
  // individuales calculan su propio canonical con el id real). noindex
  // NUNCA reemplaza auth/RLS — es solo una señal para rastreadores.
  canonicalPath = null,
  noindex = false,
  ogType = 'website',
  ogImage = DEFAULT_OG_IMAGE,
  children,
}) {
  const router = useRouter();
  const { pathname } = router;
  const [open, setOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [user, setUser] = useState(null);
  const userMenuRef = useRef(null);

  // PUBLIC HOME V1: nav público reescrito alrededor de la identidad
  // Eventos/Entradas/Campañas — "Crear rifa" queda fuera del nav público
  // por instrucción explícita (Rifas sigue intacto dentro del área
  // autenticada: /panel, /mis-iniciativas, y accesible por URL directa).
  const navItems = [
    { label: 'Eventos',        href: '/eventos' },
    { label: 'Campañas',       href: '/crear-colecta' },
    { label: 'Cómo funciona',  href: '/wizard' },
    { label: 'Precios',        href: '/planes' },
    { label: 'Seguridad',      href: '/seguridad' },
    { label: 'Ayuda',          href: '/preguntas-frecuentes' },
  ];

  // EVENT-1 (Fase 12): "Panel" pasa a ser "Mis iniciativas" — el
  // distribuidor superior de Rifas/Campañas/Eventos. /panel (Rifas) sigue
  // existiendo intacto, solo deja de tener su propio link de primer nivel
  // acá; se llega igual desde Mis iniciativas o por URL directa.
  const accountItems = [
    { label: 'Mis iniciativas', href: '/mis-iniciativas' },
    { label: 'Mis campañas',    href: '/crear-colecta' },
    { label: 'Bancos & Pagos',  href: '/panel/bancos' },
    { label: 'Perfil',          href: '/perfil' },
  ];

  const isActive = (href) => {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(href + '/');
  };

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (mounted) setUser(data?.user || null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user || null);
    });
    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  // Cierra los menús al navegar o pulsar ESC
  useEffect(() => { setOpen(false); setUserOpen(false); }, [pathname]);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && (setOpen(false), setUserOpen(false));
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Cierra el menú de usuario al hacer click afuera
  useEffect(() => {
    if (!userOpen) return;
    const onClick = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [userOpen]);

  async function handleLogout() {
    try { await supabase.auth.signOut(); } catch {}
    setUserOpen(false);
    router.push('/login');
  }

  const initial = (user?.email || '?').trim().charAt(0).toUpperCase();

  const canonical = canonicalPath
    ? (canonicalPath.startsWith('http') ? canonicalPath : canonicalUrl(canonicalPath))
    : canonicalUrl(pathname || '/');

  return (
    <>
      <Head>
        <title key="title">{title}</title>
        <meta key="description" name="description" content={description} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link key="canonical" rel="canonical" href={canonical} />
        {noindex && <meta key="robots" name="robots" content="noindex, nofollow" />}
        <meta key="og:title" property="og:title" content={title} />
        <meta key="og:description" property="og:description" content={description} />
        <meta key="og:url" property="og:url" content={canonical} />
        <meta key="og:type" property="og:type" content={ogType} />
        <meta key="og:image" property="og:image" content={ogImage} />
        <meta property="og:site_name" content="Rifex" />
        <meta key="twitter:card" name="twitter:card" content="summary_large_image" />
        <meta key="twitter:title" name="twitter:title" content={title} />
        <meta key="twitter:description" name="twitter:description" content={description} />
        <meta key="twitter:image" name="twitter:image" content={ogImage} />
      </Head>

      <header className="rf-header" role="banner">
        <div className="rf-header-inner">
          <Link href="/" className="rf-logo" aria-label="Ir al inicio">
            <img src="/rifex-logo.png" alt="" width={28} height={28} />
            <span>Rifex</span>
          </Link>

          <nav className="rf-nav rf-nav-desktop" aria-label="Principal">
            {navItems.map((it) => (
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

          <div className="rf-header-actions">
            {user ? (
              <div className="rf-user" ref={userMenuRef}>
                <button
                  className="rf-user__trigger"
                  onClick={() => setUserOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={userOpen}
                >
                  <span className="rf-user__avatar">{initial}</span>
                  <span className="rf-user__email rf-nav-desktop-only">{user.email}</span>
                  <svg className="rf-user__chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                {userOpen && (
                  <div className="rf-user__menu" role="menu">
                    {accountItems.map((it) => (
                      <Link key={it.href} href={it.href} className="rf-user__item" role="menuitem">
                        {it.label}
                      </Link>
                    ))}
                    <button className="rf-user__item rf-user__item--danger" onClick={handleLogout} role="menuitem">
                      Cerrar sesión
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="rf-auth-actions rf-nav-desktop-only">
                <Link href="/login" className="rf-btn-ghost">Iniciar sesión</Link>
                <Link href="/mis-iniciativas" className="rf-btn-primary">Crear una iniciativa</Link>
              </div>
            )}

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
        </div>

        <div
          id="rf-mobile-menu"
          className="rf-mobile"
          hidden={!open}
          aria-hidden={!open}
        >
          <nav className="rf-mobile-nav" aria-label="Menú móvil">
            {navItems.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                className="rf-mobile-link"
                data-active={isActive(it.href)}
              >
                {it.label}
              </Link>
            ))}
            <div className="rf-mobile-divider" />
            {user ? (
              <>
                {accountItems.map((it) => (
                  <Link key={it.href} href={it.href} className="rf-mobile-link" data-active={isActive(it.href)}>
                    {it.label}
                  </Link>
                ))}
                <button className="rf-mobile-link rf-mobile-link--danger" onClick={handleLogout}>
                  Cerrar sesión
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className="rf-mobile-link">Iniciar sesión</Link>
                <Link href="/mis-iniciativas" className="rf-mobile-link">Crear una iniciativa</Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="container">{children}</main>

      <footer className="rf-foot">
        <div className="rf-foot__top">
          <div className="rf-foot__brand">
            <div className="rf-foot__logo">
              <img src="/rifex-logo.png" alt="" width={22} height={22} />
              <span>Rifex</span>
            </div>
            <p>La forma más simple de crear eventos, vender entradas y recaudar fondos.</p>
          </div>
          <div className="rf-foot__cols">
            <div className="rf-foot__col">
              <span className="rf-foot__colTitle">Producto</span>
              <Link href="/crear-evento">Crear evento</Link>
              <Link href="/crear-colecta">Crear campaña</Link>
              <Link href="/planes">Precios</Link>
            </div>
            <div className="rf-foot__col">
              <span className="rf-foot__colTitle">Soporte</span>
              <Link href="/contacto">Contacto</Link>
              <Link href="/blog">Blog</Link>
              <Link href="/preguntas-frecuentes">Preguntas frecuentes</Link>
            </div>
            <div className="rf-foot__col">
              <span className="rf-foot__colTitle">Legal</span>
              <Link href="/terminos">Términos</Link>
              <Link href="/privacidad">Privacidad</Link>
              <Link href="/cookies">Cookies</Link>
              <Link href="/uso-aceptable">Uso aceptable</Link>
              <Link href="/seguridad">Seguridad</Link>
              <Link href="/cumplimiento">Rifex Cumplimiento</Link>
              <Link href="/reportar">Reportar</Link>
            </div>
          </div>
        </div>
        <div className="rf-foot__bottom">
          <span>© {new Date().getFullYear()} Rifex. Todos los derechos reservados.</span>
          <div className="rf-foot__bottomRight">
            <Link href="/confianza">Confianza</Link>
            <button
              type="button"
              className="rf-foot__cookiePrefs"
              onClick={() => window.dispatchEvent(new Event('rifex:open-cookie-preferences'))}
            >
              Preferencias de cookies
            </button>
          </div>
        </div>
      </footer>

      <style jsx>{`
        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 24px 16px;
          min-height: 60vh;
        }
        .rf-foot {
          margin-top: 48px;
          background: #0c1636;
          color: rgba(255, 255, 255, 0.6);
        }
        .rf-foot__top {
          max-width: 1200px;
          margin: 0 auto;
          padding: 40px 16px 24px;
          display: flex;
          justify-content: space-between;
          gap: 32px;
          flex-wrap: wrap;
        }
        .rf-foot__brand { max-width: 280px; }
        .rf-foot__logo {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 800;
          font-size: 15px;
          color: #fff;
          margin-bottom: 8px;
        }
        .rf-foot__logo img { border-radius: 6px; }
        .rf-foot__brand p { font-size: 13px; line-height: 1.6; margin: 0; }

        .rf-foot__cols { display: flex; gap: 40px; flex-wrap: wrap; }
        .rf-foot__col { display: flex; flex-direction: column; gap: 10px; }
        .rf-foot__colTitle { font-size: 12.5px; font-weight: 700; color: rgba(255, 255, 255, 0.85); margin-bottom: 2px; }
        .rf-foot__col :global(a) { color: rgba(255, 255, 255, 0.6); text-decoration: none; font-size: 13.5px; }
        .rf-foot__col :global(a:hover) { color: #fff; }

        .rf-foot__bottom {
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          max-width: 1200px;
          margin: 0 auto;
          padding: 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          font-size: 12px;
          flex-wrap: wrap;
        }
        .rf-foot__bottomRight { display: flex; align-items: center; gap: 16px; }
        .rf-foot__bottomRight :global(a) { color: rgba(255, 255, 255, 0.6); text-decoration: none; }
        .rf-foot__bottomRight :global(a:hover) { color: #fff; }
        .rf-foot__cookiePrefs {
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.6);
          font-size: 12px;
          font-family: inherit;
          cursor: pointer;
          padding: 0;
          text-decoration: underline;
        }
        .rf-foot__cookiePrefs:hover { color: #fff; }

        @media (max-width: 640px) {
          .rf-foot__top { flex-direction: column; gap: 24px; }
          .rf-foot__cols { gap: 32px; }
          .rf-foot__bottom { flex-direction: column; align-items: flex-start; }
        }

        .rf-header {
          position: sticky;
          top: 0;
          z-index: 40;
          background: rgba(12, 22, 54, 0.92);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .rf-header-inner {
          max-width: 1200px;
          margin: 0 auto;
          padding: 12px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }
        :global(.rf-logo) {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          font-weight: 800;
          font-size: 18px;
          color: #fff;
          text-decoration: none;
          letter-spacing: -0.2px;
          transition: opacity 0.15s ease;
        }
        :global(.rf-logo:hover) { opacity: 0.75; }
        :global(.rf-logo img) { border-radius: 7px; }

        .rf-nav { display: flex; align-items: center; gap: 2px; }
        :global(.rf-nav__link) {
          text-decoration: none;
          padding: 8px 14px;
          border-radius: 999px;
          color: rgba(255, 255, 255, 0.65);
          font-weight: 600;
          font-size: 14.5px;
          transition: background 0.15s ease, color 0.15s ease;
        }
        :global(.rf-nav__link:hover) { background: rgba(255, 255, 255, 0.08); color: #fff; }
        :global(.rf-nav__link[data-active='true']) {
          background: rgba(255, 255, 255, 0.12);
          color: #fff;
        }

        .rf-header-actions { display: flex; align-items: center; gap: 10px; }

        .rf-auth-actions { display: flex; align-items: center; gap: 8px; }
        :global(.rf-btn-ghost), :global(.rf-btn-primary) {
          font-size: 14px;
          font-weight: 700;
          padding: 9px 16px;
          border-radius: 999px;
          text-decoration: none;
          transition: transform 0.12s ease, box-shadow 0.12s ease, opacity 0.15s ease;
          display: inline-flex;
          align-items: center;
        }
        :global(.rf-btn-ghost) { color: #fff; }
        :global(.rf-btn-ghost:hover) { background: rgba(255, 255, 255, 0.08); }
        :global(.rf-btn-primary) {
          background: linear-gradient(135deg, #1e3a8a 0%, #18a957 100%);
          color: #fff;
          box-shadow: 0 4px 14px rgba(24, 169, 87, 0.28);
        }
        :global(.rf-btn-primary:hover) { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(24, 169, 87, 0.36); }

        .rf-user { position: relative; }
        .rf-user__trigger {
          display: flex;
          align-items: center;
          gap: 8px;
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 999px;
          padding: 5px 10px 5px 5px;
          cursor: pointer;
          transition: border-color 0.15s ease, background 0.15s ease;
        }
        .rf-user__trigger:hover { background: rgba(255, 255, 255, 0.08); border-color: rgba(255, 255, 255, 0.35); }
        .rf-user__avatar {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: linear-gradient(135deg, #1e3a8a 0%, #23b6c6 100%);
          color: #fff;
          font-weight: 700;
          font-size: 13px;
          display: grid;
          place-items: center;
          flex-shrink: 0;
        }
        .rf-user__email {
          font-size: 13.5px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.7);
          max-width: 160px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .rf-user__chevron { color: rgba(255, 255, 255, 0.5); flex-shrink: 0; }

        .rf-user__menu {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          min-width: 200px;
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 14px;
          box-shadow: 0 12px 32px rgba(15, 23, 42, 0.12);
          padding: 6px;
          display: flex;
          flex-direction: column;
          gap: 2px;
          animation: rf-menu-in 0.12s ease;
        }
        @keyframes rf-menu-in {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        :global(.rf-user__item) {
          display: block;
          width: 100%;
          text-align: left;
          padding: 9px 12px;
          border-radius: 9px;
          border: none;
          background: transparent;
          color: #0f172a;
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
          cursor: pointer;
          font-family: inherit;
        }
        :global(.rf-user__item:hover) { background: #f1f5f9; }
        :global(.rf-user__item--danger) { color: #b91c1c; }
        :global(.rf-user__item--danger:hover) { background: #fef2f2; }

        .rf-hamburger {
          display: none;
          width: 38px;
          height: 38px;
          border: 0;
          background: transparent;
          border-radius: 10px;
          cursor: pointer;
          flex-shrink: 0;
        }
        .rf-hamburger:hover { background: rgba(255, 255, 255, 0.08); }
        .rf-hamburger span {
          display: block;
          width: 20px;
          height: 2px;
          border-radius: 999px;
          background: #fff;
          margin: 4px auto;
          transition: transform 0.15s ease;
        }

        .rf-mobile {
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          background: #0c1636;
        }
        .rf-mobile-nav {
          display: grid;
          gap: 4px;
          padding: 10px 12px 16px;
        }
        :global(.rf-mobile-link) {
          text-decoration: none;
          padding: 11px 14px;
          border-radius: 10px;
          font-weight: 700;
          font-size: 14.5px;
          color: #fff;
          background: rgba(255, 255, 255, 0.06);
          border: none;
          text-align: left;
          cursor: pointer;
          font-family: inherit;
          width: 100%;
        }
        :global(.rf-mobile-link[data-active='true']) { background: var(--trebol); color: #fff; }
        :global(.rf-mobile-link--danger) { color: #f87171; }
        .rf-mobile-divider {
          height: 1px;
          background: rgba(255, 255, 255, 0.1);
          margin: 6px 4px;
        }

        @media (max-width: 900px) {
          .rf-nav-desktop { display: none; }
          .rf-nav-desktop-only { display: none; }
          .rf-hamburger { display: inline-grid; place-items: center; }
        }
      `}</style>
    </>
  );
}

// src/components/Layout.jsx
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import { supabaseBrowser as supabase } from '@/lib/supabaseClient';

export default function Layout({
  title = 'Rifex',
  description = 'Crea rifas en minutos, comparte el enlace y cobra online.',
  children,
}) {
  const router = useRouter();
  const { pathname } = router;
  const [open, setOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [user, setUser] = useState(null);
  const userMenuRef = useRef(null);

  // Nav principal: solo páginas de cara al público. Todo lo de cuenta va al menú de usuario.
  const navItems = [
    { label: 'Inicio',     href: '/' },
    { label: 'Rifas',      href: '/rifas' },
    { label: 'Crear rifa', href: '/crear-rifa' },
    { label: 'Planes',     href: '/planes' },
    { label: 'Blog',       href: '/blog' },
  ];

  const accountItems = [
    { label: 'Panel',          href: '/panel' },
    { label: 'Bancos & Pagos', href: '/panel/bancos' },
    { label: 'Mercado Pago',   href: '/panel/mercado-pago' },
    { label: 'Perfil',         href: '/perfil' },
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

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
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
                <Link href="/login" className="rf-btn-ghost">Ingresar</Link>
                <Link href="/register" className="rf-btn-primary">Crear cuenta</Link>
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
                <Link href="/login" className="rf-mobile-link">Ingresar</Link>
                <Link href="/register" className="rf-mobile-link">Crear cuenta</Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="container">{children}</main>

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
        .inner nav { display: flex; gap: 12px; }
        .inner a { color: #1e3a8a; text-decoration: none; }
        .inner a:hover { text-decoration: underline; }

        .rf-header {
          position: sticky;
          top: 0;
          z-index: 40;
          background: rgba(255, 255, 255, 0.85);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border-bottom: 1px solid #eef2f7;
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
        .rf-logo {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          font-weight: 800;
          font-size: 18px;
          color: #0f172a;
          text-decoration: none;
          letter-spacing: -0.2px;
          transition: opacity 0.15s ease;
        }
        .rf-logo:hover { opacity: 0.75; }
        .rf-logo img { border-radius: 7px; }

        .rf-nav { display: flex; align-items: center; gap: 2px; }
        .rf-nav__link {
          text-decoration: none;
          padding: 8px 14px;
          border-radius: 999px;
          color: #475569;
          font-weight: 600;
          font-size: 14.5px;
          transition: background 0.15s ease, color 0.15s ease;
        }
        .rf-nav__link:hover { background: #f1f5f9; color: #0f172a; }
        .rf-nav__link[data-active='true'] {
          background: #0f172a;
          color: #fff;
        }

        .rf-header-actions { display: flex; align-items: center; gap: 10px; }

        .rf-auth-actions { display: flex; align-items: center; gap: 8px; }
        .rf-btn-ghost, .rf-btn-primary {
          font-size: 14px;
          font-weight: 700;
          padding: 9px 16px;
          border-radius: 999px;
          text-decoration: none;
          transition: transform 0.12s ease, box-shadow 0.12s ease, opacity 0.15s ease;
          display: inline-flex;
          align-items: center;
        }
        .rf-btn-ghost { color: #0f172a; }
        .rf-btn-ghost:hover { background: #f1f5f9; }
        .rf-btn-primary {
          background: linear-gradient(135deg, #1e3a8a 0%, #18a957 100%);
          color: #fff;
          box-shadow: 0 4px 14px rgba(24, 169, 87, 0.28);
        }
        .rf-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(24, 169, 87, 0.36); }

        .rf-user { position: relative; }
        .rf-user__trigger {
          display: flex;
          align-items: center;
          gap: 8px;
          background: transparent;
          border: 1px solid #e5e7eb;
          border-radius: 999px;
          padding: 5px 10px 5px 5px;
          cursor: pointer;
          transition: border-color 0.15s ease, background 0.15s ease;
        }
        .rf-user__trigger:hover { background: #f8fafc; border-color: #cbd5e1; }
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
          color: #334155;
          max-width: 160px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .rf-user__chevron { color: #94a3b8; flex-shrink: 0; }

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
        .rf-user__item {
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
        .rf-user__item:hover { background: #f1f5f9; }
        .rf-user__item--danger { color: #b91c1c; }
        .rf-user__item--danger:hover { background: #fef2f2; }

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
        .rf-hamburger:hover { background: #f1f5f9; }
        .rf-hamburger span {
          display: block;
          width: 20px;
          height: 2px;
          border-radius: 999px;
          background: #0f172a;
          margin: 4px auto;
          transition: transform 0.15s ease;
        }

        .rf-mobile {
          border-top: 1px solid #eef2f7;
          background: #fff;
        }
        .rf-mobile-nav {
          display: grid;
          gap: 4px;
          padding: 10px 12px 16px;
        }
        .rf-mobile-link {
          text-decoration: none;
          padding: 11px 14px;
          border-radius: 10px;
          font-weight: 700;
          font-size: 14.5px;
          color: #0f172a;
          background: #f8fafc;
          border: none;
          text-align: left;
          cursor: pointer;
          font-family: inherit;
          width: 100%;
        }
        .rf-mobile-link[data-active='true'] { background: #0f172a; color: #fff; }
        .rf-mobile-link--danger { color: #b91c1c; }
        .rf-mobile-divider {
          height: 1px;
          background: #eef2f7;
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

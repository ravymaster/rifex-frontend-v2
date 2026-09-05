// src/components/Layout.jsx
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import { supabaseBrowser as supabase } from '@/lib/supabaseClient';
import { DEFAULT_OG_IMAGE, canonicalUrl } from '@/lib/publicMetadata';
import { SOCIAL_LINKS } from '@/lib/socialLinks';

// RIFEX FINAL PUBLIC SURFACE CLOSURE — iconos de redes sociales inline
// (sin dependencia nueva para 4 iconos). Cada uno es un badge circular
// con su color de marca real, coherente con la referencia visual
// aprobada. Solo se renderiza si SOCIAL_LINKS trae una URL real — ver
// src/lib/socialLinks.js.
function SocialIcon({ name }) {
  switch (name) {
    case 'facebook':
      return (
        <svg viewBox="0 0 36 36" width="36" height="36" aria-hidden="true">
          <circle cx="18" cy="18" r="18" fill="#1877F2" />
          <path d="M20.2 19.5h2.4l.4-3h-2.8v-1.9c0-.87.24-1.46 1.49-1.46h1.6V10.4c-.28-.04-1.22-.12-2.33-.12-2.3 0-3.88 1.4-3.88 3.98v2.24H14.6v3h2.44V27h3.16v-7.5Z" fill="#fff" />
        </svg>
      );
    case 'instagram':
      return (
        <svg viewBox="0 0 36 36" width="36" height="36" aria-hidden="true">
          <defs>
            <linearGradient id="ig-grad" x1="0" y1="36" x2="36" y2="0">
              <stop offset="0" stopColor="#FEE411" />
              <stop offset="0.3" stopColor="#FD5949" />
              <stop offset="0.65" stopColor="#D6249F" />
              <stop offset="1" stopColor="#285AEB" />
            </linearGradient>
          </defs>
          <circle cx="18" cy="18" r="18" fill="url(#ig-grad)" />
          <rect x="10.5" y="10.5" width="15" height="15" rx="4.5" fill="none" stroke="#fff" strokeWidth="1.6" />
          <circle cx="18" cy="18" r="4" fill="none" stroke="#fff" strokeWidth="1.6" />
          <circle cx="22.6" cy="13.4" r="1.1" fill="#fff" />
        </svg>
      );
    case 'tiktok':
      return (
        <svg viewBox="0 0 36 36" width="36" height="36" aria-hidden="true">
          <circle cx="18" cy="18" r="18" fill="#000" />
          <path d="M21.6 10.5c.4 1.9 1.6 3.1 3.5 3.3v2.5c-1.2.1-2.3-.3-3.5-1v5.9c0 3-2.4 4.9-5.1 4.9-2.7 0-5-2-5-4.9 0-2.9 2.5-5 5.4-4.8v2.6c-1.3-.2-2.6.6-2.6 2.2 0 1.4 1.1 2.2 2.3 2.2 1.4 0 2.5-1.1 2.5-2.9V10.5h2.5Z" fill="#fff" />
        </svg>
      );
    case 'whatsapp':
      return (
        <svg viewBox="0 0 36 36" width="36" height="36" aria-hidden="true">
          <circle cx="18" cy="18" r="18" fill="#25D366" />
          <path d="M18 9.8c-4.6 0-8.3 3.7-8.3 8.2 0 1.5.4 2.9 1.1 4.1L9.6 26l4-1.1c1.2.6 2.5 1 3.9 1h.1c4.6 0 8.3-3.7 8.3-8.2S22.6 9.8 18 9.8Zm0 15c-1.2 0-2.4-.3-3.4-.9l-.25-.14-2.4.65.65-2.35-.16-.24a6.68 6.68 0 0 1-1.05-3.64c0-3.7 3-6.7 6.65-6.7 1.78 0 3.45.7 4.7 1.95a6.6 6.6 0 0 1 1.95 4.7c0 3.7-3 6.67-6.65 6.67Zm3.65-5c-.2-.1-1.18-.58-1.36-.65-.18-.07-.32-.1-.45.1-.13.2-.51.65-.63.78-.12.13-.23.15-.43.05-.2-.1-.85-.31-1.6-.99-.6-.53-1-1.18-1.1-1.38-.12-.2-.01-.3.09-.4.09-.09.2-.23.3-.35.1-.12.13-.2.2-.33.07-.13.03-.25-.02-.35-.05-.1-.45-1.08-.62-1.48-.16-.39-.33-.34-.45-.35h-.38c-.13 0-.35.05-.53.25-.18.2-.7.68-.7 1.66s.72 1.93.82 2.06c.1.13 1.42 2.17 3.44 3.04.48.21.86.33 1.15.42.48.15.92.13 1.27.08.39-.06 1.18-.48 1.35-.95.17-.46.17-.86.12-.95-.05-.09-.18-.14-.38-.24Z" fill="#fff" />
        </svg>
      );
    default:
      return null;
  }
}

export default function Layout({
  title = 'Rifex',
  description = 'Crea eventos, vende entradas digitales y administra campañas de recaudación desde una sola plataforma.',
  // RIFEX V4 A1 — metadata pública opcional. canonicalPath acepta un path
  // ("/eventos") o una URL absoluta ya resuelta por la página (landings
  // individuales calculan su propio canonical con el id real). noindex
  // NUNCA reemplaza auth/RLS — es solo una señal para rastreadores.
  canonicalPath = null,
  noindex = false,
  // PSCG — algunas superficies PRIVATE_AUTHENTICATED requieren la tríada
  // completa noindex/nofollow/noarchive (ver
  // docs/public-surface/PUBLIC_SURFACE_CLASSIFICATION_GUARD.md). Sin
  // efecto si noindex es false. Compatible hacia atrás: los llamadores
  // existentes que solo pasan noindex siguen obteniendo exactamente
  // "noindex, nofollow", sin cambio.
  noarchive = false,
  ogType = 'website',
  ogImage = DEFAULT_OG_IMAGE,
  // RIFEX V4 A6 fix — Next 14's next/head keeps the FIRST occurrence of a
  // keyed tag, not the last, when two <Head> instances in the tree share a
  // key. Layout's own <Head> always renders before a page's nested <Head>,
  // so on pages that compute their own dynamic title/canonical/OG (e.g. a
  // per-item landing where Layout can't know the real id at getLayout time,
  // since getLayout has no access to render-time props), Layout's generic
  // defaults were winning over the page's specific ones. disableAutoMeta
  // skips Layout's own metadata tags entirely so the page's <Head> is the
  // only source — used by rifas/[id].jsx.
  disableAutoMeta = false,
  children,
}) {
  const router = useRouter();
  const { pathname, asPath } = router;
  const [open, setOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [user, setUser] = useState(null);
  const userMenuRef = useRef(null);

  // PUBLIC HOME V1: nav público reescrito alrededor de la identidad
  // Eventos/Entradas/Campañas — "Crear rifa" queda fuera del nav público
  // por instrucción explícita (Rifas sigue intacto dentro del área
  // autenticada: /panel, /mis-iniciativas, y accesible por URL directa).
  // ETAPA 2 (identidad pública) — navbar reducida a exactamente Eventos /
  // Campañas / Cómo funciona, más cuenta/login. Precios, Seguridad y Ayuda
  // siguen existiendo y accesibles (footer, enlaces internos), solo dejan
  // de tener su propio ítem de primer nivel en la navegación pública.
  // RIFEX PRODUCT LANDINGS V1 — "Campañas" ahora tiene su propia landing
  // real (/campanas, PUBLIC_INDEXABLE) y deja de apuntar al explicador
  // compartido de /wizard. Se agrega "Inscripciones" (/inscripciones, ya
  // PUBLIC_INDEXABLE desde INSCRIPCIONES V1) como cuarto ítem — hasta esa
  // misión no tenía presencia propia en la navbar pública.
  // RIFEX FINAL PUBLIC SURFACE CLOSURE (2026-09-05) — decisión de Rodrigo:
  // "Eventos" pasa a apuntar directo a /eventos, que ahora ES la landing
  // comercial (con el catálogo debajo) — /soluciones/eventos queda como
  // redirect permanente, ver src/pages/soluciones/eventos.jsx. "Cómo
  // funciona" (/wizard) se retira del navbar: las 3 landings propias ya
  // cumplen esa función: la página sigue existiendo (PUBLIC_NOINDEX) por
  // si queda algún enlace externo, pero deja de promocionarse acá.
  const navItems = [
    { label: 'Eventos',        href: '/eventos' },
    { label: 'Campañas',       href: '/campanas' },
    { label: 'Inscripciones',  href: '/inscripciones' },
  ];

  // EVENT-1 (Fase 12): "Panel" pasa a ser "Mis iniciativas" — el
  // distribuidor superior de Rifas/Campañas/Eventos. /panel (Rifas) sigue
  // existiendo intacto, solo deja de tener su propio link de primer nivel
  // acá; se llega igual desde Mis iniciativas o por URL directa.
  // STAGE 2 REPAIR — "Mis campañas" quitado del dropdown: duplicaba la
  // card Campañas que ya vive dentro de /mis-iniciativas, el único punto
  // de entrada a los productos del usuario. La ruta /crear-colecta y su
  // panel siguen intactos, solo dejan de tener su propio ítem acá.
  // PSCG + DIFUSIÓN V1 — "Difusión" es PRIVATE_AUTHENTICATED (ver
  // src/lib/publicSurfaceClassification.js): solo vive en este menú
  // interno, nunca en navItems (navbar pública) ni en el footer.
  // RIFEX PRODUCT LANDINGS V1 agregó "Rifas" (/soluciones/rifas) acá.
  // RIFEX FINAL PUBLIC SURFACE CLOSURE (2026-09-05) — decisión de
  // Rodrigo: quitarlo de este menú superior. "Cómo funcionan las Rifas"
  // pasa a vivir únicamente en el footer autenticado (ver más abajo),
  // no en la navegación superior. La landing sigue existiendo, sigue
  // PRIVATE_AUTHENTICATED/ssr_redirect, solo cambia dónde se enlaza.
  const accountItems = [
    { label: 'Mis iniciativas', href: '/mis-iniciativas' },
    { label: 'Difusión',        href: '/difusion' },
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

  // canonicalPath gana siempre que se pase explícitamente. Si no, se usa
  // asPath (no pathname): pathname es el patrón de ruta literal de Next
  // ("/eventos/[id]"), asPath ya trae el id real resuelto. Se descarta el
  // query string — un canonical nunca debe variar por parámetros de
  // tracking o de estado de UI.
  const canonical = canonicalPath
    ? (canonicalPath.startsWith('http') ? canonicalPath : canonicalUrl(canonicalPath))
    : canonicalUrl((asPath || pathname || '/').split('?')[0]);

  return (
    <>
      {!disableAutoMeta && (
        <Head>
          <title key="title">{title}</title>
          <meta key="description" name="description" content={description} />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link key="canonical" rel="canonical" href={canonical} />
          {noindex && (
            <meta key="robots" name="robots" content={`noindex, nofollow${noarchive ? ', noarchive' : ''}`} />
          )}
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
      )}
      {disableAutoMeta && (
        <Head>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
        </Head>
      )}

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
                <Link href="/login" className="rf-btn-primary">Ingresar</Link>
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
              <Link href="/login" className="rf-mobile-link">Ingresar</Link>
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
              {/* RIFEX PRODUCT LANDINGS V1 — enlaces a las landings
                  públicas (PUBLIC_INDEXABLE), no a los formularios de
                  creación directamente (esos viven dentro de cada
                  landing como CTA). RIFEX FINAL PUBLIC SURFACE CLOSURE —
                  "Eventos" ahora apunta a /eventos (landing consolidada
                  con el catálogo debajo; /soluciones/eventos quedó como
                  redirect permanente). "Cómo funcionan las Rifas" se
                  agrega SOLO cuando hay sesión (mismo estado `user` ya
                  usado para accountItems) — un anónimo nunca ve el
                  enlace, y aunque lo viera, el destino sigue protegido
                  por su propio boundary SSR real (307 antes de
                  cualquier HTML privado), nunca depende de este link
                  para su seguridad. */}
              <span className="rf-foot__colTitle">Soluciones</span>
              <Link href="/eventos">Cómo funciona Eventos</Link>
              <Link href="/campanas">Cómo funcionan las Campañas</Link>
              <Link href="/inscripciones">Cómo funcionan las Inscripciones</Link>
              {user && <Link href="/soluciones/rifas">Cómo funcionan las Rifas</Link>}
              <Link href="/planes">Comisión</Link>
              <Link href="/register" className="rf-foot__community">Conoce más productos de Rifex siendo parte de la comunidad</Link>
            </div>
            <div className="rf-foot__col">
              <span className="rf-foot__colTitle">Soporte</span>
              <Link href="/contacto">Contacto</Link>
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

        {/* RIFEX FINAL PUBLIC SURFACE CLOSURE — sección de redes sociales,
            preparada con SOCIAL_LINKS (src/lib/socialLinks.js). Solo se
            renderiza un ícono cuando su URL es real — YouTube y X quedan
            con valor null hasta tener sus URLs, por eso hoy no aparecen
            (cero href="#", cero placeholders falsos). */}
        {Object.entries(SOCIAL_LINKS).some(([, url]) => url) && (
          <div className="rf-foot__social">
            <span className="rf-foot__socialLabel">Síguenos en redes sociales</span>
            <div className="rf-foot__socialIcons">
              {SOCIAL_LINKS.facebook && (
                <a href={SOCIAL_LINKS.facebook} target="_blank" rel="noopener noreferrer" aria-label="Rifex en Facebook" className="rf-foot__socialLink">
                  <SocialIcon name="facebook" />
                </a>
              )}
              {SOCIAL_LINKS.instagram && (
                <a href={SOCIAL_LINKS.instagram} target="_blank" rel="noopener noreferrer" aria-label="Rifex en Instagram" className="rf-foot__socialLink">
                  <SocialIcon name="instagram" />
                </a>
              )}
              {SOCIAL_LINKS.tiktok && (
                <a href={SOCIAL_LINKS.tiktok} target="_blank" rel="noopener noreferrer" aria-label="Rifex en TikTok" className="rf-foot__socialLink">
                  <SocialIcon name="tiktok" />
                </a>
              )}
              {SOCIAL_LINKS.whatsapp && (
                <a href={SOCIAL_LINKS.whatsapp} target="_blank" rel="noopener noreferrer" aria-label="Escríbenos por WhatsApp" className="rf-foot__socialLink">
                  <SocialIcon name="whatsapp" />
                </a>
              )}
            </div>
          </div>
        )}

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
        .rf-foot__col :global(a.rf-foot__community) { font-size: 12px; font-style: italic; color: rgba(255, 255, 255, 0.45); max-width: 220px; }
        .rf-foot__col :global(a.rf-foot__community:hover) { color: rgba(255, 255, 255, 0.8); }

        .rf-foot__social {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 16px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }
        .rf-foot__socialLabel {
          font-size: 13.5px;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.85);
        }
        .rf-foot__socialIcons {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        :global(.rf-foot__socialLink) {
          display: inline-flex;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          overflow: hidden;
          transition: transform 0.15s ease, opacity 0.15s ease;
          flex-shrink: 0;
        }
        :global(.rf-foot__socialLink:hover) { transform: translateY(-2px); opacity: 0.9; }
        :global(.rf-foot__socialLink:focus-visible) {
          outline: 2px solid rgba(255, 255, 255, 0.6);
          outline-offset: 2px;
        }

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
          .rf-foot__social { flex-direction: column; align-items: flex-start; }
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
        /* AUTH UX 2026 — en desktop el menú central debe quedar centrado
           respecto al viewport/contenedor real, no solo en el espacio que
           sobra entre logo y acciones (que son de ancho distinto). Un
           grid de 3 columnas con la del medio en auto logra eso sin tocar
           el layout móvil, que sigue siendo el flex de arriba. */
        @media (min-width: 901px) {
          .rf-header-inner {
            display: grid;
            grid-template-columns: 1fr auto 1fr;
            justify-content: normal;
          }
          :global(.rf-header-actions) { justify-self: end; }
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

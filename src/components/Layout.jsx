// src/components/Layout.jsx
import Link from 'next/link';
import { useRouter } from 'next/router';

export default function Layout({ children }) {
  const { pathname } = useRouter();

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

  return (
    <>
      <header className="rf-header">
        <div className="rf-header-inner">
          <Link href="/" className="rf-logo">Rifex</Link>

          <nav className="rf-nav">
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
        </div>
      </header>

      <main>{children}</main>
    </>
  );
}



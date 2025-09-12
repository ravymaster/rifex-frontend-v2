import Link from 'next/link';
import Image from 'next/image';

export default function Header() {
  return (
    <header className="rf-header">
      <div className="rf-header-inner">
        <Link href="/" className="rf-logo">
          <Image src="/rifex-logo.png" alt="Rifex" width={28} height={28} priority />
          <span style={{fontWeight:800}}>Rifex</span>
        </Link>

        <nav className="rf-nav">
          <Link href="/rifas">Rifas</Link>
          <Link href="/login">Login</Link>
          <Link href="/panel/mercado-pago">MP Setup</Link>

          <Link href="/register" className="btn btn-primary">Registrarse</Link>
        </nav>
      </div>
    </header>
  );
}

// src/components/Header.jsx
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import styles from "@/styles/header.module.css";
import { supabaseBrowser as supabase } from "@/lib/supabaseClient";

export default function Header() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data?.user || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user || null));
    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  useEffect(() => {
    const onEsc = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, []);

  useEffect(() => { setOpen(false); }, [router.pathname]);

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        {/* Brand */}
        <Link href="/" className={styles.brand}>
          <img src="/rifex-logo.png" alt="Rifex" className={styles.logo} />
          <span className={styles.brandText}>RIFEX</span>
        </Link>

        {/* Desktop nav */}
        <nav className={styles.navDesktop}>
          <Link href="/panel">Panel</Link>
          <Link href="/rifas/crear">Crear rifa</Link>
          <Link href="/ayuda">Ayuda</Link>
        </nav>

        {/* Desktop actions */}
        <div className={styles.actionsDesktop}>
          {!user ? (
            <>
              <Link href="/login" className={`btn ${styles.btnPlain}`}>Ingresar</Link>
              <Link href="/register" className={`btn ${styles.btnPrimary}`}>Crear cuenta</Link>
            </>
          ) : (
            <>
              <span className={styles.me}>{user.email}</span>
              <button onClick={logout} className={`btn ${styles.btnPlain}`}>Salir</button>
            </>
          )}
        </div>

        {/* Hamburger */}
        <button
          className={styles.hamburger}
          aria-label="Abrir menú"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <>
          <div className={styles.backdrop} onClick={() => setOpen(false)} />
          <div className={styles.drawer} role="dialog" aria-modal="true">
            <nav className={styles.navMobile}>
              <Link href="/panel">Panel</Link>
              <Link href="/rifas/crear">Crear rifa</Link>
              <Link href="/ayuda">Ayuda</Link>
            </nav>
            <div className={styles.actionsMobile}>
              {!user ? (
                <>
                  <Link href="/login" className={`btn ${styles.btnPlain}`}>Ingresar</Link>
                  <Link href="/register" className={`btn ${styles.btnPrimary}`}>Crear cuenta</Link>
                </>
              ) : (
                <>
                  <div className={styles.meMobile}>{user.email}</div>
                  <button onClick={logout} className={`btn ${styles.btnPlain}`}>Salir</button>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </header>
  );
}


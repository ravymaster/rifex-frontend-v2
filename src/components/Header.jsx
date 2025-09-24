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
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) =>
      setUser(s?.user || null)
    );
    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        {/* Brand / logo */}
        <div className={styles.left}>
          <Link href="/" className={styles.brand}>
            <img
              src="/logo-64.png"
              alt="RIFEX"
              width={28}
              height={28}
              className={styles.logo}
            />
            <span>RIFEX</span>
          </Link>

          {/* Nav (desktop) */}
          <nav className={styles.nav}>
            <Link href="/panel">Panel</Link>
            {/* ✅ corregido: antes era /rifas/crear */}
            <Link href="/crear-rifa">Crear rifa</Link>
            <Link href="/ayuda">Ayuda</Link>
          </nav>
        </div>

        {/* Actions (desktop) */}
        <div className={styles.actions}>
          {!user ? (
            <>
              <Link href="/login" className={`btn ${styles.btnPlain}`}>
                Ingresar
              </Link>
              <Link href="/register" className={`btn ${styles.btnPrimary}`}>
                Crear cuenta
              </Link>
            </>
          ) : (
            <>
              <div className={styles.me}>{user.email}</div>
              <button onClick={logout} className={`btn ${styles.btnPlain}`}>
                Salir
              </button>
            </>
          )}
        </div>

        {/* Botón menú (mobile) */}
        <button
          className={styles.menuBtn}
          aria-label="Abrir menú"
          onClick={() => setOpen((v) => !v)}
        >
          ☰
        </button>
      </div>

      {/* Drawer / menú mobile */}
      {open && (
        <div className={styles.drawer}>
          <div className={styles.drawerInner}>
            <div className={styles.drawerTop}>
              <Link href="/" className={styles.brand}>
                <img
                  src="/logo-64.png"
                  alt="RIFEX"
                  width={28}
                  height={28}
                  className={styles.logo}
                />
                <span>RIFEX</span>
              </Link>
              <button
                className={styles.menuClose}
                aria-label="Cerrar menú"
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>

            <nav className={styles.navMobile} onClick={() => setOpen(false)}>
              <Link href="/panel">Panel</Link>
              {/* ✅ corregido: antes era /rifas/crear */}
              <Link href="/crear-rifa">Crear rifa</Link>
              <Link href="/ayuda">Ayuda</Link>
            </nav>

            <div className={styles.actionsMobile}>
              {!user ? (
                <>
                  <Link
                    href="/login"
                    className={`btn ${styles.btnPlain}`}
                    onClick={() => setOpen(false)}
                  >
                    Ingresar
                  </Link>
                  <Link
                    href="/register"
                    className={`btn ${styles.btnPrimary}`}
                    onClick={() => setOpen(false)}
                  >
                    Crear cuenta
                  </Link>
                </>
              ) : (
                <>
                  <div className={styles.meMobile}>{user.email}</div>
                  <button
                    onClick={() => {
                      setOpen(false);
                      logout();
                    }}
                    className={`btn ${styles.btnPlain}`}
                  >
                    Salir
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}



// src/pages/protegida.jsx
import Head from "next/head";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
import { supabaseBrowser as supabase } from "@/lib/supabaseClient";

export default function Protegida() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const user = data?.user || null;
        if (!mounted) return;
        if (!user) {
          const next = encodeURIComponent("/protegida");
          router.replace(`/login?next=${next}`);
          return;
        }
        setUserEmail(user.email || user.id);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [router]);

  const onLogout = useCallback(async () => {
    try { await supabase.auth.signOut(); } catch {}
    router.push("/login");
  }, [router]);

  return (
    <>
      <Head><title>Página protegida — Rifex</title></Head>
      <main style={{ maxWidth: 720, margin: "40px auto", padding: 16 }}>
        <h1 style={{ marginBottom: 8 }}>Página protegida</h1>
        {loading ? (
          <p style={{ color: "#64748b" }}>Cargando…</p>
        ) : (
          <>
            <p style={{ color: "#475569", marginBottom: 16 }}>
              Estás autenticado como <b>{userEmail}</b>.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <a className="btn" href="/panel">Ir al panel</a>
              <button className="btn" onClick={onLogout}>Salir</button>
            </div>
          </>
        )}
        <style jsx>{`
          .btn {
            padding: 10px 14px;
            border-radius: 10px;
            border: 1px solid #e2e8f0;
            background: #fff;
            cursor: pointer;
          }
          .btn:hover { box-shadow: 0 2px 10px rgba(0,0,0,.06); }
        `}</style>
      </main>
    </>
  );
}


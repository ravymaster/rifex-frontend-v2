// src/pages/protegida.jsx
import Head from "next/head";
import { createServerSupabaseClient } from "@supabase/auth-helpers-nextjs";
import { useRouter } from "next/router";
import { useCallback } from "react";
import { supabaseBrowser as supabase } from "@/lib/supabaseClient";

export async function getServerSideProps(ctx) {
  const supa = createServerSupabaseClient(ctx);
  const {
    data: { user },
  } = await supa.auth.getUser();

  if (!user) {
    return {
      redirect: {
        destination: `/login?next=${encodeURIComponent("/protegida")}`,
        permanent: false,
      },
    };
  }

  return {
    props: {
      user: { id: user.id, email: user.email || null },
    },
  };
}

export default function Protegida({ user }) {
  const router = useRouter();

  const onLogout = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch {}
    router.push("/login");
  }, [router]);

  return (
    <>
      <Head>
        <title>Página protegida — Rifex</title>
      </Head>
      <main style={{ maxWidth: 720, margin: "40px auto", padding: 16 }}>
        <h1 style={{ marginBottom: 8 }}>Página protegida</h1>
        <p style={{ color: "#475569", marginBottom: 16 }}>
          Estás autenticado como <b>{user.email || user.id}</b>.
        </p>

        <div style={{ display: "flex", gap: 8 }}>
          <a className="btn" href="/panel">Ir al panel</a>
          <button className="btn" onClick={onLogout}>Salir</button>
        </div>

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

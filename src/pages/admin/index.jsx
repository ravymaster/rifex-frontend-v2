// src/pages/admin/index.jsx
// Puerta admin mínima (A1). Sin métricas, pagos, usuarios ni Country
// Control todavía — solo confirma la autoridad real. La página nunca
// decide por sí sola: siempre pregunta a /api/admin/me (que sí valida
// server-side vía app_metadata.role) y refleja lo que responde. Ocultar
// esta ruta del menú es cosmético, no autoridad.
import Head from "next/head";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "@/components/Layout";
import { supabaseBrowser as supabase } from "@/lib/supabaseClient";

export default function AdminHome() {
  const router = useRouter();
  const [state, setState] = useState("checking"); // checking | denied | ok
  const [email, setEmail] = useState(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) {
        router.replace(`/login?next=${encodeURIComponent("/admin")}`);
        return;
      }

      try {
        const r = await fetch("/api/admin/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const j = await r.json().catch(() => ({ ok: false }));
        if (r.ok && j?.ok && j?.admin) {
          setEmail(j.email || null);
          setState("ok");
        } else {
          setState("denied");
        }
      } catch (e) {
        console.error("[admin] error validando autoridad", e);
        setState("denied");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <Head><title>Admin — Rifex</title></Head>
      <main style={{ padding: "60px 20px", textAlign: "center" }}>
        {state === "checking" && <p>Verificando acceso…</p>}

        {state === "denied" && (
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#b91c1c" }}>Acceso denegado</h1>
            <p style={{ color: "#6B7280", marginTop: 8 }}>
              Tu cuenta no tiene autorización para administrar Rifex.
            </p>
          </div>
        )}

        {state === "ok" && (
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800 }}>Panel Admin</h1>
            <p style={{ color: "#6B7280", marginTop: 8 }}>
              Acceso confirmado{email ? ` — ${email}` : ""}.
            </p>
          </div>
        )}
      </main>
    </>
  );
}

AdminHome.getLayout = (page) => <Layout>{page}</Layout>;

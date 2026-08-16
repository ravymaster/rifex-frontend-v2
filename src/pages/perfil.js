// src/pages/perfil.js
import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import ProfileView from "@/components/rifex/ProfileView";
import styles from "@/styles/perfil.module.css";
import { supabaseBrowser as supabase } from "@/lib/supabaseClient";

export default function Perfil() {
  const router = useRouter();

  const [token, setToken] = useState(null);
  const [viewerId, setViewerId] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      const { data: sres } = await supabase.auth.getSession();
      const session = sres?.session;
      if (!session) {
        router.push("/login?next=/perfil");
        return;
      }
      setToken(session.access_token);
      setViewerId(session.user.id);
      try {
        const r = await fetch(`/api/perfil/${session.user.id}`);
        const j = await r.json();
        if (!r.ok || !j.ok) throw new Error(j?.error || "No se pudo cargar tu perfil.");
        setData(j);
        setError(null);
      } catch (e) {
        setError(e?.message || "No se pudo cargar tu perfil.");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  return (
    <>
      <Head><title>Mi perfil — Rifex</title></Head>
      <section className={styles.page}>
        <div className="container" style={{ maxWidth: 760 }}>
          {loading ? (
            <p style={{ padding: "24px 0" }}>Cargando…</p>
          ) : error ? (
            <p style={{ padding: "24px 0", color: "#b91c1c" }}>{error}</p>
          ) : (
            <ProfileView
              profile={data.profile}
              stats={data.stats}
              active={data.active}
              completed={data.completed}
              isOwner
              token={token}
              viewerToken={token}
              viewerId={viewerId}
              onProfileUpdate={(p) => setData((d) => ({ ...d, profile: p }))}
            />
          )}
        </div>
      </section>
    </>
  );
}

Perfil.getLayout = (page) => <Layout>{page}</Layout>;

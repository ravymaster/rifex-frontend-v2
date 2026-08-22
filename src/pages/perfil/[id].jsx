// src/pages/perfil/[id].jsx
import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import ProfileView from "@/components/rifex/ProfileView";
import styles from "@/styles/perfil.module.css";
import { supabaseBrowser as supabase } from "@/lib/supabaseClient";

export default function PerfilPublico() {
  const router = useRouter();
  const { id } = router.query;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewer, setViewer] = useState({ token: null, id: null });

  useEffect(() => {
    (async () => {
      const { data: sres } = await supabase.auth.getSession();
      const session = sres?.session;
      if (session) setViewer({ token: session.access_token, id: session.user.id });
    })();
  }, []);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/perfil/${id}`);
        const j = await r.json();
        if (!r.ok || !j.ok) throw new Error(j?.error || "No se pudo cargar el perfil.");
        setData(j);
        setError(null);
      } catch (e) {
        setError(e?.message || "No se pudo cargar el perfil.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  return (
    <>
      <Head><title>{`${data?.profile?.nombre || "Perfil"} — Rifex`}</title></Head>
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
              isOwner={false}
              viewerToken={viewer.token}
              viewerId={viewer.id}
            />
          )}
        </div>
      </section>
    </>
  );
}

PerfilPublico.getLayout = (page) => <Layout>{page}</Layout>;

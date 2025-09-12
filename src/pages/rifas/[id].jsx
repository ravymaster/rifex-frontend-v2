// src/pages/rifas/[id].jsx
import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import styles from "../../styles/rifaDetalle.module.css";

// Cliente público para leer rifa/tickets
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const fmtCLP = (n) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(
    n || 0
  );

export default function RifaDetallePage() {
  const router = useRouter();
  const { id } = router.query;

  const [raffle, setRaffle] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  // selección en frontend
  const [selected, setSelected] = useState([]);
  const isSelected = (n) => selected.includes(n);
  const toggleNumber = (n, available) => {
    if (!available) return;
    setSelected((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));
  };

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);

      const { data: rifa } = await supabase.from("raffles").select("*").eq("id", id).single();

      const { data: tks } = await supabase
        .from("tickets")
        .select("number,status,purchase_id")
        .eq("raffle_id", id)
        .order("number", { ascending: true });

      setRaffle(rifa || null);
      setTickets(tks || []);
      setSelected([]);
      setLoading(false);
    })();
  }, [id]);

  // Normaliza 1..N con estado
  const grid = useMemo(() => {
    const total = raffle?.total_numbers || 0;
    if (!total) return [];
    const map = new Map(tickets.map((t) => [t.number, t.status || "available"]));
    return Array.from({ length: total }, (_, i) => {
      const n = i + 1;
      return { number: n, status: map.get(n) || "available" };
    });
  }, [raffle, tickets]);

   async function comprar() {
    if (selected.length === 0) return;

    try {
      const payload = { raffle_id: id, raffleId: id, numbers: selected };

      const r = await fetch('/api/checkout/mp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      let data = {};
      try { data = await r.json(); } catch {}

      if (r.ok && (data.init_point || data.url)) {
        window.location.href = data.init_point || data.url;
        return;
      }

      alert(data?.error || 'No se pudo iniciar el checkout.');
    } catch (e) {
      console.error(e);
      alert('Error iniciando checkout.');
    }
  }


  if (loading) {
    return (
      <>
        <Head>
          <title>Rifa — Rifex</title>
        </Head>
        <div className={styles.page}>
          <div className="container" style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}>
            <div className={styles.loading}>Cargando…</div>
          </div>
        </div>
      </>
    );
  }

  if (!raffle) {
    return (
      <>
        <Head>
          <title>Rifa — Rifex</title>
        </Head>
        <div className={styles.page}>
          <div className="container" style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}>
            <div className={styles.error}>No encontramos esta rifa.</div>
          </div>
        </div>
      </>
    );
  }

  const price = (raffle.price_cents || 0) / 100;
  const availableStatuses = new Set(["available", "free"]);

  return (
    <>
      <Head>
        <title>{raffle.title} — Rifex</title>
      </Head>

      <div className={styles.page}>
        <div className="container" style={{ maxWidth: 1100, margin: "0 auto", padding: "0 16px" }}>
          <div className={styles.card} style={{ marginTop: 24 }}>
            <div className={styles.body}>
              {/* Izquierda */}
              <div className={styles.left}>
                <div className={styles.head}>
                  <div className={styles.tags}>
                    <span className={styles.badge}>
                      <span role="img" aria-label="dinero">
                        💸
                      </span>
                      Dinero
                    </span>
                  </div>
                  <h1 className={styles.title}>{raffle.title}</h1>
                  <p className={styles.sub}>Fechas por confirmar</p>
                </div>

                <h3>Descripción</h3>
                <div className={styles.desc}>{raffle.description || "—"}</div>

                <div className={styles.numbersBlock}>
                  <h3 className={styles.numbersTitle}>Números</h3>
                  <div className={styles.numsGrid}>
                    {grid.map((t) => {
                      const n = t.number;
                      const available = availableStatuses.has(t.status);
                      return (
                        <button
                          key={n}
                          type="button"
                          onClick={() => toggleNumber(n, available)}
                          aria-pressed={isSelected(n)}
                          disabled={!available}
                          className={[
                            styles.num,
                            available ? "free" : styles.paid, // "free" existe en tu CSS (solo hover)
                            isSelected(n) ? styles.sel : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          {n}
                        </button>
                      );
                    })}
                  </div>
                  <div className={styles.numsNote}>
                    Selecciona uno o más números y luego presiona comprar.
                  </div>
                </div>
              </div>

              {/* Derecha / Sidebar */}
              <aside className={styles.side}>
                <div className={styles.panel}>
                  <div className={styles.price}>{fmtCLP(price)}</div>
                  <div className={styles.cupos}>📇 {raffle.total_numbers} cupos</div>

                  <button
                    type="button"
                    className={styles.cta}
                    disabled={selected.length === 0}
                    onClick={comprar}
                    // Override del cursor cuando está habilitado (gana a cursor:not-allowed del CSS)
                    style={selected.length > 0 ? { cursor: "pointer" } : undefined}
                  >
                    {selected.length === 0
                      ? "Comprar (selecciona)"
                      : `Comprar (${selected.length})`}
                  </button>

                  <div className={styles.help}>
                    Estado: <b>{raffle.status || "activa"}</b>
                  </div>
                </div>
              </aside>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

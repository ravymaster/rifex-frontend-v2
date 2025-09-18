// components/IconsGrid.jsx
import { useEffect, useMemo, useState } from "react";
import IconCard from "./IconCard";

const THEME_ORDER = [
  "Universe","Mythology","Dinosaurs","Flora & Fauna",
  "Food","Video Games","Superheroes","Fantasy","Technology","Sports",
];

// Simula estado del backend (podés traerlo luego por API)
const SOLD     = [];         // ej: [3, 17, 88]
const RESERVED = [];         // ej: [11, 32]

export default function IconsGrid() {
  const [manifest, setManifest] = useState(null);
  const [themeFilter, setThemeFilter] = useState("All");
  const [selected, setSelected] = useState(() => {
    const raw = typeof window !== "undefined" && localStorage.getItem("raffle:selected");
    return new Set(raw ? JSON.parse(raw) : []);
  });

  // carga manifest
  useEffect(() => {
    fetch("/icons/manifest.json").then(r => r.json()).then(setManifest).catch(console.error);
  }, []);

  // persiste selección
  useEffect(() => {
    localStorage.setItem("raffle:selected", JSON.stringify(Array.from(selected)));
  }, [selected]);

  const themes = useMemo(() => {
    if (!manifest?.themes) return [];
    return Object.entries(manifest.themes).map(([slug, obj]) => ({
      slug, title: obj.title, items: obj.items || []
    }));
  }, [manifest]);

  // 1..100 ordenado por THEME_ORDER y por idx 01..10 dentro de cada tema
  const flatList = useMemo(() => {
    if (!themes.length) return [];
    const byTitle = new Map(themes.map(t => [t.title, t]));
    const ordered = THEME_ORDER.map(t => byTitle.get(t)).filter(Boolean);

    const rows = [];
    ordered.forEach((t, ti) => {
      const items = [...t.items].sort((a, b) => (a.idx ?? 0) - (b.idx ?? 0));
      items.forEach((it, ii) => {
        const number = ti * 10 + ii + 1;
        rows.push({
          number,
          theme: t.title,
          name: it.name,
          src: it.file1024 || it.file512,
          status: SOLD.includes(number) ? "sold" : RESERVED.includes(number) ? "reserved" : "available",
        });
      });
    });
    return rows;
  }, [themes]);

  const list = useMemo(() => themeFilter === "All"
    ? flatList
    : flatList.filter(x => x.theme === themeFilter),
  [flatList, themeFilter]);

  const toggle = (n) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n); else next.add(n);
      return next;
    });
  };

  const clearSel = () => setSelected(new Set());

  const exportJSON = () => {
    const arr = Array.from(selected).sort((a,b)=>a-b);
    const blob = new Blob([JSON.stringify(arr)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: "seleccion.json" });
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  const exportCSV = () => {
    const arr = Array.from(selected).sort((a,b)=>a-b);
    const blob = new Blob([arr.join(",")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: "seleccion.csv" });
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  if (!manifest) return <p>Cargando íconos…</p>;

  return (
    <div style={{ display:"grid", gap:16, gridTemplateRows:"auto auto 1fr" }}>
      {/* Filtros */}
      <div style={{ display:"flex", gap:12, alignItems:"center" }}>
        <h2 style={{ margin:0 }}>Rifa — Íconos</h2>
        <div style={{ marginLeft:"auto", opacity:.7 }}>{flatList.length} íconos</div>
      </div>

      <div style={{ display:"flex", gap:12, alignItems:"center" }}>
        <label>Tema:</label>
        <select value={themeFilter} onChange={e=>setThemeFilter(e.target.value)} style={{ padding:"6px 10px", borderRadius:8 }}>
          <option>All</option>
          {THEME_ORDER.map(t => <option key={t}>{t}</option>)}
        </select>

        <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
          <button onClick={exportJSON}>Exportar JSON</button>
          <button onClick={exportCSV}>Exportar CSV</button>
          <button onClick={clearSel}>Limpiar selección</button>
          <span style={{ alignSelf:"center", opacity:.75 }}>{selected.size} seleccionados</span>
        </div>
      </div>

      {/* Grid */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(128px, 1fr))", gap:16 }}>
        {list.map((it) => (
          <IconCard
            key={`${it.theme}-${it.number}`}
            src={it.src}
            alt={it.name}
            number={it.number}
            status={it.status}
            selected={selected.has(it.number)}
            onToggle={() => it.status === "available" && toggle(it.number)}
          />
        ))}
      </div>
    </div>
  );
}

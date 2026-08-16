// src/components/rifex/ProfileView.jsx
import { useState } from "react";
import Link from "next/link";
import styles from "@/styles/perfil.module.css";
import RaffleChat from "@/components/rifex/RaffleChat";

const MAX_AVATAR_BYTES = 3 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function clp(cents) {
  const n = Number(cents || 0) / 100;
  return n.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
}

function RaffleCard({ r, chatOpen, onToggleChat, viewerToken, viewerId }) {
  const pct = r.total_numbers ? Math.round((r.sold / r.total_numbers) * 100) : 0;
  return (
    <div className={styles.raffleCard}>
      <Link href={`/rifas/${r.id}`} className={styles.raffleCardLink}>
        <div className={styles.raffleTitle}>{r.title}</div>
        <div className={styles.rafflePrice}>{clp(r.price_cents)} el número</div>
        <div className={styles.raffleBar}>
          <div className={styles.raffleBarFill} style={{ width: `${pct}%` }} />
        </div>
      </Link>
      <button type="button" className={styles.chatToggle} onClick={() => onToggleChat(r.id)}>
        💬 {chatOpen ? "Ocultar chat" : "Ver chat"}
      </button>
      {chatOpen && <RaffleChat raffleId={r.id} viewerToken={viewerToken} viewerId={viewerId} />}
    </div>
  );
}

export default function ProfileView({ profile, stats, active, completed, isOwner, token, viewerToken, viewerId, onProfileUpdate }) {
  const [tab, setTab] = useState("active");
  const [openChatId, setOpenChatId] = useState(null);
  const effectiveViewerToken = viewerToken || (isOwner ? token : null);
  const [editing, setEditing] = useState(false);
  const [nombre, setNombre] = useState(profile?.nombre || "");
  const [bio, setBio] = useState(profile?.bio || "");
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [err, setErr] = useState("");

  const initial = (profile?.nombre || "?").trim().charAt(0).toUpperCase();
  const memberSince = profile?.member_since
    ? new Date(profile.member_since).toLocaleDateString("es-CL", { month: "long", year: "numeric" })
    : null;

  async function onAvatarChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr("");
    if (!ALLOWED_AVATAR_TYPES.has(file.type)) return setErr("Formato no permitido.");
    if (file.size > MAX_AVATAR_BYTES) return setErr("La imagen pesa más de 3MB.");

    setUploadingAvatar(true);
    try {
      const dataBase64 = await fileToBase64(file);
      const res = await fetch("/api/profile/upload-avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ filename: file.name, contentType: file.type, dataBase64 }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "No se pudo subir la foto.");
      onProfileUpdate?.({ ...profile, avatar_url: data.url });
    } catch (e2) {
      setErr(e2?.message || "No se pudo subir la foto.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function onSave() {
    setSaving(true);
    setErr("");
    try {
      const res = await fetch("/api/profile/update", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ nombre, bio }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "No se pudo guardar.");
      onProfileUpdate?.({ ...profile, nombre, bio });
      setEditing(false);
    } catch (e2) {
      setErr(e2?.message || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  const list = tab === "active" ? active : completed;

  return (
    <>
      <div className={styles.headerCard}>
        {isOwner && !editing && (
          <button className={styles.editBtn} onClick={() => setEditing(true)}>
            ✏️ Editar perfil
          </button>
        )}

        <div className={styles.headerTop}>
          {isOwner ? (
            <label className={styles.avatarUploadBtn}>
              {profile?.avatar_url ? (
                <img className={styles.avatarImg} src={profile.avatar_url} alt="" />
              ) : (
                <div className={styles.avatarFallback}>{initial}</div>
              )}
              <span className={styles.avatarUploadHint}>{uploadingAvatar ? "…" : "✎"}</span>
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onAvatarChange} disabled={uploadingAvatar} />
            </label>
          ) : profile?.avatar_url ? (
            <img className={styles.avatarImg} src={profile.avatar_url} alt="" />
          ) : (
            <div className={styles.avatarFallback}>{initial}</div>
          )}

          <div>
            <h1 className={styles.name}>{profile?.nombre || "Creador de Rifex"}</h1>
            {memberSince && <p className={styles.memberSince}>Miembro desde {memberSince}</p>}
          </div>
        </div>

        {isOwner && editing && (
          <div className={styles.editForm}>
            <label className="label">Nombre</label>
            <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Tu nombre" />
            <label className="label" style={{ marginTop: 10 }}>Sobre mí</label>
            <textarea className="input" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Contales a los compradores qué tipo de rifas organizas, hace cuánto lo haces y qué te apasiona de esto." maxLength={500} />
            {err && <p style={{ color: "#b91c1c", fontSize: 13, marginTop: 8 }}>{err}</p>}
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button className="btn btn-primary" onClick={onSave} disabled={saving}>
                {saving ? "Guardando…" : "Guardar"}
              </button>
              <button className="btn btn-ghost" onClick={() => { setEditing(false); setNombre(profile?.nombre || ""); setBio(profile?.bio || ""); }}>
                Cancelar
              </button>
            </div>
          </div>
        )}
        {isOwner && !editing && err && <p style={{ color: "#b91c1c", fontSize: 13, marginTop: 8 }}>{err}</p>}
      </div>

      {!editing && (
        <div className={styles.aboutCard}>
          <h2 className={styles.aboutTitle}>Sobre mí</h2>
          {profile?.bio ? (
            <p className={styles.aboutText}>{profile.bio}</p>
          ) : (
            <p className={styles.aboutEmpty}>
              {isOwner ? (
                <>Todavía no contaste nada sobre vos. <button type="button" className={styles.aboutEditLink} onClick={() => setEditing(true)}>Agregar descripción</button></>
              ) : (
                "Este creador todavía no agregó una descripción."
              )}
            </p>
          )}
        </div>
      )}

      <div className={styles.statsGrid}>
        <div className={styles.statTile}>
          <div className={styles.statValue}>{stats?.raffles_created ?? 0}</div>
          <div className={styles.statLabel}>Rifas creadas</div>
        </div>
        <div className={styles.statTile}>
          <div className={styles.statValue}>{stats?.raffles_completed ?? 0}</div>
          <div className={styles.statLabel}>Completadas</div>
        </div>
        <div className={styles.statTile}>
          <div className={styles.statValue}>{stats?.numbers_sold ?? 0}</div>
          <div className={styles.statLabel}>Números vendidos</div>
        </div>
      </div>

      <div className={styles.tabs}>
        <button className={styles.tab} data-active={tab === "active"} onClick={() => setTab("active")}>
          Rifas activas ({active?.length || 0})
        </button>
        <button className={styles.tab} data-active={tab === "completed"} onClick={() => setTab("completed")}>
          Completadas ({completed?.length || 0})
        </button>
      </div>

      {list?.length ? (
        <div className={styles.raffleGrid}>
          {list.map((r) => (
            <RaffleCard
              key={r.id}
              r={r}
              chatOpen={openChatId === r.id}
              onToggleChat={(id) => setOpenChatId((cur) => (cur === id ? null : id))}
              viewerToken={effectiveViewerToken}
              viewerId={viewerId}
            />
          ))}
        </div>
      ) : (
        <p className={styles.raffleEmpty}>
          {tab === "active" ? "No hay rifas activas por ahora." : "Todavía no hay rifas completadas."}
        </p>
      )}
    </>
  );
}

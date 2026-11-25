// src/components/rifex/RaffleChat.jsx
import { useEffect, useRef, useState } from "react";
import styles from "@/styles/raffleChat.module.css";

const GUEST_NAME_KEY = "rifex_guest_chat_name";
const REFRESH_MS = 10_000;

function timeLabel(iso) {
  try {
    return new Date(iso).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function RaffleChat({ raffleId, viewerToken }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [guestName, setGuestName] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const listRef = useRef(null);

  useEffect(() => {
    if (!viewerToken) {
      setGuestName(localStorage.getItem(GUEST_NAME_KEY) || "");
    }
  }, [viewerToken]);

  // Mensajes por la API del chat (campos públicos, sin ids internos);
  // refresco periódico en vez de suscribirse a la base desde el navegador.
  useEffect(() => {
    let cancelled = false;
    const load = async (first) => {
      if (first) setLoading(true);
      try {
        const headers = viewerToken ? { Authorization: `Bearer ${viewerToken}` } : undefined;
        const r = await fetch(`/api/chat/${raffleId}`, { headers });
        const j = await r.json().catch(() => null);
        if (!cancelled && r.ok && j?.ok) setMessages(j.messages || []);
      } catch {
      } finally {
        if (!cancelled && first) setLoading(false);
      }
    };
    load(true);
    const timer = setInterval(() => load(false), REFRESH_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [raffleId, viewerToken]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  async function onSend(e) {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    if (!viewerToken && !guestName.trim()) {
      setErr("Poné tu nombre para poder escribir.");
      return;
    }
    setSending(true);
    setErr("");
    try {
      const headers = { "Content-Type": "application/json" };
      if (viewerToken) headers.Authorization = `Bearer ${viewerToken}`;
      const payload = viewerToken ? { body } : { body, guest_name: guestName.trim() };

      if (!viewerToken) localStorage.setItem(GUEST_NAME_KEY, guestName.trim());

      const res = await fetch(`/api/chat/${raffleId}`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "No se pudo enviar el mensaje.");
      setMessages((prev) => (prev.some((m) => m.id === data.message.id) ? prev : [...prev, data.message]));
      setText("");
    } catch (e2) {
      setErr(e2?.message || "No se pudo enviar el mensaje.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.list} ref={listRef}>
        {loading ? (
          <p className={styles.empty}>Cargando mensajes…</p>
        ) : messages.length ? (
          messages.map((m) => (
            <div key={m.id} className={`${styles.msg} ${m.is_mine ? styles.me : ""}`}>
              <div className={styles.meta}>
                <span className={styles.name}>{m.nombre}</span>
                {m.is_guest && <span className={styles.guestTag}>Invitado</span>}
                <span className={styles.time}>{timeLabel(m.created_at)}</span>
              </div>
              <div className={styles.bubble}>{m.body}</div>
            </div>
          ))
        ) : (
          <p className={styles.empty}>Todavía no hay mensajes. ¡Sé el primero en escribir!</p>
        )}
      </div>

      <form className={styles.inputBar} onSubmit={onSend}>
        {!viewerToken && (
          <input
            className={`input ${styles.guestNameInput}`}
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="Tu nombre"
            maxLength={40}
            disabled={sending}
          />
        )}
        <input
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escribe un mensaje…"
          maxLength={500}
          disabled={sending}
        />
        <button className="btn btn-primary" disabled={sending || !text.trim()}>
          {sending ? "…" : "Enviar"}
        </button>
      </form>
      {err && <p className={styles.err}>{err}</p>}
    </div>
  );
}

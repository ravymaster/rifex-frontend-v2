// src/lib/publicChat.js
// Campos públicos y validación del chat de Rifas (src/pages/api/chat/[raffleId].js).
// Lista cerrada: id público derivado (no reversible), texto, fecha,
// nombre público o alias, y marcas is_guest / is_organizer / is_mine.
import crypto from 'crypto';

export const PUBLIC_CHAT_MESSAGE_FIELDS = Object.freeze(['id', 'body', 'created_at', 'nombre', 'is_guest', 'is_organizer', 'is_mine']);

const MAX_LEN = 500;
const MAX_GUEST_NAME_LEN = 40;
const CONTROL_CHARS_RE = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩]/g;

export function publicMessageId(id) {
  return crypto.createHash('sha256').update(`rifex-chat-message|${id}`).digest('base64url').slice(0, 16);
}

export function cleanMessageBody(value) {
  if (typeof value !== 'string') return null;
  const body = value.replace(CONTROL_CHARS_RE, '').replace(/\n{3,}/g, '\n\n').trim();
  return body && body.length <= MAX_LEN ? body : null;
}

// Alias de invitado: texto corto, sin correos ni números de contacto.
export function cleanGuestName(value) {
  if (typeof value !== 'string') return null;
  const name = value.replace(CONTROL_CHARS_RE, '').replace(/\s+/g, ' ').trim();
  if (!name || name.length > MAX_GUEST_NAME_LEN) return null;
  if (name.includes('@') || (name.match(/\d/g) || []).length >= 7) return null;
  return name;
}

export function toPublicMessage(m, { nombre, creatorId, viewerId }) {
  return {
    id: publicMessageId(m.id),
    body: m.body,
    created_at: m.created_at,
    nombre,
    is_guest: !m.user_id,
    is_organizer: Boolean(m.user_id && creatorId && m.user_id === creatorId),
    is_mine: Boolean(m.user_id && viewerId && m.user_id === viewerId),
  };
}

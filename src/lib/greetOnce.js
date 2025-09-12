// src/lib/greetOnce.js
const key = (raffleId) => `greeted:${raffleId}`;

export function markGreeted(raffleId) {
  try { localStorage.setItem(key(raffleId), "1"); } catch {}
}

export function shouldShowGreet(raffleId) {
  try { return localStorage.getItem(key(raffleId)) === "1"; } catch {}
  return false;
}

export function clearGreet(raffleId) {
  try { localStorage.removeItem(key(raffleId)); } catch {}
}

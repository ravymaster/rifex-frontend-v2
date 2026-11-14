// src/lib/slugify.js
const DIACRITICS_RE = new RegExp('[̀-ͯ]', 'g');

export function slugify(input) {
  return String(input || '')
    .normalize('NFD')
    .replace(DIACRITICS_RE, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80) || 'post';
}

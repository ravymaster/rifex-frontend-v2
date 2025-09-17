// src/hooks/useIconsMap.js
import data from "../data/icons.manifest.json";

const THEME_ORDER = [
  "Universe","Mythology","Dinosaurs","Flora & Fauna",
  "Food","Video Games","Superheroes","Fantasy","Technology","Sports",
];

const byTitle = new Map(Object.values(data.themes).map(t => [t.title, t]));
const ordered = THEME_ORDER.map(t => byTitle.get(t)).filter(Boolean);

// Array 1..100 con { src512, src1024 }
const ICONS = [];
ordered.forEach(t => {
  const items = [...(t.items || [])].sort((a,b) => (a.idx ?? 0) - (b.idx ?? 0));
  items.forEach(it => ICONS.push({
    src512: it.file512,
    src1024: it.file1024 || it.file512
  }));
});

export function getIconByNumber(n) {
  return ICONS[n - 1] || null;
}

// DIFUSIÓN V1.1 — MULTIPRODUCTO. Certifica el selector de 4 productos
// (Rifas/Campañas/Eventos/Inscripciones) y el contenido por guía, sin
// tocar la clasificación PSCG de /difusion (PRIVATE_AUTHENTICATED,
// boundary ssr_redirect — certificada en tests/pscg.test.mjs, no
// duplicada acá). docs/difusion/DIFUSION_V1.md documenta el detalle.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DIFFUSION_PRODUCTS, DIFFUSION_GUIDES, DIFFUSION_COMMON_AD_NOTE } from "../src/lib/difusionGuides.js";

const ROOT = path.join(process.cwd());
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const pageSrc = read("src/pages/difusion.jsx");
const guidesSrc = read("src/lib/difusionGuides.js");

// ---------- 1. existen 4 categorías ----------
test("DIFFUSION_PRODUCTS: exactamente 4 productos (raffle, campaign, event, registration)", () => {
  assert.equal(DIFFUSION_PRODUCTS.length, 4);
  const keys = DIFFUSION_PRODUCTS.map((p) => p.key).sort();
  assert.deepEqual(keys, ["campaign", "event", "raffle", "registration"]);
});

// ---------- 2-5. cada producto presente ----------
test("Rifas presente con label 'Rifas'", () => {
  assert.equal(DIFFUSION_GUIDES.raffle.label, "Rifas");
});
test("Campañas presente con label 'Campañas'", () => {
  assert.equal(DIFFUSION_GUIDES.campaign.label, "Campañas");
});
test("Eventos presente con label 'Eventos'", () => {
  assert.equal(DIFFUSION_GUIDES.event.label, "Eventos");
});
test("Inscripciones presente con label 'Inscripciones'", () => {
  assert.equal(DIFFUSION_GUIDES.registration.label, "Inscripciones");
});

// ---------- 6. INSCRIPCIONES V1 — ya es un producto real: available=true,
// mismo tratamiento funcional que Campañas/Eventos (sección 31 del
// mandato INSCRIPCIONES V1: actualizar EXCLUSIVAMENTE esta guía para
// dejar de decir "Próximamente") ----------
test("Inscripciones: available=true, tagline 'Guía de difusión', ejemplo copiable funcional", () => {
  const reg = DIFFUSION_GUIDES.registration;
  assert.equal(reg.available, true);
  assert.equal(reg.tagline, "Guía de difusión");
  assert.ok(reg.example, "debe tener un ejemplo real y copiable, igual que Campañas/Eventos");
  assert.ok(Array.isArray(reg.doList) && reg.doList.length > 0);
});

test("difusion.jsx: el selector muestra la etiqueta 'Próximamente' junto a Inscripciones", () => {
  assert.match(pageSrc, /Próximamente/);
});

test("difusion.jsx: ExampleBlock no renderiza el botón 'Copiar ejemplo' cuando copyable=false (Inscripciones)", () => {
  assert.match(pageSrc, /copyable\s*\?/);
  assert.match(pageSrc, /copyable=\{guide\.available\}/);
});

test("difusion.jsx: no hay ruta ni componente nuevo DE DIFUSIÓN dedicado a Inscripciones — sigue siendo la misma /difusion (src/pages/inscripciones.jsx es la landing del producto Inscripciones, no una ruta de Difusión)", () => {
  assert.ok(!fs.existsSync(path.join(ROOT, "src/pages/difusion")));
});

// ---------- 7/11. cada producto implementado tiene ejemplo propio y distinto ----------
test("Rifas, Campañas y Eventos tienen ejemplos de texto distintos entre sí", () => {
  const examples = [DIFFUSION_GUIDES.raffle.example, DIFFUSION_GUIDES.campaign.example, DIFFUSION_GUIDES.event.example];
  assert.equal(new Set(examples).size, 3, "los 3 ejemplos deben ser textos distintos");
});

test("cada guía muestra contenido introductorio/recomendaciones distinto (no texto compartido copiado literal)", () => {
  const raffleText = JSON.stringify(DIFFUSION_GUIDES.raffle);
  const campaignText = JSON.stringify(DIFFUSION_GUIDES.campaign);
  const eventText = JSON.stringify(DIFFUSION_GUIDES.event);
  assert.notEqual(raffleText, campaignText);
  assert.notEqual(campaignText, eventText);
  assert.notEqual(raffleText, eventText);
});

// ---------- 8. Rifas: precauciones especiales ----------
test("Rifas: tagline 'Precauciones especiales', explica orgánico vs pagado y que cambiar palabras no cambia la política", () => {
  const raffle = DIFFUSION_GUIDES.raffle;
  assert.equal(raffle.tagline, "Precauciones especiales");
  const all = JSON.stringify(raffle);
  assert.match(all, /org[aá]nica.*pagado|pagado.*org[aá]nica/i);
  assert.match(all, /Cambiar palabras no convierte una actividad restringida/);
  assert.match(all, /revisar políticas vigentes|Revisa siempre las políticas vigentes/i);
});

test("Rifas: no enseña bypass, evasión, engaño de algoritmo, cloaking ni sustitución deliberada", () => {
  const all = JSON.stringify(DIFFUSION_GUIDES.raffle).toLowerCase() + pageSrc.toLowerCase();
  for (const forbidden of ["bypass", "evasi[oó]n", "enga[ñn]ar al algoritmo", "cloaking", "sustituci[oó]n deliberada"]) {
    assert.doesNotMatch(all, new RegExp(forbidden));
  }
});

// ---------- 9. Campañas: recomendaciones específicas ----------
test("Campañas: recomienda explicar motivo, identificar organizador, describir uso de aportes, evitar garantías/dinero fácil", () => {
  const all = JSON.stringify(DIFFUSION_GUIDES.campaign);
  assert.match(all, /motivo de la campaña/);
  assert.match(all, /Identifica al organizador/);
  assert.match(all, /para qué se utilizarán los aportes/);
  assert.match(all, /garantías de resultados/);
  assert.match(all, /dinero fácil/);
});

// ---------- 10. Eventos: guía de difusión ----------
test("Eventos: tagline 'Guía de difusión', no promete aprobación de plataformas, cubre fecha/hora/lugar/entradas", () => {
  const event = DIFFUSION_GUIDES.event;
  assert.equal(event.tagline, "Guía de difusión");
  const all = JSON.stringify(event);
  for (const term of ["Fecha.", "Hora.", "Lugar.", "Disponibilidad de entradas."]) {
    assert.match(all, new RegExp(term.replace(".", "\\.")));
  }
  for (const forbidden of ["permitido por Meta", "garantizado", "sin riesgo"]) {
    assert.doesNotMatch(all, new RegExp(forbidden, "i"));
  }
});

// ---------- 12. botón Copiar ejemplo corresponde al texto activo de cada guía ----------
test("difusion.jsx: el botón Copiar ejemplo copia guide.example de la guía activa (vía ExampleBlock, prop text)", () => {
  assert.match(pageSrc, /navigator\.clipboard\.writeText\(text\)/);
  assert.match(pageSrc, /text=\{guide\.example\}/);
  assert.match(pageSrc, /const guide = DIFFUSION_GUIDES\[active\]/);
});

// ---------- 13-15. cero APIs sociales, cero Warp AI, cero generación automática ----------
test("difusion.jsx / difusionGuides.js: cero APIs sociales, cero Warp AI/IA, cero generación automática de contenido", () => {
  const combined = (pageSrc + guidesSrc).toLowerCase();
  const forbidden = [
    "openai",
    "warp",
    "gpt",
    "oauth",
    "graph.facebook",
    "graph\\.instagram",
    "tiktok.*api",
    "generatecopy",
    "auto.?generat",
    "scheduler",
    "analytics",
  ];
  for (const term of forbidden) {
    assert.doesNotMatch(combined, new RegExp(term));
  }
});

// ---------- 16-17. sin rutas nuevas por producto, sin backend nuevo ----------
test("sin rutas nuevas por producto (una sola página /difusion) y sin API nueva", () => {
  for (const bad of [
    "src/pages/difusion-rifas.jsx",
    "src/pages/difusion-campanas.jsx",
    "src/pages/difusion-eventos.jsx",
    "src/pages/difusion-inscripciones.jsx",
    "src/pages/api/difusion",
    "src/pages/api/difusion.js",
  ]) {
    assert.ok(!fs.existsSync(path.join(ROOT, bad)), `no debe existir: ${bad}`);
  }
});

// ---------- selector UX: no navega, no pierde sesión ----------
test("difusion.jsx: el selector cambia estado local (useState), nunca navega a otra página", () => {
  assert.match(pageSrc, /useState\('event'\)/);
  assert.match(pageSrc, /onClick=\{\(\) => setActive\(p\.key\)\}/);
  assert.doesNotMatch(pageSrc, /router\.push|router\.replace|window\.location/);
});

// ---------- nota común de publicidad ----------
test("DIFFUSION_COMMON_AD_NOTE: bloque común presente y renderizado", () => {
  assert.match(DIFFUSION_COMMON_AD_NOTE, /Las políticas de las plataformas pueden cambiar/);
  assert.match(pageSrc, /DIFFUSION_COMMON_AD_NOTE/);
});

// ---------- metadata sigue neutral (sin cambios respecto a V1) ----------
test("difusion.jsx: metadata (title/description) exacta, sin palabras sensibles, robots noindex/nofollow/noarchive intactos", () => {
  assert.match(pageSrc, /title="Difusión — Rifex"/);
  assert.match(
    pageSrc,
    /description="Guía para compartir tus iniciativas de Rifex en redes sociales de forma clara y responsable\."/
  );
  assert.match(pageSrc, /noindex/);
  assert.match(pageSrc, /noarchive/);
  const layoutPropsBlock = pageSrc.match(/Difusion\.getLayout[\s\S]*$/)[0];
  for (const w of ["rifa", "rifas", "sorteo", "sorteos", "premio", "premios", "azar"]) {
    assert.doesNotMatch(layoutPropsBlock.split("noindex")[0], new RegExp(`\\b${w}\\b`, "i"));
  }
});

// ---------- boundary PSCG sin cambios (verificación puntual, no duplica pscg.test.mjs) ----------
test("difusion.jsx: getServerSideProps sigue siendo ssr_redirect, sin cambios respecto a V1", () => {
  assert.match(pageSrc, /export async function getServerSideProps/);
  assert.match(pageSrc, /getSupabaseServer/);
  assert.match(pageSrc, /redirect:\s*\{\s*destination:\s*'\/login\?next=\/difusion'/);
});

// RIFEX HOME HERO 2026 — certifica el reemplazo del Hero de Home por
// los assets aprobados (desktop/mobile, composiciones deliberadamente
// distintas), selección responsive real vía <picture>/<source> (nunca
// JS decidiendo el breakpoint), ausencia de los CTA antiguos y de
// texto HTML duplicado del mensaje ya contenido en el asset, y que el
// resto de Home (Navbar, trust strip, capacidades — Eventos/Campañas/
// Inscripciones/Medidor QR) siga intacto. Misión puramente visual —
// no se tocó SEO/PSCG/sitemap/robots (verificado también acá).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PSCG_CATEGORY, findPscgEntry } from '../src/lib/publicSurfaceClassification.js';

const ROOT = path.join(process.cwd());
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

const HOME_SRC = read('src/pages/index.js');
const HOME_CSS = read('src/styles/index.module.css');

test('1. ambos assets del Hero existen en public/images/hero/ (PNG + WebP), nombres exactos ya definidos por el usuario', () => {
  for (const name of ['hero-rifex-desktop.png', 'hero-rifex-desktop.webp', 'hero-rifex-mobile.png', 'hero-rifex-mobile.webp']) {
    assert.ok(exists(`public/images/hero/${name}`), `falta public/images/hero/${name}`);
  }
});

test('2. el asset hero anterior (rifex-hero-events.png) fue retirado — no queda huérfano', () => {
  assert.equal(exists('public/images/hero/rifex-hero-events.png'), false);
  assert.doesNotMatch(HOME_SRC, /rifex-hero-events/);
});

test('3. Home usa <picture> con selección responsive real — dos <source> mobile (webp+png) acotados a max-width:1023px, un <source> desktop sin media (fallback), nunca JS decidiendo el breakpoint', () => {
  assert.match(HOME_SRC, /<picture>/);
  assert.match(HOME_SRC, /source media="\(max-width: 1023px\)" type="image\/webp" srcSet="\/images\/hero\/hero-rifex-mobile\.webp"/);
  assert.match(HOME_SRC, /source media="\(max-width: 1023px\)" type="image\/png" srcSet="\/images\/hero\/hero-rifex-mobile\.png"/);
  assert.match(HOME_SRC, /source type="image\/webp" srcSet="\/images\/hero\/hero-rifex-desktop\.webp"/);
  assert.match(HOME_SRC, /src="\/images\/hero\/hero-rifex-desktop\.png"/);
  // Nunca un breakpoint decidido en JS (matchMedia/userAgent/window.innerWidth
  // condicionando qué <img>/<source> se renderiza) — la selección es 100%
  // nativa del navegador vía el atributo media de <source>.
  assert.doesNotMatch(HOME_SRC, /matchMedia|userAgent|innerWidth/);
});

test('4. el <img> de fallback declara width/height (previene layout shift) y fetchpriority="high" en minúsculas (atributo HTML real, no la prop camelCase de React)', () => {
  assert.match(HOME_SRC, /width=\{941\}/);
  assert.match(HOME_SRC, /height=\{1672\}/);
  assert.match(HOME_SRC, /fetchpriority="high"/);
  assert.doesNotMatch(HOME_SRC, /fetchPriority=/);
});

test('5. alt text funcional presente (no vacío, no un párrafo entero) describiendo el asset real', () => {
  const m = HOME_SRC.match(/alt="([^"]+)"/);
  assert.ok(m, 'debe existir un alt no vacío en el <img> del Hero');
  assert.ok(m[1].length > 20 && m[1].length < 220, 'alt debe ser descriptivo pero no un párrafo entero');
  assert.match(m[1], /Rifex/);
});

test('6. h1 real presente para estructura semántica/SEO, visualmente oculto (sr-only) — nunca duplicado visible en pantalla', () => {
  assert.match(HOME_SRC, /<h1 className=\{styles\.srOnly\}>/);
  assert.match(HOME_CSS, /\.srOnly\s*\{/);
  assert.match(HOME_CSS, /clip: rect\(0, 0, 0, 0\)/);
});

test('7. decisión de producto FINAL: el Hero no lleva CTAs — "Crear un evento"/"Crear una campaña" retirados, junto con las clases CSS que ya no se usan', () => {
  assert.doesNotMatch(HOME_SRC, /Crear un evento/);
  assert.doesNotMatch(HOME_SRC, /Crear una campaña/);
  assert.doesNotMatch(HOME_SRC, /styles\.ctaPrimary|styles\.ctaSecondary|styles\.heroCtas/);
  assert.doesNotMatch(HOME_CSS, /\.ctaPrimary|\.ctaSecondary|\.heroCtas/);
});

test('8. el mensaje de marca ("Recauda. Vende entradas...") no se duplica como texto HTML visible — el asset ya lo incluye visualmente; solo vive en el h1 sr-only', () => {
  const visibleTextBlocks = HOME_SRC.match(/<p className=\{styles\.heroSub\}>[\s\S]*?<\/p>/);
  assert.equal(visibleTextBlocks, null, 'no debe existir un párrafo visible duplicando el mensaje del Hero');
});

test('9. breakout deliberado fuera de max-width:1200px (`.container`) para aprovechar el ancho — mismo patrón ya certificado en VISUAL-LOCK (rifaDetalle.module.css)', () => {
  assert.match(HOME_CSS, /\.heroPictureWrap\s*\{[\s\S]*?left:\s*50%;[\s\S]*?transform:\s*translateX\(-50%\);[\s\S]*?width:\s*95vw;/);
});

test('10. proporción del asset preservada por breakpoint (aspect-ratio en CSS, nunca object-fit:cover destruyendo contenido)', () => {
  assert.match(HOME_CSS, /aspect-ratio:\s*1672\s*\/\s*941/);
  assert.doesNotMatch(HOME_CSS, /\.heroImg[\s\S]{0,200}object-fit:\s*cover/);
});

test('11. Navbar (Layout) intacto — Home sigue usando getLayout con <Layout>, nunca reemplazado', () => {
  assert.match(HOME_SRC, /Home\.getLayout = function getLayout\(page\) \{/);
  assert.match(HOME_SRC, /<Layout\s/);
});

test('12. trust strip y capacidades (Eventos/Campañas/Inscripciones/Medidor QR) siguen presentes, sin tocar', () => {
  assert.match(HOME_SRC, /TRUST_ITEMS\.map/);
  assert.match(HOME_SRC, /styles\.trust\b/);
  assert.match(HOME_SRC, /medidor-qr/);
});

test('13. SEO/PSCG de Home sin cambios: PUBLIC_INDEXABLE, sitemap, robots, title/description/canonical, JSON-LD Organization+WebSite', () => {
  const entry = findPscgEntry('/');
  assert.equal(entry.category, PSCG_CATEGORY.PUBLIC_INDEXABLE);
  assert.match(read('public/sitemap.xml'), /<loc>https:\/\/rifex\.pro\/<\/loc>/);
  assert.doesNotMatch(read('public/robots.txt'), /Disallow: \/$/m);
  assert.match(HOME_SRC, /title="Rifex — Eventos, entradas y recaudación en línea"/);
  assert.match(HOME_SRC, /canonicalPath="\/"/);
  assert.match(HOME_SRC, /ld-organization/);
  assert.match(HOME_SRC, /ld-website/);
  assert.doesNotMatch(HOME_SRC, /noindex/);
});

test('14. DEV banner es infraestructura de _app.js, nunca del asset ni de este archivo — no se tocó', () => {
  const appSrc = read('src/pages/_app.js');
  assert.match(appSrc, /DevBanner|entorno de desarrollo/i);
  assert.doesNotMatch(HOME_SRC, /entorno de desarrollo/i);
});

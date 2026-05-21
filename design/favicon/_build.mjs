/**
 * One-shot build script for RoutineForge favicon assets.
 *
 * Inputs:
 *   - design/favicon/favicon.svg            (single-color, currentColor)
 *
 * Outputs:
 *   - design/favicon/favicon.ico            (16,32,48 — PNG-embedded ICO)
 *   - design/favicon/apple-touch-icon.png   (180x180, dark ground, light mark)
 *   - design/favicon/icon-192.png           (192x192, dark ground, maskable-safe)
 *   - design/favicon/icon-512.png           (512x512, dark ground, maskable-safe)
 *
 * Renderer: Playwright Chromium (already on disk via pnpm-installed playwright).
 * ICO: PNG-embedded format (Vista+). Microsoft documents this and every modern
 *      browser (incl. Edge/Chrome/Firefox/Safari) supports PNG-in-ICO. We embed
 *      three PNG entries (16, 32, 48) inside one .ico container.
 *
 * Run with:
 *   node design/favicon/_build.mjs
 */

// Pnpm hides packages in .pnpm/<name>@<version>/node_modules/<name>; resolve
// playwright from there via createRequire since playwright is CJS.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const playwrightPath = require.resolve('playwright', {
  paths: ['C:\\Users\\Sina\\Documents\\profProjects\\routineForge\\node_modules\\.pnpm\\playwright@1.60.0\\node_modules'],
});
const { chromium } = require(playwrightPath);
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SVG_PATH = path.join(HERE, 'favicon.svg');

// Graphite dark palette (matches design/tokens.css [data-palette="graphite"][data-theme="dark"]).
const SURFACE = '#101012';   // --c-surface-base, graphite dark
const INK = '#E8E8EA';       // light tint of the same neutral; reads quietly, not "purple AI brand"

/**
 * Render the SVG at a given pixel size, on a SOLID ground, with the mark in INK.
 * Returns a Buffer containing PNG bytes.
 *
 * `maskableSafe`: when true, the mark is shrunk to 80% (the maskable safe-zone),
 * with the remaining 10% on every side filled with surface color. Required for
 * PWA manifest icons so platforms (Android/iOS) can crop them to any shape
 * (circle, squircle, rounded square) without clipping the glyph.
 */
async function renderPng(browser, { size, maskableSafe, transparent = false }) {
  const svgText = await readFile(SVG_PATH, 'utf8');
  const inner = maskableSafe ? 0.8 : 0.86; // favicon.svg already has ~12% internal padding; nudge for visual centering
  const inset = ((1 - inner) / 2) * size;
  const innerSize = inner * size;

  const bg = transparent ? 'transparent' : SURFACE;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;padding:0;background:${bg};}
      .frame{width:${size}px;height:${size}px;background:${bg};display:flex;align-items:center;justify-content:center;}
      .mark{width:${innerSize}px;height:${innerSize}px;color:${INK};display:block;}
      .mark svg{width:100%;height:100%;display:block;}
    </style></head><body>
    <div class="frame"><div class="mark">${svgText}</div></div>
    </body></html>`;

  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  const buf = await page.screenshot({
    omitBackground: transparent,
    type: 'png',
    clip: { x: 0, y: 0, width: size, height: size },
  });
  await page.close();
  return buf;
}

/**
 * Build a PNG-embedded ICO from a list of PNG buffers.
 * Format (Microsoft ICO, PNG entry variant):
 *   ICONDIR (6 bytes):
 *     u16 reserved=0, u16 type=1 (ICO), u16 count
 *   ICONDIRENTRY (16 bytes) × count:
 *     u8 width  (0 means 256)
 *     u8 height (0 means 256)
 *     u8 colorCount=0
 *     u8 reserved=0
 *     u16 planes=1
 *     u16 bitCount=32
 *     u32 dataSize
 *     u32 dataOffset
 *   PNG data blobs, each at its declared offset.
 */
function buildIco(entries) {
  const count = entries.length;
  const headerSize = 6 + 16 * count;
  let offset = headerSize;
  const dirEntries = entries.map(({ size, png }) => {
    const entry = { size, png, dataSize: png.length, dataOffset: offset };
    offset += png.length;
    return entry;
  });

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);     // reserved
  header.writeUInt16LE(1, 2);     // type = icon
  header.writeUInt16LE(count, 4); // image count

  for (let i = 0; i < count; i++) {
    const e = dirEntries[i];
    const off = 6 + 16 * i;
    header.writeUInt8(e.size >= 256 ? 0 : e.size, off + 0); // width
    header.writeUInt8(e.size >= 256 ? 0 : e.size, off + 1); // height
    header.writeUInt8(0, off + 2);  // color palette
    header.writeUInt8(0, off + 3);  // reserved
    header.writeUInt16LE(1, off + 4);  // color planes
    header.writeUInt16LE(32, off + 6); // bits per pixel
    header.writeUInt32LE(e.dataSize, off + 8);
    header.writeUInt32LE(e.dataOffset, off + 12);
  }
  return Buffer.concat([header, ...dirEntries.map((e) => e.png)]);
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  // ICO sources: SOLID graphite ground at the actual ICO sizes. Rationale:
  // the favicon must read as part of the same family as the apple-touch +
  // maskable PWA icons (all solid graphite ground). A transparent favicon
  // composited onto a light tab strip would erase the dark-ground identity
  // we built the rest of the family around. The dark "badge" approach is
  // consistent with Linear, Vercel, Things — restrained brands that own
  // their ground color instead of yielding it to the OS chrome.
  //
  // The mark stays full-bleed (no safe-zone) so the stroke reads as large
  // as possible at 16px — favicons don't get masked into circles, so the
  // safe-zone math only applies to icon-192/icon-512.
  const ico16 = await renderPng(browser, { size: 16, transparent: false, maskableSafe: false });
  const ico32 = await renderPng(browser, { size: 32, transparent: false, maskableSafe: false });
  const ico48 = await renderPng(browser, { size: 48, transparent: false, maskableSafe: false });
  const ico = buildIco([
    { size: 16, png: ico16 },
    { size: 32, png: ico32 },
    { size: 48, png: ico48 },
  ]);
  await writeFile(path.join(HERE, 'favicon.ico'), ico);

  // Apple touch icon: solid graphite ground, no pre-rounded corners (iOS
  // applies its own rounding). The mark is slightly inset for visual breathing
  // room but NOT shrunk to the maskable 80% — iOS doesn't crop circularly.
  const apple = await renderPng(browser, { size: 180, transparent: false, maskableSafe: false });
  await writeFile(path.join(HERE, 'apple-touch-icon.png'), apple);

  // PWA manifest icons: maskable-safe (mark within 80%, surface filling the
  // outer 10% ring on every side so circular/squircle crops don't clip it).
  const icon192 = await renderPng(browser, { size: 192, transparent: false, maskableSafe: true });
  await writeFile(path.join(HERE, 'icon-192.png'), icon192);
  const icon512 = await renderPng(browser, { size: 512, transparent: false, maskableSafe: true });
  await writeFile(path.join(HERE, 'icon-512.png'), icon512);

  await browser.close();

  // Report sizes for sanity.
  const report = [
    ['favicon.ico',        ico.length],
    ['apple-touch-icon.png', apple.length],
    ['icon-192.png',       icon192.length],
    ['icon-512.png',       icon512.length],
  ];
  for (const [name, bytes] of report) {
    console.log(`${name.padEnd(24)} ${String(bytes).padStart(8)} bytes`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

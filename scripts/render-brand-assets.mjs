// Rasterize the SVG brand sources in resources/ to the binaries the packagers
// consume:
//
//   npm run render:brand
//
//   logo.svg              -> icon.png            (1024, macOS/Win/Linux app icon)
//   logo.svg              -> tray.png            (32, Windows notification area)
//   installer-sidebar.svg -> installerSidebar.bmp (164x314, NSIS welcome panel)
//   installer-header.svg  -> installerHeader.bmp  (150x57,  NSIS inner header)
//
// Run this after editing any of those SVGs. The binaries are what actually
// ship, so leaving them stale silently reverts the artwork (the same trap the
// DMG backdrop documents). The DMG backdrop has its own renderer,
// scripts/render-dmg-background.mjs.
//
// Rendering goes through the Electron already in devDependencies — no added
// rasterizer (docs/standards.md rule 2), same engine that draws the UI. BMP is encoded
// inline (24-bit, bottom-up) because NSIS needs BMP and there is no dependency
// that would produce one. If this exits with "Cannot read properties of
// undefined (reading 'whenReady')", ELECTRON_RUN_AS_NODE=1 is set — run
// `env -u ELECTRON_RUN_AS_NODE npm run render:brand`.
import { readFileSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { createRequire } from 'module'
import { fileURLToPath, pathToFileURL } from 'url'
import { dirname, join } from 'path'

const { app, BrowserWindow } = createRequire(import.meta.url)('electron')
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const res = (f) => join(root, 'resources', f)

const JOBS = [
  { src: 'logo.svg', w: 1024, h: 1024, out: 'icon.png', format: 'png' },
  // Windows notification area. Rendered at 32 — the shell downscales to 16 at
  // 100% DPI and uses it as-is above that — rather than letting it shrink the
  // 1024 app icon, which turns a monoline mark to mush.
  { src: 'logo.svg', w: 32, h: 32, out: 'tray.png', format: 'png' },
  { src: 'installer-sidebar.svg', w: 164, h: 314, out: 'installerSidebar.bmp', format: 'bmp' },
  { src: 'installer-header.svg', w: 150, h: 57, out: 'installerHeader.bmp', format: 'bmp' }
]

// A 24-bit BGR, bottom-up BMP from Electron's top-down BGRA bitmap buffer.
function encodeBmp(bgra, w, h) {
  const rowSize = (w * 3 + 3) & ~3
  const pad = rowSize - w * 3
  const pixels = rowSize * h
  const buf = Buffer.alloc(54 + pixels)
  buf.write('BM', 0)
  buf.writeUInt32LE(54 + pixels, 2)
  buf.writeUInt32LE(54, 10)
  buf.writeUInt32LE(40, 14)
  buf.writeInt32LE(w, 18)
  buf.writeInt32LE(h, 22)
  buf.writeUInt16LE(1, 26)
  buf.writeUInt16LE(24, 28)
  buf.writeUInt32LE(pixels, 34)
  buf.writeInt32LE(2835, 38)
  buf.writeInt32LE(2835, 42)
  let off = 54
  for (let sy = h - 1; sy >= 0; sy--) {
    for (let x = 0; x < w; x++) {
      const si = (sy * w + x) * 4
      buf[off++] = bgra[si]
      buf[off++] = bgra[si + 1]
      buf[off++] = bgra[si + 2]
    }
    for (let p = 0; p < pad; p++) buf[off++] = 0
  }
  return buf
}

async function render(win, { src, w, h, out, format }) {
  // The source SVG carries its own intrinsic width/height; override them so it
  // scales to the target (icon.png is 1024 from a 256 master). Loaded from a
  // file:// URL — a data: URL is treated as an image document Chromium aborts
  // before capturePage can read it, and a comment in the XML prolog fails the
  // same loader, so strip comments too.
  const svg = readFileSync(res(src), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/(<svg\b[^>]*?)\swidth="[^"]*"/, `$1 width="${w}"`)
    .replace(/(<svg\b[^>]*?)\sheight="[^"]*"/, `$1 height="${h}"`)
  const tmp = join(tmpdir(), `diffbro-brand-${process.pid}-${out}.svg`)
  writeFileSync(tmp, svg)
  try {
    win.setContentSize(w, h)
    await win.loadURL(pathToFileURL(tmp).href)
    await new Promise((r) => setTimeout(r, 450))
    let image = await win.webContents.capturePage({ x: 0, y: 0, width: w, height: h })
    if (image.getSize().width !== w) image = image.resize({ width: w, height: h, quality: 'best' })
    writeFileSync(res(out), format === 'bmp' ? encodeBmp(image.toBitmap(), w, h) : image.toPNG())
    process.stdout.write(`wrote resources/${out} (${w}x${h})\n`)
  } finally {
    rmSync(tmp, { force: true })
  }
}

app.whenReady().then(async () => {
  // One reusable offscreen window: creating a second one in the same process
  // after destroying the first tears down the offscreen surface and the next
  // load fails, so resize this one per job instead.
  const win = new BrowserWindow({
    width: 1024,
    height: 1024,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: { javascript: false, offscreen: true }
  })
  try {
    for (const job of JOBS) await render(win, job)
  } catch (e) {
    console.error(e)
    process.exitCode = 1
  }
  win.destroy()
  app.quit()
})

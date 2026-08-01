// Rasterize resources/dmg-background.svg to the PNGs electron-builder feeds
// Finder as the DMG backdrop.
//
//   npm run render:dmg-bg
//
// Run this after every edit to the SVG. The PNGs are what actually ships, so
// leaving them stale silently reverts the artwork — that is exactly how a dark
// backdrop survived a rewrite of the SVG to a light one.
//
// If this exits with "Cannot read properties of undefined (reading 'whenReady')",
// something in the environment has set ELECTRON_RUN_AS_NODE=1, which makes the
// Electron binary behave as plain Node (require('electron') then returns a path
// string). Run `env -u ELECTRON_RUN_AS_NODE npm run render:dmg-bg`.
//
// Rendering goes through the Electron already in devDependencies rather than a
// new rasterizer: no added dependency (docs/standards.md rule 2), and it is the same
// engine that draws the app, so the SVG renders identically to the UI. Loaded
// from a file:// URL with JavaScript disabled and no network access.
import { writeFileSync } from 'fs'
import { createRequire } from 'module'
import { fileURLToPath, pathToFileURL } from 'url'
import { dirname, join } from 'path'

// Electron's entry point is CommonJS and exposes no named ESM exports, so the
// bindings have to come through require() even in an .mjs file.
const { app, BrowserWindow } = createRequire(import.meta.url)('electron')

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svg = join(root, 'resources', 'dmg-background.svg')

// Must match the SVG's canvas, not electron-builder.yml's window size: the
// window is deliberately smaller than the artwork (see the SVG's header).
const WIDTH = 1600
const HEIGHT = 1000

// One render, two outputs. A 2x-sized offscreen window (3200x2000) crashes the
// renderer, and `force-device-scale-factor` does not reach offscreen surfaces,
// so the artwork is rasterized once at its natural CSS size and both PNGs are
// derived from that capture at exact dimensions. On a Retina host the capture
// already arrives at 2x, which makes background.png a supersampled downscale.
async function capture() {
  const win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    show: false,
    frame: false,
    // Transparent would let the page's white base blend with the desktop;
    // the SVG paints its own opaque white, so an opaque window is correct.
    backgroundColor: '#ffffff',
    webPreferences: { javascript: false, offscreen: true },
  })
  await win.loadURL(pathToFileURL(svg).href)
  // capturePage() races the first paint on an offscreen window.
  await new Promise((resolve) => setTimeout(resolve, 400))
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: WIDTH, height: HEIGHT })
  win.destroy()
  const size = image.getSize()
  if (size.width < WIDTH * 2) {
    process.stderr.write(
      `warning: captured ${size.width}x${size.height} on a non-Retina display; ` +
        `background@2x.png will be upscaled. Re-render on a Retina Mac.\n`
    )
  }
  return image
}

function write(image, scale, out) {
  const target = { width: WIDTH * scale, height: HEIGHT * scale }
  const size = image.getSize()
  const final =
    size.width === target.width && size.height === target.height
      ? image
      : image.resize({ ...target, quality: 'best' })
  const got = final.getSize()
  if (got.width !== target.width || got.height !== target.height) {
    throw new Error(`expected ${target.width}x${target.height}, got ${got.width}x${got.height}`)
  }
  // Synchronous on purpose: Electron tears the process down as soon as the
  // last window is gone, and an in-flight async write loses the race — it left
  // background@2x.png truncated to 0 bytes.
  writeFileSync(out, final.toPNG())
  process.stderr.write(`Wrote ${out} (${got.width}x${got.height})\n`)
}

app.whenReady().then(async () => {
  try {
    const image = await capture()
    write(image, 1, join(root, 'resources', 'background.png'))
    write(image, 2, join(root, 'resources', 'background@2x.png'))
    app.exit(0)
  } catch (err) {
    process.stderr.write(`${err.stack ?? err.message}\n`)
    app.exit(1)
  }
})

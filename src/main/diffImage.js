import { BrowserWindow, clipboard, dialog, ipcMain, nativeImage, screen } from 'electron'
import { writeFile } from 'fs/promises'
import { normalizeCaptureRect, pngDimensions, previewSize, safeImageName } from './captureRect'
import { stitchBitmaps } from './stitchBitmap'

// Diff images are a real screenshot of the app's own diff view, not a redrawn
// look-alike: capturePage photographs the composited page, so the picture always
// carries the active theme, the split panes and Monaco's syntax highlighting,
// and can never drift from what the user is looking at.
//
// A diff taller than the pane takes more than one shot — capturePage only sees
// what is composited — so the renderer scrolls a viewport at a time and each
// strip lands here as raw BGRA rows, joined when it says it is done.
//
// The captured bitmap stays HERE. The renderer gets a data URL for the preview
// and then asks main to copy or save "the last capture" by name — image bytes
// never travel back across the IPC boundary to be re-decoded.
let slices = []
let lastCapture = null

// A screenshot of a HiDPI window has a device-scale representation; asking for
// scaleFactor 1 would hand back the downscaled copy and throw the detail away.
function displayScaleFor(win) {
  try {
    return screen.getDisplayNearestPoint(win.getBounds()).scaleFactor || 1
  } catch {
    return 1
  }
}

// One shot, kept as raw rows. Sizing is deliberately NOT taken from getSize(),
// whose DIP-vs-device meaning differs by platform — getting it wrong does not
// fail, it shears every row of the stitched picture diagonally. The captured
// area times the display scale is exact, and the bitmap's own length proves it;
// only if that disagrees is it worth encoding a PNG to ask.
function sliceDims(data, area, scaleFactor, image) {
  const width = Math.round(area.width * scaleFactor)
  const height = Math.round(area.height * scaleFactor)
  if (data.length === width * height * 4) return { width, height }
  const measured = pngDimensions(image.toPNG({ scaleFactor }))
  return measured && data.length === measured.width * measured.height * 4 ? measured : null
}

async function shoot(win, rect) {
  const [width, height] = win.getContentSize()
  const area = normalizeCaptureRect(rect, { width, height })
  if (!area) return null
  const image = await win.webContents.capturePage(area)
  if (image.isEmpty()) return null
  const scaleFactor = displayScaleFor(win)
  const data = image.toBitmap({ scaleFactor })
  const dims = sliceDims(data, area, scaleFactor, image)
  return dims ? { data, ...dims } : null
}

function finalize(scaleFactor) {
  const merged = stitchBitmaps(slices)
  slices = []
  if (!merged) return { error: 'empty' }
  const { width, height } = merged
  const image = nativeImage.createFromBitmap(merged.data, { width, height, scaleFactor })
  // Encoding the full-resolution PNG is the single most expensive step here and
  // most exports are only ever copied, so it waits until something asks to save.
  // The size is the bitmap's own — no encode needed to know what was captured.
  lastCapture = { image, scaleFactor }
  // Only the preview shrinks: a tall export must not push megabytes of base64
  // through IPC for detail the dialog is far too small to show. Copy and save
  // still work from the full-resolution capture.
  const small = previewSize({ width, height })
  const preview = small ? image.resize({ ...small, quality: 'good' }) : image
  return { dataUrl: preview.toDataURL(small ? {} : { scaleFactor }), width, height }
}

async function addSlice(win, rect, reset) {
  if (reset) slices = []
  const slice = await shoot(win, rect)
  if (!slice) return { error: 'bad-rect' }
  slices.push(slice)
  return { ok: true }
}

export function registerDiffImageIpc() {
  // Starts a fresh picture: one shot, finished immediately — the whole export
  // for any diff that fits its pane.
  ipcMain.handle('image:capture', async (e, rect) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return { error: 'no-window' }
    const added = await addSlice(win, rect, true)
    return added.error ? added : finalize(displayScaleFor(win))
  })

  // Scroll-and-stitch: strips of a tall diff, then the join. `reset` marks the
  // top strip, so an abandoned run can never prepend itself to the next one.
  ipcMain.handle('image:appendSlice', async (e, rect, reset) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return { error: 'no-window' }
    return addSlice(win, rect, !!reset)
  })

  ipcMain.handle('image:stitch', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return { error: 'no-window' }
    return finalize(displayScaleFor(win))
  })

  ipcMain.handle('image:copy', () => {
    if (!lastCapture) return { ok: false, error: 'nothing-captured' }
    clipboard.writeImage(lastCapture.image)
    return { ok: true }
  })

  ipcMain.handle('image:save', async (e, name) => {
    if (!lastCapture) return { ok: false, error: 'nothing-captured' }
    const win = BrowserWindow.fromWebContents(e.sender)
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Export diff as image',
      defaultPath: `${safeImageName(name)}.png`,
      filters: [{ name: 'PNG image', extensions: ['png'] }]
    })
    if (canceled || !filePath) return { canceled: true }
    await writeFile(filePath, lastCapture.image.toPNG({ scaleFactor: lastCapture.scaleFactor }))
    return { ok: true, path: filePath }
  })

  // The preview is closed: drop the bitmap rather than holding a picture of the
  // user's data in main for the rest of the session.
  ipcMain.handle('image:forget', () => {
    lastCapture = null
    slices = []
    return { ok: true }
  })
}

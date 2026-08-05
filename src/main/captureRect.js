// The renderer asks main to photograph a region of its own page, so the rect is
// untrusted input (rule 6): a hostile or buggy renderer must not be able to make
// capturePage read outside the window, allocate an absurd bitmap, or crash on a
// NaN. Pure, so the refusals are unit-tested without Electron.

// A capture below this is not a diff; above it is not shareable either.
export const MIN_CAPTURE_SIDE = 32
export const MAX_CAPTURE_SIDE = 8192

const int = (n) => Math.round(n)
const isFiniteNumber = (n) => typeof n === 'number' && Number.isFinite(n)

/**
 * Clamp a renderer-supplied rect into the window's content area.
 * @param {unknown} rect      { x, y, width, height } in CSS pixels
 * @param {{ width: number, height: number }} bounds  the page's content size
 * @returns {{ x: number, y: number, width: number, height: number } | null}
 */
export function normalizeCaptureRect(rect, bounds) {
  if (!rect || typeof rect !== 'object') return null
  const { x, y, width, height } = rect
  if (![x, y, width, height].every(isFiniteNumber)) return null
  if (!isFiniteNumber(bounds?.width) || !isFiniteNumber(bounds?.height)) return null

  const left = Math.min(Math.max(int(x), 0), int(bounds.width))
  const top = Math.min(Math.max(int(y), 0), int(bounds.height))
  const w = Math.min(int(width), int(bounds.width) - left, MAX_CAPTURE_SIDE)
  const h = Math.min(int(height), int(bounds.height) - top, MAX_CAPTURE_SIDE)
  if (w < MIN_CAPTURE_SIDE || h < MIN_CAPTURE_SIDE) return null
  return { x: left, y: top, width: w, height: h }
}

// IHDR is the first chunk of every PNG: 8-byte signature, 4-byte length,
// 'IHDR', then width and height as big-endian uint32.
const IHDR_WIDTH_OFFSET = 16

/**
 * The true pixel size of encoded PNG bytes. Read from the file rather than from
 * NativeImage.getSize(), whose DIP-vs-device meaning differs by platform — the
 * exported image must report the dimensions it actually has.
 * @param {Buffer} buffer
 * @returns {{ width: number, height: number } | null}
 */
export function pngDimensions(buffer) {
  if (!buffer || buffer.length < IHDR_WIDTH_OFFSET + 8) return null
  if (buffer.toString('ascii', 12, 16) !== 'IHDR') return null
  return {
    width: buffer.readUInt32BE(IHDR_WIDTH_OFFSET),
    height: buffer.readUInt32BE(IHDR_WIDTH_OFFSET + 4)
  }
}

// The preview in the dialog is displayed a few hundred CSS pixels wide, so a
// tall export's full-resolution data URL is megabytes of base64 crossing IPC to
// show detail no one can see. The copied/saved PNG is unaffected — only the
// preview shrinks.
export const MAX_PREVIEW_HEIGHT = 4096

/**
 * The size to render the preview at, or null when the capture is already small
 * enough to send as-is. Aspect ratio is preserved so the preview cannot distort.
 * @param {{ width: number, height: number }} size  the capture, in device pixels
 * @param {number} [max]
 * @returns {{ width: number, height: number } | null}
 */
export function previewSize({ width, height }, max = MAX_PREVIEW_HEIGHT) {
  if (!(width > 0) || !(height > 0) || height <= max) return null
  return { width: Math.max(1, Math.round((width * max) / height)), height: max }
}

/**
 * A filename base that cannot escape the directory the user picked.
 * @param {unknown} name
 * @returns {string}
 */
export function safeImageName(name) {
  const flat = String(name ?? '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/^\.+/, '')
    .trim()
  return flat.slice(0, 80) || 'diff'
}

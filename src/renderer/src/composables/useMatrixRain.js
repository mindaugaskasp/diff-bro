import { onBeforeUnmount, onMounted } from 'vue'

// Canvas "digital rain" for the Matrix theme. One glyph per cell as each column's
// head steps down at its own speed; a translucent overlay fades the trail in
// place. No katakana (those tofu on fonts that lack them).
const GLYPHS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ<>*+=/#'
const rnd = (n) => Math.floor(Math.random() * n)
const glyph = () => GLYPHS[rnd(GLYPHS.length)]

function hexToRgba(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return `rgba(2,10,4,${a})`
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

/**
 * @param {import('vue').Ref<HTMLCanvasElement|null>} canvas
 * @param {{ fill: boolean }} props
 */
export function useMatrixRain(canvas, props) {
  const FONT = props.fill ? 16 : 11
  let ctx = null
  let raf = null
  let ro = null
  let last = 0
  let cols = 0
  let w = 0
  let h = 0
  let ys = []
  let speeds = []
  let lastCell = []
  let headGlyph = []
  let green = '#00ff41'
  let bright = '#c6ffd2'
  let fade = 'rgba(2,10,4,0.05)'

  function palette() {
    const s = getComputedStyle(document.documentElement)
    green = s.getPropertyValue('--accent').trim() || green
    bright = s.getPropertyValue('--text').trim() || bright
    // Lower alpha = the trail lingers longer before fading to black.
    fade = hexToRgba(s.getPropertyValue('--bg'), 0.035)
  }

  function resize() {
    const parent = canvas.value.parentElement
    const dpr = window.devicePixelRatio || 1
    w = parent.clientWidth
    h = parent.clientHeight
    canvas.value.width = Math.max(1, Math.round(w * dpr))
    canvas.value.height = Math.max(1, Math.round(h * dpr))
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.font = `${FONT}px Menlo, Consolas, monospace`
    ctx.textBaseline = 'top'
    const next = Math.max(1, Math.ceil(w / FONT))
    if (next === cols) return
    cols = next
    ys = Array.from({ length: cols }, () => rnd(Math.ceil(h / FONT) + 1))
    speeds = Array.from({ length: cols }, () => 4 + Math.random() * 7)
    lastCell = Array.from({ length: cols }, () => -1)
    headGlyph = Array.from({ length: cols }, () => '')
  }

  function step(t) {
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 0
    last = t
    ctx.fillStyle = fade
    ctx.fillRect(0, 0, w, h)
    const rows = Math.ceil(h / FONT)
    for (let i = 0; i < cols; i++) {
      ys[i] += speeds[i] * dt
      const cell = Math.floor(ys[i])
      if (cell === lastCell[i]) continue
      // The old head drops back to green; the new head is the bright leader.
      if (lastCell[i] >= 0) {
        ctx.fillStyle = green
        ctx.fillText(headGlyph[i], i * FONT, lastCell[i] * FONT)
      }
      lastCell[i] = cell
      headGlyph[i] = glyph()
      ctx.fillStyle = bright
      ctx.fillText(headGlyph[i], i * FONT, cell * FONT)
      // Wrap well above the top so the column stays dark for a beat before the
      // next stream falls in — that gap keeps the field from filling to a wall.
      if (cell > rows && Math.random() > 0.9) ys[i] = -rnd(rows * 3)
    }
    raf = requestAnimationFrame(step)
  }

  function drawStatic() {
    ctx.fillStyle = fade.replace(/[\d.]+\)$/, '1)')
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = green
    for (let i = 0; i < cols; i++)
      for (let y = 0; y < h; y += FONT) if (Math.random() < 0.5) ctx.fillText(glyph(), i * FONT, y)
  }

  onMounted(() => {
    ctx = canvas.value.getContext('2d')
    palette()
    resize()
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    ro = new ResizeObserver(() => {
      resize()
      if (reduce) drawStatic()
    })
    ro.observe(canvas.value.parentElement)
    if (reduce) drawStatic()
    else raf = requestAnimationFrame(step)
  })
  onBeforeUnmount(() => {
    cancelAnimationFrame(raf)
    ro?.disconnect()
  })
}

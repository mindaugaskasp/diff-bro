// The three globals a launched app reaches that `--user-data-dir` does NOT
// cover. Sharing one corrupts silently rather than erroring:
//
//   DISPLAY — one X11 clipboard per display; 22 specs read it back.
//   TMPDIR  — sweepStage() (src/main/clipboardStage.js) deletes every
//             diffbro-clipboard-* dir in app.getPath('temp') on launch.
//   HOME    — the CLI shim installs to ~/.local/bin and refuses to clobber.
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

// The one place the worker count is written. Everything else — the display
// pool, compose, CI — reads E2E_WORKERS or falls back to this.
export const DEFAULT_WORKERS = 4

// Not TEST_WORKER_INDEX: that grows all run and would outrun a fixed display pool.
export const workerIndex = () => Number(process.env.TEST_PARALLEL_INDEX ?? 0)

// Above :99, which the container's interactive dev app and noVNC own.
export const BASE_DISPLAY = 100

const socketFor = (display) => `/tmp/.X11-unix/X${display.slice(1)}`

/**
 * This worker's display, falling back to the ambient one only single-worker
 * (`xvfb-run`, a developer's desktop). Missing otherwise it THROWS — falling
 * back puts two workers on one clipboard, which fails silently and elsewhere.
 * @param {number} [index]
 * @returns {string}
 */
export function displayFor(index = workerIndex()) {
  const wanted = `:${BASE_DISPLAY + index}`
  if (existsSync(socketFor(wanted))) return wanted
  const ambient = process.env.DISPLAY
  if (index === 0 && ambient) return ambient
  throw new Error(
    `E2E worker ${index} has no display at ${wanted}. ` +
      `Run scripts/e2e-displays.sh (the container entrypoint does) or set E2E_WORKERS=1.`
  )
}

// Scratch belongs to the PROFILE, not the worker: a relaunch of the same
// userDataDir must find the files it staged (copy-as-file proves the launch
// sweep that way), and the fixture's rmSync then takes all of it with the
// profile instead of leaving per-worker dirs to accumulate and leak between
// the tests that worker goes on to run.
const scratchIn = (userDataDir) => {
  const dirs = { TMPDIR: join(userDataDir, 'tmp'), HOME: join(userDataDir, 'home') }
  for (const dir of Object.values(dirs)) mkdirSync(dir, { recursive: true })
  return dirs
}

export const isX11 = process.platform === 'linux'

/**
 * The environment a launched app runs in. Spreads the ambient env so
 * Playwright's own plumbing (PATH, NODE_*) survives.
 * @param {string} userDataDir
 * @returns {Record<string, string>}
 */
export function workerEnv(userDataDir) {
  const env = { ...process.env, ...scratchIn(userDataDir) }
  // DISPLAY is X11's. The macOS-only specs run natively (see docs/standards.md)
  // where there is no socket to point at — and no way to give a worker its own
  // clipboard either, so a second one there would collide in silence.
  if (!isX11) {
    if (workerIndex() > 0) {
      throw new Error('parallel E2E needs X11; run this platform with E2E_WORKERS=1')
    }
    return env
  }
  return { ...env, DISPLAY: displayFor() }
}

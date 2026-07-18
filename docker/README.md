# Testing DiffBro in Docker

Runs the **real Electron app** (main process, preload, renderer, IPC — the
works) inside a Linux container on a virtual display, streamed to your
browser via noVNC. No NSIS/DMG build, no installer, nothing touches the
host beyond Docker itself.

## Usage

```bash
npm run docker:up        # or: docker compose up --build
```

Then open **http://localhost:6080/vnc.html** and click *Connect*.

- The source tree is bind-mounted into the container and runs under
  `electron-vite dev`, so edits on the host hot-reload inside the container.
- Sample files to diff live in `testdata/` → `/app/testdata` in the
  container (use *File → Open Left/Right* or the toolbar slots; drag & drop
  from the host doesn't cross the VNC boundary).
- Stop with `Ctrl+C` or `npm run docker:down`.

## Notes

- `node_modules` and `build` are container-local named volumes so the Linux
  Electron binaries never mix with the Windows/macOS ones on the host.
  After changing dependencies in `package.json`, refresh them with:
  `docker compose down -v && docker compose up --build`
- The container runs Chromium with `--no-sandbox` (required as root in a
  container) and software rendering. That's fine for functional testing but
  is **not** representative for performance measurements.
- The offline kill switch is active in the container exactly as on the
  desktop; only the local Vite dev server is allowed through (dev mode).
- Some keyboard shortcuts (Ctrl+1/Ctrl+2 = browser tab switch, Ctrl+T = new
  tab) are captured by *your* browser before they reach noVNC — use the
  app's File menu for those actions when testing through the browser.
- What this does *not* test: native window chrome, OS file dialogs of the
  host platform, host drag & drop, installer behavior. Those still need a
  real `npm run dev` / packaged build on the target OS.

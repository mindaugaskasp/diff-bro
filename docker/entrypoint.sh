#!/bin/bash
# Boots a virtual display, exposes it via noVNC on :6080, then starts the
# Electron app in dev mode (with HMR against the mounted source tree).
set -e

export DISPLAY=:99
export DIFFBRO_DOCKER=1
# Electron refuses to run its SUID sandbox as root inside the container.
export ELECTRON_DISABLE_SANDBOX=1

SCREEN_SIZE="${SCREEN_SIZE:-1400x900x24}"

# A stale lock from a previous run (container restart) would kill Xvfb.
rm -f /tmp/.X99-lock /tmp/.X11-unix/X99

echo "Starting Xvfb on $DISPLAY (${SCREEN_SIZE})..."
Xvfb "$DISPLAY" -screen 0 "$SCREEN_SIZE" -nolisten tcp &

# Wait for the X server socket to appear
for i in $(seq 1 50); do
  [ -S /tmp/.X11-unix/X99 ] && break
  sleep 0.2
done

# Minimal window manager: without one, X assigns no keyboard focus and
# typing / menu accelerators never reach the app.
openbox &

# One more display per E2E worker, :100 up, so parallel workers never share the
# (per-display) X11 clipboard. :99 above stays the interactive one.
bash /app/scripts/e2e-displays.sh

# Chromium probes both dbus buses on startup and, finding neither, logs a wall
# of errors that read like fatal failures but are not. Starting them is purely
# cosmetic — it keeps the log readable so real problems stand out.
mkdir -p /run/dbus
rm -f /run/dbus/pid
dbus-daemon --system --fork
eval "$(dbus-launch --sh-syntax)"

echo "Starting x11vnc..."
# -noxdamage: under Xvfb the X DAMAGE extension reports incomplete regions for
# fast-moving content (e.g. the Nyan lane), leaving ghost trails in the noVNC
# view. Full-screen polling costs a little CPU but repaints cleanly. Purely a
# test-view fix — the shipped app never runs under VNC.
x11vnc -display "$DISPLAY" -nopw -forever -shared -quiet -noxdamage -listen localhost &

echo "Starting noVNC on http://localhost:6080/vnc.html ..."
websockify --web=/usr/share/novnc 6080 localhost:5900 &

echo ""
echo "============================================================"
echo "  DiffBro is starting."
echo "  Open http://localhost:6080/vnc.html in your browser."
echo "  Test files from ./tests/data are available at /app/tests/data."
echo "============================================================"
echo ""

# --watch: also restart Electron when main/preload sources change
# (renderer HMR works either way)
exec npm run dev -- --watch

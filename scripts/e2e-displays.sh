#!/bin/bash
# One Xvfb display per E2E worker, :100 upward — the X11 clipboard is
# per-display, so sharing one has workers reading each other's copies. :99 stays
# the interactive session (noVNC, screenshots, theme-sweep).
#
# Run by docker/entrypoint.sh, `make e2e` and CI. Idempotent.
# Usage: e2e-displays.sh [worker-count]   (default $E2E_WORKERS, else 4)
set -e

E2E_WORKERS="${1:-${E2E_WORKERS:-4}}"
SCREEN_SIZE="${SCREEN_SIZE:-1400x900x24}"

start_display() {
  local num="$1"
  [ -S "/tmp/.X11-unix/X${num}" ] && return 0
  # A stale lock from a previous run (container restart) would kill Xvfb.
  rm -f "/tmp/.X${num}-lock"
  Xvfb ":${num}" -screen 0 "$SCREEN_SIZE" -nolisten tcp &
  local ready=
  for _ in $(seq 1 50); do
    if [ -S "/tmp/.X11-unix/X${num}" ]; then
      ready=1
      break
    fi
    sleep 0.2
  done
  [ -n "$ready" ] || { echo "Xvfb :${num} did not come up" >&2; return 1; }
  # Without a WM, X assigns no keyboard focus. Optional — CI has no openbox.
  command -v openbox >/dev/null 2>&1 && DISPLAY=":${num}" openbox &
  return 0
}

for i in $(seq 1 "$E2E_WORKERS"); do
  start_display "$((99 + i))"
done

echo "E2E displays ready: :100..:$((99 + E2E_WORKERS)) (${E2E_WORKERS} worker(s))"

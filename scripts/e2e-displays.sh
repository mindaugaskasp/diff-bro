#!/bin/bash
# One Xvfb display per E2E worker, :100 upward — the X11 clipboard is
# per-display, so sharing one has workers reading each other's copies. :99 stays
# the interactive session (noVNC, screenshots, theme-sweep).
#
# Run by docker/entrypoint.sh, `make e2e` and CI. Idempotent.
# Usage: e2e-displays.sh [worker-count]   (default $E2E_WORKERS, else DEFAULT_WORKERS)
set -e

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Read from the module Playwright reads, so the pool cannot be sized differently
# from the workers that need it.
default_workers() {
  node --input-type=module -e \
    "import('file://$HERE/../e2e/workerEnv.mjs').then((m) => process.stdout.write(String(m.DEFAULT_WORKERS)))"
}

E2E_WORKERS="${1:-${E2E_WORKERS:-$(default_workers)}}"
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
  # Not cosmetic: unmanaged, the window takes a different width and the diff
  # panes split unevenly. Both the container and CI install openbox.
  command -v openbox >/dev/null 2>&1 && DISPLAY=":${num}" openbox &
  return 0
}

for i in $(seq 1 "$E2E_WORKERS"); do
  start_display "$((99 + i))"
done

echo "E2E displays ready: :100..:$((99 + E2E_WORKERS)) (${E2E_WORKERS} worker(s))"

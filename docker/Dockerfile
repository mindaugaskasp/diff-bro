# Two targets, both driven from docker-compose.yml:
#   dev       — runs the real Electron app (main + preload + renderer) headlessly
#               under Xvfb, exposed in the browser via noVNC. Any host arch.
#   packaging — adds wine so electron-builder can produce the Windows installer.
#               amd64 only; see docker/README.md.
# Neither service may rely on the default (last) stage — both set `target:`.
FROM node:20-bookworm-slim AS dev

ENV DEBIAN_FRONTEND=noninteractive

# Electron runtime libraries + virtual display + VNC/noVNC stack
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Electron / Chromium runtime deps
    libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 libatspi2.0-0 \
    libdrm2 libgbm1 libasound2 libx11-xcb1 libxcb-dri3-0 libsecret-1-0 \
    ca-certificates fonts-liberation \
    # Headless display + browser access; openbox provides window focus,
    # without it keyboard input never reaches the Electron window
    xvfb x11vnc novnc websockify openbox \
    # Session + system bus; without them Chromium floods the log with dbus
    # errors. dbus-x11 provides dbus-launch, dbus the system bus config
    # (dbus-x11 alone leaves /usr/share/dbus-1/system.conf missing).
    dbus dbus-x11 \
    # In-container test tooling: synthetic input + screenshots
    xdotool scrot \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Match the host's npm major version: npm 10 and 11 disagree about which
# optional/platform packages belong in package-lock.json, and a lock written
# by one fails `npm ci` under the other. One resolver everywhere.
RUN npm install -g npm@11

# Install dependencies at image-build time so the node_modules volume that
# shadows the host's (Windows) node_modules starts out populated with the
# Linux Electron binaries.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 6080

ENTRYPOINT ["/bin/bash", "docker/entrypoint.sh"]

# electron-builder shells out to wine to stamp the icon and version resources
# into the .exe (rcedit) — without it the NSIS build dies with
# "wine process failed ENOENT". Debian ships wine for amd64 only, which is why
# this lives in its own stage and the builder service pins linux/amd64.
FROM dev AS packaging

# wine32 (and therefore the i386 architecture) is not optional: the last NSIS
# step runs the freshly built installer under wine to generate the uninstaller,
# and that binary is 32-bit — with wine64 alone it fails on a missing
# syswow64\ntdll.dll after the .exe has already been produced.
RUN dpkg --add-architecture i386 \
    && apt-get update && apt-get install -y --no-install-recommends \
    wine wine64 wine32:i386 \
    && rm -rf /var/lib/apt/lists/*

# Keep wine's first-run prefix creation out of the build log and off the
# critical path of every packaging run.
ENV WINEDEBUG=-all
ENV WINEPREFIX=/root/.wine
RUN wineboot --init 2>/dev/null || true

# Runs the real Electron app (main + preload + renderer) headlessly under
# Xvfb and exposes it in the browser via noVNC — no installer build needed.
# See docker/README.md for usage.
FROM node:20-bookworm-slim

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
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies at image-build time so the node_modules volume that
# shadows the host's (Windows) node_modules starts out populated with the
# Linux Electron binaries.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 6080

ENTRYPOINT ["/bin/bash", "docker/entrypoint.sh"]

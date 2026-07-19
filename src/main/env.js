// Set only by `npm run dev` (electron-vite). Its presence is what distinguishes
// dev from a packaged build, and both the network kill switch and the
// will-navigate block key off it — so it lives in one place rather than being
// re-read from the environment in each module.
export const DEV_URL = process.env['ELECTRON_RENDERER_URL']

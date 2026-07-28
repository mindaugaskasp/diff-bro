import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

// Bundles land in build/ (electron-vite's default would be out/).
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { outDir: 'build/main' }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { outDir: 'build/preload' }
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src')
      }
    },
    plugins: [vue()],
    build: {
      outDir: 'build/renderer',
      // Two renderer entries: the main app and the floating quick look-up
      // launcher (its own hardened BrowserWindow — see src/main/quickLook.js).
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          quicklook: resolve('src/renderer/quicklook.html')
        }
      }
    }
  }
})

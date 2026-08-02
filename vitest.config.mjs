import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // jsdom gives the store tests localStorage/document; the crypto tests
    // only need Node and run fine under it too.
    environment: 'jsdom',
    // localStorage needs a non-opaque origin in jsdom
    environmentOptions: { jsdom: { url: 'http://localhost/' } },
    setupFiles: ['tests/setup.js'],
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'text'],
      // Only the logic that can be tested without an Electron runtime or a
      // mounted component: the main-process cores, the stores, and the pure
      // renderer helpers. Glue (index.js, window.js, menus) and .vue files are
      // verified in the Docker env instead — see docs/standards.md.
      // The bar, set just under what the suite currently reaches. It is a
      // ratchet, not a target: raise it when coverage rises, never lower it to
      // make a red run green.
      thresholds: {
        statements: 93,
        branches: 86,
        functions: 92,
        lines: 95
      },
      include: [
        'src/main/sealing.js',
        'src/main/shareCore.js',
        'src/main/dataFiles.js',
        'src/main/snippetSealing.js',
        'src/main/vaultCrypt.js',
        'src/main/textCrypt.js',
        'src/main/kdf.js',
        'src/main/configBackup.js',
        'src/main/issueUrl.js',
        'src/main/logFormat.js',
        'src/main/logRedact.js',
        'src/main/captureRect.js',
        'src/main/autoBackup.js',
        'src/main/gitTool.js',
        'src/main/hashing.js',
        'src/main/stitchBitmap.js',
        'src/main/lineIndexCore.js',
        'src/main/lineIndex.js',
        'src/main/hashDiff.js',
        'src/main/streamWindow.js',
        'src/main/xlsx/**',
        'src/renderer/src/stores/**',
        'src/renderer/src/utils/**',
        'src/renderer/src/adapters/**'
      ]
    }
  }
})

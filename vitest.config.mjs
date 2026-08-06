import { defineConfig } from 'vitest/config'
// A feature slice's index.js is its whole surface, components included, so a
// test importing the slice pulls a .vue in. Renderer .vue files stay outside
// the coverage set — this only lets them parse.
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { 'monaco-editor': new URL('tests/stubs/monaco-editor.js', import.meta.url).pathname }
  },
  test: {
    // jsdom gives the store tests localStorage/document; the crypto tests
    // only need Node and run fine under it too.
    environment: 'jsdom',
    // localStorage needs a non-opaque origin in jsdom
    environmentOptions: { jsdom: { url: 'http://localhost/' } },
    setupFiles: ['tests/setup.js'],
    include: ['tests/**/*.test.js'],
    // A HANG detector, not a performance budget — which is why it is generous.
    // The Windows runner is roughly 7x slower than a dev machine on these
    // jsdom-heavy tests, and ~40 of them sit over 300ms locally (the slowest at
    // ~1s), so vitest's 5s default put about eight of them over the line at
    // once. Which one tripped was luck; v0.4.11 lost a release build to it.
    // Raise this rather than sprinkling per-test timeouts: the number is about
    // the slowest PLATFORM, not about any one test.
    testTimeout: 20_000,
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
      //
      // NOT yet widened to the nine tested main modules outside this set
      // (shareExport, trustedKeys, quickLookCore, cliShim, backupZip,
      // fileFilters, appData, files, cli): adding them drops the aggregate to
      // 93.6/86.6/94.4/94.5, and buying that would mean LOWERING the lines
      // floor, which this ratchet forbids. They need tests of their own first —
      // then they join the set and the floors go up again.
      thresholds: {
        statements: 94,
        branches: 87,
        functions: 95,
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
        'src/main/linkPolicy.js',
        'src/main/mailAddress.js',
        'src/main/mailto.js',
        'src/main/clipboardWrite.js',
        'src/main/clipboardStage.js',
        'src/main/clipboardFiles.js',
        'src/main/demoContent.js',
        'src/main/xlsx/**',
        'src/shared/**',
        'src/renderer/src/stores/**',
        // A slice's store is shipped logic like any other; without this line
        // moving one out of stores/ would raise coverage by measuring less.
        'src/renderer/src/features/**/*.js',
        'src/renderer/src/utils/**',
        'src/renderer/src/adapters/**'
      ]
    }
  }
})

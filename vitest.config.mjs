import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // jsdom gives the store tests localStorage/document; the crypto tests
    // only need Node and run fine under it too.
    environment: 'jsdom',
    // localStorage needs a non-opaque origin in jsdom
    environmentOptions: { jsdom: { url: 'http://localhost/' } },
    setupFiles: ['tests/setup.js'],
    include: ['tests/**/*.test.js']
  }
})

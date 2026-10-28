import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.render\.mjs$/,
  workers: 1,
  timeout: 300_000,
  expect: { timeout: 8_000 },
  reporter: [['list']]
})

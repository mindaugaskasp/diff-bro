import { test, expect } from './fixtures.mjs'

// The launch smoke test: proves the built main + preload + renderer actually
// boot together and paint. If window.api (preload) failed to bridge, the
// renderer dies on mount and the empty-state text below never appears — so this
// one assertion also guards the IPC surface being present.
test('boots to the empty-state diff view in a single window', async ({ app, page }) => {
  expect(app.windows()).toHaveLength(1)
  // The window title carries the installed version (window.api.appVersion),
  // so this also proves the sync version bridge resolved.
  await expect(page).toHaveTitle(/^Diff Bro v\d+\.\d+\.\d+/)
  await expect(page.getByText('Choose or drop two files to compare.')).toBeVisible()
  // The snippets shelf renders, which only happens once the preload-backed
  // stores have hydrated.
  await expect(page.getByRole('button', { name: 'New snippet' })).toBeVisible()
})

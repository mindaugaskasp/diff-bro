import { expect } from '@playwright/test'

/**
 * Click into a dialog's Monaco editor and wait until it really holds focus.
 *
 * `webContents.paste()` delivers to whatever is focused AT THAT MOMENT, so a
 * paste issued while Monaco is still wiring up lands nowhere and the editor
 * stays empty — an intermittent that failed `snippet-image.spec.mjs` on CI
 * three times and blocked a release twice. Monaco's real input is a hidden
 * `textarea.inputarea`; waiting for it is the only signal that a paste will
 * arrive.
 *
 * Not used by `compare-snippets.spec.mjs`, which pastes the same way: that test
 * already carries two 15s waits inside a 30s budget, and the extra round trip
 * tipped it over on CI. It has never been seen flaking — reach for this there
 * only alongside a budget its steps actually fit in.
 */
export async function focusEditor(dialog) {
  await dialog.locator('.editor').click()
  await expect(dialog.locator('.monaco-editor textarea.inputarea').first()).toBeFocused()
}

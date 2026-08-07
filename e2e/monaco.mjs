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
 */
export async function focusEditor(dialog) {
  await dialog.locator('.editor').click()
  await expect(dialog.locator('.monaco-editor textarea.inputarea').first()).toBeFocused()
}

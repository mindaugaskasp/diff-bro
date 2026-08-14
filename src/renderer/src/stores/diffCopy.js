import { diffPatchFile } from '../utils/copyAsFile'
import { copyableSide } from '../utils/sideText'
import { STREAMED_LIMITS } from '../utils/streamedLimits'
import { t } from '../i18n'

// Everything that puts the comparison on the clipboard. Its own module because
// the store is at its size cap. Clipboard writes go through main —
// navigator.clipboard is denied here by the permission handler.

// The builder returns a sentinel for the streamed case so it need not carry the
// store's own wording for a limit the store already owns.
const patchError = (reason) => (reason === 'streamed' ? t(STREAMED_LIMITS.copy) : reason)

export const copyActions = {
  // Recompute a clean git-style patch (Monaco's on-screen diff isn't one).
  async copyDiff() {
    const file = diffPatchFile(this)
    if (file.error) return this.showNotice(patchError(file.error))
    const out = await window.api.copyText(file.content)
    this.showNotice(
      out?.ok ? t('diffNotices.unifiedDiffCopiedToClipboard') : t('diffNotices.couldNotCopyTheDiff')
    )
  },
  // The twin: a real .patch file on the clipboard, for a destination that
  // wants a file rather than characters.
  async copyDiffAsFile() {
    const file = diffPatchFile(this)
    if (file.error) return this.showNotice(patchError(file.error))
    const out = await window.api.copyAsFile(file.name, file.content)
    this.showNotice(
      out?.ok
        ? t('diffNotices.copiedAsFile', { name: out.name })
        : t('diffNotices.couldNotCopyThatAs')
    )
  },
  /**
   * One side, verbatim — not the patch. Declines silently when that side has no
   * text to give: the slot hides its copy control in the same case, so reaching
   * here means a shortcut or menu fired against a spreadsheet or a streamed
   * file, and a notice about an action nothing offered would be noise.
   * @param {'left'|'right'} side
   */
  async copySide(side) {
    const file = copyableSide(this, side)
    if (!file) return
    const out = await window.api.copyText(file.content)
    this.showNotice(
      out?.ok
        ? t('diffNotices.sideCopied', { name: file.name })
        : t('diffNotices.couldNotCopyTheSide')
    )
  }
}

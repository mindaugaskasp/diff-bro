// Whether this platform can carry a file on the clipboard, and the copy itself.
//
// The capability is asked once per session and shared: a command that silently
// does nothing is worse than one that is not offered, so every caller hides its
// control when this is false rather than failing at the click.
import { ref } from 'vue'
import { useDiffStore } from '../stores/diffStore'

const supported = ref(true)
let asked = false

export function useCopyAsFile() {
  if (!asked) {
    asked = true
    Promise.resolve(window.api?.canCopyAsFile?.())
      .then((ok) => (supported.value = ok !== false))
      .catch(() => (supported.value = false))
  }

  /**
   * @param {{ name: string, content: string } | { error: string }} file
   * @returns {Promise<boolean>} whether it landed
   */
  async function copyFile(file) {
    const diff = useDiffStore()
    if (file.error) {
      diff.showNotice(file.error)
      return false
    }
    const out = await window.api.copyAsFile(file.name, file.content)
    diff.showNotice(
      out?.ok
        ? `${out.name} copied as a file — paste it where you need it.`
        : 'Could not copy that as a file.'
    )
    return out?.ok === true
  }

  return { supported, copyFile }
}

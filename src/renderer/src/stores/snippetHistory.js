// Version actions, spread into snippetStore — its own module because the store
// file sits at its size ratchet, the way snippetTags.js is.
import { entryAad } from '../utils/snippetState'

export const historyActions = {
  /**
   * Decrypt one historical version. A tampered version returns null and KEEPS
   * the entry — unlike load(), which drops an undecryptable current box — so a
   * corrupt memory never costs the living snippet.
   * @param {string} id
   * @param {number} index  position in entry.history
   * @returns {Promise<string|null>}
   */
  async loadVersion(id, index) {
    const entry = this.entries.find((e) => e.id === id)
    const box = entry?.history?.[index]
    if (!box) return null
    const content = await window.api.vaultDecrypt(
      { iv: box.iv, data: box.data },
      entryAad(entry.id, entry.aadSalt, entry.createdAt)
    )
    if (content && typeof content === 'object' && content.error) {
      this.keyError = content.error
      return null
    }
    return content
  }
}

// The tag registry's actions, spread into snippetStore. Its own module because
// tags are a concern of their own and the store they live in is at its cap.
// `deleteTag` stays behind: it sweeps the vault too, and importing vaultStore
// from here would close a new cycle through snippetStore.
import { MAX_TAGS, TAG_PALETTE, cleanTag, dropTag, nextRank } from '../utils/snippetState'
import { useUiStore } from './uiStore'

// Also from the sidebar filter, which would otherwise hide rows behind a tag with no chip left.
export function forgetTag(name, ...entryLists) {
  for (const entries of entryLists) dropTag(entries, name)
  const ui = useUiStore()
  ui.sidebarTags = ui.sidebarTags.filter((tag) => tag !== name)
}

export const tagActions = {
  touchTag(name) {
    const tag = this.tags[cleanTag(name)]
    if (tag) {
      tag.rank = nextRank(this.tags)
      this.persist()
    }
  },
  recolorTag(name, color) {
    const tag = this.tags[cleanTag(name)]
    if (tag && TAG_PALETTE.includes(color)) {
      tag.color = color
      this.persist()
    }
  },
  renameTag(oldName, newName) {
    const o = cleanTag(oldName)
    const n = cleanTag(newName)
    if (!this.tags[o] || !n || o === n) return
    if (!this.tags[n]) this.tags[n] = { color: this.tags[o].color, rank: nextRank(this.tags) }
    delete this.tags[o]
    for (const e of this.entries) {
      const i = e.tags.indexOf(o)
      if (i > -1) {
        e.tags.splice(i, 1)
        if (!e.tags.includes(n) && e.tags.length < MAX_TAGS) e.tags.push(n)
      }
    }
    this.persist()
  }
}

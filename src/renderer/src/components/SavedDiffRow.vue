<script setup>
// One saved-diff row. Two lines, led by a type monogram (like a snippet): name
// + lifetime on top, format · sender · tag beneath. Imported rows add the sender
// and a trusted-sender mark — every stored external diff was signature-verified
// against a trusted key at import (openSealed rejects any other), so it's honest.
import { computed } from 'vue'
import { useVaultStore } from '../stores/vaultStore'
import { useDiffStore } from '../stores/diffStore'
import { useSnippetStore } from '../stores/snippetStore'
import { useDataDir } from '../composables/useDataDir'
import { languageMonogram, isMappedLanguage } from '../utils/languageMonogram'
import { shaped } from '../utils/props'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  /** @type {import('vue').PropType<import('../types').VaultEntry>} */
  entry: { type: Object, required: true, validator: shaped('id', 'name', 'expiresAt', 'from') }
})

const vault = useVaultStore()
const diff = useDiffStore()
const snippets = useSnippetStore()
const dataDir = useDataDir()

const SOON_MS = 15 * 60_000
// Prefer the explicit format; fall back to a format-shaped tag so diffs saved
// before the field existed still show a real monogram instead of TXT.
const formatKey = computed(
  () => props.entry.format || (props.entry.tags || []).find(isMappedLanguage) || null
)
const mono = computed(() => languageMonogram(formatKey.value))
// Drop tags that restate other signals: the format (the monogram) and the local
// "imported" auto-tag (the External section already says so).
const shownTags = computed(() =>
  (props.entry.tags || []).filter((t) => t !== formatKey.value && t !== 'imported')
)
const tagColor = (t) => snippets.colorOf(t) || 'var(--text-dim)'

const title = computed(() => {
  const from = props.entry.from ? ` (from ${props.entry.from})` : ''
  const loc = dataDir.value ? `\nSaved in ${dataDir.value}` : ''
  return `Open "${props.entry.name}"${from}${loc}`
})

// Live lifetime (vault.now ticks each second): kept, a countdown warming to
// "soon" in the last stretch, then expired.
const state = computed(() => {
  if (props.entry.expiresAt === null) return { cls: 'kept', text: '' }
  const ms = props.entry.expiresAt - vault.now
  if (ms <= 0) return { cls: 'expired', text: 'expired' }
  const h = Math.floor(ms / 3600_000)
  const m = Math.floor((ms % 3600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  const text = h > 0 ? `${h}h ${m}m left` : m > 0 ? `${m}m ${s}s left` : `${s}s left`
  return { cls: ms <= SOON_MS ? 'soon' : 'left', text }
})

async function open() {
  const payload = await vault.load(props.entry.id)
  if (payload) diff.restore(payload)
  else diff.showNotice('This saved diff has expired or could not be decrypted.')
}
</script>

<template>
  <li class="diff" :class="{ favorite: entry.favorite, external: entry.from }">
    <button
      class="star"
      :class="{ on: entry.favorite }"
      :data-tip="entry.favorite ? 'Unfavorite' : 'Favorite'"
      :aria-label="entry.favorite ? 'Unfavorite' : 'Favorite (pin to top)'"
      @click="vault.toggleFavorite(entry.id)"
    >
      <AppIcon :name="entry.favorite ? 'star-filled' : 'star'" />
    </button>

    <button class="stack" :title="title" @click="open">
      <span class="monogram" :style="{ '--fam': mono.family }" :title="formatKey || ''">{{
        mono.label
      }}</span>
      <span class="lines">
        <span class="l1">
          <span class="name">{{ entry.name }}</span>
          <span v-if="state.text" class="state-chip" :class="state.cls">{{ state.text }}</span>
        </span>
        <span class="l2">
          <template v-if="entry.from">
            <span class="from">from {{ entry.from }}</span>
            <span class="trust-mark" title="Verified — sealed by a trusted sender">
              <AppIcon name="shield-check" />
            </span>
          </template>
          <template v-if="shownTags.length">
            <span v-if="entry.from" class="sep">·</span>
            <span class="tag-word">
              <span class="tw-dot" :style="{ background: tagColor(shownTags[0]) }"></span>
              <span class="tw-label">{{ shownTags[0] }}</span>
              <span v-if="shownTags.length > 1" class="tw-more">+{{ shownTags.length - 1 }}</span>
            </span>
          </template>
          <span v-else-if="!entry.from" class="untagged">Untagged</span>
        </span>
      </span>
    </button>

    <span class="diffacts">
      <button
        v-if="!entry.from"
        class="row-btn"
        data-tip="Share"
        aria-label="Share as sealed file"
        @click="diff.shareEntry(entry.id)"
      >
        <AppIcon name="share" />
      </button>
      <button
        class="row-btn delete"
        data-tip="Delete"
        aria-label="Delete now"
        @click="vault.requestDelete(entry.id, entry.name)"
      >
        <AppIcon name="trash" />
      </button>
    </span>
  </li>
</template>

<style scoped src="./styles/SavedDiffRow.css"></style>

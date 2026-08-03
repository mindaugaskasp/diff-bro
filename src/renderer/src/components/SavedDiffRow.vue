<script setup>
// One saved-diff row. Two lines, led by a type monogram (like a snippet): name
// + lifetime on top, format · sender · tag beneath. Imported rows add the sender
// and a trusted-sender mark — every stored external diff was signature-verified
// against a trusted key at import (openSealed rejects any other), so it's honest.
import { computed } from 'vue'
import { useVaultStore } from '../stores/vaultStore'
import { useImageExportStore } from '../features/imageExport'
import { useDiffStore } from '../stores/diffStore'
import { useSnippetStore } from '../stores/snippetStore'
import { useTabsStore } from '../stores/tabsStore'
import { useDataDir } from '../composables/useDataDir'
import { languageMonogram } from '../utils/languageMonogram'
import { rowFormatKey, rowTags } from '../utils/diffRowTags'
import { shaped } from '../utils/props'
import AppIcon from './AppIcon.vue'
import { useShareStore } from '../features/share'

const props = defineProps({
  /** @type {import('vue').PropType<import('../types').VaultEntry>} */
  entry: { type: Object, required: true, validator: shaped('id', 'name', 'expiresAt', 'from') }
})

const vault = useVaultStore()
const share = useShareStore()
const imageExport = useImageExportStore()
const diff = useDiffStore()
const snippets = useSnippetStore()
const tabs = useTabsStore()
const dataDir = useDataDir()

const SOON_MS = 15 * 60_000
const formatKey = computed(() => rowFormatKey(props.entry))
const mono = computed(() => languageMonogram(formatKey.value))
const shownTags = computed(() => rowTags(props.entry))
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
  if (!payload) return diff.showNotice('This saved diff has expired or could not be decrypted.')
  // Its own tab, keyed by the vault id so clicking the row twice focuses the
  // one already open rather than stacking a duplicate.
  tabs.open(payload, { diffSaved: true, entryId: props.entry.id, name: props.entry.name })
}
</script>

<template>
  <li class="diff" :class="{ favorite: entry.favorite, external: entry.from }">
    <button
      class="star"
      :class="{ on: entry.favorite }"
      :data-tip="entry.favorite ? 'Remove from favorites' : 'Pin to the top of the list'"
      :aria-label="entry.favorite ? 'Unfavorite' : 'Favorite (pin to top)'"
      @click="vault.toggleFavorite(entry.id)"
    >
      <AppIcon :name="entry.favorite ? 'star-filled' : 'star'" />
    </button>

    <button class="stack" :data-tip="title" @click="open">
      <span
        class="monogram"
        :style="{ '--fam': mono.family }"
        :data-tip="formatKey ? `Format: ${formatKey}` : 'Plain text comparison'"
        >{{ mono.label }}</span
      >
      <span class="lines">
        <span class="l1">
          <span class="name">{{ entry.name }}</span>
          <span v-if="state.text" class="state-chip" :class="state.cls">{{ state.text }}</span>
        </span>
        <span class="l2">
          <template v-if="entry.from">
            <span class="from">from {{ entry.from }}</span>
            <span class="trust-mark" data-tip="Verified — the signature matched a key you trust">
              <AppIcon name="shield-check" />
            </span>
          </template>
          <template v-if="shownTags.length">
            <span v-if="entry.from" class="sep">·</span>
            <span class="tag-word" :style="{ '--tc': tagColor(shownTags[0]) }">
              <span class="tw-dot"></span>
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
        v-if="entry.format !== 'excel'"
        class="row-btn"
        data-tip="Export this diff as a picture (PNG)"
        aria-label="Export as image"
        @click="imageExport.exportImage(entry.id)"
      >
        <AppIcon name="image" />
      </button>
      <button
        class="row-btn"
        data-tip="Edit this diff's tags"
        aria-label="Edit tags"
        @click="vault.requestRetag(entry.id)"
      >
        <AppIcon name="tag" />
      </button>
      <button
        v-if="!entry.from"
        class="row-btn"
        data-tip="Seal this diff for one trusted recipient"
        aria-label="Share as sealed file"
        @click="share.shareEntry(entry.id)"
      >
        <AppIcon name="share" />
      </button>
      <button
        class="row-btn delete"
        data-tip="Delete this saved diff now"
        aria-label="Delete now"
        @click="vault.requestDelete(entry.id, entry.name)"
      >
        <AppIcon name="trash" />
      </button>
    </span>
  </li>
</template>

<style scoped src="./styles/SavedDiffRow.css"></style>

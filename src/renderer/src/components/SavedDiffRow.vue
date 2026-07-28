<script setup>
// One saved-diff row (own or imported). Imported rows carry a sender.
import { computed } from 'vue'
import { useVaultStore } from '../stores/vaultStore'
import { useDiffStore } from '../stores/diffStore'
import { useSnippetStore } from '../stores/snippetStore'
import { useDataDir } from '../composables/useDataDir'
import { shaped } from '../utils/props'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  /** @type {import('vue').PropType<import('../types').VaultEntry>} */
  entry: { type: Object, required: true, validator: shaped('id', 'name', 'expiresAt', 'from') }
})

const vault = useVaultStore()
const diff = useDiffStore()
// Tag colors come from the shared registry (snippets own the persisted palette).
const snippets = useSnippetStore()
const dataDir = useDataDir()

// Tooltip: what the entry is + where it's stored (Settings → Data folder).
const title = computed(() => {
  const from = props.entry.from ? ` (from ${props.entry.from})` : ''
  const loc = dataDir.value ? `\nSaved in ${dataDir.value}` : ''
  return `Open "${props.entry.name}"${from}${loc}`
})

// Live countdown (vault.now ticks each second); a kept diff has none.
const remaining = computed(() => {
  if (props.entry.expiresAt === null) return 'kept'
  const ms = props.entry.expiresAt - vault.now
  if (ms <= 0) return 'expired'
  const h = Math.floor(ms / 3600_000)
  const m = Math.floor((ms % 3600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  if (h > 0) return `${h}h ${m}m left`
  if (m > 0) return `${m}m ${s}s left`
  return `${s}s left`
})

async function open() {
  const payload = await vault.load(props.entry.id)
  if (payload) diff.restore(payload)
  else diff.showNotice('This saved diff has expired or could not be decrypted.')
}
</script>

<template>
  <li class="diff" :class="{ favorite: entry.favorite }">
    <button
      class="star"
      :class="{ on: entry.favorite }"
      :title="entry.favorite ? 'Unfavorite' : 'Favorite (pin to top)'"
      @click="vault.toggleFavorite(entry.id)"
    >
      <AppIcon :name="entry.favorite ? 'star-filled' : 'star'" />
    </button>
    <button class="entry" :title="title" @click="open">
      <span class="name">{{ entry.name }}</span>
      <span class="ttl">
        {{ remaining }}<template v-if="entry.from"> · from {{ entry.from }}</template>
        <span v-if="entry.tags?.length" class="tags">
          <span
            v-for="t in entry.tags"
            :key="t"
            class="tag-dot"
            :style="{ background: snippets.colorOf(t) || 'var(--text-dim)' }"
            :title="t"
          />
        </span>
      </span>
    </button>
    <button
      v-if="!entry.from"
      class="row-btn"
      title="Share as sealed file"
      @click="diff.shareEntry(entry.id)"
    >
      <AppIcon name="share" />
    </button>
    <button
      class="row-btn delete"
      title="Delete now"
      @click="vault.requestDelete(entry.id, entry.name)"
    >
      <AppIcon name="x" />
    </button>
  </li>
</template>

<style scoped src="./styles/SavedDiffRow.css"></style>

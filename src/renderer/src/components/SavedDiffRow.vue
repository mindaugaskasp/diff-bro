<script setup>
// One saved-diff row: favorite star, name + live countdown, share and delete.
// The same row serves your own diffs and imported ones — imported rows just
// carry a sender, which the tooltip mentions.
import { computed } from 'vue'
import { useVaultStore } from '../stores/vaultStore'
import { useDiffStore } from '../stores/diffStore'
import { useDataDir } from '../composables/useDataDir'
import { shaped } from '../utils/props'

const props = defineProps({
  /** @type {import('vue').PropType<import('../types').VaultEntry>} */
  entry: { type: Object, required: true, validator: shaped('id', 'name', 'expiresAt', 'from') }
})

const vault = useVaultStore()
const diff = useDiffStore()
const dataDir = useDataDir()

// Tooltip: what the entry is + where it's stored (Settings → Data folder).
const title = computed(() => {
  const from = props.entry.from ? ` (from ${props.entry.from})` : ''
  const loc = dataDir.value ? `\nSaved in ${dataDir.value}` : ''
  return `Open "${props.entry.name}"${from}${loc}`
})

// Live countdown — vault.now ticks once a second, which also purges expiries.
const remaining = computed(() => {
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
      {{ entry.favorite ? '★' : '☆' }}
    </button>
    <button class="entry" :title="title" @click="open">
      <span class="name">{{ entry.name }}</span>
      <span class="ttl"
        >{{ remaining }}<template v-if="entry.from"> · from {{ entry.from }}</template></span
      >
    </button>
    <!-- Imported diffs are the sender's to share on; only your own get the button. -->
    <button
      v-if="!entry.from"
      class="row-btn"
      title="Share as sealed file"
      @click="diff.shareEntry(entry.id)"
    >
      ↑
    </button>
    <button
      class="row-btn delete"
      title="Delete now"
      @click="vault.requestDelete('entry', entry.id, entry.name)"
    >
      ×
    </button>
  </li>
</template>

<style scoped src="./styles/SavedDiffRow.css"></style>

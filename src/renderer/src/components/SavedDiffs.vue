<script setup>
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { useVaultStore } from '../stores/vaultStore'
import { useDiffStore } from '../stores/diffStore'
import { MOD } from '../keys'

const vault = useVaultStore()
const diff = useDiffStore()

let timer = null
onMounted(() => {
  vault.tick()
  // 1 s tick: keeps the countdowns live and purges entries the moment
  // they expire.
  timer = setInterval(() => vault.tick(), 1000)
})
onBeforeUnmount(() => clearInterval(timer))

// Own saves vs. diffs imported from other machines.
const own = computed(() => vault.active.filter((e) => !e.from))
const imported = computed(() => vault.active.filter((e) => e.from))

function remaining(entry) {
  const ms = entry.expiresAt - vault.now
  if (ms <= 0) return 'expired'
  const h = Math.floor(ms / 3600_000)
  const m = Math.floor((ms % 3600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  if (h > 0) return `${h}h ${m}m left`
  if (m > 0) return `${m}m ${s}s left`
  return `${s}s left`
}

async function open(entry) {
  const payload = await vault.load(entry.id)
  if (payload) {
    diff.restore(payload)
  } else {
    diff.showNotice('This saved diff has expired or could not be decrypted.')
  }
}
</script>

<template>
  <aside class="saved">
    <div class="head">
      <span>Saved diffs</span>
      <span class="head-actions">
        <button
          class="icon"
          :title="`Import a shared diff (${MOD}+I)`"
          @click="diff.importShared()"
        >
          ⤓
        </button>
        <span class="lock" title="Encrypted at rest, auto-expiring">🔒</span>
      </span>
    </div>

    <p v-if="!own.length" class="empty">
      Nothing saved. Load two files and press <kbd>{{ MOD }}+S</kbd> to keep a diff around —
      encrypted, and gone automatically after at most 24&nbsp;hours.
    </p>

    <ul v-else>
      <li v-for="entry in own" :key="entry.id">
        <button class="entry" :title="`Open ${entry.name}`" @click="open(entry)">
          <span class="name">{{ entry.name }}</span>
          <span class="ttl">{{ remaining(entry) }}</span>
        </button>
        <button class="share" title="Share as sealed file" @click="diff.shareEntry(entry.id)">
          ⤒
        </button>
        <button class="delete" title="Delete now" @click="vault.remove(entry.id)">×</button>
      </li>
    </ul>

    <div class="head sub">
      <span>Imported diffs</span>
      <button class="icon" :title="`Import a shared diff (${MOD}+I)`" @click="diff.importShared()">
        ⤓
      </button>
    </div>
    <p v-if="!imported.length" class="empty">
      Diffs shared with you appear here. Press <kbd>{{ MOD }}+I</kbd> to open a sealed
      <code>.diffbro</code> file — it expires at the same moment as the sender's copy.
    </p>
    <ul v-else>
      <li v-for="entry in imported" :key="entry.id">
        <button
          class="entry"
          :title="`Open ${entry.name} (from ${entry.from})`"
          @click="open(entry)"
        >
          <span class="name">{{ entry.name }}</span>
          <span class="ttl">{{ remaining(entry) }} · from {{ entry.from }}</span>
        </button>
        <button class="delete" title="Delete now" @click="vault.remove(entry.id)">×</button>
      </li>
    </ul>
  </aside>
</template>

<style scoped>
.saved {
  width: 220px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  background: var(--bg-panel);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.head.sub {
  margin-top: 10px;
  border-top: 1px solid var(--border);
}
.head-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.icon {
  background: none;
  border: none;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 13px;
  padding: 0 2px;
}
.icon:hover {
  color: var(--text);
}
.empty {
  padding: 4px 10px;
  font-size: 12px;
  color: var(--text-dim);
  line-height: 1.5;
}
.empty kbd {
  font-size: 10px;
  padding: 0 3px;
  border: 1px solid var(--border);
  border-radius: 3px;
}
ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
li {
  display: flex;
  align-items: stretch;
}
.entry {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
  background: none;
  border: none;
  border-top: 1px solid var(--border);
  color: var(--text);
  padding: 6px 4px 6px 10px;
  cursor: pointer;
}
.entry:hover {
  background: var(--bg);
}
.name {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ttl {
  font-size: 11px;
  color: var(--text-hint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.empty code {
  font-size: 11px;
}
.share,
.delete {
  background: none;
  border: none;
  border-top: 1px solid var(--border);
  color: var(--text-dim);
  padding: 0 6px;
  cursor: pointer;
  font-size: 13px;
}
.share:hover {
  color: var(--accent);
}
.delete:hover {
  color: #f85149;
}
</style>

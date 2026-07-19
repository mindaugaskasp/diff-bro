<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useVaultStore } from '../stores/vaultStore'
import { useDiffStore } from '../stores/diffStore'
import SnippetsPanel from './SnippetsPanel.vue'
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

const imported = computed(() => vault.importedActive)

// Categories start expanded (diffs visible); track only the collapsed ones.
const collapsed = ref(new Set())
const addingCategory = ref(false)
const newCategoryName = ref('')

const isExpanded = (id) => !collapsed.value.has(id)
function toggle(id) {
  collapsed.value.has(id) ? collapsed.value.delete(id) : collapsed.value.add(id)
  collapsed.value = new Set(collapsed.value)
}

// Auto-expand (un-collapse) a category as soon as a diff is saved into it.
watch(
  () => vault.lastTouchedCategory,
  (id) => {
    if (id && collapsed.value.has(id)) {
      const next = new Set(collapsed.value)
      next.delete(id)
      collapsed.value = next
    }
  }
)

function startAddCategory() {
  addingCategory.value = true
  newCategoryName.value = ''
}
function commitAddCategory() {
  if (!addingCategory.value) return
  addingCategory.value = false
  if (newCategoryName.value.trim()) vault.addCategory(newCategoryName.value)
}

function deleteCategoryTitle(category) {
  if (category.isDefault) return "The Default category can't be deleted"
  if (vault.activeInCategory(category.id).length) return 'Delete or let its diffs expire first'
  return 'Delete category'
}

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
      <span class="lock" title="Encrypted at rest, auto-expiring">🔒</span>
    </div>
    <div class="head-actions">
      <button class="action" title="New category" @click="startAddCategory">+ New category</button>
    </div>

    <div v-if="addingCategory" class="add-category">
      <input
        v-model="newCategoryName"
        type="text"
        placeholder="Category name…"
        spellcheck="false"
        autofocus
        @keyup.enter="commitAddCategory"
        @keyup.escape="addingCategory = false"
        @blur="commitAddCategory"
      />
    </div>

    <p v-if="!vault.active.some((e) => !e.from)" class="empty">
      Nothing saved. Load two files and press <kbd>{{ MOD }}+S</kbd> to keep a diff around —
      encrypted, and gone automatically after at most 24&nbsp;hours.
    </p>

    <ul v-if="vault.favoritesOwn.length" class="favorites-group">
      <li class="fav-head">★ Favorites</li>
      <li v-for="entry in vault.favoritesOwn" :key="entry.id" class="diff favorite">
        <button class="star on" title="Unfavorite" @click="vault.toggleFavorite(entry.id)">
          ★
        </button>
        <button class="entry" :title="`Open ${entry.name}`" @click="open(entry)">
          <span class="name">{{ entry.name }}</span>
          <span class="ttl">{{ remaining(entry) }}</span>
        </button>
        <button class="row-btn" title="Share as sealed file" @click="diff.shareEntry(entry.id)">
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
    </ul>

    <ul class="categories">
      <li v-for="category in vault.categories" :key="category.id" class="category">
        <div class="category-head">
          <button class="cat-toggle" @click="toggle(category.id)">
            <span class="chevron" :class="{ open: isExpanded(category.id) }">▸</span>
            <span class="cat-name">{{ category.name }}</span>
            <span class="count">{{ vault.activeInCategory(category.id).length }}</span>
          </button>
          <button
            class="icon delete"
            :disabled="!vault.canDeleteCategory(category.id)"
            :title="deleteCategoryTitle(category)"
            @click="vault.requestDelete('category', category.id, category.name)"
          >
            ×
          </button>
        </div>
        <ul v-if="isExpanded(category.id)" class="diff-list">
          <li v-if="!vault.activeInCategory(category.id).length" class="empty small">
            No diffs yet.
          </li>
          <li
            v-for="entry in vault.activeInCategory(category.id)"
            :key="entry.id"
            class="diff"
            :class="{ favorite: entry.favorite }"
          >
            <button
              class="star"
              :class="{ on: entry.favorite }"
              :title="entry.favorite ? 'Unfavorite' : 'Favorite (pin to top)'"
              @click="vault.toggleFavorite(entry.id)"
            >
              {{ entry.favorite ? '★' : '☆' }}
            </button>
            <button class="entry" :title="`Open ${entry.name}`" @click="open(entry)">
              <span class="name">{{ entry.name }}</span>
              <span class="ttl">{{ remaining(entry) }}</span>
            </button>
            <button class="row-btn" title="Share as sealed file" @click="diff.shareEntry(entry.id)">
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
        </ul>
      </li>
    </ul>

    <div class="head sub">
      <span>External diffs</span>
    </div>
    <div class="head-actions">
      <button
        class="action"
        :title="`Import a shared diff (${MOD}+I)`"
        @click="diff.importShared()"
      >
        Import
      </button>
    </div>
    <p v-if="!imported.length" class="empty">
      Diffs shared by someone else appear here — each is signed by its sender and shown separately
      from your own saved diffs. Press <kbd>{{ MOD }}+I</kbd> to open a sealed
      <code>.diffbro</code> file; it expires at the same moment as the sender's copy.
    </p>
    <ul v-else>
      <li
        v-for="entry in imported"
        :key="entry.id"
        class="diff"
        :class="{ favorite: entry.favorite }"
      >
        <button
          class="star"
          :class="{ on: entry.favorite }"
          :title="entry.favorite ? 'Unfavorite' : 'Favorite (pin to top)'"
          @click="vault.toggleFavorite(entry.id)"
        >
          {{ entry.favorite ? '★' : '☆' }}
        </button>
        <button
          class="entry"
          :title="`Open ${entry.name} (from ${entry.from})`"
          @click="open(entry)"
        >
          <span class="name">{{ entry.name }}</span>
          <span class="ttl">{{ remaining(entry) }} · from {{ entry.from }}</span>
        </button>
        <button
          class="row-btn delete"
          title="Delete now"
          @click="vault.requestDelete('entry', entry.id, entry.name)"
        >
          ×
        </button>
      </li>
    </ul>

    <SnippetsPanel />
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
  gap: 5px;
  padding: 0 10px 8px;
}
.action {
  flex: 1;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 5px;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 11px;
  font-weight: 500;
  text-transform: none;
  letter-spacing: 0;
  padding: 4px 6px;
  transition:
    color 0.12s,
    border-color 0.12s,
    background 0.12s;
}
.action:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--bg-hover);
}
.add-category {
  padding: 0 10px 8px;
}
.add-category input {
  width: 100%;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  padding: 5px 8px;
  font-size: 12.5px;
}
.add-category input:focus {
  outline: none;
  border-color: var(--accent);
}
.empty {
  padding: 4px 10px;
  font-size: 12px;
  color: var(--text-dim);
  line-height: 1.5;
}
.empty.small {
  padding: 4px 10px 4px 30px;
  font-size: 11.5px;
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
.category-head {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-right: 6px;
  border-top: 1px solid var(--border);
}
.cat-toggle {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  text-align: left;
  background: none;
  border: none;
  color: var(--text);
  padding: 6px 4px 6px 10px;
  cursor: pointer;
  font-size: 13px;
}
.cat-toggle:hover {
  background: var(--bg);
}
.chevron {
  display: inline-block;
  font-size: 10px;
  color: var(--text-dim);
  transition: transform 0.1s;
}
.chevron.open {
  transform: rotate(90deg);
}
.cat-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.count {
  font-size: 11px;
  color: var(--text-hint);
}
.icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  background: none;
  border: 1px solid transparent;
  border-radius: 5px;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0;
}
.icon.delete:hover:not(:disabled) {
  color: #f85149;
  border-color: #f85149;
}
.icon:disabled {
  opacity: 0.3;
  cursor: default;
}
.favorites-group {
  list-style: none;
  margin: 0;
  padding: 0;
}
.fav-head {
  padding: 6px 10px 3px;
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #d29922;
}
.diff {
  display: flex;
  align-items: stretch;
}
.diff.favorite {
  background: color-mix(in srgb, #d29922 12%, transparent);
  box-shadow: inset 3px 0 0 #d29922;
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
.star {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 26px;
  background: none;
  border: none;
  border-top: 1px solid var(--border);
  color: var(--text-dim);
  padding: 0 6px;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
}
.star:hover {
  color: #d29922;
  background: var(--bg-hover);
}
.star.on {
  color: #d29922;
}
.row-btn {
  background: none;
  border: none;
  border-top: 1px solid var(--border);
  color: var(--text-dim);
  padding: 0 8px;
  cursor: pointer;
  font-size: 15px;
}
.row-btn:hover {
  color: var(--accent);
}
.row-btn.delete:hover {
  color: #f85149;
}
</style>

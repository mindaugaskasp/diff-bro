<script setup>
import { ref, watch } from 'vue'
import { useSnippetStore } from '../stores/snippetStore'
import { useDiffStore } from '../stores/diffStore'

const store = useSnippetStore()
const diff = useDiffStore()
const expanded = ref(new Set())
const addingCategory = ref(false)
const newCategoryName = ref('')
const filter = ref('')

function toggle(id) {
  expanded.value.has(id) ? expanded.value.delete(id) : expanded.value.add(id)
  expanded.value = new Set(expanded.value) // new ref for reactivity
}

// While a filter is active every category is treated as expanded so matches
// are never hidden inside a collapsed one.
const isExpanded = (id) => (filter.value.trim() ? true : expanded.value.has(id))

function matchesFilter(entry) {
  const q = filter.value.trim().toLowerCase()
  if (!q) return true
  return (
    entry.name.toLowerCase().includes(q) || (entry.language || 'auto').toLowerCase().includes(q)
  )
}
const visibleIn = (categoryId) => store.inCategory(categoryId).filter(matchesFilter)
const visibleFavorites = () => store.favorites.filter(matchesFilter)

async function copySnippet(id) {
  const content = await store.load(id)
  if (content != null) {
    await navigator.clipboard.writeText(content)
    diff.showNotice('Copied snippet to clipboard.')
  }
}

// Auto-expand a category as soon as a snippet is added to it.
watch(
  () => store.lastTouchedCategory,
  (id) => {
    if (id) expanded.value = new Set(expanded.value).add(id)
  }
)

function startAddCategory() {
  addingCategory.value = true
  newCategoryName.value = ''
}

function commitAddCategory() {
  // Enter commits and hides the input; hiding it fires a blur that would
  // call this a second time — the flag guard makes the second call a no-op
  // so we don't create the category twice.
  if (!addingCategory.value) return
  addingCategory.value = false
  if (newCategoryName.value.trim()) {
    const id = store.addCategory(newCategoryName.value)
    expanded.value = new Set(expanded.value).add(id)
  }
}

function newSnippet(categoryId) {
  store.editingSnippet = { id: null, categoryId }
}

function editSnippet(id) {
  store.editingSnippet = { id }
}

function exportCategory(categoryId) {
  store.pendingExport = { categoryId }
}

function deleteCategoryTitle(category) {
  if (category.isDefault) return "The Default category can't be deleted"
  if (store.inCategory(category.id).length) return 'Move or delete its snippets first'
  return 'Delete category'
}
</script>

<template>
  <div class="snippets-section">
    <div class="head sub">
      <span>Snippets</span>
    </div>
    <div class="head-actions">
      <button class="action" title="New category" @click="startAddCategory">+ New</button>
      <button
        class="action"
        title="Export all snippets to a passphrase-protected file"
        @click="store.pendingExport = { categoryId: 'all' }"
      >
        Export
      </button>
      <button
        class="action"
        title="Import snippets from a file"
        @click="store.pendingImport = true"
      >
        Import
      </button>
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

    <div v-if="store.entries.length" class="filter">
      <input
        v-model="filter"
        type="search"
        placeholder="Filter by name or syntax…"
        spellcheck="false"
      />
    </div>

    <p v-if="!store.categories.length && !addingCategory" class="empty">
      Press <strong>New</strong> to add a category, then add snippets — saved encrypted, organized
      however you like, and exportable as a passphrase-protected file.
    </p>

    <ul v-if="visibleFavorites().length" class="favorites-group">
      <li class="fav-head">★ Favorites</li>
      <li v-for="entry in visibleFavorites()" :key="entry.id" class="snippet favorite">
        <button class="star on" title="Unfavorite" @click="store.toggleFavorite(entry.id)">
          ★
        </button>
        <button class="entry" :title="`Open ${entry.name}`" @click="editSnippet(entry.id)">
          {{ entry.name }}
        </button>
        <button class="row-btn" title="Copy to clipboard" @click="copySnippet(entry.id)">⧉</button>
        <button
          class="row-btn delete"
          title="Delete"
          @click="store.requestDelete('snippet', entry.id, entry.name)"
        >
          ×
        </button>
      </li>
    </ul>

    <ul class="categories">
      <li v-for="category in store.categories" :key="category.id" class="category">
        <div class="category-head">
          <button class="cat-toggle" @click="toggle(category.id)">
            <span class="chevron" :class="{ open: isExpanded(category.id) }">▸</span>
            <span class="cat-name">{{ category.name }}</span>
            <span class="count">{{ visibleIn(category.id).length }}</span>
          </button>
          <button class="icon" title="New snippet" @click="newSnippet(category.id)">+</button>
          <button class="icon" title="Export this category" @click="exportCategory(category.id)">
            ↑
          </button>
          <button
            class="icon delete"
            :disabled="!store.canDeleteCategory(category.id)"
            :title="deleteCategoryTitle(category)"
            @click="store.requestDelete('category', category.id, category.name)"
          >
            ×
          </button>
        </div>
        <ul v-if="isExpanded(category.id)" class="snippet-list">
          <li v-if="!visibleIn(category.id).length" class="empty small">
            {{ filter.trim() ? 'No matches.' : 'No snippets yet.' }}
          </li>
          <li
            v-for="entry in visibleIn(category.id)"
            :key="entry.id"
            class="snippet"
            :class="{ favorite: entry.favorite }"
          >
            <button
              class="star"
              :class="{ on: entry.favorite }"
              :title="entry.favorite ? 'Unfavorite' : 'Favorite (pin to top)'"
              @click="store.toggleFavorite(entry.id)"
            >
              {{ entry.favorite ? '★' : '☆' }}
            </button>
            <button class="entry" :title="`Open ${entry.name}`" @click="editSnippet(entry.id)">
              {{ entry.name }}
            </button>
            <button class="row-btn" title="Copy to clipboard" @click="copySnippet(entry.id)">
              ⧉
            </button>
            <button
              class="row-btn delete"
              title="Delete"
              @click="store.requestDelete('snippet', entry.id, entry.name)"
            >
              ×
            </button>
          </li>
        </ul>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.snippets-section {
  display: flex;
  flex-direction: column;
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
  transition:
    color 0.12s,
    border-color 0.12s,
    background 0.12s;
}
.icon:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--border);
  background: var(--bg-hover);
}
.icon.delete:hover:not(:disabled) {
  color: #f85149;
  border-color: #f85149;
}
.icon:disabled {
  opacity: 0.3;
  cursor: default;
}
.star {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 26px;
  background: none;
  border: none;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 15px;
  line-height: 1;
  padding: 0 4px 0 8px;
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
  color: var(--text-dim);
  cursor: pointer;
  font-size: 15px;
  padding: 0 8px;
}
.row-btn:hover {
  color: var(--accent);
}
.row-btn.delete:hover {
  color: #f85149;
}
.add-category {
  padding: 4px 10px 8px;
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
.filter {
  padding: 0 10px 8px;
}
.filter input {
  width: 100%;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  padding: 5px 8px;
  font-size: 12.5px;
}
.filter input:focus {
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
.categories {
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
.snippet-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.snippet {
  display: flex;
  align-items: stretch;
}
.snippet.favorite {
  background: color-mix(in srgb, #d29922 12%, transparent);
  box-shadow: inset 3px 0 0 #d29922;
}
.entry {
  flex: 1;
  min-width: 0;
  text-align: left;
  background: none;
  border: none;
  color: var(--text-dim);
  padding: 5px 4px 5px 6px;
  cursor: pointer;
  font-size: 12.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.entry:hover {
  background: var(--bg);
  color: var(--text);
}
</style>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useVaultStore } from '../stores/vaultStore'
import { useDiffStore } from '../stores/diffStore'
import SavedDiffRow from './SavedDiffRow.vue'
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

// Shared-in diffs split into a ★ Favorites shelf + the rest.
const importedFavs = computed(() => vault.importedFavorites)
const importedOthers = computed(() => vault.importedOthers)
const hasImported = computed(() => importedFavs.value.length || importedOthers.value.length)

// Top-level sections collapse; categories start expanded (track collapsed only).
const savedOpen = ref(true)
const externalOpen = ref(true)
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
</script>

<template>
  <aside class="saved">
    <div class="head section-head" @click="savedOpen = !savedOpen">
      <span class="chev" :class="{ open: savedOpen }">▸</span>
      <span class="section-title">Saved diffs</span>
      <span class="lock" title="Encrypted at rest, auto-expiring">🔒</span>
    </div>
    <div v-show="savedOpen" class="section-body">
      <div class="head-actions">
        <button class="btn btn-sm btn-block" title="New category" @click="startAddCategory">
          + New category
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

      <p v-if="!vault.active.some((e) => !e.from)" class="empty">
        Nothing saved. Load two files and press <kbd>{{ MOD }}+S</kbd> to keep a diff around —
        encrypted, and gone automatically after at most 24&nbsp;hours.
      </p>

      <ul v-if="vault.favoritesOwn.length" class="favorites-group">
        <li class="fav-head">★ Favorites</li>
        <SavedDiffRow v-for="entry in vault.favoritesOwn" :key="entry.id" :entry="entry" />
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
            <SavedDiffRow
              v-for="entry in vault.activeInCategory(category.id)"
              :key="entry.id"
              :entry="entry"
            />
          </ul>
        </li>
      </ul>
    </div>

    <div class="head sub section-head" @click="externalOpen = !externalOpen">
      <span class="chev" :class="{ open: externalOpen }">▸</span>
      <span class="section-title">External diffs</span>
    </div>
    <div v-show="externalOpen" class="section-body">
      <div class="head-actions">
        <button
          class="btn btn-sm btn-block"
          :title="`Import a shared diff (${MOD}+I)`"
          @click="diff.importShared()"
        >
          Import
        </button>
      </div>
      <p v-if="!hasImported" class="empty">
        Diffs shared by someone else appear here — each is signed by its sender and shown separately
        from your own saved diffs. Press <kbd>{{ MOD }}+I</kbd> to open a sealed
        <code>.diffbro</code> file; it expires at the same moment as the sender's copy.
      </p>

      <!-- Favorited shared-in diffs pin to their own shelf, kept inside this
           section (not merged with your own favorites). Star only pins; expiry
           is still bound to the sender's copy. -->
      <ul v-if="importedFavs.length" class="favorites-group">
        <li class="fav-head">★ Favorites</li>
        <SavedDiffRow v-for="entry in importedFavs" :key="entry.id" :entry="entry" />
      </ul>

      <ul v-if="importedOthers.length">
        <SavedDiffRow v-for="entry in importedOthers" :key="entry.id" :entry="entry" />
      </ul>
    </div>

    <SnippetsPanel />
  </aside>
</template>

<style scoped src="./styles/SavedDiffs.css"></style>

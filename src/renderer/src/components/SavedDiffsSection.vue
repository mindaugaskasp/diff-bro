<script setup>
// The "Saved diffs" sidebar section: a Favorites shelf plus draggable category
// shelves, each holding your own encrypted, auto-expiring diffs. Section move
// controls live in SectionHeader; category order is drag-reorderable and
// persisted per-section in settings.shelfOrder.
import { computed, ref, watch } from 'vue'
import { useVaultStore } from '../stores/vaultStore'
import { useSettingsStore } from '../stores/settingsStore'
import SavedDiffRow from './SavedDiffRow.vue'
import SectionHeader from './SectionHeader.vue'
import { MOD } from '../keys'

defineProps({ first: { type: Boolean, default: false } })

const vault = useVaultStore()
const settings = useSettingsStore()

const open = ref(true)
const collapsed = ref(new Set())
const addingCategory = ref(false)
const newCategoryName = ref('')

// Categories shown in the user's saved order (drag-reorder below), reconciled
// against the categories that currently exist.
const orderedCategories = computed(() => {
  const byId = new Map(vault.categories.map((c) => [c.id, c]))
  return settings
    .shelfOrderFor(
      'saved',
      vault.categories.map((c) => c.id)
    )
    .map((id) => byId.get(id))
    .filter(Boolean)
})

const isExpanded = (id) => !collapsed.value.has(id)
function toggle(id) {
  collapsed.value.has(id) ? collapsed.value.delete(id) : collapsed.value.add(id)
  collapsed.value = new Set(collapsed.value)
}

// Auto-expand a category the moment a diff is saved into it.
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

// --- category drag-reorder ---
const dragId = ref(null)
function onDrop(targetId) {
  const from = dragId.value
  dragId.value = null
  if (!from || from === targetId) return
  const ids = orderedCategories.value.map((c) => c.id)
  ids.splice(ids.indexOf(targetId), 0, ids.splice(ids.indexOf(from), 1)[0])
  settings.setShelfOrder('saved', ids)
}
</script>

<template>
  <section class="sidebar-section">
    <SectionHeader
      section-id="saved"
      title="Saved diffs"
      :open="open"
      :first="first"
      @toggle="open = !open"
    >
      <template #actions>
        <span class="lock" title="Encrypted at rest, auto-expiring">🔒</span>
      </template>
    </SectionHeader>

    <div v-show="open" class="section-body">
      <div class="section-actions">
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
        <li
          v-for="category in orderedCategories"
          :key="category.id"
          class="category"
          :class="{ dragging: dragId === category.id }"
          draggable="true"
          @dragstart="dragId = category.id"
          @dragend="dragId = null"
          @dragover.prevent
          @drop.prevent="onDrop(category.id)"
        >
          <div class="category-head">
            <span class="grip" title="Drag to reorder">⠿</span>
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
  </section>
</template>

<style scoped src="./styles/SavedDiffsSection.css"></style>

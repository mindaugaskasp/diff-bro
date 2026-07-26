<script setup>
// The "Saved diffs" group: a Favorites folder plus collapsible category folders.
// `query` narrows the visible rows/categories (shell search); `unified` renders
// the light group label.
import { computed, ref, watch } from 'vue'
import { useVaultStore } from '../stores/vaultStore'
import { useSettingsStore } from '../stores/settingsStore'
import SavedDiffRow from './SavedDiffRow.vue'
import SectionHeader from './SectionHeader.vue'
import { MOD } from '../keys'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  first: { type: Boolean, default: false },
  unified: { type: Boolean, default: false },
  search: { type: String, default: '' }
})
const q = computed(() => props.search.trim().toLowerCase())
const filt = (list) => (q.value ? list.filter((e) => e.name.toLowerCase().includes(q.value)) : list)

// The synthetic collapse key for the pinned Favorites folder — it isn't a real
// category, so it needs an id that can never collide with a category UUID.
const FAVORITES_ID = '__favorites__'

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
// While searching, hide categories with no matching diffs so results stand out.
const visibleCategories = computed(() =>
  q.value
    ? orderedCategories.value.filter((c) => filt(vault.activeInCategory(c.id)).length)
    : orderedCategories.value
)

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
  open.value = true // the input lives in the body — expand if the "+" was hit while collapsed
  addingCategory.value = true
  newCategoryName.value = ''
}
function commitAddCategory() {
  if (!addingCategory.value) return
  addingCategory.value = false
  if (newCategoryName.value.trim()) vault.addCategory(newCategoryName.value)
}
// Close the input without creating anything. mousedown.prevent on the X keeps
// the input focused so its @blur=commit never fires first and adds a category.
function cancelAddCategory() {
  addingCategory.value = false
  newCategoryName.value = ''
}

function deleteCategoryTitle(category) {
  return category.isDefault ? "The Default category can't be deleted" : 'Delete category'
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
      icon="folder"
      :open="open"
      :first="first"
      :unified="unified"
      @toggle="open = !open"
    />

    <div v-show="open" class="section-body">
      <p v-if="!vault.active.some((e) => !e.from)" class="empty">
        Nothing saved. Load two files and press <kbd>{{ MOD }}+S</kbd> to keep a diff around —
        encrypted, and gone automatically after at most 24&nbsp;hours.
      </p>

      <ul class="categories">
        <!-- Add-category control at the head of the tree, so it plainly reads as
             "add a category" (sits right above the first folder). -->
        <li class="add-cat-row">
          <button class="add-cat" title="New category" @click="startAddCategory">
            <AppIcon class="add-plus" name="plus" />
            <span>New category</span>
          </button>
          <div v-if="addingCategory" class="add-category sidebar-field">
            <input
              v-model="newCategoryName"
              type="text"
              placeholder="Category name…"
              spellcheck="false"
              autofocus
              @keyup.enter="commitAddCategory"
              @keyup.escape="cancelAddCategory"
              @blur="commitAddCategory"
            />
            <button class="xbox" title="Cancel" @mousedown.prevent="cancelAddCategory">
              <AppIcon name="x" />
            </button>
          </div>
        </li>
        <!-- Favorites: a special, non-draggable folder pinned at the top of the
             tree, marked by a golden folder glyph. Its leaves are your starred
             diffs, lifted here out of their own categories. -->
        <li v-if="filt(vault.favoritesOwn).length" class="category favorites">
          <div class="category-head">
            <AppIcon class="grip ghost" name="grip" />
            <button class="cat-toggle" @click="toggle(FAVORITES_ID)">
              <AppIcon
                class="chevron"
                :class="{ open: isExpanded(FAVORITES_ID) }"
                name="chevron-right"
              />
              <AppIcon class="folder gold" name="folder" />
              <span class="cat-name">Favorites</span>
              <span class="count">{{ filt(vault.favoritesOwn).length }}</span>
            </button>
          </div>
          <ul v-if="isExpanded(FAVORITES_ID)" class="diff-list">
            <SavedDiffRow v-for="entry in filt(vault.favoritesOwn)" :key="entry.id" :entry="entry" />
          </ul>
        </li>

        <li
          v-for="category in visibleCategories"
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
            <AppIcon class="grip" name="grip" title="Drag to reorder" />
            <button class="cat-toggle" @click="toggle(category.id)">
              <AppIcon
                class="chevron"
                :class="{ open: isExpanded(category.id) }"
                name="chevron-right"
              />
              <AppIcon class="folder" name="folder" />
              <span class="cat-name">{{ category.name }}</span>
              <span class="count">{{ filt(vault.activeInCategory(category.id)).length }}</span>
            </button>
            <button
              class="icon delete"
              :disabled="!vault.canDeleteCategory(category.id)"
              :title="deleteCategoryTitle(category)"
              @click="vault.requestDelete('category', category.id, category.name)"
            >
              <AppIcon name="x" />
            </button>
          </div>
          <ul v-if="isExpanded(category.id)" class="diff-list">
            <li v-if="!filt(vault.activeInCategory(category.id)).length" class="empty small">
              Empty
            </li>
            <SavedDiffRow
              v-for="entry in filt(vault.activeInCategory(category.id))"
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

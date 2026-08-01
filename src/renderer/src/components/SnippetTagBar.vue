<script setup>
// Collapsible tag filter bar + right-click "manage tag" popover (composes with
// the text search).
import { ref } from 'vue'
import { useSnippetStore, TAG_PALETTE } from '../stores/snippetStore'
import { DEFAULT_TAG } from '../composables/useSnippetFilters'
import { arrayOfShape } from '../utils/props'
import TagGlyph from './TagGlyph.vue'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  /** @type {import('vue').PropType<import('../types').TagChip[]>} */
  chips: { type: Array, required: true, validator: arrayOfShape('name', 'label', 'count') },
  /** Tag names currently filtering the list. @type {import('vue').PropType<Set<string>>} */
  active: { type: Set, required: true },
  filtering: { type: Boolean, default: false }
})
const emit = defineEmits(['toggle', 'clear'])

const store = useSnippetStore()
const open = ref(true)
const DEFAULT = DEFAULT_TAG

// { name, color } while the manage popover is open.
const managing = ref(null)
const renameValue = ref('')

function openManage(e, name) {
  if (name === DEFAULT) return // Default is permanent
  e.preventDefault()
  renameValue.value = name
  managing.value = { name, color: store.colorOf(name) }
}
function closeManage() {
  managing.value = null
}
function applyRename() {
  const to = renameValue.value.trim().toLowerCase()
  if (to && to !== managing.value.name) store.renameTag(managing.value.name, to)
  closeManage()
}
function applyColor(color) {
  store.recolorTag(managing.value.name, color)
  managing.value = { ...managing.value, color }
}
function deleteTag() {
  store.requestDelete('tag', managing.value.name, managing.value.name)
  closeManage()
}
function exportTag() {
  store.pendingExport = { tag: managing.value.name }
  closeManage()
}
</script>

<template>
  <div class="tagbar" :class="{ collapsed: !open, 'has-active': active.size }">
    <div class="tagbar-head">
      <button class="tagbar-toggle" @click="open = !open">
        <AppIcon class="chev" :class="{ open }" name="chevron-right" />
        <span>Tags</span>
        <span v-if="active.size" class="active-count">· {{ active.size }} active</span>
      </button>
      <button v-if="props.filtering" class="clear" @click="emit('clear')">Clear all</button>
    </div>
    <div v-show="open" class="chips">
      <button
        v-for="t in chips"
        :key="t.name"
        class="tag-chip chip"
        :class="{ def: t.name === DEFAULT, on: active.has(t.name) }"
        :style="t.color ? { '--tc': t.color } : {}"
        :aria-pressed="active.has(t.name)"
        :data-tip="
          t.name === DEFAULT ? 'Untagged snippets' : `Filter by ${t.label} · right-click to manage`
        "
        @click="emit('toggle', t.name)"
        @contextmenu="openManage($event, t.name)"
      >
        <TagGlyph :color="t.color || 'var(--text-dim)'" />
        {{ t.label }}<span class="ct">{{ t.count }}</span>
      </button>
    </div>
  </div>

  <div v-if="managing" class="manage-backdrop" @click="closeManage">
    <div class="manage" @click.stop>
      <div class="manage-head">
        <span>Manage tag</span>
        <button class="dialog-close" data-tip="Close" @click="closeManage">
          <AppIcon name="x" />
        </button>
      </div>
      <input
        v-model="renameValue"
        class="rename"
        type="text"
        spellcheck="false"
        placeholder="Tag name"
        @keyup.enter="applyRename"
      />
      <div class="swatches">
        <button
          v-for="c in TAG_PALETTE"
          :key="c"
          class="swatch"
          :style="{ background: c }"
          :aria-pressed="managing.color === c"
          :data-tip="c"
          @click="applyColor(c)"
        ></button>
      </div>
      <div class="dialog-actions">
        <button class="btn btn-sm btn-ghost btn-danger" @click="deleteTag">Delete tag</button>
        <span class="spacer" />
        <button class="btn btn-sm" @click="exportTag">Export…</button>
        <button class="btn btn-sm btn-primary" @click="applyRename">Rename</button>
      </div>
    </div>
  </div>
</template>

<style scoped src="./styles/SnippetTagBar.css"></style>

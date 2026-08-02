<script setup>
// Rename, recolour, export or delete a tag. Anchored to the sidebar's tag bar,
// which is the one place tags are listed — and which counts snippets AND saved
// diffs, because they share a single registry.
import { ref, watch } from 'vue'
import { useSnippetStore, TAG_PALETTE } from '../stores/snippetStore'
import AppIcon from './AppIcon.vue'

const props = defineProps({ name: { type: String, required: true } })
const emit = defineEmits(['close'])

const store = useSnippetStore()
const renameValue = ref(props.name)
const color = ref(store.colorOf(props.name))
watch(
  () => props.name,
  (n) => {
    renameValue.value = n
    color.value = store.colorOf(n)
  }
)

function applyRename() {
  const to = renameValue.value.trim().toLowerCase()
  if (to && to !== props.name) store.renameTag(props.name, to)
  emit('close')
}
function applyColor(c) {
  store.recolorTag(props.name, c)
  color.value = c
}
function remove() {
  store.requestDelete('tag', props.name, props.name)
  emit('close')
}
function exportTag() {
  store.pendingExport = { tag: props.name }
  emit('close')
}
</script>

<template>
  <div class="manage-backdrop" @click="emit('close')">
    <div class="manage" role="dialog" aria-label="Manage tag" @click.stop>
      <div class="manage-head">
        <span>Manage tag</span>
        <button class="dialog-close" data-tip="Close" aria-label="Close" @click="emit('close')">
          <AppIcon name="x" />
        </button>
      </div>
      <input
        v-model="renameValue"
        class="rename"
        type="text"
        spellcheck="false"
        placeholder="Tag name"
        aria-label="Tag name"
        @keyup.enter="applyRename"
      />
      <div class="swatches">
        <button
          v-for="c in TAG_PALETTE"
          :key="c"
          class="swatch"
          :style="{ background: c }"
          :aria-pressed="color === c"
          :data-tip="c"
          :aria-label="`Use colour ${c}`"
          @click="applyColor(c)"
        ></button>
      </div>
      <div class="manage-actions">
        <button class="btn btn-sm btn-ghost btn-danger" @click="remove">Delete tag</button>
        <span class="spacer" />
        <button class="btn btn-sm" @click="exportTag">Export…</button>
        <button class="btn btn-sm btn-primary" @click="applyRename">Rename</button>
      </div>
    </div>
  </div>
</template>

<style scoped src="./styles/TagManagePopover.css"></style>

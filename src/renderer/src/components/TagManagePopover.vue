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
    <div class="manage" role="dialog" :aria-label="$t('tagManagePopover.manageTag')" @click.stop>
      <div class="manage-head">
        <span>{{ $t('tagManagePopover.manageTag') }}</span>
        <button
          class="dialog-close"
          :data-tip="$t('common.close')"
          :aria-label="$t('common.close')"
          @click="emit('close')"
        >
          <AppIcon name="x" />
        </button>
      </div>
      <input
        v-model="renameValue"
        class="rename"
        type="text"
        spellcheck="false"
        :placeholder="$t('tagManagePopover.tagName')"
        :aria-label="$t('tagManagePopover.tagName')"
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
          :aria-label="$t('tagManagePopover.useColour', { colour: c })"
          @click="applyColor(c)"
        ></button>
      </div>
      <div class="manage-actions">
        <button class="btn btn-sm btn-danger" @click="remove">
          {{ $t('tagManagePopover.deleteTag') }}
        </button>
        <span class="spacer" />
        <button class="btn btn-sm" @click="exportTag">{{ $t('tagManagePopover.export') }}</button>
        <button class="btn btn-sm btn-primary" @click="applyRename">
          {{ $t('tagManagePopover.rename') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped src="./styles/TagManagePopover.css"></style>

<script setup>
import { nextTick, ref } from 'vue'
import AppIcon from './AppIcon.vue'

const MENU_W = 232

defineProps({ canExport: { type: Boolean, default: true } })
const emit = defineEmits(['export', 'reveal'])

const trigger = ref(null)
const menu = ref(null)
const at = ref(null)

async function toggle() {
  if (at.value) return close()
  const r = trigger.value.getBoundingClientRect()
  at.value = { x: Math.max(8, r.right - MENU_W), y: r.bottom + 4 }
  await nextTick()
  menu.value?.querySelector('button')?.focus()
}
function close() {
  at.value = null
}
function pick(action) {
  close()
  emit(action)
}
</script>

<template>
  <button
    ref="trigger"
    class="row-btn"
    aria-haspopup="menu"
    :aria-expanded="!!at"
    :data-tip="$t('savedDiffRow.moreActions')"
    :aria-label="$t('savedDiffRow.moreActions')"
    @click="toggle"
  >
    <AppIcon name="more-horizontal" />
  </button>
  <Teleport to="body">
    <div v-if="at" class="ctx-backdrop" @pointerdown="close">
      <div
        ref="menu"
        class="ctx"
        role="menu"
        :aria-label="$t('savedDiffRow.moreActions')"
        :style="{ left: `${at.x}px`, top: `${at.y}px` }"
        @pointerdown.stop
        @keydown.esc.stop="close"
      >
        <button
          v-if="canExport"
          type="button"
          class="ctx-item"
          role="menuitem"
          @click="pick('export')"
        >
          <AppIcon name="image" /> {{ $t('savedDiffRow.exportAsImage') }}
        </button>
        <button type="button" class="ctx-item" role="menuitem" @click="pick('reveal')">
          <AppIcon name="folder" /> {{ $t('showInFolder.label') }}
        </button>
      </div>
    </div>
  </Teleport>
</template>

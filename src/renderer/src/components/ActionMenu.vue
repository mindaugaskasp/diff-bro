<script setup>
import { nextTick, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { shaped } from '../utils/props'

const MENU_W = 232

defineProps({
  label: { type: String, required: true },
  /** @type {import('vue').PropType<{action: string, label: string, icon: string, keys?: string, disabled?: boolean}[]>} */
  items: {
    type: Array,
    required: true,
    validator: (v) => v.every(shaped('action', 'label', 'icon'))
  },
  triggerClass: { type: String, default: 'row-btn' }
})
const emit = defineEmits(['pick'])

const trigger = ref(null)
const menu = ref(null)
const at = ref(null)

async function toggle() {
  if (at.value) return close()
  const r = trigger.value.getBoundingClientRect()
  at.value = { x: Math.max(8, r.right - MENU_W), y: r.bottom + 4 }
  await nextTick()
  menu.value?.querySelector('button:not(:disabled)')?.focus()
}
function close() {
  at.value = null
}
function pick(action) {
  close()
  emit('pick', action)
}
</script>

<template>
  <button
    ref="trigger"
    type="button"
    :class="triggerClass"
    aria-haspopup="menu"
    :aria-expanded="!!at"
    :data-tip="label"
    :aria-label="label"
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
        :aria-label="label"
        :style="{ left: `${at.x}px`, top: `${at.y}px` }"
        @pointerdown.stop
        @keydown.esc.stop="close"
      >
        <button
          v-for="item in items"
          :key="item.action"
          type="button"
          class="ctx-item"
          role="menuitem"
          :disabled="item.disabled"
          @click="pick(item.action)"
        >
          <AppIcon :name="item.icon" />
          <span class="ctx-label">{{ item.label }}</span>
          <span v-if="item.keys" class="ctx-keys">{{ item.keys }}</span>
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
// The tab strip's right-click menu. Drawn here rather than through Electron's
// Menu.popup(): a native menu is OS chrome, and would be the one surface in the
// app the themes cannot reach.
import { onMounted, ref } from 'vue'
import { shaped } from '../utils/props'

defineProps({
  /** @type {import('vue').PropType<{x:number,y:number}>} */
  at: { type: Object, required: true, validator: shaped('x', 'y') },
  /** @type {import('vue').PropType<import('../utils/tabMenu').TabMenuItem[]>} */
  items: { type: Array, required: true },
  cursor: { type: Number, default: -1 }
})
const emit = defineEmits(['pick', 'close', 'hover', 'key'])

// Focused on open so the arrow keys have somewhere to land; the highlight is
// `cursor`, not DOM focus, so pointer and keyboard share one marker.
const panel = ref(null)
onMounted(() => panel.value?.focus())
</script>

<template>
  <div class="ctx-backdrop" @pointerdown="emit('close')" @contextmenu.prevent="emit('close')">
    <div
      ref="panel"
      class="ctx"
      role="menu"
      tabindex="-1"
      :aria-label="$t('tabContextMenu.tabActions')"
      :style="{ left: `${at.x}px`, top: `${at.y}px` }"
      @pointerdown.stop
      @contextmenu.stop.prevent
      @keydown="emit('key', $event)"
    >
      <template v-for="(item, i) in items">
        <div v-if="item.sep" :key="`sep-${i}`" class="ctx-sep" role="separator"></div>
        <button
          v-else
          :key="item.action"
          type="button"
          class="ctx-item"
          role="menuitem"
          :class="{ hot: i === cursor, danger: item.action === 'close-all' }"
          :disabled="!item.enabled"
          @click="emit('pick', item.action)"
          @mousemove="emit('hover', i)"
        >
          {{ item.label }}
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped src="./styles/TabContextMenu.css"></style>

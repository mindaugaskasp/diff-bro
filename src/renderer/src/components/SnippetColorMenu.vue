<script setup>
// The snippet row's colour picker, opened by right-clicking the row. Drawn here
// rather than through Electron's Menu.popup() for the reason TabContextMenu
// gives: a native menu is OS chrome, and would be the one surface the themes
// cannot reach.
import { computed, onMounted, ref } from 'vue'
import { useSnippetStore } from '../stores/snippetStore'
import { useUiStore } from '../stores/uiStore'
import { useRowColorMenu } from '../composables/useRowColorMenu'
import { clampMenu } from '../utils/tabMenu'
import { t } from '../i18n'
import AppIcon from './AppIcon.vue'

const store = useSnippetStore()
const ui = useUiStore()
const panel = ref(null)

const at = computed(() => ui.rowColorMenu)
const entry = computed(() => store.entries.find((e) => e.id === at.value?.id) ?? null)
const close = () => (ui.rowColorMenu = null)

function pick(color) {
  store.setSnippetColor(at.value.id, color)
  close()
}

const menu = useRowColorMenu({
  current: () => entry.value?.color ?? null,
  onPick: pick,
  onClose: close
})

// Opens at the pointer, pulled back inside the window when the last row would
// hang it off an edge — the tab strip's own rule. Focused so the arrow keys have
// somewhere to land.
const where = ref({ left: `${at.value?.x ?? 0}px`, top: `${at.value?.y ?? 0}px` })
onMounted(() => {
  panel.value?.focus()
  const box = panel.value.getBoundingClientRect()
  const spot = clampMenu({
    x: at.value?.x ?? 0,
    y: at.value?.y ?? 0,
    menu: { w: box.width, h: box.height },
    view: { w: window.innerWidth, h: window.innerHeight }
  })
  where.value = { left: `${spot.x}px`, top: `${spot.y}px` }
})

const label = (c) => t(c.labelKey)
</script>

<template>
  <div class="rcm-backdrop" @pointerdown="close" @contextmenu.prevent="close">
    <div
      ref="panel"
      class="rcm"
      role="menu"
      tabindex="-1"
      :aria-label="$t('rowColor.menuLabel')"
      :style="where"
      @pointerdown.stop
      @contextmenu.stop.prevent
      @keydown="menu.onKeydown"
    >
      <div class="rcm-hd">{{ $t('rowColor.menuLabel') }}</div>
      <div class="rcm-row">
        <button
          v-for="(c, i) in menu.colors"
          :key="c.id"
          type="button"
          class="rcm-sw"
          role="menuitemradio"
          :class="{ hot: i === menu.cursor.value }"
          :style="{ '--snip-color': c.hex }"
          :aria-checked="entry?.color === c.id"
          :aria-label="label(c)"
          :data-tip="label(c)"
          :data-color="c.id"
          @click="pick(c.id)"
          @mousemove="menu.point(i)"
        >
          <span class="rcm-dot"></span>
          <AppIcon v-if="entry?.color === c.id" class="rcm-tick" name="check" />
        </button>
        <button
          type="button"
          class="rcm-sw rcm-none"
          role="menuitemradio"
          :class="{ hot: menu.cursor.value === menu.clearIndex }"
          :aria-checked="!entry?.color"
          :aria-label="$t('rowColor.none')"
          :data-tip="$t('rowColor.none')"
          data-color="none"
          @click="pick(null)"
          @mousemove="menu.point(menu.clearIndex)"
        >
          <span class="rcm-dot"></span>
          <AppIcon v-if="!entry?.color" class="rcm-tick" name="check" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped src="./styles/SnippetColorMenu.css"></style>

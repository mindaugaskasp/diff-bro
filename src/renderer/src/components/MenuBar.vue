<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { buildMenus } from '../menus'
import { useCommands } from '../composables/useCommands'
import AppIcon from './AppIcon.vue'
import MenuList from './MenuList.vue'

// The ≡ menu for Windows/Linux (macOS keeps the native bar); mirrors the hidden
// app menu, which still binds the accelerators.
const { runFromMenu: run } = useCommands()
// Computed, not called once: the labels come from t(), so switching language
// has to rebuild the list rather than leave the old strings on screen.
const menus = computed(() => buildMenus(run))
const open = ref(false)
// DevTools is dev-only; hidden in packaged builds.
const isPackaged = ref(true)

function close() {
  open.value = false
}

function activate(item) {
  close()
  item.run()
}

function onKeydown(e) {
  if (e.key === 'Escape') close()
}
onMounted(async () => {
  window.addEventListener('keydown', onKeydown)
  isPackaged.value = await window.api.isPackaged()
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <nav class="menubar" data-tour="menubar">
    <button
      class="btn btn-sm btn-square"
      :class="{ active: open }"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-label="$t('menuBar.menu')"
      :data-tip="$t('menuBar.menu')"
      @click="open = !open"
    >
      <AppIcon name="menu" />
    </button>
    <MenuList v-if="open" :items="menus" :is-packaged="isPackaged" @pick="activate" />
  </nav>
  <!-- Click-catcher: clicking anywhere closes the
       open menu without dimming the app behind it. -->
  <div v-if="open" class="menu-backdrop" @click="close" @contextmenu.prevent="close" />
</template>

<style scoped src="./styles/MenuBar.css"></style>

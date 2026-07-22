<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import { buildMenus } from '../menus'

// Themed replacement for the native File/View menu bar on Windows/Linux
// (macOS keeps the system menu bar). Items mirror the hidden application
// menu, whose accelerators still work — this bar is only the visual half.
const store = useDiffStore()
const menus = buildMenus(store)
const open = ref(null)
// DevTools is dev-only; hidden in packaged builds.
const isPackaged = ref(true)

// Label of the submenu currently flown out, scoped to the open dropdown.
const openSub = ref(null)

function toggle(id) {
  open.value = open.value === id ? null : id
  openSub.value = null
}

function activate(item) {
  open.value = null
  openSub.value = null
  item.run()
}

function onKeydown(e) {
  if (e.key === 'Escape') {
    open.value = null
    openSub.value = null
  }
}
onMounted(async () => {
  window.addEventListener('keydown', onKeydown)
  isPackaged.value = await window.api.isPackaged()
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <nav class="menubar">
    <div v-for="menu in menus" :key="menu.id" class="menu">
      <button
        class="top"
        :class="{ open: open === menu.id }"
        @click="toggle(menu.id)"
        @mouseenter="open && ((open = menu.id), (openSub = null))"
      >
        {{ menu.label }}
      </button>
      <div v-if="open === menu.id" class="dropdown">
        <template v-for="(item, i) in menu.items" :key="i">
          <template v-if="!(item.devOnly && isPackaged)">
            <div v-if="item.sep" class="sep" />
            <div v-else-if="item.items" class="submenu" @mouseenter="openSub = item.label">
              <button class="item" @click="openSub = openSub === item.label ? null : item.label">
                <span>{{ item.label }}</span>
                <span class="arrow" aria-hidden="true">›</span>
              </button>
              <div v-if="openSub === item.label" class="dropdown flyout">
                <button
                  v-for="sub in item.items"
                  :key="sub.label"
                  class="item"
                  @click="activate(sub)"
                >
                  <span>{{ sub.label }}</span>
                  <kbd v-if="sub.keys">{{ sub.keys }}</kbd>
                </button>
              </div>
            </div>
            <button v-else class="item" @click="activate(item)" @mouseenter="openSub = null">
              <span>{{ item.label }}</span>
              <kbd v-if="item.keys">{{ item.keys }}</kbd>
            </button>
          </template>
        </template>
      </div>
    </div>
  </nav>
  <!-- Invisible click-catcher, not a modal scrim: clicking anywhere closes the
       open menu without dimming the app behind it. -->
  <div v-if="open" class="menu-backdrop" @click="open = null" @contextmenu.prevent="open = null" />
</template>

<style scoped src="./styles/MenuBar.css"></style>

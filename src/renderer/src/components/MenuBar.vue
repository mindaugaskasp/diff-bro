<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import { MOD } from '../keys'

// Themed replacement for the native File/View menu bar on Windows/Linux
// (macOS keeps the system menu bar). Items mirror the hidden application
// menu, whose accelerators still work — this bar is only the visual half.
const store = useDiffStore()
const open = ref(null)
// DevTools is dev-only; hidden in packaged builds.
const isPackaged = ref(true)

const menus = [
  {
    id: 'file',
    label: 'File',
    items: [
      { label: 'Open Left', keys: `${MOD}+1`, run: () => store.handleMenuAction('open-left') },
      { label: 'Open Right', keys: `${MOD}+2`, run: () => store.handleMenuAction('open-right') },
      { sep: true },
      { label: 'Save', keys: `${MOD}+S`, run: () => store.handleMenuAction('save') },
      { label: 'Share', keys: `${MOD}+E`, run: () => store.shareCurrent() },
      { label: 'Import', keys: `${MOD}+I`, run: () => store.importShared() },
      { sep: true },
      { label: 'Settings', keys: `${MOD}+,`, run: () => store.handleMenuAction('settings') },
      { sep: true },
      { label: 'Quit', run: () => window.api.quit() }
    ]
  },
  {
    id: 'edit',
    label: 'Edit',
    items: [
      { label: 'Swap Sides', keys: `${MOD}+Shift+S`, run: () => store.swap() },
      { label: 'Clear', keys: `${MOD}+K`, run: () => store.clear() },
      { sep: true },
      { label: 'Paste Text Mode', keys: `${MOD}+T`, run: () => store.togglePasteMode() }
    ]
  },
  {
    id: 'view',
    label: 'View',
    items: [
      {
        label: 'Toggle Split View',
        keys: `${MOD}+\\`,
        run: () => store.handleMenuAction('toggle-split')
      },
      { label: 'Toggle Light/Dark Theme', keys: `${MOD}+D`, run: () => store.toggleTheme() },
      { sep: true },
      { label: 'Zoom In', keys: `${MOD}++`, run: () => window.api.zoom(1) },
      { label: 'Zoom Out', keys: `${MOD}+-`, run: () => window.api.zoom(-1) },
      { label: 'Reset Zoom', keys: `${MOD}+0`, run: () => window.api.zoom(0) },
      { sep: true, devOnly: true },
      { label: 'Toggle Developer Tools', devOnly: true, run: () => window.api.toggleDevTools() }
    ]
  },
  {
    id: 'security',
    label: 'Security',
    items: [
      { label: 'Share My Public Key', run: () => (store.showShareKeyDialog = true) },
      { sep: true },
      { label: 'Add Trusted Key', run: () => store.addTrustedKey() },
      { label: 'Manage Trusted Keys', run: () => store.handleMenuAction('manage-keys') },
      { sep: true },
      { label: 'Back Up Configuration', run: () => store.handleMenuAction('config-backup') },
      { label: 'Restore Configuration', run: () => store.handleMenuAction('config-restore') }
    ]
  },
  {
    id: 'tools',
    label: 'Tools',
    items: [
      {
        label: 'Base64 Encode/Decode',
        keys: `${MOD}+Shift+B`,
        run: () => store.handleMenuAction('tools-base64')
      },
      {
        label: 'JSON Format/Validate',
        keys: `${MOD}+Shift+J`,
        run: () => store.handleMenuAction('tools-json')
      },
      {
        label: 'XML Format/Validate',
        keys: `${MOD}+Shift+M`,
        run: () => store.handleMenuAction('tools-xml')
      },
      {
        label: 'SQL Format/Validate',
        keys: `${MOD}+Shift+Q`,
        run: () => store.handleMenuAction('tools-sql')
      },
      {
        label: 'Encrypt/Decrypt Text',
        keys: `${MOD}+Shift+X`,
        run: () => store.handleMenuAction('tools-crypt')
      }
    ]
  }
]

function toggle(id) {
  open.value = open.value === id ? null : id
}

function activate(item) {
  open.value = null
  item.run()
}

function onKeydown(e) {
  if (e.key === 'Escape') open.value = null
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
        @mouseenter="open && (open = menu.id)"
      >
        {{ menu.label }}
      </button>
      <div v-if="open === menu.id" class="dropdown">
        <template v-for="(item, i) in menu.items" :key="i">
          <template v-if="!(item.devOnly && isPackaged)">
            <div v-if="item.sep" class="sep" />
            <button v-else class="item" @click="activate(item)">
              <span>{{ item.label }}</span>
              <kbd v-if="item.keys">{{ item.keys }}</kbd>
            </button>
          </template>
        </template>
      </div>
    </div>
  </nav>
  <div v-if="open" class="backdrop" @click="open = null" @contextmenu.prevent="open = null" />
</template>

<style scoped>
.menubar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px 6px;
  background: var(--bg-panel);
  user-select: none;
  position: relative;
  z-index: 30;
}
.menu {
  position: relative;
}
.top {
  background: none;
  border: none;
  border-radius: 5px;
  color: var(--text);
  font-size: 12.5px;
  padding: 3px 10px;
  cursor: pointer;
}
.top:hover,
.top.open {
  background: var(--bg-hover, #21262d);
}
.top.open {
  color: var(--accent);
}
.dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 240px;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 5px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
}
.item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  background: none;
  border: none;
  border-radius: 5px;
  color: var(--text);
  font-size: 12.5px;
  text-align: left;
  padding: 5px 10px;
  cursor: pointer;
  white-space: nowrap;
}
.item:hover {
  background: var(--accent);
  color: #fff;
}
.item:hover kbd {
  color: rgba(255, 255, 255, 0.85);
  border-color: rgba(255, 255, 255, 0.35);
}
.item kbd {
  font-family: inherit;
  font-size: 10.5px;
  color: var(--text-hint);
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 0 4px;
}
.sep {
  height: 1px;
  margin: 4px 8px;
  background: var(--border);
}
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 20;
}
</style>

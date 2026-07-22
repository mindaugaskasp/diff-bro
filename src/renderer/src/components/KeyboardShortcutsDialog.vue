<script setup>
// Help → Keyboard Shortcuts: the full, grouped list. Labels come from
// utils/shortcuts.js, which resolves modifier names against the host OS, so a
// Mac shows ⌘ where Windows/Linux show Ctrl.
import { useDiffStore } from '../stores/diffStore'
import { SHORTCUT_GROUPS } from '../utils/shortcuts'
import { isMac } from '../keys'
import BaseDialog from './BaseDialog.vue'

const store = useDiffStore()
const groups = SHORTCUT_GROUPS
const platform = isMac ? 'macOS' : 'this system'

function close() {
  store.showShortcutsDialog = false
}
</script>

<template>
  <BaseDialog width="440px" title="Keyboard shortcuts" @close="close">
    <p class="dialog-note">
      Shortcuts for <strong>{{ platform }}</strong
      >.
    </p>
    <div class="groups">
      <section v-for="g in groups" :key="g.group" class="group">
        <h4>{{ g.group }}</h4>
        <ul>
          <li v-for="s in g.items" :key="s.keys">
            <span class="label">{{ s.label }}</span>
            <kbd>{{ s.keys }}</kbd>
          </li>
        </ul>
      </section>
    </div>
    <template #actions>
      <button class="btn btn-primary" @click="close">Done</button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/KeyboardShortcutsDialog.css"></style>

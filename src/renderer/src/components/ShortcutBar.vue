<script setup>
import { ref } from 'vue'
import { MOD } from '../keys'

// One-line, dim hint strip. Dismissal is remembered per install.
const DISMISS_KEY = 'diffbro.shortcutBarDismissed'
const dismissed = ref(localStorage.getItem(DISMISS_KEY) === '1')

const shortcuts = [
  [`${MOD}+1`, 'open left'],
  [`${MOD}+2`, 'open right'],
  [`${MOD}+S`, 'save diff'],
  [`${MOD}+Shift+S`, 'swap'],
  [`${MOD}+T`, 'paste text'],
  [`${MOD}+\\`, 'split view'],
  [`${MOD}+K`, 'clear']
]

function dismiss() {
  dismissed.value = true
  localStorage.setItem(DISMISS_KEY, '1')
}
</script>

<template>
  <div v-if="!dismissed" class="shortcut-bar">
    <span v-for="[keys, label] in shortcuts" :key="keys" class="hint">
      <kbd>{{ keys }}</kbd> {{ label }}
    </span>
    <button class="close" title="Hide shortcuts" @click="dismiss">×</button>
  </div>
</template>

<style scoped>
.shortcut-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  /* Top margin keeps the strip off the window title bar — on macOS this bar is
     the first thing under the native title bar (no in-app menu bar there). */
  margin-top: 6px;
  padding: 4px 28px 4px 8px;
  font-size: 11px;
  color: var(--text-hint);
  background: var(--bg-panel);
  position: relative;
  white-space: nowrap;
  overflow: hidden;
}
.hint {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
kbd {
  font-family: inherit;
  font-size: 10px;
  padding: 0 4px;
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 3px;
  background: var(--bg-hover);
}
.close {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  padding: 0 4px;
}
.close:hover {
  color: var(--text);
}
</style>

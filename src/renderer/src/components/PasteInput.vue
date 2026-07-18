<script setup>
import { useDiffStore } from '../stores/diffStore'

const store = useDiffStore()
</script>

<template>
  <div class="paste">
    <div class="panes">
      <textarea
        v-model="store.pasteLeft"
        class="pane"
        placeholder="Paste original text here…"
        spellcheck="false"
      ></textarea>
      <textarea
        v-model="store.pasteRight"
        class="pane"
        placeholder="Paste changed text here…"
        spellcheck="false"
      ></textarea>
    </div>
    <div class="actions">
      <button class="primary" :disabled="!store.pasteLeft && !store.pasteRight" @click="store.comparePasted">
        Compare
      </button>
      <button class="ghost" @click="store.togglePasteMode">Cancel</button>
    </div>
  </div>
</template>

<style scoped>
.paste {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
}
.panes {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 10px;
}
.pane {
  flex: 1;
  resize: none;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  padding: 10px;
  font-family: ui-monospace, 'Cascadia Code', Consolas, monospace;
  font-size: 13px;
  line-height: 1.5;
}
.pane:focus {
  outline: none;
  border-color: var(--accent);
}
.actions {
  display: flex;
  gap: 10px;
  justify-content: center;
}
.primary {
  background: var(--accent);
  border: none;
  border-radius: 6px;
  color: #fff;
  padding: 6px 18px;
  cursor: pointer;
  font-weight: 600;
}
.primary:disabled {
  opacity: 0.4;
  cursor: default;
}
.ghost {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  padding: 6px 14px;
  cursor: pointer;
}
</style>

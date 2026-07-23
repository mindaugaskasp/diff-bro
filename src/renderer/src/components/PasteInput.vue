<script setup>
// Paste-compare with partial-paste support: each side is either a textarea or a
// loaded file, independently — so pasted text on one side can be diffed against
// a real dropped/chosen file on the other. Each pane captures its own drop so
// the window-level diff drop never sees it.
import { useDiffStore } from '../stores/diffStore'
import { useFileTextDrop } from '../composables/useFileDrop'
import AppIcon from './AppIcon.vue'

const store = useDiffStore()

const leftDrop = useFileTextDrop((content, name, path) =>
  store.receivePasteFile('left', { name, content, path })
)
const rightDrop = useFileTextDrop((content, name, path) =>
  store.receivePasteFile('right', { name, content, path })
)
</script>

<template>
  <div class="paste">
    <div class="panes">
      <div
        class="pane-col"
        @dragover.capture.prevent.stop
        @drop.capture.prevent.stop="leftDrop.onDropFile"
      >
        <div class="pane-head">
          <span class="pane-label">Original</span>
          <template v-if="store.pasteLeftFile">
            <span class="file-name" :title="store.pasteLeftFile.name"
              ><AppIcon name="file" /> {{ store.pasteLeftFile.name }}</span
            >
            <button class="link" @click="store.clearPasteFile('left')">use text</button>
          </template>
          <button v-else class="link" @click="store.pastePickFile('left')">load file…</button>
        </div>
        <textarea
          v-if="!store.pasteLeftFile"
          v-model="store.pasteLeft"
          class="pane"
          placeholder="Paste original text here… or drop a file"
          spellcheck="false"
        ></textarea>
        <pre v-else class="pane file-view">{{ store.pasteLeftFile.content }}</pre>
      </div>

      <div
        class="pane-col"
        @dragover.capture.prevent.stop
        @drop.capture.prevent.stop="rightDrop.onDropFile"
      >
        <div class="pane-head">
          <span class="pane-label">Changed</span>
          <template v-if="store.pasteRightFile">
            <span class="file-name" :title="store.pasteRightFile.name"
              ><AppIcon name="file" /> {{ store.pasteRightFile.name }}</span
            >
            <button class="link" @click="store.clearPasteFile('right')">use text</button>
          </template>
          <button v-else class="link" @click="store.pastePickFile('right')">load file…</button>
        </div>
        <textarea
          v-if="!store.pasteRightFile"
          v-model="store.pasteRight"
          class="pane"
          placeholder="Paste changed text here… or drop a file"
          spellcheck="false"
        ></textarea>
        <pre v-else class="pane file-view">{{ store.pasteRightFile.content }}</pre>
      </div>
    </div>
    <div class="actions">
      <button class="btn btn-primary" :disabled="!store.canSave" @click="store.comparePasted">
        Compare
      </button>
      <button class="btn btn-ghost" @click="store.togglePasteMode">Cancel</button>
    </div>
  </div>
</template>

<style scoped src="./styles/PasteInput.css"></style>

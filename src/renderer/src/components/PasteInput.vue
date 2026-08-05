<script setup>
// Paste-compare with partial paste: each side is a textarea or a loaded file,
// independently. Each pane captures its own drop.
import { useDiffStore } from '../stores/diffStore'
import { useFileTextDrop } from '../composables/useFileDrop'
import AppIcon from './AppIcon.vue'
import { MAX_SIDE_NAME } from '../utils/pasteNames'

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
          <span class="pane-label">{{ $t('pasteInput.original') }}</span>
          <template v-if="store.pasteLeftFile">
            <span class="file-name" :title="store.pasteLeftFile.name"
              ><AppIcon name="file" /> {{ store.pasteLeftFile.name }}</span
            >
            <button class="link" @click="store.clearPasteFile('left')">
              {{ $t('pasteInput.useText') }}
            </button>
          </template>
          <template v-else>
            <input
              v-model="store.pasteLeftName"
              class="side-name"
              type="text"
              spellcheck="false"
              :maxlength="MAX_SIDE_NAME"
              :placeholder="$t('pasteInput.nameThisSide')"
              :data-tip="`What to call this side — defaults to &quot;Left (pasted)&quot;`"
              :aria-label="`Name for the left side`"
            />
            <button class="link" @click="store.pastePickFile('left')">load file…</button>
          </template>
        </div>
        <textarea
          v-if="!store.pasteLeftFile"
          v-model="store.pasteLeft"
          class="pane"
          :placeholder="$t('pasteInput.pasteOriginalTextHereOr')"
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
          <span class="pane-label">{{ $t('pasteInput.changed') }}</span>
          <template v-if="store.pasteRightFile">
            <span class="file-name" :title="store.pasteRightFile.name"
              ><AppIcon name="file" /> {{ store.pasteRightFile.name }}</span
            >
            <button class="link" @click="store.clearPasteFile('right')">
              {{ $t('pasteInput.useText') }}
            </button>
          </template>
          <template v-else>
            <input
              v-model="store.pasteRightName"
              class="side-name"
              type="text"
              spellcheck="false"
              :maxlength="MAX_SIDE_NAME"
              :placeholder="$t('pasteInput.nameThisSide')"
              :data-tip="`What to call this side — defaults to &quot;Right (pasted)&quot;`"
              :aria-label="`Name for the right side`"
            />
            <button class="link" @click="store.pastePickFile('right')">load file…</button>
          </template>
        </div>
        <textarea
          v-if="!store.pasteRightFile"
          v-model="store.pasteRight"
          class="pane"
          :placeholder="$t('pasteInput.pasteChangedTextHereOr')"
          spellcheck="false"
        ></textarea>
        <pre v-else class="pane file-view">{{ store.pasteRightFile.content }}</pre>
      </div>
    </div>
    <div class="actions">
      <button class="btn btn-primary" :disabled="!store.canSave" @click="store.comparePasted">
        {{ $t('pasteInput.compare') }}
      </button>
      <button class="btn btn-ghost" @click="store.togglePasteMode">
        {{ $t('common.cancel') }}
      </button>
    </div>
  </div>
</template>

<style scoped src="./styles/PasteInput.css"></style>

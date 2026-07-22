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
      <button
        class="btn btn-primary"
        :disabled="!store.pasteLeft && !store.pasteRight"
        @click="store.comparePasted"
      >
        Compare
      </button>
      <button class="btn btn-ghost" @click="store.togglePasteMode">Cancel</button>
    </div>
  </div>
</template>

<style scoped src="./styles/PasteInput.css"></style>

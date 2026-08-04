<script setup>
// The two halves of the one-time key swap, in the toolbar's empty left third.
// Sharing is the reason External diffs exist, and until now both ends of setting
// it up lived only in the Security menu — reachable once you know the app,
// invisible before that.
import { useCommands } from '../composables/useCommands'
import AppIcon from './AppIcon.vue'

const { run } = useCommands()
</script>

<template>
  <div class="key-actions">
    <button
      class="btn"
      data-tip="Send someone your public key, so they can seal diffs for you"
      @click="run('export-pubkey')"
    >
      <AppIcon name="fingerprint" />My key
    </button>
    <button
      class="btn"
      data-tip="Open a .diffbrokey someone sent you, so you can seal diffs for them"
      @click="run('add-trusted-key')"
    >
      <AppIcon name="plus" />Trusted key
    </button>
  </div>
</template>

<style scoped src="./styles/KeyActions.css"></style>

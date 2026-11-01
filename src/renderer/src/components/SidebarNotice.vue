<script setup>
import { useUiStore } from '../stores/uiStore'

const ui = useUiStore()
</script>

<template>
  <Transition name="sidebar-notice">
    <p v-if="ui.sidebarNotice" class="sidebar-notice" role="status" aria-live="polite">
      {{ ui.sidebarNotice }}
    </p>
  </Transition>
</template>

<style scoped src="./styles/SidebarNotice.css"></style>

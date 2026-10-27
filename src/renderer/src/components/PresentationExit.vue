<script setup>
import AppIcon from './AppIcon.vue'
import { useCommands } from '../composables/useCommands'

const { run } = useCommands()
</script>

<template>
  <button type="button" class="btn btn-sm present-exit" @click="run('toggle-presentation')">
    <AppIcon name="restore" />{{ $t('presentation.exit') }}
  </button>
</template>

<style scoped src="./styles/PresentationExit.css"></style>

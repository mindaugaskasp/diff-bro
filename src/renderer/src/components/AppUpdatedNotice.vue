<script setup>
import { listenForAppUpdate, useAppUpdated } from '../composables/useAppUpdated'
import AppIcon from './AppIcon.vue'

listenForAppUpdate()
const { version, blocked, restart, dismiss } = useAppUpdated()
</script>

<template>
  <transition name="fade">
    <div v-if="version" class="update-notice" role="status">
      <AppIcon name="refresh" class="un-icon" />
      <span class="un-text">
        {{
          blocked
            ? $t('appUpdatedNotice.saveSnippetFirst')
            : $t('appUpdatedNotice.updated', { version })
        }}
      </span>
      <button class="btn btn-sm" @click="restart">{{ $t('appUpdatedNotice.restart') }}</button>
      <button
        class="un-x"
        :data-tip="$t('appUpdatedNotice.dismiss')"
        :aria-label="$t('appUpdatedNotice.dismiss')"
        @click="dismiss"
      >
        <AppIcon name="x" />
      </button>
    </div>
  </transition>
</template>

<style scoped src="./styles/AppUpdatedNotice.css"></style>

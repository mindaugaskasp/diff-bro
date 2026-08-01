<script setup>
// A file moved under the comparison. Its own label rather than the 5 s toast:
// it holds long enough to read, and can be dismissed by hand.
import { useDiffStore } from '../stores/diffStore'
import AppIcon from './AppIcon.vue'

const store = useDiffStore()
</script>

<template>
  <transition name="fade">
    <div v-if="store.diskNotice" class="disk-notice" role="status">
      <AppIcon name="clock" class="dn-icon" />
      <span class="dn-text">{{ store.diskNotice }}</span>
      <button
        class="dn-x"
        data-tip="Dismiss"
        aria-label="Dismiss the file-changed notice"
        @click="store.dismissDiskNotice()"
      >
        <AppIcon name="x" />
      </button>
    </div>
  </transition>
</template>

<style scoped src="./styles/DiskChangeNotice.css"></style>

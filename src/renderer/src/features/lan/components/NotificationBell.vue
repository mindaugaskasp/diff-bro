<script setup>
import { computed, ref } from 'vue'
import AppIcon from '../../../components/AppIcon.vue'
import NotificationList from './NotificationList.vue'
import { useLanStore } from '../lanStore'

const lan = useLanStore()
const trigger = ref(null)
const count = computed(() => lan.items.length + lan.liveRequests.length)
const at = computed(() => {
  if (!lan.bellOpen || !trigger.value) return null
  const r = trigger.value.getBoundingClientRect()
  return { right: Math.max(8, window.innerWidth - r.right), top: r.bottom + 6 }
})
</script>

<template>
  <button
    v-if="lan.showsBell"
    ref="trigger"
    type="button"
    class="btn btn-sm btn-square bell"
    data-testid="lan-bell"
    :aria-label="$t('lan.bell.label', count)"
    :data-tip="$t('lan.bell.title')"
    :aria-expanded="lan.bellOpen"
    @click="lan.toggleBell()"
  >
    <AppIcon :name="lan.isSilenced ? 'bell-off' : 'bell'" />
    <span v-if="count" class="badge">{{ count }}</span>
  </button>
  <Teleport to="body">
    <div v-if="at" class="ctx-backdrop" @pointerdown="lan.closeBell()">
      <NotificationList :style="{ right: `${at.right}px`, top: `${at.top}px` }" @pointerdown.stop />
    </div>
  </Teleport>
</template>

<style scoped src="./styles/NotificationBell.css"></style>

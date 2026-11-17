<script setup>
import { computed } from 'vue'
import NotificationCard from './NotificationCard.vue'
import { useLanStore } from '../lanStore'

const lan = useLanStore()
const isEmpty = computed(() => !lan.items.length && !lan.requests.length)
const headerKey = computed(() => {
  if (!lan.popups) return 'lan.bell.popupsOff'
  return lan.isSilenced ? 'lan.bell.silenced' : 'lan.bell.waiting'
})
</script>

<template>
  <div class="popover notifications" role="dialog" :aria-label="$t('lan.bell.title')">
    <div class="head">
      <span class="title">{{ $t('lan.bell.title') }}</span>
      <span v-if="!isEmpty || lan.isSilenced" class="meta">
        {{ $t(headerKey, { n: lan.items.length, time: lan.silencedUntilText }) }}
      </span>
    </div>
    <p v-if="isEmpty" class="empty">{{ $t('lan.bell.empty') }}</p>
    <NotificationCard v-for="r in lan.requests" :key="r.id" :request="r" />
    <NotificationCard v-for="item in lan.items" :key="item.id" :item="item" />
  </div>
</template>

<style scoped src="./styles/NotificationList.css"></style>

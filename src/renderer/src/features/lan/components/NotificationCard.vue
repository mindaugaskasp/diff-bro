<script setup>
import { computed } from 'vue'
import AppIcon from '../../../components/AppIcon.vue'
import { useCountdown } from '../../../composables/useCountdown'
import { relativeAge } from '../../../utils/countdown'
import { useLanStore } from '../lanStore'
import { shaped } from '../../../utils/props'

const props = defineProps({
  /** @type {import('vue').PropType<import('../../../types').LanItem|null>} */
  item: {
    type: Object,
    default: null,
    validator: (v) => v === null || shaped('id', 'kind', 'name', 'from', 'receivedAt')(v)
  },
  /** @type {import('vue').PropType<import('../../../types').LanPairingView|null>} */
  request: {
    type: Object,
    default: null,
    validator: (v) => v === null || shaped('id', 'stage', 'name', 'expiresAt')(v)
  }
})
const lan = useLanStore()
const isLive = computed(() => props.request?.stage === 'show-code')
const left = useCountdown(() => props.request?.expiresAt ?? 0)
const icon = computed(() => {
  if (props.request) return isLive.value ? 'key' : 'clock'
  return props.item.kind === 'snippet' ? 'code' : 'diff'
})
</script>

<template>
  <div class="card" :class="{ faded: request && !isLive }" data-testid="lan-card">
    <div class="line">
      <span class="glyph-well" data-hue="received"><AppIcon :name="icon" /></span>
      <span class="text">
        <span class="top">
          <span class="name">
            <template v-if="request">
              {{ $t(isLive ? 'lan.code.title' : 'lan.bell.requestEnded', { name: request.name }) }}
            </template>
            <template v-else>
              {{
                $t(item.kind === 'snippet' ? 'lan.items.sharedSnippet' : 'lan.items.sharedDiff', {
                  name: item.from
                })
              }}
            </template>
          </span>
          <span class="time">
            {{
              request
                ? isLive
                  ? $t('lan.bell.left', { time: left })
                  : ''
                : relativeAge(item.receivedAt, Date.now(), $t)
            }}
          </span>
        </span>
        <span class="body">
          {{ request ? $t(isLive ? 'lan.bell.codeReady' : 'lan.bell.askAgain') : item.name }}
        </span>
      </span>
    </div>
    <div v-if="item || isLive" class="actions">
      <button
        type="button"
        class="btn btn-sm"
        @click="item ? lan.declineItem(item.id) : lan.declineRequest(request)"
      >
        {{ $t('lan.items.decline') }}
      </button>
      <button
        type="button"
        class="btn btn-sm"
        @click="item ? lan.openItem(item.id) : lan.showRequest(request)"
      >
        {{ $t(item ? 'lan.items.open' : 'lan.bell.showCode') }}
      </button>
    </div>
  </div>
</template>

<style scoped src="./styles/NotificationCard.css"></style>

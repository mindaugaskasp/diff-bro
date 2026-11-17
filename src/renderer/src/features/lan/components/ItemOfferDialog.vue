<script setup>
import { computed } from 'vue'
import BaseDialog from '../../../components/BaseDialog.vue'
import AppIcon from '../../../components/AppIcon.vue'
import SilenceMenu from './SilenceMenu.vue'
import { daysLeft } from '../../../utils/countdown'
import { useLanStore } from '../lanStore'

const lan = useLanStore()
const item = computed(() => lan.currentOffer)
const isSnippet = computed(() => item.value.kind === 'snippet')
const days = computed(() => daysLeft(item.value.expiresAt, Date.now()))
</script>

<template>
  <BaseDialog
    width="460px"
    :title="$t(isSnippet ? 'lan.items.sharedSnippet' : 'lan.items.sharedDiff', { name: item.from })"
    @close="lan.dismissOffers()"
  >
    <div class="offer">
      <span class="glyph-well" data-hue="received"
        ><AppIcon :name="isSnippet ? 'code' : 'diff'"
      /></span>
      <span class="offer-text">
        <span class="offer-name">{{ item.name }}</span>
        <span class="offer-meta">{{ $t('lan.items.deletesIn', days) }}</span>
      </span>
      <span v-if="lan.offerQueue.length > 1" class="count-pill">
        {{ $t('lan.items.ofTotal', { n: 1, total: lan.offerQueue.length }) }}
      </span>
    </div>
    <template #actions>
      <SilenceMenu />
      <span class="spacer" />
      <button type="button" class="btn btn-ghost" @click="lan.declineItem(item.id)">
        {{ $t('lan.items.decline') }}
      </button>
      <button type="button" class="btn btn-primary" @click="lan.openItem(item.id)">
        {{ $t('lan.items.open') }}
      </button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/ItemOfferDialog.css"></style>

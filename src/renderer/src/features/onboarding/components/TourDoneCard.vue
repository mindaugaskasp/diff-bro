<script setup>
import { computed } from 'vue'
import AppIcon from '../../../components/AppIcon.vue'
import { tourById } from '../tourRegistry'

const props = defineProps({
  tourId: { type: String, required: true }
})
defineEmits(['close', 'start'])

const card = computed(() => tourById(props.tourId)?.doneCard ?? null)
const nextTours = computed(() => (card.value?.next ?? []).map(tourById).filter(Boolean))
</script>

<template>
  <div v-if="card" class="tour-done" role="status" :data-tour-done="tourId">
    <div class="td-head">
      <p class="td-title">{{ $t(card.titleKey) }}</p>
      <button
        type="button"
        class="btn btn-icon"
        :aria-label="$t('onboarding.core.done.close')"
        :data-tip="$t('onboarding.core.done.close')"
        @click="$emit('close')"
      >
        <AppIcon name="x" />
      </button>
    </div>
    <p v-if="card.bodyKey" class="td-body">{{ $t(card.bodyKey) }}</p>
    <p v-if="nextTours.length" class="td-next">
      <button
        v-for="next in nextTours"
        :key="next.id"
        type="button"
        class="btn btn-sm"
        @click="$emit('start', next.id)"
      >
        {{ $t(next.nameKey) }}
      </button>
    </p>
  </div>
</template>

<style scoped src="./styles/TourDoneCard.css"></style>

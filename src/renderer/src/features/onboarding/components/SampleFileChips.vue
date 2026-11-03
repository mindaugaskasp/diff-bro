<script setup>
import { useOnboardingStore } from '../onboardingStore'
import { SAMPLE_NAMES } from '../tourSample'
import { setSampleDragPayload } from '../../../utils/snippetSource'
import AppIcon from '../../../components/AppIcon.vue'

const tour = useOnboardingStore()
</script>

<template>
  <section v-if="tour.isOffering" class="sample-offer" data-tour="sample-chips">
    <p class="so-label">{{ $t('onboarding.tryIt', { step: 1, count: tour.stepCount }) }}</p>
    <p class="so-title">{{ $t('onboarding.core.drop.title') }}</p>
    <ul class="so-chips">
      <li
        v-for="name in SAMPLE_NAMES"
        :key="name"
        class="so-chip"
        draggable="true"
        @dragstart="setSampleDragPayload($event.dataTransfer)"
      >
        <AppIcon name="file" />
        <span>{{ name }}</span>
      </li>
    </ul>
    <p class="so-actions">
      <button type="button" class="so-link" @click="tour.loadSample()">
        {{ $t('onboarding.core.drop.load') }}
      </button>
      <button type="button" class="so-link" @click="tour.skip()">
        {{ $t('onboarding.skip') }}
      </button>
    </p>
  </section>
</template>

<style scoped src="./styles/SampleFileChips.css"></style>

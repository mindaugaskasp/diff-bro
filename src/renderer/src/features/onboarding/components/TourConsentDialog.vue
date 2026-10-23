<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { TOUR_TOPICS } from '../../../utils/tourSteps'
import { useOnboardingStore } from '../onboardingStore'
import AppIcon from '../../../components/AppIcon.vue'
import BaseDialog from '../../../components/BaseDialog.vue'

const tour = useOnboardingStore()
const { t } = useI18n()
const isUpdate = computed(() => tour.promptKind === 'update')
const title = computed(() =>
  isUpdate.value
    ? t('onboarding.tourConsent.updateTitle', tour.promptSteps.length)
    : t('onboarding.tourConsent.title')
)
</script>

<template>
  <BaseDialog v-if="tour.promptOpen" width="420px" :title="title" @close="tour.deferPrompt()">
    <p v-if="!isUpdate" class="dialog-note">
      {{ $t('onboarding.tourConsent.intro', { n: tour.promptSteps.length }) }}
    </p>
    <ul class="tour-topics">
      <template v-if="isUpdate">
        <li v-for="step in tour.promptSteps" :key="step.id">{{ $t(step.titleKey) }}</li>
      </template>
      <template v-else>
        <li v-for="topic in TOUR_TOPICS" :key="topic.labelKey">
          <span class="glyph-well" :data-hue="topic.hue"><AppIcon :name="topic.icon" /></span>
          {{ $t(topic.labelKey) }}
        </li>
      </template>
    </ul>
    <p class="tour-later">{{ $t('onboarding.tourConsent.later') }}</p>
    <template #actions>
      <button class="btn btn-ghost" @click="tour.declinePrompt()">
        {{ $t('onboarding.tourConsent.noThanks') }}
      </button>
      <button class="btn btn-primary" @click="tour.acceptPrompt()">
        {{ $t('onboarding.tourConsent.start') }}
      </button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/TourConsentDialog.css"></style>

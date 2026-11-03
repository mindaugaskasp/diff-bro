<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '../../../components/AppIcon.vue'
import { useOnboardingStore } from '../onboardingStore'
import { useReleaseOffer } from '../useReleaseOffer'

const tour = useOnboardingStore()
const { locale, t } = useI18n()
const { cardTours, single, version, visible } = useReleaseOffer()

const names = computed(() =>
  new Intl.ListFormat(locale.value, { type: 'conjunction' }).format(
    cardTours.value.map((entry) => t(entry.nameKey))
  )
)
</script>

<template>
  <div v-if="visible" class="release-card" role="status" data-release-card>
    <div class="rc-head">
      <span class="rc-kicker">
        <AppIcon name="sparkle" />{{ $t('onboarding.release.newIn', { version }) }}
      </span>
      <button
        type="button"
        class="btn btn-icon"
        :aria-label="$t('onboarding.release.close')"
        :data-tip="$t('onboarding.release.close')"
        @click="tour.dismissReleases()"
      >
        <AppIcon name="x" />
      </button>
    </div>
    <template v-if="single">
      <p class="rc-title">{{ $t(single.nameKey) }}</p>
      <p class="rc-body">{{ $t(single.summaryKey, { count: single.steps.length }) }}</p>
    </template>
    <template v-else>
      <p class="rc-title">{{ $t('onboarding.release.many', cardTours.length) }}</p>
      <p class="rc-body">{{ names }}</p>
    </template>
    <div class="rc-actions">
      <button type="button" class="btn btn-sm btn-ghost" @click="tour.laterReleases()">
        {{ $t('onboarding.release.later') }}
      </button>
      <button
        v-if="single"
        type="button"
        class="btn btn-sm btn-primary"
        @click="tour.showReleaseTour()"
      >
        {{ $t('onboarding.release.showMe', single.steps.length) }}
      </button>
      <button v-else type="button" class="btn btn-sm btn-primary" @click="tour.openReleaseTours()">
        {{ $t('onboarding.release.showTours') }}
      </button>
    </div>
  </div>
</template>

<style scoped src="./styles/ReleaseTourCard.css"></style>

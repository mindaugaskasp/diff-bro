<script setup>
// Asked the moment run one ends, never deferred to a future launch: this app is
// left open for weeks, so "next launch" could be a month away — run two would
// land on someone who has forgotten there was a tour, or never arrive at all.
import { useOnboardingStore } from '../onboardingStore'
import BaseDialog from '../../../components/BaseDialog.vue'

const tour = useOnboardingStore()
</script>

<template>
  <BaseDialog
    v-if="tour.promptOpen"
    width="380px"
    :title="$t('onboarding.continueTourDialog.threeMoreTips')"
    @close="tour.deferPrompt()"
  >
    <p class="dialog-note">
      {{ $t('onboarding.continueTourDialog.thatIsTheEverydayRoute') }}
    </p>
    <template #actions>
      <button class="btn btn-ghost" @click="tour.deferPrompt()">
        {{ $t('onboarding.continueTourDialog.notNow') }}
      </button>
      <button class="btn btn-primary" @click="tour.acceptPrompt()">
        {{ $t('onboarding.continueTourDialog.showMe') }}
      </button>
    </template>
  </BaseDialog>
</template>

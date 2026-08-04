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
    title="Three more tips?"
    @close="tour.deferPrompt()"
  >
    <p class="dialog-note">
      That is the everyday route covered. The rest is about keeping your own material in here —
      saving a snippet, comparing two of them, and previewing a diagram. About a minute.
    </p>
    <template #actions>
      <button class="btn btn-ghost" @click="tour.deferPrompt()">Not now</button>
      <button class="btn btn-primary" @click="tour.acceptPrompt()">Show me</button>
    </template>
  </BaseDialog>
</template>

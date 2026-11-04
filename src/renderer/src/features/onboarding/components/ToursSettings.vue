<script setup>
import { onBeforeUnmount, ref } from 'vue'
import SettingToggle from '../../../components/SettingToggle.vue'
import { useOnboardingStore } from '../onboardingStore'
import TourRow from './TourRow.vue'

const tour = useOnboardingStore()
defineEmits(['take'])

const NOTICE_MS = 2500
const broughtBack = ref(false)
let timer = 0
function bringBack() {
  tour.bringBackTips()
  broughtBack.value = true
  clearTimeout(timer)
  timer = setTimeout(() => (broughtBack.value = false), NOTICE_MS)
}
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <section class="tours-settings" data-tour="tours-page">
    <h4>{{ $t('settingsTours.title') }}</h4>
    <p class="ts-intro">{{ $t('settingsTours.intro') }}</p>
    <TourRow
      v-for="row in tour.tourRows.tours"
      :key="row.id"
      :row="row"
      :disabled="tour.isRunning"
      @take="$emit('take', $event)"
    />
    <template v-for="group in tour.tourRows.releases" :key="group.version">
      <h5 class="ts-sub">{{ $t('settingsTours.newIn', { version: group.version }) }}</h5>
      <TourRow
        v-for="row in group.rows"
        :key="row.id"
        :row="row"
        :disabled="tour.isRunning"
        @take="$emit('take', $event)"
      />
    </template>
    <h5 class="ts-sub">{{ $t('settingsTours.afterUpdate') }}</h5>
    <SettingToggle :checked="tour.offerTours" @change="tour.setOfferTours">
      {{ $t('settingsTours.offerTours') }}
    </SettingToggle>
    <h5 class="ts-sub">{{ $t('settingsTours.dailyTips') }}</h5>
    <SettingToggle :checked="tour.tips.on" @change="tour.setShowTips">
      {{ $t('settingsTours.showTips') }}
    </SettingToggle>
    <p class="ts-bring-back">
      <button
        type="button"
        class="btn btn-sm"
        :disabled="!tour.tips.known.length"
        @click="bringBack"
      >
        {{ $t('settingsTours.bringBack') }}
      </button>
      <span v-if="broughtBack" class="ts-notice" role="status">
        {{ $t('settingsTours.broughtBack') }}
      </span>
    </p>
  </section>
</template>

<style scoped src="./styles/ToursSettings.css"></style>

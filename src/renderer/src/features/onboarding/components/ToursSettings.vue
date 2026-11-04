<script setup>
import SettingToggle from '../../../components/SettingToggle.vue'
import { useOnboardingStore } from '../onboardingStore'
import TourRow from './TourRow.vue'

const tour = useOnboardingStore()
defineEmits(['take'])
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
  </section>
</template>

<style scoped src="./styles/ToursSettings.css"></style>

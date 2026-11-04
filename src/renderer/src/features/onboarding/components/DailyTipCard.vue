<script setup>
import AppIcon from '../../../components/AppIcon.vue'
import { useOnboardingStore } from '../onboardingStore'
import { useDailyTip } from '../useDailyTip'
import TipCopy from './TipCopy.vue'

defineProps({ canShow: { type: Boolean, default: false } })
const tour = useOnboardingStore()
const { tip, visible, top } = useDailyTip()
</script>

<template>
  <div
    v-if="visible"
    class="daily-tip"
    role="status"
    :style="{ top: `${top}px` }"
    :data-daily-tip="tip.id"
  >
    <div class="dt-head">
      <span class="dt-kicker"><AppIcon name="bulb" />{{ $t('tips.kicker') }}</span>
      <button
        type="button"
        class="btn btn-icon"
        :aria-label="$t('tips.close')"
        :data-tip="$t('tips.close')"
        @click="tour.closeTip()"
      >
        <AppIcon name="x" />
      </button>
    </div>
    <p class="dt-title">{{ $t(tip.titleKey) }}</p>
    <TipCopy :tip="tip" class="dt-body" />
    <div class="dt-foot">
      <button type="button" class="link-btn dt-off" @click="tour.setShowTips(false)">
        {{ $t('tips.off') }}
      </button>
      <span class="dt-actions">
        <button type="button" class="btn btn-sm btn-ghost" @click="tour.knowTip()">
          {{ $t('tips.knew') }}
        </button>
        <button v-if="canShow" type="button" class="btn btn-sm btn-primary" @click="tour.showTip()">
          {{ $t('tips.showMe') }}
        </button>
      </span>
    </div>
  </div>
</template>

<style scoped src="./styles/DailyTipCard.css"></style>

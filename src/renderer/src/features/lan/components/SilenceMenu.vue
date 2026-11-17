<script setup>
import { nextTick, ref, watch } from 'vue'
import AppIcon from '../../../components/AppIcon.vue'
import { useLanStore } from '../lanStore'
import { SILENCE_CHOICES } from '../silenceChoices'

const TIMED = SILENCE_CHOICES.filter((c) => c.value !== 'forever')
const lan = useLanStore()
const trigger = ref(null)
const menu = ref(null)
const at = ref(null)
const emit = defineEmits(['open'])
watch(at, (value) => emit('open', !!value))

async function toggle() {
  if (at.value) return (at.value = null)
  const r = trigger.value.getBoundingClientRect()
  at.value = { x: r.left, y: r.bottom + 4 }
  await nextTick()
  menu.value?.querySelector('button')?.focus()
}

function pick(choice) {
  at.value = null
  lan.silence(choice)
}
</script>

<template>
  <span class="silence">
    <span class="silence-label">{{ $t('lan.silence.label') }}</span>
    <button
      ref="trigger"
      type="button"
      class="btn btn-sm"
      aria-haspopup="menu"
      :aria-expanded="!!at"
      @click="toggle"
    >
      {{ $t(TIMED[4].labelKey) }}
      <AppIcon name="chevron-down" />
    </button>
  </span>
  <Teleport to="body">
    <div v-if="at" class="ctx-backdrop" @pointerdown="at = null">
      <div
        ref="menu"
        class="ctx"
        role="menu"
        tabindex="-1"
        :aria-label="$t('lan.silence.label')"
        :style="{ left: `${at.x}px`, top: `${at.y}px` }"
        @pointerdown.stop
        @keydown.esc.stop="at = null"
      >
        <button
          v-for="choice in TIMED"
          :key="choice.value"
          type="button"
          class="ctx-item"
          role="menuitem"
          @click="pick(choice.value)"
        >
          <span class="ctx-label">{{ $t(choice.labelKey) }}</span>
        </button>
        <div class="ctx-sep" role="separator" />
        <button type="button" class="ctx-item forever" role="menuitem" @click="pick('forever')">
          <span class="ctx-label">{{ $t('lan.silence.choice.forever') }}</span>
          <span class="forever-why">{{ $t('lan.silence.foreverWhy') }}</span>
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped src="./styles/SilenceMenu.css"></style>

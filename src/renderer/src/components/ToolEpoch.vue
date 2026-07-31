<script setup>
// The Epoch / Date tool panel — hosted in both the Tools dialog and the Quick
// Look launcher. Bidirectional: pick a date → epoch, and an epoch → readable
// rows (ISO / relative / local). Pure conversions live in utils/epoch.js.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { nowEpoch, epochRows, pickToEpoch, nowLocalInput } from '../utils/epoch'
import { isDarkTheme } from '../utils/themes'
import { useDiffStore } from '../stores/diffStore'
import SegmentedControl from './SegmentedControl.vue'
import AppIcon from './AppIcon.vue'

defineProps({ compact: { type: Boolean, default: false } })

const diff = useDiffStore()
// Theme the native date-picker dropdown (calendar + the HH:MM spinners); without
// color-scheme it renders as a light widget on a dark surface.
const colorScheme = computed(() =>
  isDarkTheme(document.documentElement.dataset.theme || diff.theme) ? 'dark' : 'light'
)

const UNITS = [
  { value: 'seconds', label: 'seconds' },
  { value: 'millis', label: 'millis' }
]
const ZONES = [
  { value: 'UTC', label: 'UTC' },
  { value: 'Local', label: 'Local' }
]

const unit = ref('seconds')
const tz = ref('UTC')
const picked = ref('')
const epochIn = ref('')

const live = ref(nowEpoch(unit.value))
const timer = setInterval(() => (live.value = nowEpoch(unit.value)), 1000)
watch(unit, () => (live.value = nowEpoch(unit.value)))
onBeforeUnmount(() => clearInterval(timer))

const pickedEpoch = computed(() => pickToEpoch(picked.value, { unit: unit.value, tz: tz.value }))
const rows = computed(() => epochRows(epochIn.value, { unit: unit.value }))

// The field shows/accepts "YYYY-MM-DD HH:MM"; the calendar button fills it and
// "Now" seeds it — both from the native "…THH:MM" form.
const setNow = () => (picked.value = nowLocalInput(tz.value).replace('T', ' '))
const fromPicker = (e) => {
  if (e.target.value) picked.value = e.target.value.replace('T', ' ')
}

const copied = ref('')
async function copy(text) {
  if (!text) return
  const res = await window.api.copyText(text)
  if (!res?.ok) return
  copied.value = text
  setTimeout(() => (copied.value = ''), 900)
}
</script>

<template>
  <div class="te" :class="{ compact }">
    <div class="te-now">
      <span class="te-now-l"><AppIcon name="clock" class="te-tick" /> Now</span>
      <button class="te-now-v" :data-tip="`Copy ${live}`" @click="copy(live)">{{ live }}</button>
    </div>

    <div class="te-controls">
      <SegmentedControl v-model:value="unit" label="Unit" :options="UNITS" />
      <SegmentedControl v-model:value="tz" label="Picked time" :options="ZONES" />
    </div>

    <div class="te-lanes">
      <section class="te-lane">
        <span class="te-lane-k"><AppIcon name="calendar" /> Date → epoch</span>
        <div class="te-in-row">
          <input
            v-model="picked"
            type="text"
            class="te-input"
            placeholder="YYYY-MM-DD HH:MM"
            spellcheck="false"
            aria-label="Date and time, as YYYY-MM-DD HH:MM"
          />
          <span class="te-cal" title="Pick from a calendar">
            <AppIcon name="calendar" class="te-cal-ico" />
            <input
              type="datetime-local"
              class="te-cal-native"
              tabindex="-1"
              :style="{ colorScheme }"
              aria-label="Pick from a calendar"
              @input="fromPicker"
            />
          </span>
          <button class="btn btn-sm" @click="setNow">Now</button>
        </div>
        <div class="te-out">
          <span class="te-out-v">{{ pickedEpoch || '—' }}</span>
          <button
            v-if="pickedEpoch"
            class="te-copy"
            aria-label="Copy epoch"
            data-tip="Copy"
            @click="copy(pickedEpoch)"
          >
            <AppIcon :name="copied === pickedEpoch ? 'check' : 'copy'" />
          </button>
        </div>
      </section>

      <section class="te-lane">
        <span class="te-lane-k">Epoch → date</span>
        <input
          v-model="epochIn"
          type="text"
          inputmode="numeric"
          class="te-input"
          placeholder="1753905600"
          aria-label="Unix timestamp"
        />
        <div v-if="rows.length" class="te-rows">
          <div v-for="r in rows" :key="r.key" class="te-res">
            <span class="te-res-k">{{ r.key }}</span>
            <span class="te-res-v">{{ r.value }}</span>
            <button class="te-copy" aria-label="Copy" @click="copy(r.value)">
              <AppIcon :name="copied === r.value ? 'check' : 'copy'" />
            </button>
          </div>
        </div>
        <p v-else-if="epochIn" class="te-hint">Enter Unix {{ unit }} to see the date.</p>
      </section>
    </div>
  </div>
</template>

<style scoped src="./styles/ToolEpoch.css"></style>

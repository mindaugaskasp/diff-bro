<script setup>
// The regex tester. Matches are highlighted by rendering the SEGMENTS the pure
// engine returns as spans — `v-html` is banned (rule 8), and building markup
// from a user's own subject is exactly what that rule is for.
import { computed, ref } from 'vue'
import { FLAGS, replaceAll, runRegex } from '../utils/regex'
import AppIcon from './AppIcon.vue'
import { useCopyFeedback } from '../composables/useCopyFeedback'

defineProps({ compact: { type: Boolean, default: false } })

const pattern = ref('')
const flags = ref(['g'])
const subject = ref('')
const replacement = ref('')
const selected = ref(0)

const toggleFlag = (f) =>
  (flags.value = flags.value.includes(f) ? flags.value.filter((x) => x !== f) : [...flags.value, f])

const result = computed(() => runRegex(pattern.value, flags.value, subject.value))
const current = computed(() => result.value.matches[selected.value] ?? result.value.matches[0])
const replaced = computed(() =>
  replacement.value
    ? replaceAll(pattern.value, flags.value, subject.value, replacement.value)
    : null
)

const { copied, flash } = useCopyFeedback()
async function copyOutput() {
  const text = replaced.value?.output
  if (!text) return
  const res = await window.api.copyText(text)
  if (!res?.ok) return
  flash()
}
</script>

<template>
  <div class="tre" :class="{ compact }">
    <div class="tre-pat">
      <span class="tre-slash">/</span>
      <input
        v-model="pattern"
        class="tre-field mono"
        spellcheck="false"
        placeholder="pattern"
        :aria-label="$t('toolRegex.regularExpression')"
      />
      <span class="tre-slash">/</span>
    </div>
    <div class="tre-flags">
      <button
        v-for="f in FLAGS"
        :key="f"
        class="tre-flag"
        :class="{ on: flags.includes(f) }"
        :aria-pressed="flags.includes(f)"
        :data-tip="$t('toolRegex.flagTip', { flag: f })"
        @click="toggleFlag(f)"
      >
        {{ f }}
      </button>
    </div>

    <textarea
      v-model="subject"
      class="tre-in"
      :placeholder="$t('toolRegex.pasteTheTextToTest')"
      spellcheck="false"
      :aria-label="$t('toolRegex.subjectText')"
    ></textarea>

    <p v-if="result.error" class="tre-err">{{ result.error }}</p>
    <template v-else>
      <div class="tre-bh">
        <span>{{ $t('count.matches', result.matches.length) }}</span>
        <span v-if="result.truncated" class="tre-warn">
          {{ $t('toolRegex.tooSlow') }}
        </span>
        <span v-else-if="result.capped" class="tre-warn">{{
          $t('toolRegex.firstMatchesOnly')
        }}</span>
      </div>

      <p class="tre-out mono">
        <span v-for="(seg, i) in result.segments" :key="i" :class="{ hit: seg.match }">{{
          seg.text
        }}</span>
      </p>

      <div v-if="current?.groups.length" class="tre-groups">
        <div v-for="g in current.groups" :key="g.name" class="tre-group">
          <span class="tre-gname">{{ g.name }}</span>
          <span class="tre-gval mono">{{ g.value ?? '—' }}</span>
        </div>
      </div>

      <div class="tre-replace">
        <input
          v-model="replacement"
          class="tre-field"
          spellcheck="false"
          :placeholder="$t('toolRegex.replacePlaceholder')"
          :aria-label="$t('toolRegex.replacement')"
        />
        <button
          v-if="replaced?.output"
          class="tre-copy"
          :aria-label="$t('common.copy')"
          :data-tip="$t('common.copy')"
          @click="copyOutput"
        >
          <AppIcon :name="copied ? 'check' : 'copy'" />
        </button>
      </div>
      <pre v-if="replaced?.output" class="tre-preview mono">{{ replaced.output }}</pre>
    </template>
  </div>
</template>

<style scoped src="./styles/ToolRegex.css"></style>

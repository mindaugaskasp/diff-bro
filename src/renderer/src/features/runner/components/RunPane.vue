<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useCopyFeedback } from '../../../composables/useCopyFeedback'
import { useSnippetStore } from '../../../stores/snippetStore'
import { t } from '../../../i18n'
import AppIcon from '../../../components/AppIcon.vue'
import { labelKeyOf } from '../../../../../shared/snippetLanguages'
import { shaped } from '../../../utils/props'
import { runDetails } from '../runDetails'
import { useRunnerStore } from '../runnerStore'

const props = defineProps({
  tabKey: { type: String, required: true },
  /** @type {import('vue').PropType<import('../../../types').SnippetRun>} */
  snippetRun: { type: Object, required: true, validator: shaped('runAgain') }
})

const runner = useRunnerStore()
const snippets = useSnippetStore()
const run = computed(() => runner.runFor(props.tabKey))
const running = computed(() => run.value?.state === 'running')

const STATES = {
  running: 'runner.pane.running',
  finished: 'runner.pane.finished',
  failed: 'runner.pane.failed',
  stopped: 'runner.pane.stopped'
}
const stateIcon = computed(() => (run.value?.state === 'failed' ? 'alert' : 'check'))

const elapsed = ref(0)
let clock = null
watch(
  running,
  (on) => {
    clearInterval(clock)
    elapsed.value = 0
    if (on) clock = setInterval(() => elapsed.value++, 1000)
  },
  { immediate: true }
)
onBeforeUnmount(() => clearInterval(clock))

const details = computed(() => {
  const r = run.value
  const name = [t(labelKeyOf(r.language)), r.version].filter(Boolean).join(' ')
  const rest = runDetails(r, { elapsedSeconds: elapsed.value })
  return [name, ...rest.map((d) => t(d.key, d.params))].join(' · ')
})

// Follows the output, unless you have scrolled up to read it.
const FOLLOW_SLACK_PX = 24
const out = ref(null)
watch(
  () => run.value?.blocks.reduce((chars, b) => chars + b.text.length, 0),
  () => {
    const el = out.value
    if (!el || el.scrollHeight - el.scrollTop - el.clientHeight > FOLLOW_SLACK_PX) return
    nextTick(() => (el.scrollTop = el.scrollHeight))
  }
)

const { copied, flash } = useCopyFeedback()
async function copy() {
  const res = await window.api.copyText(runner.outputText(props.tabKey))
  if (res?.ok) flash()
}
const saveAsSnippet = () =>
  snippets.startNewSnippetFrom(runner.outputText(props.tabKey), 'plaintext')
</script>

<template>
  <section v-if="run" class="run-pane" :aria-label="$t('runner.pane.output')">
    <div class="run-head band">
      <span class="run-state" :class="run.state">
        <i v-if="running" class="run-spin" />
        <AppIcon v-else :name="stateIcon" />
        {{ $t(STATES[run.state]) }}
      </span>
      <span class="run-details">{{ details }}</span>
      <span class="run-gap" />
      <template v-if="!running">
        <button type="button" class="btn btn-sm" @click="saveAsSnippet">
          {{ $t('textToolDialog.saveAsSnippet') }}
        </button>
        <button
          type="button"
          class="btn btn-sm btn-square"
          :aria-label="$t('runner.pane.runAgain')"
          :data-tip="$t('runner.pane.runAgain')"
          @click="snippetRun.runAgain()"
        >
          <AppIcon name="refresh" />
        </button>
        <button
          type="button"
          class="btn btn-sm btn-square"
          :aria-label="$t('runner.pane.copyOutput')"
          :data-tip="$t('runner.pane.copyOutput')"
          @click="copy"
        >
          <AppIcon :name="copied ? 'check' : 'copy'" />
        </button>
        <button
          type="button"
          class="btn btn-sm btn-square"
          :aria-label="$t('runner.pane.clear')"
          :data-tip="$t('runner.pane.clear')"
          @click="runner.clear(tabKey)"
        >
          <AppIcon name="clear" />
        </button>
      </template>
      <button
        type="button"
        class="btn btn-sm btn-square"
        :aria-label="$t('common.close')"
        :data-tip="$t('common.close')"
        @click="runner.close(tabKey)"
      >
        <AppIcon name="x" />
      </button>
    </div>
    <pre ref="out" class="run-out"><template v-for="(block, i) in run.blocks" :key="i"
      ><span :class="{ 'run-err': block.stream === 'err' }">{{ block.text }}</span></template></pre>
  </section>
</template>

<style scoped src="./styles/RunPane.css"></style>

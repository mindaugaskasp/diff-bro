<script setup>
import { computed, ref } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'
import { useHoverReveal } from '../composables/useHoverReveal'
import { TEMPLATE_TOKENS, expandTemplates } from '../utils/snippetTemplates'

const props = defineProps({ fills: { type: Array, default: () => [] } })

const settings = useSettingsStore()
const { open, enter, leave, onKeydown } = useHoverReveal()
// Re-read on every opening, so a value never goes stale while the panel is shown.
const now = ref(new Date())
function show() {
  now.value = new Date()
  enter()
}

const builtins = computed(() =>
  TEMPLATE_TOKENS.map((spec) => ({
    tag: `{{${spec.token}}}`,
    labelKey: spec.labelKey,
    value: expandTemplates(`{{${spec.token}}}`, { now: now.value, locale: settings.activeLocale })
  }))
)
const EXAMPLE = '{{name}}'
const fillTags = computed(() => props.fills.map((name) => `{{${name}}}`))
</script>

<template>
  <span
    class="tt"
    @mouseenter="show"
    @mouseleave="leave"
    @focusin="show"
    @focusout="leave"
    @keydown="onKeydown"
  >
    <button type="button" class="tt-trigger" :class="{ on: open }" :aria-expanded="open">
      <span class="tt-glyph" aria-hidden="true">{ }</span>
      {{
        fills.length ? $t('statusBar.templateTags', fills.length) : $t('snippetTemplates.tokens')
      }}
    </button>
    <div v-if="open" class="tt-pop" role="dialog" :aria-label="$t('snippetTemplates.tokens')">
      <section>
        <strong>{{ $t('statusBar.inThisSnippet') }}</strong>
        <p class="tt-hint">{{ $t('statusBar.fillsHint', { example: EXAMPLE }) }}</p>
        <div v-if="fillTags.length" class="tt-fills">
          <span v-for="tag in fillTags" :key="tag" class="tt-chip">{{ tag }}</span>
        </div>
      </section>
      <section>
        <strong>{{ $t('statusBar.builtIn') }}</strong>
        <p class="tt-hint">{{ $t('statusBar.builtInHint') }}</p>
        <div class="tt-grid">
          <span v-for="row in builtins" :key="row.tag" class="tt-row" :data-tip="$t(row.labelKey)">
            <span class="tt-tag">{{ row.tag }}</span>
            <span class="tt-value">{{ row.value }}</span>
          </span>
        </div>
      </section>
    </div>
  </span>
</template>

<style scoped src="./styles/TemplateTagsPopover.css"></style>

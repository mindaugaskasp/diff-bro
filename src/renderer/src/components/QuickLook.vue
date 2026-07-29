<script setup>
// Root of the floating quick look-up window (see src/main/quickLook.js); logic
// lives in useQuickLook. The snippet preview renders through text interpolation
// only, never v-html (CLAUDE.md #7).
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useQuickLook } from '../composables/useQuickLook'
import { useSnippetStore } from '../stores/snippetStore'
import { languageMonogram } from '../utils/languageMonogram'
import { isMac } from '../keys'
import AppIcon from './AppIcon.vue'
import QuickLookConvert from './QuickLookConvert.vue'

// Same type anchor the sidebar rows use, so a result reads the same everywhere.
const mono = (lang) => languageMonogram(lang)

const {
  query,
  selected,
  results,
  current,
  diffMeta,
  snippetText,
  zone,
  previewEl,
  choose,
  copy,
  copied,
  copiedName,
  copiedIndex,
  closing,
  refresh,
  onKeydown,
  convertTool,
  convertInput,
  convertResult,
  exitConvert,
  copyConvert
} = useQuickLook()
const store = useSnippetStore()
const input = ref(null)
const copyKey = isMac ? '⌘C' : 'Ctrl+C'
const snippetLines = computed(() => snippetText.value.split('\n'))

// Row helpers — precomputed so the template rows stay one line each.
const monoStyle = (it) => ({ '--fam': it.kind === 'command' ? '' : mono(it.lang).family })
const monoText = (it) => (it.kind === 'command' ? '' : mono(it.lang).label)
const tagStyle = (it) => ({ background: store.colorOf(it.tags?.[0]) })

// Keyboard hints for the foot, data-driven so the template stays small.
const footHints = computed(() => {
  if (zone.value === 'preview') {
    return [
      ['↑↓', 'scroll'],
      ['←', 'back to list'],
      ['↵', 'open'],
      ['Esc', 'back']
    ]
  }
  const hints = [['↑↓', 'navigate']]
  if (current.value?.kind === 'snippet') hints.push(['→', 'scroll preview'])
  else if (current.value?.kind === 'command') hints.push(['→', 'convert'])
  hints.push(['↵', 'open'], [copyKey, 'copy'], ['Esc', 'close'])
  return hints
})

// Per-kind preview action + body hint — a command converts, a snippet/diff opens.
const ACTIONS = {
  snippet: { icon: 'edit', label: 'Open in editor' },
  diff: { icon: 'file', label: 'Open in comparison' },
  command: { icon: 'wrench', label: 'Convert' }
}
const bodyHint = (it) =>
  it.kind === 'command' ? 'convert with this tool' : 'open this diff in the comparison view'
const lockLabel = (it) => (it.kind === 'command' ? 'runs on this machine' : 'decrypted on demand')

function focusInput() {
  input.value?.focus()
  input.value?.select()
}

onMounted(() => {
  focusInput()
  window.api.onQuickLookShow(() => {
    refresh()
    focusInput()
  })
})

// Leaving convert mode must return focus to the search box, or the arrow-key
// navigation (driven by its @keydown) goes dead.
watch(convertTool, (tool) => {
  if (!tool) nextTick(focusInput)
})

function expiryLabel(meta) {
  if (!meta) return ''
  if (meta.from) return 'Shared diff'
  if (meta.expiresAt === null) return 'Kept'
  const mins = Math.max(0, Math.round((meta.expiresAt - Date.now()) / 60000))
  return mins >= 60 ? `expires in ${Math.round(mins / 60)} h` : `expires in ${mins} min`
}
</script>

<template>
  <div class="ql" :class="{ closing }">
    <QuickLookConvert
      v-if="convertTool"
      v-model:input="convertInput"
      :tool="convertTool"
      :result="convertResult"
      @back="exitConvert"
      @copy="copyConvert"
    />
    <template v-else>
      <div class="ql-search band">
        <AppIcon name="search" class="ql-search-ico" />
        <input
          ref="input"
          v-model="query"
          class="ql-input"
          type="text"
          placeholder="Search snippets & diffs…"
          autocomplete="off"
          spellcheck="false"
          @keydown="onKeydown"
        />
        <span class="ql-kbd">Esc</span>
      </div>

      <div class="ql-body" :class="{ 'in-preview': zone === 'preview' }">
        <ul class="ql-results">
          <li v-if="!results.length" class="ql-empty">No snippet or diff matches.</li>
          <li
            v-for="(it, i) in results"
            :key="it.kind + it.id"
            class="ql-res"
            :class="{ sel: i === selected, copied: copied && i === copiedIndex }"
            @click="selected = i"
            @dblclick="choose(i)"
          >
            <span v-if="it.kind === 'command'" class="monogram cmd"><AppIcon name="wrench" /></span>
            <span v-else class="monogram" :style="monoStyle(it)">{{ monoText(it) }}</span>
            <span class="ql-name">{{ it.name }}</span>
            <span v-if="it.tags?.[0]" class="ql-tag" :style="tagStyle(it)">{{ it.tags[0] }}</span>
            <span class="ql-kind">{{ it.kind === 'command' ? 'convert' : it.kind }}</span>
            <Transition name="ql-copychip">
              <span v-if="copied && i === copiedIndex" class="ql-res-copied" aria-live="polite">
                <AppIcon name="check" /> Copied
              </span>
            </Transition>
          </li>
        </ul>

        <div class="ql-preview">
          <template v-if="current">
            <div class="ql-pv-head band">
              <button
                v-if="zone === 'preview'"
                class="ql-pv-back"
                title="Back to list (←)"
                @click="zone = 'list'"
              >
                <AppIcon name="chevron-left" />
              </button>
              <span class="ql-pv-name">{{ current.name }}</span>
              <span v-if="current.lang" class="ql-pv-lang">{{ current.lang }}</span>
              <button
                v-if="current.kind === 'snippet'"
                class="btn btn-sm ql-pv-copy"
                :title="`Copy contents (${copyKey})`"
                @click="copy(selected)"
              >
                <AppIcon :name="copied ? 'check' : 'copy'" /> {{ copied ? 'Copied' : 'Copy' }}
              </button>
            </div>
            <div v-if="current.tags?.length" class="ql-pv-tags">
              <span v-for="t in current.tags" :key="t" class="ql-pv-tag">
                <span class="dot" :style="{ background: store.colorOf(t) }"></span>{{ t }}
              </span>
            </div>

            <div
              v-if="current.kind === 'snippet'"
              ref="previewEl"
              class="ql-pv-body"
              :class="{ scrolling: zone === 'preview' }"
            >
              <div v-for="(line, i) in snippetLines" :key="i" class="ql-pv-line">{{ line }}</div>
            </div>
            <div v-else class="ql-pv-diff">
              <span v-if="current.kind === 'diff'" class="ql-pv-expiry">{{
                expiryLabel(diffMeta)
              }}</span>
              <p>Press <strong>Enter</strong> to {{ bodyHint(current) }}.</p>
            </div>

            <div class="ql-pv-foot band">
              <span class="ql-lock"><AppIcon name="lock" /> {{ lockLabel(current) }}</span>
              <span class="ql-pv-actions">
                <button class="btn btn-primary btn-sm" @click="choose(selected)">
                  <AppIcon :name="ACTIONS[current.kind].icon" /> {{ ACTIONS[current.kind].label }}
                </button>
              </span>
            </div>
          </template>
          <div v-else class="ql-pv-none">Select a result to preview it.</div>
        </div>
      </div>

      <div class="ql-foot band">
        <span v-for="[k, label] in footHints" :key="label"
          ><span class="ql-kbd">{{ k }}</span> {{ label }}</span
        >
      </div>
    </template>

    <transition name="ql-toast">
      <div v-if="copied" class="ql-toast" role="status">
        <AppIcon name="check" class="ok" /> Copied <strong>{{ copiedName }}</strong>
      </div>
    </transition>
  </div>
</template>

<style scoped src="./styles/QuickLook.css"></style>

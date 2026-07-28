<script setup>
// Root of the floating quick look-up window (see src/main/quickLook.js); logic
// lives in useQuickLook. The snippet preview renders through text interpolation
// only, never v-html (CLAUDE.md #7).
import { onMounted, ref } from 'vue'
import { useQuickLook } from '../composables/useQuickLook'
import { useSnippetStore } from '../stores/snippetStore'
import { languageMonogram } from '../utils/languageMonogram'
import { isMac } from '../keys'
import AppIcon from './AppIcon.vue'

// Same type anchor the sidebar rows use, so a result reads the same everywhere.
const mono = (lang) => languageMonogram(lang)

const { query, selected, results, current, diffMeta, snippetText, choose, copy, copied, closing, refresh, onKeydown } =
  useQuickLook()
const store = useSnippetStore()
const input = ref(null)
const copyKey = isMac ? '⌘C' : 'Ctrl+C'

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

    <div class="ql-body">
      <ul class="ql-results">
        <li v-if="!results.length" class="ql-empty">No snippet or diff matches.</li>
        <li
          v-for="(it, i) in results"
          :key="it.kind + it.id"
          class="ql-res"
          :class="{ sel: i === selected }"
          @click="selected = i"
          @dblclick="choose(i)"
        >
          <span class="monogram" :style="{ '--fam': mono(it.lang).family }">{{
            mono(it.lang).label
          }}</span>
          <span class="ql-name">{{ it.name }}</span>
          <span v-if="it.tags[0]" class="ql-tag" :style="{ background: store.colorOf(it.tags[0]) }">{{
            it.tags[0]
          }}</span>
          <span class="ql-kind">{{ it.kind }}</span>
        </li>
      </ul>

      <div class="ql-preview">
        <template v-if="current">
          <div class="ql-pv-head band">
            <span class="ql-pv-name">{{ current.name }}</span>
            <span v-if="current.lang" class="ql-pv-lang">{{ current.lang }}</span>
          </div>
          <div v-if="current.tags.length" class="ql-pv-tags">
            <span v-for="t in current.tags" :key="t" class="ql-pv-tag">
              <span class="dot" :style="{ background: store.colorOf(t) }"></span>{{ t }}
            </span>
          </div>

          <pre v-if="current.kind === 'snippet'" class="ql-pv-body">{{ snippetText }}</pre>
          <div v-else class="ql-pv-diff">
            <span class="ql-pv-expiry">{{ expiryLabel(diffMeta) }}</span>
            <p>Press <strong>Enter</strong> to open this diff in the comparison view.</p>
          </div>

          <div class="ql-pv-foot band">
            <span class="ql-lock"><AppIcon name="lock" /> decrypted on demand</span>
            <span class="ql-pv-actions">
              <button
                v-if="current.kind === 'snippet'"
                class="btn btn-sm"
                :title="`Copy contents (${copyKey})`"
                @click="copy(selected)"
              >
                <AppIcon :name="copied ? 'check' : 'copy'" /> {{ copied ? 'Copied' : 'Copy' }}
              </button>
              <button class="btn btn-primary btn-sm" @click="choose(selected)">
                <AppIcon :name="current.kind === 'diff' ? 'file' : 'edit'" />
                {{ current.kind === 'diff' ? 'Open in comparison' : 'Open in editor' }}
              </button>
            </span>
          </div>
        </template>
        <div v-else class="ql-pv-none">Select a result to preview it.</div>
      </div>
    </div>

    <div class="ql-foot band">
      <span><span class="ql-kbd">↑↓</span> navigate</span>
      <span><span class="ql-kbd">↵</span> open</span>
      <span><span class="ql-kbd">{{ copyKey }}</span> copy</span>
      <span><span class="ql-kbd">Esc</span> dismiss</span>
    </div>

    <transition name="ql-toast">
      <div v-if="copied" class="ql-toast" role="status">
        <AppIcon name="check" class="ok" /> Copied to clipboard
      </div>
    </transition>
  </div>
</template>

<style scoped src="./styles/QuickLook.css"></style>

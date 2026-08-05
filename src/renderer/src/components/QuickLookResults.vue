<script setup>
// The launcher's result rows. Owns its own scroll-into-view, so the selection
// cannot walk off the bottom of the list.
import { ref, watch } from 'vue'
import { useSnippetStore } from '../stores/snippetStore'
import { languageMonogram } from '../utils/languageMonogram'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  results: { type: Array, required: true },
  copied: { type: Boolean, default: false },
  copiedIndex: { type: Number, default: -1 },
  toolsOpen: { type: Boolean, default: false }
})
const selected = defineModel('selected', { type: Number, required: true })
defineEmits(['choose'])

const store = useSnippetStore()
const listEl = ref(null)
watch(selected, (i) => listEl.value?.children?.[i]?.scrollIntoView({ block: 'nearest' }))

const mono = (lang) => languageMonogram(lang)
const monoStyle = (it) => ({ '--fam': it.kind === 'snippet' ? mono(it.lang).family : '' })
const monoText = (it) => (it.kind === 'snippet' ? mono(it.lang).label : '')
const tagStyle = (it) => ({ '--tc': store.colorOf(it.tags?.[0]) })
const rowIcon = () => (props.toolsOpen ? 'chevron-down' : 'chevron-right')
const kindLabel = (it) =>
  it.kind === 'command' ? it.action : it.kind === 'tools' ? `${it.count} tools` : it.kind

// The seam sits under the tools block, above the first snippet.
const isSectionStart = (i) =>
  props.results[i]?.kind === 'snippet' &&
  !!props.results[i - 1] &&
  props.results[i - 1].kind !== 'snippet'

const resClass = (i) => ({
  sel: i === selected.value,
  copied: props.copied && i === props.copiedIndex,
  'group-start': isSectionStart(i),
  section: props.results[i]?.kind === 'tools',
  sub: props.results[i]?.kind === 'command'
})
</script>

<template>
  <ul ref="listEl" class="ql-results">
    <li v-if="!results.length" class="ql-empty">
      {{ $t('quickLookResults.noSnippetOrToolMatches') }}
    </li>
    <li
      v-for="(it, i) in results"
      :key="it.kind + it.id"
      class="ql-res"
      :class="resClass(i)"
      @click="selected = i"
      @dblclick="$emit('choose', i)"
    >
      <span v-if="it.kind === 'command'" class="monogram cmd"><AppIcon :name="it.icon" /></span>
      <span v-else-if="it.count" class="monogram sec"><AppIcon :name="rowIcon()" /></span>
      <span v-else class="monogram" :style="monoStyle(it)">{{ monoText(it) }}</span>
      <span class="ql-name">{{ it.name }}</span>
      <span v-if="it.tags?.[0]" class="tag-word" :style="tagStyle(it)">
        <span class="tw-dot"></span>
        <span class="tw-label">{{ it.tags[0] }}</span>
        <span v-if="it.tags.length > 1" class="tw-more">+{{ it.tags.length - 1 }}</span>
      </span>
      <span class="ql-kind">{{ kindLabel(it) }}</span>
      <Transition name="ql-copychip">
        <span v-if="copied && i === copiedIndex" class="ql-res-copied" aria-live="polite">
          <AppIcon name="check" /> {{ $t('common.copied') }}
        </span>
      </Transition>
    </li>
  </ul>
</template>

<style scoped src="./styles/QuickLook.css"></style>

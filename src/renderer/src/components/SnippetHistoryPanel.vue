<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSnippetStore, languageOf } from '../stores/snippetStore'
import { versionRows } from '../utils/snippetHistory'
import { isSecret } from '../utils/secretSnippet'
import { useVersionPair } from '../composables/useVersionPair'
import { useMonacoDiffPane } from '../composables/useMonacoDiffPane'
import { useCopyFeedback } from '../composables/useCopyFeedback'
import { ago } from '../utils/relativeTime'
import { useHistoryResize } from '../composables/useHistoryResize'
import SnippetSecretMask from './SnippetSecretMask.vue'
import AppIcon from './AppIcon.vue'

const props = defineProps({ snippetId: { type: String, required: true } })
const emit = defineEmits(['close'])
const store = useSnippetStore()
const entry = computed(() => store.entries.find((e) => e.id === props.snippetId))
const rows = computed(() => versionRows(entry.value))
const language = computed(() => languageOf(entry.value))

// A secret's history opens masked, like its editor; reveal is per-open.
const revealed = ref(false)
const masked = computed(() => isSecret(entry.value) && !revealed.value)

const textAt = async (index) =>
  index === -1
    ? ((await store.load(entry.value.id)) ?? '')
    : ((await store.loadVersion(entry.value.id, index)) ?? '')
const { selected, pair, select: selectPair } = useVersionPair(textAt)

// index -1 is current, whose predecessor is the newest stored version; the
// oldest version diffs against nothing — its whole content is the change.
function select(index) {
  if (!entry.value) return
  const prev = index === -1 ? (entry.value.history?.length ?? 0) - 1 : index - 1
  return selectPair(index, prev)
}
select(-1)
watch(entry, (e) => e || emit('close'))

const container = ref(null)
useMonacoDiffPane({
  container,
  original: computed(() => pair.value.before),
  modified: computed(() => pair.value.after),
  language
})

const { copied, flash } = useCopyFeedback()
async function copyVersion() {
  if (!pair.value.after) return
  const res = await window.api.copyText(pair.value.after)
  if (res?.ok) flash()
}

const stamp = (at) =>
  new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const t = useI18n().t
const rowLabel = (row) => (row.index === -1 ? t('snippetHistoryDialog.current') : ago(row.at))
const selectedRow = computed(() => rows.value.find((r) => r.index === selected.value))

const panel = ref(null)
const { width, start, reset } = useHistoryResize(
  () => panel.value?.parentElement?.clientWidth ?? window.innerWidth
)
</script>

<template>
  <aside
    v-if="entry"
    ref="panel"
    class="hist-panel"
    :style="{ width: `${width}px` }"
    :aria-label="$t('snippetHistoryDialog.title', { name: entry.name })"
  >
    <button
      class="hist-grip"
      :aria-label="$t('snippetHistoryDialog.resize')"
      :data-tip="$t('snippetHistoryDialog.resizeTip')"
      @pointerdown="start"
      @dblclick="reset"
    ></button>
    <div class="hist-head band">
      <span class="hist-title">{{ $t('snippetEditorActions.history') }}</span>
      <button class="btn btn-sm btn-icon" :aria-label="$t('common.close')" @click="emit('close')">
        <AppIcon name="x" />
      </button>
    </div>
    <ol class="hist-rail">
      <li v-for="row in rows" :key="row.index">
        <button
          class="hist-version"
          :class="{ on: selected === row.index }"
          :aria-current="selected === row.index || undefined"
          @click="select(row.index)"
        >
          <span class="hv-when">{{ rowLabel(row) }}</span>
          <span class="hv-meta">{{ stamp(row.at) }}</span>
        </button>
      </li>
    </ol>
    <div class="hist-band band">
      <span v-if="selected === -1" class="hb-text">
        {{ $t('snippetHistoryDialog.isCurrent') }}
      </span>
      <span v-else class="hb-text">
        <strong>{{ selectedRow && rowLabel(selectedRow) }}</strong>
        <span class="hb-meta">{{ $t('snippetHistoryDialog.toCurrent') }}</span>
      </span>
      <button
        v-if="isSecret(entry)"
        class="btn btn-sm"
        :data-tip="
          masked
            ? $t('snippetEditorActions.showTheContents')
            : $t('snippetEditorActions.hideTheContentsAgain')
        "
        @click="revealed = !revealed"
      >
        <AppIcon :name="masked ? 'eye' : 'eye-off'" />
        {{ masked ? $t('snippetEditorActions.show') : $t('snippetEditorActions.hide') }}
      </button>
      <!-- Works while masked: copying without revealing is what a secret is for. -->
      <button
        v-if="selected !== -1"
        class="btn btn-sm"
        :class="{ copied }"
        :data-tip="$t('snippetHistoryDialog.copyTip')"
        @click="copyVersion"
      >
        {{ copied ? $t('common.copied') : $t('snippetHistoryDialog.copyVersion') }}
      </button>
    </div>
    <div v-if="!masked" ref="container" class="hist-diff"></div>
    <div v-else class="hist-diff hist-masked"><SnippetSecretMask compact /></div>
  </aside>
</template>

<style scoped src="./styles/SnippetHistoryPanel.css"></style>

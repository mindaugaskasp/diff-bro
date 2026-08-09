<script setup>
// A snippet's past edits: a rail of versions, each diffed against the version
// it replaced. View-only — the contents of any version are a Copy away.
import { computed, ref, watch } from 'vue'
import { useSnippetStore, languageOf } from '../stores/snippetStore'
import { useUiStore } from '../stores/uiStore'
import { versionRows } from '../utils/snippetHistory'
import { isSecret } from '../utils/secretSnippet'
import { useVersionPair } from '../composables/useVersionPair'
import { useMonacoDiffPane } from '../composables/useMonacoDiffPane'
import { useCopyFeedback } from '../composables/useCopyFeedback'
import { ago } from '../utils/relativeTime'
import BaseDialog from './BaseDialog.vue'
import SnippetSecretMask from './SnippetSecretMask.vue'
import AppIcon from './AppIcon.vue'

const ui = useUiStore()
const store = useSnippetStore()
const entry = computed(() => store.entries.find((e) => e.id === ui.snippetHistory?.id))
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
watch(entry, (e) => e || ui.closeSnippetHistory())

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

const stamp = (at) => new Date(at).toLocaleString()
</script>

<template>
  <BaseDialog
    v-if="entry"
    width="680px"
    :title="$t('snippetHistoryDialog.title', { name: entry.name })"
    @close="ui.closeSnippetHistory()"
  >
    <div class="hist-body">
      <ol class="hist-rail">
        <li v-for="row in rows" :key="row.index">
          <button
            class="hist-version"
            :class="{ on: selected === row.index }"
            @click="select(row.index)"
          >
            <span class="hv-when">{{ stamp(row.at) }}</span>
            <span class="hv-meta">
              {{ row.index === -1 ? $t('snippetHistoryDialog.current') : ago(row.at) }}
            </span>
          </button>
        </li>
      </ol>
      <div v-if="!masked" ref="container" class="hist-diff"></div>
      <div v-else class="hist-diff hist-masked"><SnippetSecretMask compact /></div>
    </div>
    <template #actions>
      <button
        v-if="isSecret(entry)"
        class="btn"
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
      <!-- Works while masked — copying without revealing is what a secret is
           FOR, and the row and editor both honour that. -->
      <button
        class="btn"
        :class="{ copied }"
        :data-tip="$t('snippetHistoryDialog.copyTip')"
        @click="copyVersion"
      >
        {{ copied ? $t('common.copied') : $t('snippetHistoryDialog.copyVersion') }}
      </button>
      <button class="btn btn-ghost" @click="ui.closeSnippetHistory()">
        {{ $t('common.close') }}
      </button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/SnippetHistoryDialog.css"></style>

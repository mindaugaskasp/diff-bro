<script setup>
// Fill a Claude prompt's {{variables}} before copying it. Opened from the snippet
// copy action when the content has placeholders (SnippetRow); the resolved text
// goes straight to the clipboard.
import { ref } from 'vue'
import { useSnippetStore } from '../stores/snippetStore'
import { useDiffStore } from '../stores/diffStore'
import { parseTemplateVars, fillTemplate } from '../utils/templateVars'
import BaseDialog from './BaseDialog.vue'

const store = useSnippetStore()
const diff = useDiffStore()
const name = store.pendingFill?.name ?? 'snippet'
const content = store.pendingFill?.content ?? ''
const vars = parseTemplateVars(content)
const values = ref(Object.fromEntries(vars.map((v) => [v, ''])))
// Held in script so the literal braces don't prematurely close the mustache.
const marker = '{{…}}'

async function copyFilled() {
  await window.api.copyText(fillTemplate(content, values.value))
  diff.showNotice(`Copied "${name}"`)
  close()
}
function close() {
  store.pendingFill = null
}
</script>

<template>
  <BaseDialog width="440px" :title="$t('snippetFillDialog.fillInTitle', { name })" @close="close">
    <form class="dialog-form" @submit.prevent="copyFilled">
      <p class="dialog-note">
        {{ $t('snippetFillDialog.thisPromptHasPlaceholdersFill') }}
        <code>{{ marker }}</code> {{ $t('snippetFillDialog.marker') }}
      </p>
      <label v-for="(v, i) in vars" :key="v" class="fill-row">
        <span class="fill-name">{{ v }}</span>
        <input
          v-model="values[v]"
          type="text"
          spellcheck="false"
          :autofocus="i === 0"
          :placeholder="`value for ${v}`"
        />
      </label>
      <div class="dialog-actions">
        <button type="submit" class="btn btn-primary">
          {{ $t('snippetFillDialog.copyFilled') }}
        </button>
        <button type="button" class="btn btn-ghost" @click="close">
          {{ $t('common.cancel') }}
        </button>
      </div>
    </form>
  </BaseDialog>
</template>

<style scoped src="./styles/SnippetFillDialog.css"></style>

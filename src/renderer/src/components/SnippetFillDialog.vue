<script setup>
import { useSnippetFill } from '../composables/useSnippetFill'
import BaseDialog from './BaseDialog.vue'

const { name, vars, values, copyFilled, close } = useSnippetFill()
// Held in script so the literal braces don't prematurely close the mustache.
const marker = '{{…}}'
</script>

<template>
  <BaseDialog
    width="440px"
    tour="fill-dialog"
    :title="$t('snippetFillDialog.fillInTitle', { name })"
    @close="close"
  >
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

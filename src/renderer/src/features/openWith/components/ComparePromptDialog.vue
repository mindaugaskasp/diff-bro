<script setup>
import { useOpenWithStore } from '../openWithStore'
import BaseDialog from '../../../components/BaseDialog.vue'
import AppIcon from '../../../components/AppIcon.vue'

const openWith = useOpenWithStore()
</script>

<template>
  <BaseDialog
    width="460px"
    close-on-backdrop
    :title="$t('openWith.prompt.title', { name: openWith.prompt.previous })"
    @close="openWith.choose('tab')"
  >
    <i18n-t keypath="openWith.prompt.body" tag="p" class="dialog-note">
      <template #next>
        <strong>{{ openWith.prompt.next }}</strong>
      </template>
      <template #previous>
        <strong>{{ openWith.prompt.previous }}</strong>
      </template>
    </i18n-t>
    <div class="owp-sides">
      <span class="owp-side">
        <span class="owp-label">{{ $t('openWith.prompt.left') }}</span>
        <span class="owp-name">{{ openWith.prompt.previous }}</span>
      </span>
      <AppIcon name="arrow-right" class="owp-arrow" />
      <span class="owp-side">
        <span class="owp-label">{{ $t('openWith.prompt.right') }}</span>
        <span class="owp-name">{{ openWith.prompt.next }}</span>
      </span>
    </div>
    <template #actions>
      <button class="btn" @click="openWith.choose('tab')">
        {{ $t('openWith.prompt.newTab') }}
      </button>
      <button class="btn btn-primary" autofocus @click="openWith.choose('compare')">
        {{ $t('openWith.prompt.compare') }}
      </button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/ComparePromptDialog.css"></style>

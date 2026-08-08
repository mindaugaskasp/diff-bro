<script setup>
// Making room by closing the oldest comparison is opt-in, but the tab it wants
// is not always disposable — this is the one case where the reader has to say
// so. Confirming resumes the open that was waiting; cancelling opens nothing.
import { computed } from 'vue'
import { useTabsStore } from '../stores/tabsStore'
import { tabLabel } from '../utils/tabs'
import BaseDialog from './BaseDialog.vue'

const tabs = useTabsStore()
const victim = computed(() => tabs.tabs.find((t) => t.id === tabs.pendingEvict?.id))
const name = computed(() => (victim.value ? tabLabel(victim.value) : ''))
</script>

<template>
  <BaseDialog
    width="380px"
    :title="$t('tabEvictDialog.makeRoom')"
    :closable="false"
    @close="tabs.cancelEvict()"
  >
    <p class="dialog-note">
      <i18n-t keypath="tabEvictDialog.willClose" tag="span">
        <template #name
          ><strong>“{{ name }}”</strong></template
        >
      </i18n-t>
    </p>
    <template #actions>
      <button class="btn btn-destructive" @click="tabs.confirmEvict()">
        {{ $t('tabEvictDialog.closeAndOpen') }}
      </button>
      <button class="btn btn-ghost" @click="tabs.cancelEvict()">
        {{ $t('tabEvictDialog.keepItOpen') }}
      </button>
    </template>
  </BaseDialog>
</template>

<script setup>
// For the share dialog, which cannot send you to the sidebar mid-pick.
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useShareStore } from '../shareStore'
import BaseDialog from '../../../components/BaseDialog.vue'
import TrustedKeyList from './TrustedKeyList.vue'

const share = useShareStore()
const editingCount = ref(0)

// BaseDialog's capture-phase Escape closed the manager mid-edit, so this owns it.
function onEscape(e) {
  if (e.key !== 'Escape' || editingCount.value > 0) return
  e.stopPropagation()
  close()
}
onMounted(() => window.addEventListener('keydown', onEscape, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onEscape, true))

function close() {
  share.lastAddedTrustedFp = null
  share.showTrustedKeysDialog = false
}
</script>

<template>
  <BaseDialog
    width="480px"
    :title="$t('share.trustedKeysDialog.trustedKeys')"
    :escape-closes="false"
    @close="close"
  >
    <p class="dialog-note">{{ $t('share.trustedKeysDialog.publicKeysOfPeopleYou') }}</p>
    <p v-if="!share.trusted.length" class="empty">
      <i18n-t keypath="share.trustedKeysDialog.noKeysYet" tag="span">
        <template #ext><code>.diffbrokey</code></template>
      </i18n-t>
    </p>
    <TrustedKeyList class="dialog-scroller" @editing="editingCount += $event ? 1 : -1" />
    <template #actions>
      <button class="btn btn-primary" @click="share.addTrustedKey()">
        {{ $t('share.trustedKeysDialog.addKey') }}
      </button>
      <button class="btn btn-ghost" @click="close">{{ $t('common.close') }}</button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/TrustedKeysDialog.css"></style>

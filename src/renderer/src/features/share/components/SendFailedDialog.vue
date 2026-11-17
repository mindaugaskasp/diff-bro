<script setup>
import BaseDialog from '../../../components/BaseDialog.vue'
import { useShareStore } from '../shareStore'

const share = useShareStore()
</script>

<template>
  <BaseDialog width="440px" :title="$t('lan.share.couldNotSend')" @close="share.closeSendFailure()">
    <p class="dialog-note">{{ $t('lan.share.couldNotSendNote') }}</p>
    <template #actions>
      <span class="spacer" />
      <button type="button" class="btn btn-ghost" @click="share.closeSendFailure()">
        {{ $t('common.close') }}
      </button>
      <button
        v-if="!share.sendFailure.snippet"
        type="button"
        class="btn btn-primary"
        @click="share.createFileAfterFailure()"
      >
        {{ $t('share.diffDialog.createFile') }}
      </button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/SendFailedDialog.css"></style>

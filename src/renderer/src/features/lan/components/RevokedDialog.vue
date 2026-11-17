<script setup>
import BaseDialog from '../../../components/BaseDialog.vue'
import { useLanStore } from '../lanStore'

const lan = useLanStore()
</script>

<template>
  <BaseDialog
    width="440px"
    :title="$t('lan.stop.toldTitle', { name: lan.revokedBy.name })"
    @close="lan.revokedBy = null"
  >
    <p class="body">{{ $t('lan.stop.toldBody') }}</p>
    <template #actions>
      <span class="spacer" />
      <button type="button" class="btn btn-primary" @click="lan.revokedBy = null">
        {{ $t('lan.stop.ok') }}
      </button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/StopSharingDialog.css"></style>

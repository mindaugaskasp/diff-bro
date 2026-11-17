<script setup>
import { computed } from 'vue'
import BaseDialog from '../../../components/BaseDialog.vue'
import { useLanStore } from '../lanStore'

const lan = useLanStore()
const person = computed(() => lan.confirmStop)
const waiting = computed(() => lan.items.filter((i) => i.fp === person.value.fp).length)
</script>

<template>
  <BaseDialog
    width="460px"
    :title="$t('lan.stop.title', { name: person.name })"
    @close="lan.confirmStop = null"
  >
    <p class="body">{{ $t('lan.stop.body', waiting) }}</p>
    <p class="dialog-note">{{ $t('lan.stop.told') }}</p>
    <template #actions>
      <span class="spacer" />
      <button type="button" class="btn btn-ghost" @click="lan.confirmStop = null">
        {{ $t('common.cancel') }}
      </button>
      <button type="button" class="btn btn-destructive" @click="lan.stopSharing(person)">
        {{ $t('lan.stop.confirm') }}
      </button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/StopSharingDialog.css"></style>

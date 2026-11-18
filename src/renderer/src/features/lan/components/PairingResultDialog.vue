<script setup>
import { computed } from 'vue'
import BaseDialog from '../../../components/BaseDialog.vue'
import { pairingResult } from '../pairingResult'
import { useLanStore } from '../lanStore'

const lan = useLanStore()
const result = computed(() => pairingResult(lan.pairing))
</script>

<template>
  <BaseDialog
    width="440px"
    :title="$t(result.title, { name: lan.pairing.name })"
    @close="lan.dismissPairing()"
  >
    <p v-if="result.note" class="dialog-note">{{ $t(result.note) }}</p>
    <template #actions>
      <span class="spacer" />
      <template v-if="result.action">
        <button type="button" class="btn btn-ghost" @click="lan.dismissPairing()">
          {{ $t('common.close') }}
        </button>
        <button type="button" class="btn btn-primary" @click="lan.retryPairing()">
          {{ $t('lan.result.tryAgain') }}
        </button>
      </template>
      <button v-else type="button" class="btn btn-primary" @click="lan.dismissPairing()">
        {{ $t('common.close') }}
      </button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/PairingResultDialog.css"></style>

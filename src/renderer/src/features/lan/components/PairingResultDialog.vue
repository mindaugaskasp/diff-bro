<script setup>
import { computed } from 'vue'
import BaseDialog from '../../../components/BaseDialog.vue'
import { pairingResult } from '../pairingResult'
import { useLanStore } from '../lanStore'

const lan = useLanStore()
const result = computed(() => pairingResult(lan.pairing))
const primaryKey = computed(() =>
  result.value.action === 'addBack' ? 'lan.result.addBack' : 'lan.result.tryAgain'
)
</script>

<template>
  <BaseDialog
    width="440px"
    :title="$t(result.title, { name: lan.pairing.name })"
    @close="lan.dismissPairing()"
  >
    <p class="dialog-note">{{ $t(result.note) }}</p>
    <template #actions>
      <span class="spacer" />
      <template v-if="result.action">
        <button type="button" class="btn btn-ghost" @click="lan.dismissPairing()">
          {{ $t(result.action === 'addBack' ? 'lan.result.notNow' : 'common.close') }}
        </button>
        <button type="button" class="btn btn-primary" @click="lan.retryPairing()">
          {{ $t(primaryKey) }}
        </button>
      </template>
      <button v-else type="button" class="btn btn-primary" @click="lan.dismissPairing()">
        {{ $t('common.close') }}
      </button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/PairingResultDialog.css"></style>

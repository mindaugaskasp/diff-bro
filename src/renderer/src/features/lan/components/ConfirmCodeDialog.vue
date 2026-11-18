<script setup>
import { computed } from 'vue'
import BaseDialog from '../../../components/BaseDialog.vue'
import { useCountdown } from '../../../composables/useCountdown'
import { useLanStore } from '../lanStore'

const lan = useLanStore()
const isHolder = computed(() => lan.pairing.role === 'holder')
const remaining = useCountdown(() => lan.pairing.expiresAt)
</script>

<template>
  <BaseDialog
    width="440px"
    :title="
      $t(isHolder ? 'lan.confirm.title' : 'lan.confirm.waitingTitle', { name: lan.pairing.name })
    "
    :escape-closes="false"
    @close="isHolder ? lan.confirmAdd(false) : lan.cancelPairing()"
  >
    <div class="show-code">
      <p class="dialog-note">
        {{ $t(isHolder ? 'lan.confirm.note' : 'lan.confirm.waitingNote') }}
      </p>
      <div class="code-box confirm-box" data-testid="lan-confirm-code">
        <span class="code">{{ lan.pairing.confirm }}</span>
      </div>
      <i18n-t keypath="lan.code.expires" tag="p" class="dialog-note expires">
        <template #time
          ><span class="time">{{ remaining }}</span></template
        >
      </i18n-t>
    </div>
    <template #actions>
      <span class="spacer" />
      <template v-if="isHolder">
        <button type="button" class="btn btn-ghost" @click="lan.confirmAdd(false)">
          {{ $t('lan.confirm.decline') }}
        </button>
        <button type="button" class="btn btn-primary" @click="lan.confirmAdd(true)">
          {{ $t('lan.confirm.add') }}
        </button>
      </template>
      <button v-else type="button" class="btn btn-ghost" @click="lan.cancelPairing()">
        {{ $t('common.cancel') }}
      </button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/ShowCodeDialog.css"></style>

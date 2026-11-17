<script setup>
import { computed } from 'vue'
import BaseDialog from '../../../components/BaseDialog.vue'
import AppIcon from '../../../components/AppIcon.vue'
import { formatCode } from '../../../../../shared/pairingCodeText'
import { useCountdown } from '../../../composables/useCountdown'
import { useCopiedFlag } from '../../../composables/useCopiedFlag'
import { useLanStore } from '../lanStore'

const lan = useLanStore()
const shown = computed(() => formatCode(lan.pairing.code))
const remaining = useCountdown(() => lan.pairing.expiresAt)
const { copied, markCopied } = useCopiedFlag()

async function copy() {
  await window.api.copyText(lan.pairing.code)
  markCopied()
}
</script>

<template>
  <BaseDialog
    width="440px"
    :title="$t('lan.code.title', { name: lan.pairing.name })"
    :escape-closes="false"
    @close="lan.cancelPairing()"
  >
    <div class="show-code">
      <p class="dialog-note">{{ $t('lan.code.share') }}</p>
      <button
        type="button"
        class="code-box"
        :class="{ copied }"
        :aria-label="$t('lan.code.copy')"
        :data-tip="$t('lan.code.clickToCopy')"
        data-testid="lan-code"
        @click="copy"
      >
        <span class="code">{{ shown }}</span>
        <span v-if="copied" class="hint copied-hint"
          ><AppIcon name="check" />{{ $t('lan.code.copied') }}</span
        >
        <span v-else class="hint"><AppIcon name="copy" /></span>
      </button>
      <i18n-t keypath="lan.code.expires" tag="p" class="dialog-note expires">
        <template #time
          ><span class="time">{{ remaining }}</span></template
        >
      </i18n-t>
    </div>
    <template #actions>
      <span class="spacer" />
      <button type="button" class="btn btn-ghost" @click="lan.cancelPairing()">
        {{ $t('common.cancel') }}
      </button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/ShowCodeDialog.css"></style>

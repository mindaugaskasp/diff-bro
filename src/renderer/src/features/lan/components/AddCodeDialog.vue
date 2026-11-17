<script setup>
import { computed, ref } from 'vue'
import BaseDialog from '../../../components/BaseDialog.vue'
import AppIcon from '../../../components/AppIcon.vue'
import { normalizeCode } from '../../../../../shared/pairingCodeText'
import { useLanStore } from '../lanStore'

const lan = useLanStore()
const code = ref('')
const pasteFailed = ref(false)
const isValid = computed(() => normalizeCode(code.value) !== null)
const isReady = computed(() => lan.pairing?.stage === 'enter-code')

async function paste() {
  const res = await lan.pasteCode()
  pasteFailed.value = !res?.code
  if (res?.code) code.value = res.code
}

function submit() {
  if (isValid.value && isReady.value) lan.submitCode(code.value)
}
</script>

<template>
  <BaseDialog
    width="440px"
    :title="$t('lan.add.title', { name: lan.pairing.name })"
    :escape-closes="false"
    @close="lan.cancelPairing()"
  >
    <form class="dialog-form add-code" @submit.prevent="submit">
      <p class="dialog-note">{{ $t('lan.add.onNetwork') }}</p>
      <label class="code-label" for="lan-code">{{ $t('lan.add.codeLabel') }}</label>
      <div class="code-field">
        <input
          id="lan-code"
          v-model="code"
          class="code-input"
          maxlength="9"
          autocomplete="off"
          spellcheck="false"
          :placeholder="$t('lan.add.placeholder')"
          data-testid="lan-code-input"
          @input="pasteFailed = false"
        />
        <button type="button" class="btn btn-sm paste" @click="paste">
          <AppIcon name="clipboard" />
          {{ $t('lan.add.paste') }}
        </button>
      </div>
      <p class="dialog-note">
        {{ pasteFailed ? $t('lan.add.noCodeOnClipboard') : $t('lan.add.oneTry') }}
      </p>
      <div class="dialog-actions">
        <span class="spacer" />
        <button type="button" class="btn btn-ghost" @click="lan.cancelPairing()">
          {{ $t('common.cancel') }}
        </button>
        <button type="submit" class="btn btn-primary" :disabled="!isValid || !isReady">
          {{ $t('lan.add.add') }}
        </button>
      </div>
    </form>
  </BaseDialog>
</template>

<style scoped src="./styles/AddCodeDialog.css"></style>

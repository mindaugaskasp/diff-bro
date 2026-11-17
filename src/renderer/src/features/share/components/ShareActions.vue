<script setup>
import AppIcon from '../../../components/AppIcon.vue'
import { shaped } from '../../../utils/props'
import { useShareStore } from '../shareStore'

defineProps({
  picker: {
    type: Object,
    required: true,
    validator: shaped('canSubmit', 'everyPickedHasEmail')
  },
  network: { type: Boolean, default: false },
  snippet: { type: Boolean, default: false }
})
defineEmits(['send', 'email', 'file', 'address', 'close'])
const share = useShareStore()
</script>

<template>
  <div class="dialog-actions">
    <template v-if="network">
      <button
        type="button"
        class="btn btn-primary"
        :disabled="!picker.canSubmit.value || share.sending"
        @click="$emit('send')"
      >
        <AppIcon name="send" />
        {{ share.sending ? $t('lan.share.sending') : $t('lan.share.sendNow') }}
      </button>
      <template v-if="!snippet">
        <button
          type="button"
          class="btn btn-sm"
          :disabled="!picker.everyPickedHasEmail.value || share.sending"
          @click="$emit('email')"
        >
          {{ $t('lan.share.email') }}
        </button>
        <button
          type="button"
          class="btn btn-sm"
          :disabled="!picker.canSubmit.value || share.sending"
          @click="$emit('file')"
        >
          {{ $t('share.diffDialog.createFile') }}
        </button>
      </template>
    </template>
    <template v-else>
      <!-- The primary is what the user can actually do now: a disabled primary
           that never explains itself is how a toolbar comes to look switched off. -->
      <button
        v-if="picker.everyPickedHasEmail.value"
        type="button"
        class="btn btn-primary"
        @click="$emit('email')"
      >
        <AppIcon name="mail" />
        {{ $t('share.diffDialog.emailThisDiff') }}
      </button>
      <button
        type="button"
        :class="
          picker.everyPickedHasEmail.value
            ? $t('shareDiffDialog.btnBtnSm')
            : $t('shareDiffDialog.btnBtnPrimary')
        "
        :disabled="!picker.canSubmit.value"
        @click="$emit('file')"
      >
        {{ $t('share.diffDialog.createFile') }}
      </button>
      <button
        v-if="picker.canSubmit.value && !picker.everyPickedHasEmail.value"
        type="button"
        class="btn btn-sm"
        @click="$emit('address')"
      >
        {{ $t('share.diffDialog.addAnAddress') }}
      </button>
    </template>
    <span class="spacer" />
    <button type="button" class="btn btn-ghost" @click="$emit('close')">
      {{ $t('common.cancel') }}
    </button>
  </div>
</template>

<style scoped src="./styles/ShareActions.css"></style>

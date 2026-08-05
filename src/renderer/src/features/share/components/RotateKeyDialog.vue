<script setup>
// Replacing this machine's key. The copy is the point: rotation is widely
// believed to un-send things, and it does not. What it buys is that a leaked
// key stops being able to sign in your name.
import { onMounted, ref } from 'vue'
import { useShareStore } from '../shareStore'
import BaseDialog from '../../../components/BaseDialog.vue'

const share = useShareStore()
const busy = ref(false)
const retired = ref(0)
const done = ref(null)
const confirmDestroy = ref(false)

const refresh = async () => (retired.value = (await window.api.retiredKeyCount()) ?? 0)
onMounted(refresh)

async function rotate() {
  busy.value = true
  const res = await window.api.rotateKey()
  busy.value = false
  if (res?.ok) done.value = res.fingerprint
  await refresh()
}

async function destroy() {
  busy.value = true
  await window.api.destroyRetiredKeys()
  busy.value = false
  confirmDestroy.value = false
  await refresh()
}

const close = () => (share.showRotateKeyDialog = false)
</script>

<template>
  <BaseDialog width="460px" :title="$t('share.rotateKeyDialog.replaceMyKey')" @close="close">
    <template v-if="done">
      <i18n-t keypath="share.rotateKeyDialog.doneNote" tag="p" class="dialog-note">
        <template #fp
          ><strong class="fp">{{ done }}</strong></template
        >
      </i18n-t>
    </template>

    <template v-else>
      <p class="dialog-note">
        {{ $t('share.rotateKeyDialog.aNewKeyTakesOver') }}
      </p>
      <i18n-t keypath="share.rotateKeyDialog.alreadyShared" tag="p" class="dialog-note">
        <template #shared
          ><em>{{ $t('share.rotateKeyDialog.alreadySharedEm') }}</em></template
        >
        <template #their
          ><em>{{ $t('share.rotateKeyDialog.their') }}</em></template
        >
      </i18n-t>
      <p class="dialog-note">{{ $t('share.rotateKeyDialog.doThisIfYourMachine') }}</p>
    </template>

    <div v-if="retired" class="retired">
      <p class="dialog-note">{{ $t('share.rotateKeyDialog.retiredKept', retired) }}</p>
      <label class="also">
        <input v-model="confirmDestroy" type="checkbox" />
        <span>{{ $t('share.rotateKeyDialog.understandDestroy', retired) }}</span>
      </label>
      <button
        class="btn btn-sm btn-destructive"
        :disabled="!confirmDestroy || busy"
        @click="destroy"
      >
        {{ $t('share.rotateKeyDialog.destroyOld', retired) }}
      </button>
    </div>

    <template #actions>
      <button v-if="!done" class="btn btn-destructive" :disabled="busy" @click="rotate">
        {{ $t('share.rotateKeyDialog.replaceMyKey') }}
      </button>
      <button class="btn btn-ghost" @click="close">
        {{ done ? $t('common.done') : $t('common.cancel') }}
      </button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/RotateKeyDialog.css"></style>

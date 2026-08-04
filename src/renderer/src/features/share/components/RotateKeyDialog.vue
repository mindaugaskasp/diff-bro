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
  <BaseDialog width="460px" title="Replace my key" @close="close">
    <template v-if="done">
      <p class="dialog-note">
        Your new fingerprint is <strong class="fp">{{ done }}</strong
        >. Send your public key again — until each person imports it, anything you seal will reach
        them as an unknown sender.
      </p>
    </template>

    <template v-else>
      <p class="dialog-note">
        A new key takes over from here. Your old one is kept so that diffs already sealed to it
        still open — it is only ever used to read, never to send.
      </p>
      <p class="dialog-note">
        Diffs you have <em>already shared</em> stay readable by the people you sent them to. They
        were sealed with <em>their</em> keys; yours only signed them. Replacing a key cannot take
        anything back.
      </p>
      <p class="dialog-note">Do this if your machine or your key may have been exposed.</p>
    </template>

    <div v-if="retired" class="retired">
      <p class="dialog-note">
        {{ retired }} earlier {{ retired === 1 ? 'key is' : 'keys are' }} kept for reading.
        Destroying {{ retired === 1 ? 'it' : 'them' }} gives up any diff still sealed to
        {{ retired === 1 ? 'it' : 'them' }} that you have not opened.
      </p>
      <label class="also">
        <input v-model="confirmDestroy" type="checkbox" />
        <span>I understand, and want the old {{ retired === 1 ? 'key' : 'keys' }} destroyed</span>
      </label>
      <button
        class="btn btn-sm btn-destructive"
        :disabled="!confirmDestroy || busy"
        @click="destroy"
      >
        Destroy old {{ retired === 1 ? 'key' : 'keys' }}
      </button>
    </div>

    <template #actions>
      <button v-if="!done" class="btn btn-destructive" :disabled="busy" @click="rotate">
        Replace my key
      </button>
      <button class="btn btn-ghost" @click="close">{{ done ? 'Done' : 'Cancel' }}</button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/RotateKeyDialog.css"></style>

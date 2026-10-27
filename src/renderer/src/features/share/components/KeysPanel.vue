<script setup>
import { onMounted, ref } from 'vue'
import { useShareStore } from '../shareStore'
import KeyIdenticon from '../../../components/KeyIdenticon.vue'
import AppIcon from '../../../components/AppIcon.vue'
import TrustedKeyList from './TrustedKeyList.vue'

defineProps({ search: { type: String, default: '' } })
const share = useShareStore()
const fingerprint = ref('')
const label = ref('')
// A key goes out with a name; until it has one, the naming dialog comes first.
function sendKey(run) {
  if (label.value) run(label.value)
  else share.showShareKeyDialog = true
}
onMounted(async () => {
  fingerprint.value = (await window.api.myFingerprint?.()) ?? ''
  label.value = (await window.api.myKeyLabel?.()) ?? ''
})
</script>

<template>
  <div class="keys-panel">
    <section class="key-card">
      <div class="key-ident">
        <KeyIdenticon :fingerprint="fingerprint" class="key-mark" />
        <span class="key-text">
          <span class="key-title">{{ $t('keysPanel.yourKey') }}</span>
          <span class="key-fp">{{ fingerprint }}</span>
        </span>
      </div>
      <div class="key-actions">
        <button type="button" class="btn btn-sm" @click="sendKey(share.runEmailKey)">
          <AppIcon name="mail" />{{ $t('keysPanel.email') }}
        </button>
        <button type="button" class="btn btn-sm" @click="sendKey(share.runCopyKey)">
          <AppIcon name="copy" />{{ $t('common.copy') }}
        </button>
        <button type="button" class="btn btn-sm" @click="sendKey(share.runExportKey)">
          <AppIcon name="save" />{{ $t('keysPanel.save') }}
        </button>
      </div>
    </section>

    <section v-if="share.trusted.length" class="trusted">
      <div class="trusted-head">
        <h3>{{ $t('keysPanel.trusted', { n: share.trusted.length }) }}</h3>
        <button type="button" class="btn btn-sm" @click="share.addTrustedKey()">
          <AppIcon name="plus" />{{ $t('keysPanel.add') }}
        </button>
        <button
          type="button"
          class="btn btn-sm"
          :aria-label="$t('keysPanel.addFromClipboardLabel')"
          :data-tip="$t('keysPanel.addFromClipboardTip')"
          @click="share.pasteTrustedKey()"
        >
          <AppIcon name="clipboard" />{{ $t('keysPanel.addFromClipboard') }}
        </button>
      </div>
      <TrustedKeyList :query="search" />
    </section>

    <section v-else class="first-swap">
      <h3>{{ $t('keysPanel.shareWithSomeone') }}</h3>
      <ol class="steps">
        <li><span class="num">1</span>{{ $t('keysPanel.stepSend') }}</li>
        <li><span class="num">2</span>{{ $t('keysPanel.stepAdd') }}</li>
      </ol>
      <div class="key-actions">
        <button type="button" class="btn btn-sm" @click="sendKey(share.runEmailKey)">
          <AppIcon name="mail" />{{ $t('keysPanel.sendMyKey') }}
        </button>
        <button type="button" class="btn btn-sm" @click="share.addTrustedKey()">
          <AppIcon name="plus" />{{ $t('keysPanel.addTheirKey') }}
        </button>
        <button
          type="button"
          class="btn btn-sm"
          :aria-label="$t('keysPanel.addFromClipboardLabel')"
          :data-tip="$t('keysPanel.addFromClipboardTip')"
          @click="share.pasteTrustedKey()"
        >
          <AppIcon name="clipboard" />{{ $t('keysPanel.addFromClipboard') }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped src="./styles/KeysPanel.css"></style>

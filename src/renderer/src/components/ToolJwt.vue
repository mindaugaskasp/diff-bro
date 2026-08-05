<script setup>
// The JWT tool panel — hosted in the Tools dialog and the Quick Look launcher.
// Decodes header + payload, humanizes the time claims (iat/nbf/exp), and flags
// the alg + expiry. Decode only — the signature is never verified. Pure logic in
// utils/jwt.
import { computed, ref } from 'vue'
import { parseJwt, jwtClaims } from '../utils/jwt'
import AppIcon from './AppIcon.vue'
import { offerToolOutput } from '../composables/useToolOutput'
import { useCopyFeedback } from '../composables/useCopyFeedback'

defineProps({ compact: { type: Boolean, default: false } })

const input = ref('')
const empty = computed(() => !input.value.trim())
const parsed = computed(() => parseJwt(input.value))
const ok = computed(() => !empty.value && !parsed.value.error)
const claims = computed(() =>
  ok.value ? jwtClaims(parsed.value.header, parsed.value.payload) : null
)
const hasExp = computed(() => typeof parsed.value.payload?.exp === 'number')
const headerJson = computed(() => (ok.value ? JSON.stringify(parsed.value.header, null, 2) : ''))
const payloadJson = computed(() => (ok.value ? JSON.stringify(parsed.value.payload, null, 2) : ''))

const { copied: copied, flash } = useCopyFeedback()
async function copy(text) {
  if (!text) return
  const res = await window.api.copyText(text)
  if (!res?.ok) return
  flash(text)
}

// Offer this panel's result to the dialog's Save-as-snippet action.
offerToolOutput(
  () => payloadJson.value ?? '',
  () => 'json'
)
</script>

<template>
  <div class="tj" :class="{ compact }">
    <textarea
      v-model="input"
      class="tj-in"
      :placeholder="$t('toolJwt.pasteAJWTHeaderPayload')"
      spellcheck="false"
      :aria-label="$t('toolJwt.jWT')"
    ></textarea>

    <p v-if="!empty && parsed.error" class="tj-err">{{ parsed.error }}</p>

    <template v-else-if="ok">
      <div class="tj-summary">
        <span class="tj-badge">{{ claims.alg }}</span>
        <span v-if="hasExp" class="tj-pill" :class="{ bad: claims.expired }">
          <AppIcon :name="claims.expired ? 'x' : 'check'" />
          {{ claims.expired ? $t('toolJwt.expired') : $t('toolJwt.notExpired') }}
        </span>
        <span v-if="claims.notYetValid" class="tj-pill bad">{{ $t('toolJwt.notYetValid') }}</span>
      </div>

      <div v-if="claims.rows.length" class="tj-claims">
        <div v-for="r in claims.rows" :key="r.key" class="tj-claim">
          <span class="tj-ck">{{ r.key }}</span>
          <span class="tj-cv">{{ r.epoch }}</span>
          <span class="tj-cn">{{ r.relative }} · {{ r.when }}</span>
        </div>
      </div>

      <div class="tj-block">
        <div class="tj-bh">
          {{ $t('toolJwt.header') }}
          <button
            class="tj-copy"
            :aria-label="$t('toolJwt.copyHeader')"
            :data-tip="$t('common.copy')"
            @click="copy(headerJson)"
          >
            <AppIcon :name="copied === headerJson ? 'check' : 'copy'" />
          </button>
        </div>
        <pre class="tj-json">{{ headerJson }}</pre>
      </div>

      <div class="tj-block">
        <div class="tj-bh">
          {{ $t('toolJwt.payload') }}
          <button
            class="tj-copy"
            :aria-label="$t('toolJwt.copyPayload')"
            :data-tip="$t('common.copy')"
            @click="copy(payloadJson)"
          >
            <AppIcon :name="copied === payloadJson ? 'check' : 'copy'" />
          </button>
        </div>
        <pre class="tj-json">{{ payloadJson }}</pre>
      </div>

      <p class="tj-note"><AppIcon name="unlock" /> {{ $t('toolJwt.theSignatureIsnTVerified') }}</p>
    </template>
  </div>
</template>

<style scoped src="./styles/ToolJwt.css"></style>

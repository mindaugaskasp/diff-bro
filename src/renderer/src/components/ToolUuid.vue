<script setup>
// The UUID tool panel — hosted in both the Tools dialog and the Quick Look
// launcher. Generate v1/v4/v6/v7 (or deterministic v5 from a namespace + name),
// inspect a pasted UUID, and copy it in any case/form. Pure logic in utils/uuid.
import { computed, ref, watch } from 'vue'
import {
  uuidV1,
  uuidV4,
  uuidV5,
  uuidV6,
  uuidV7,
  formatUuid,
  uuidInfo,
  toCanonicalUuid,
  UUID_NAMESPACES
} from '../utils/uuid'
import SegmentedControl from './SegmentedControl.vue'
import AppIcon from './AppIcon.vue'
import { offerToolOutput } from '../composables/useToolOutput'
import { useCopyFeedback } from '../composables/useCopyFeedback'

defineProps({ compact: { type: Boolean, default: false } })

const VERSIONS = ['v1', 'v4', 'v5', 'v6', 'v7'].map((v) => ({ value: v, label: v }))
const CASES = [
  { value: 'lower', label: 'lower' },
  { value: 'upper', label: 'UPPER' }
]
const FORMS = [
  { value: 'canonical', label: 'canonical' },
  { value: 'hex', label: '32-hex' },
  { value: 'urn', label: 'urn' },
  { value: 'braced', label: '{ }' }
]
const NS = UUID_NAMESPACES
const NS_KEYS = Object.keys(NS)

const version = ref('v4')
const namespace = ref(NS.DNS)
const name = ref('')
const uuid = ref('')
const caseOpt = ref('lower')
const form = ref('canonical')
const isV5 = computed(() => version.value === 'v5')

const GEN = { v1: uuidV1, v4: uuidV4, v6: uuidV6, v7: uuidV7 }
async function generate() {
  uuid.value = isV5.value ? await uuidV5(namespace.value, name.value) : GEN[version.value]()
}
watch(version, generate, { immediate: true })
watch([namespace, name], () => isV5.value && generate())

// Any pasted form normalizes to canonical first, so the output form converts
// both directions (e.g. paste 32-hex → get canonical, and vice versa).
const canonical = computed(() => toCanonicalUuid(uuid.value))
const display = computed(() =>
  canonical.value
    ? formatUuid(canonical.value, { form: form.value, upper: caseOpt.value === 'upper' })
    : ''
)
const info = computed(() => (canonical.value ? uuidInfo(canonical.value) : null))

// v5 is a one-way hash, so it can't be reversed to a name — but a candidate can
// be verified: does it equal what this namespace + name produce?
const verify = ref('')
const verifyMatch = computed(() => {
  const v = toCanonicalUuid(verify.value)
  return v ? v === canonical.value : null
})

const { copied, flash } = useCopyFeedback()
async function copy() {
  if (!display.value) return
  const res = await window.api.copyText(display.value)
  if (!res?.ok) return
  flash()
}

// Offer this panel's result to the dialog's Save-as-snippet action.
offerToolOutput(
  () => display.value ?? '',
  () => 'plaintext'
)
</script>

<template>
  <div class="tu" :class="{ compact }">
    <div class="tu-top">
      <SegmentedControl
        v-model:value="version"
        :label="$t('toolUuid.version')"
        :options="VERSIONS"
      />
      <button v-if="!isV5" class="btn btn-sm" @click="generate">
        <AppIcon name="plus" /> {{ $t('toolUuid.new') }}
      </button>
    </div>

    <div v-if="isV5" class="tu-v5">
      <div class="tu-chips">
        <button
          v-for="k in NS_KEYS"
          :key="k"
          class="tu-chip"
          :class="{ on: namespace === NS[k] }"
          @click="namespace = NS[k]"
        >
          {{ k }}
        </button>
      </div>
      <input
        v-model="namespace"
        class="tu-in tu-mono"
        spellcheck="false"
        :aria-label="$t('toolUuid.namespaceUUID')"
      />
      <input
        v-model="name"
        class="tu-in"
        :placeholder="$t('toolUuid.nameEGExampleCom')"
        spellcheck="false"
        :aria-label="$t('toolUuid.name')"
      />
      <div class="tu-verify">
        <input
          v-model="verify"
          class="tu-in tu-mono"
          spellcheck="false"
          :placeholder="$t('toolUuid.verifyAUUIDAgainstThis')"
          :aria-label="$t('toolUuid.verifyUUID')"
        />
        <span v-if="verifyMatch !== null" class="tu-match" :class="{ ok: verifyMatch }">
          <AppIcon :name="verifyMatch ? 'check' : 'x'" />
          {{ verifyMatch ? $t('toolUuid.match') : $t('toolUuid.noMatch') }}
        </span>
      </div>
    </div>

    <div class="tu-lane">
      <span class="tu-k">
        {{ $t('toolUuid.uUID') }}
        <span v-if="info" class="tu-badge">{{
          $t('toolUuid.versionVariant', { version: info.version, variant: info.variant })
        }}</span>
      </span>
      <input
        v-model="uuid"
        class="tu-in tu-mono"
        spellcheck="false"
        :placeholder="$t('toolUuid.pasteOrGenerate')"
        :aria-label="$t('toolUuid.uUID')"
      />
    </div>

    <div class="tu-opts">
      <SegmentedControl v-model:value="caseOpt" :label="$t('toolUuid.case')" :options="CASES" />
      <SegmentedControl v-model:value="form" :label="$t('toolUuid.form')" :options="FORMS" />
    </div>

    <div class="tu-out">
      <span class="tu-mono tu-out-v">{{ display || '—' }}</span>
      <button
        v-if="display"
        class="tu-copy"
        :aria-label="$t('common.copy')"
        :data-tip="$t('common.copy')"
        @click="copy"
      >
        <AppIcon :name="copied ? 'check' : 'copy'" />
      </button>
    </div>
  </div>
</template>

<style scoped src="./styles/ToolUuid.css"></style>

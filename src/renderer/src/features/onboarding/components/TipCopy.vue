<script setup>
import { computed } from 'vue'
import AppIcon from '../../../components/AppIcon.vue'
import { useSettingsStore } from '../../../stores/settingsStore'
import { acceleratorKeys } from '../../../utils/accelerator'
import { isMac } from '../../../keys'
import { shaped } from '../../../utils/props'

defineProps({
  /** @type {import('vue').PropType<import('../../../types').Tip>} */
  tip: { type: Object, required: true, validator: shaped('id', 'titleKey', 'bodyKey') }
})
const settings = useSettingsStore()
const keys = computed(() => acceleratorKeys(settings.quickLookShortcut, isMac))
const braced = (token) => `{{${token}}}`
const HASH = '#'
</script>

<template>
  <i18n-t :keypath="tip.bodyKey" tag="p" class="tip-body">
    <template #hash
      ><kbd class="ql-kbd">{{ HASH }}</kbd></template
    >
    <template #colour>
      <strong>{{ $t('rowColor.menuLabel') }}</strong>
    </template>
    <template v-for="token in tip.tokens ?? []" #[token] :key="token">
      <kbd class="ql-kbd tip-token">{{ braced(token) }}</kbd>
    </template>
    <template #keys>
      <span class="tip-keys">
        <kbd v-for="key in keys" :key="key" class="ql-kbd">{{ key }}</kbd>
      </span>
    </template>
    <template #more>
      <AppIcon
        name="more-horizontal"
        class="tip-more"
        :title="$t('snippetEditorActions.moreActions')"
      />
    </template>
    <template #repair>
      <strong>{{ $t('snippetEditorActions.repair') }}</strong>
    </template>
  </i18n-t>
</template>

<style scoped src="./styles/TipCopy.css"></style>

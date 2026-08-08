<script setup>
// The recipient list at scale. Two regions, and only the lower one filters:
// selected recipients sit above the divider and ignore the query, or ticking
// someone and then searching seals for a person no longer on screen.
// The state and the keyboard guards live in useRecipientPicker so they are
// unit-tested rather than inline here.
import { computed } from 'vue'
import AppIcon from '../../../components/AppIcon.vue'
import { shaped } from '../../../utils/props'
import { t } from '../../../i18n'

const props = defineProps({
  // The useRecipientPicker() return: refs and computeds, not plain data, so the
  // validator names the members this template actually reads.
  picker: {
    type: Object,
    required: true,
    validator: shaped('query', 'visible', 'picked', 'selected', 'toggle', 'handleKey')
  },
  showEmail: { type: Boolean, default: false }
})
defineEmits(['submit', 'close', 'add'])

// The list keeps the height it had BEFORE any query, capped at what fits, so
// filtering never resizes the dialog under the pointer — the same reservation
// SettingsDialog makes for its panes.
const MAX_VISIBLE_ROWS = 8
const reservedRows = computed(() => Math.min(props.picker.total.value, MAX_VISIBLE_ROWS))
</script>

<template>
  <div class="picker">
    <div class="filterbar">
      <span class="field-search">
        <AppIcon name="search" />
        <input
          :value="picker.query.value"
          type="search"
          :placeholder="$t('share.recipientPicker.searchRecipients')"
          spellcheck="false"
          autofocus
          :aria-label="$t('share.recipientPicker.searchRecipients2')"
          @input="picker.setQuery($event.target.value)"
          @keydown="
            picker.handleKey($event, {
              onSubmit: () => $emit('submit'),
              onClose: () => $emit('close')
            }) && $event.preventDefault()
          "
        />
        <button
          v-if="picker.query.value"
          type="button"
          :aria-label="$t('share.recipientPicker.clearSearch')"
          @click="picker.setQuery('')"
        >
          <AppIcon name="x" />
        </button>
      </span>
      <button
        v-if="showEmail"
        type="button"
        class="btn btn-sm"
        :class="{ active: picker.emailOnly.value }"
        :data-tip="$t('share.recipientPicker.showOnlyRecipientsWithAn')"
        @click="picker.setEmailOnly(!picker.emailOnly.value)"
      >
        {{ $t('share.recipientPicker.withAnAddress') }}
      </button>
    </div>

    <ul class="picked">
      <li v-for="r in picker.picked.value" :key="r.fingerprint">
        <button
          type="button"
          class="chip"
          :data-tip="$t('recipientPicker.removeTip', { name: r.label })"
          @click="picker.toggle(r.fingerprint)"
        >
          <span class="chip-name">{{ r.label }}</span>
          <AppIcon name="x" />
        </button>
      </li>
    </ul>

    <div class="dialog-scroller rows" :style="{ '--reserved-rows': reservedRows }">
      <p v-if="!picker.visible.value.length" class="empty">
        {{
          picker.query.value
            ? t('recipientPicker.noMatches', { query: picker.query.value })
            : $t('share.recipientPicker.noneHaveEmail')
        }}
      </p>
      <ul v-else class="recipients">
        <li v-for="(r, i) in picker.visible.value" :key="r.fingerprint">
          <label class="recipient" :class="{ active: picker.activeIndex.value === i }">
            <input
              type="checkbox"
              :checked="picker.selected.value.includes(r.fingerprint)"
              @change="picker.toggle(r.fingerprint)"
            />
            <span class="rc-name">{{ r.label }}</span>
            <span v-if="r.email" class="rc-mail">{{ r.email }}</span>
            <span v-else class="rc-mail none">{{ $t('share.recipientPicker.noAddress') }}</span>
          </label>
        </li>
      </ul>
    </div>

    <div class="listfoot">
      <span v-if="picker.isFiltered.value">
        {{
          $t('share.recipientPicker.visibleOfTotal', {
            shown: picker.visible.value.length,
            total: picker.total.value
          })
        }}
      </span>
      <span v-else>{{ $t('share.recipientPicker.keyCount', picker.total.value) }}</span>
      <span class="spacer" />
      <button type="button" class="btn btn-sm" @click="$emit('add')">
        {{ $t('share.recipientPicker.addRecipient') }}
      </button>
    </div>
  </div>
</template>

<style scoped src="./styles/RecipientPicker.css"></style>

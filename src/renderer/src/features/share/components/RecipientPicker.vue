<script setup>
// The recipient list at scale. Two regions, and only the lower one filters:
// selected recipients sit above the divider and ignore the query, or ticking
// someone and then searching seals for a person no longer on screen.
// The state and the keyboard guards live in useRecipientPicker so they are
// unit-tested rather than inline here.
import AppIcon from '../../../components/AppIcon.vue'
import { shaped } from '../../../utils/props'

defineProps({
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
</script>

<template>
  <div class="picker">
    <div class="filterbar">
      <span class="field-search">
        <AppIcon name="search" />
        <input
          :value="picker.query.value"
          type="search"
          placeholder="Search recipients…"
          spellcheck="false"
          autofocus
          aria-label="Search recipients"
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
          aria-label="Clear search"
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
        data-tip="Show only recipients with an email address"
        @click="picker.setEmailOnly(!picker.emailOnly.value)"
      >
        With an address
      </button>
    </div>

    <ul v-if="picker.picked.value.length" class="picked">
      <li v-for="r in picker.picked.value" :key="r.fingerprint">
        <button
          type="button"
          class="chip"
          :data-tip="`Remove ${r.label}`"
          @click="picker.toggle(r.fingerprint)"
        >
          <span class="chip-name">{{ r.label }}</span>
          <AppIcon name="x" />
        </button>
      </li>
    </ul>

    <div class="dialog-scroller rows">
      <p v-if="!picker.visible.value.length" class="empty">
        {{
          picker.query.value
            ? `No one matches “${picker.query.value}”.`
            : 'No trusted key has an email address yet.'
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
            <span v-else class="rc-mail none">no address</span>
          </label>
        </li>
      </ul>
    </div>

    <div class="listfoot">
      <span v-if="picker.isFiltered.value">
        {{ picker.visible.value.length }} of {{ picker.total.value }}
      </span>
      <span v-else>{{ picker.total.value }} {{ picker.total.value === 1 ? 'key' : 'keys' }}</span>
      <span class="spacer" />
      <button type="button" class="btn btn-sm" @click="$emit('add')">Add recipient…</button>
    </div>
  </div>
</template>

<style scoped src="./styles/RecipientPicker.css"></style>

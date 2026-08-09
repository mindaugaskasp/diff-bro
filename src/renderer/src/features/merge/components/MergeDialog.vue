<script setup>
// Resolving what git could not: one choice per conflict, and the merged file
// goes back only when every one of them has an answer.
import { useMergeStore } from '../mergeStore'
import BaseDialog from '../../../components/BaseDialog.vue'
import AppIcon from '../../../components/AppIcon.vue'

const merge = useMergeStore()

const CHOICES = [
  { value: 'ours', labelKey: 'merge.takeOurs' },
  { value: 'theirs', labelKey: 'merge.takeTheirs' },
  { value: 'both', labelKey: 'merge.takeBoth' },
  { value: 'neither', labelKey: 'merge.takeNeither' }
]

const preview = (lines) => lines.join('\n')
</script>

<template>
  <BaseDialog
    v-if="merge.open"
    :title="$t('merge.title')"
    :width="{ width: 760, height: 620 }"
    :escape-closes="false"
    @close="merge.close()"
  >
    <p v-if="merge.error === 'unreadable'" class="dialog-note">
      {{ $t('merge.unreadable') }}
    </p>
    <template v-else>
      <p class="dialog-note">{{ $t('merge.remaining', merge.remaining) }}</p>

      <div class="merge-bulk">
        <button
          v-for="c in CHOICES.slice(0, 2)"
          :key="c.value"
          class="btn btn-sm"
          @click="merge.takeAll(c.value)"
        >
          {{ $t('merge.allOf', { side: $t(c.labelKey) }) }}
        </button>
      </div>

      <div class="merge-list">
        <section
          v-for="(conflict, i) in merge.conflicts"
          :key="i"
          class="merge-conflict"
          :class="{ done: merge.choices[i] }"
        >
          <header class="merge-head band">
            <AppIcon :name="merge.choices[i] ? 'check' : 'minus'" />
            <span>{{ $t('merge.conflictN', { n: i + 1 }) }}</span>
            <span class="merge-choices">
              <button
                v-for="c in CHOICES"
                :key="c.value"
                class="btn btn-sm"
                :class="{ active: merge.choices[i] === c.value }"
                :data-testid="`merge-${c.value}-${i}`"
                @click="merge.choose(i, c.value)"
              >
                {{ $t(c.labelKey) }}
              </button>
            </span>
          </header>
          <div class="merge-sides">
            <pre class="merge-side ours">{{ preview(conflict.ours) }}</pre>
            <pre class="merge-side theirs">{{ preview(conflict.theirs) }}</pre>
          </div>
        </section>
      </div>
    </template>

    <template #actions>
      <button class="btn btn-ghost" @click="merge.close()">{{ $t('common.cancel') }}</button>
      <button
        class="btn btn-primary"
        data-testid="merge-save"
        :disabled="!merge.canSave"
        @click="merge.save()"
      >
        {{ $t('merge.save') }}
      </button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/MergeDialog.css"></style>

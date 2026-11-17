<script setup>
import { onMounted, ref, watch } from 'vue'
import SettingToggle from '../../../components/SettingToggle.vue'
import { useLanStore } from '../lanStore'

const lan = useLanStore()
const name = ref(lan.name)
watch(
  () => lan.name,
  (value) => (name.value = value)
)
onMounted(() => lan.init())

function commitName() {
  const next = name.value.trim()
  if (next && next !== lan.name) lan.update({ name: next })
  else name.value = lan.name
}
</script>

<template>
  <section class="network-settings">
    <h4>{{ $t('lan.settings.title') }}</h4>
    <SettingToggle :checked="lan.enabled" @change="(on) => lan.update({ enabled: on })">
      {{ $t('lan.settings.share') }}
    </SettingToggle>
    <p class="dialog-note">{{ $t('lan.settings.shareNote') }}</p>
    <SettingToggle
      :checked="lan.visible"
      :disabled="!lan.enabled"
      @change="(on) => lan.update({ visible: on })"
    >
      {{ $t('lan.settings.visible') }}
    </SettingToggle>
    <p class="dialog-note">{{ $t('lan.settings.visibleNote') }}</p>
    <SettingToggle
      :checked="lan.popups"
      :disabled="!lan.enabled"
      @change="(on) => lan.update({ popups: on })"
    >
      {{ $t('lan.settings.popups') }}
    </SettingToggle>
    <p class="dialog-note">{{ $t('lan.settings.popupsNote') }}</p>
    <label class="name-row" :class="{ off: !lan.enabled }">
      <span class="name-label">{{ $t('lan.settings.name') }}</span>
      <input
        v-model="name"
        type="text"
        maxlength="64"
        spellcheck="false"
        :disabled="!lan.enabled"
        data-testid="lan-name"
        @blur="commitName"
        @keydown.enter="commitName"
      />
    </label>
    <template v-if="lan.enabled">
      <h4>{{ $t('lan.settings.people') }}</h4>
      <p v-if="!lan.online" class="dialog-note">{{ $t('lan.settings.noNetwork') }}</p>
      <p v-else-if="!lan.peers.length" class="dialog-note">{{ $t('lan.settings.noOne') }}</p>
      <div v-else class="people" data-testid="lan-people">
        <div v-for="peer in lan.peers" :key="peer.fp" class="row-2 person">
          <span class="row-2-text"
            ><span class="row-2-name">{{ peer.name }}</span></span
          >
          <span v-if="peer.trusted" class="status">{{ $t('lan.settings.trusted') }}</span>
          <button v-else type="button" class="btn btn-sm" @click="lan.add(peer)">
            {{ $t('lan.add.button') }}
          </button>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped src="./styles/NetworkSettings.css"></style>

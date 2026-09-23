<template>
  <div class="flex flex-col gap-3 text-sm text-content w-full select-text">
    <div class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-content-muted">
      <span class="font-semibold uppercase" :class="TONE_TEXT[tone]">{{ severityLabel }}</span>
      <span v-if="alert.codeName || alert.code !== undefined" class="tabular-nums">
        {{ alert.codeName }}<template v-if="alert.code !== undefined"> #{{ alert.code }}</template>
      </span>
      <span v-if="time" class="tabular-nums">{{ time }}</span>
    </div>
    <div v-if="alert.explanation">
      <p class="text-[11px] font-bold uppercase tracking-wider text-content-faint mb-0.5">
        {{ t('components.guider.native.log.explanation') }}
      </p>
      <p>{{ alert.explanation }}</p>
    </div>
    <div
      v-if="alert.fix"
      class="rounded-control border border-accent/30 bg-accent/5 p-2.5 flex flex-col gap-0.5"
    >
      <p class="text-[11px] font-bold uppercase tracking-wider text-accent">
        {{ t('components.guider.native.log.fix') }}
      </p>
      <p>{{ alert.fix }}</p>
    </div>
    <div v-if="alert.detail">
      <p class="text-[11px] font-bold uppercase tracking-wider text-content-faint mb-0.5">
        {{ t('components.guider.native.log.detail') }}
      </p>
      <p class="text-content-muted break-words">{{ alert.detail }}</p>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { TONE_TEXT, severityTone } from '@/utils/nativeGuider';

const props = defineProps({
  alert: { type: Object, required: true },
});

const { t, te } = useI18n();
const tone = computed(() => severityTone(props.alert.severity));
const severityLabel = computed(() => {
  const key = `components.guider.native.log.severity.${String(props.alert.severity || 'Info').toLowerCase()}`;
  return te(key) ? t(key) : props.alert.severity;
});
const time = computed(() => {
  const ms = Date.parse(props.alert.timestamp);
  return Number.isFinite(ms) ? new Date(ms).toLocaleTimeString() : '';
});
</script>

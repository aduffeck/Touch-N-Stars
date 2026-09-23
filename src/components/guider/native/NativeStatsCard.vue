<template>
  <div class="tns-card flex flex-col gap-2 min-w-0">
    <h3 class="text-sm font-semibold text-content">
      {{ t('components.guider.native.stats.title') }}
    </h3>

    <div v-if="!windowStats && !sessionStats" class="py-4 text-center text-xs text-content-muted">
      {{ t('components.guider.native.stats.empty') }}
    </div>

    <div v-else class="stats-grid text-xs">
      <!-- Header row -->
      <div></div>
      <div class="col-head">{{ t('components.guider.native.stats.window') }}</div>
      <div class="col-head">{{ t('components.guider.native.stats.session') }}</div>

      <template v-for="row in rows" :key="row.key">
        <div class="row-label" :class="{ 'font-semibold text-content': row.emphasis }">
          {{ t(`components.guider.native.stats.${row.key}`) }}
        </div>
        <div class="row-value">
          <span :class="row.emphasis ? 'text-accent font-semibold' : 'text-content'">
            {{ row.format(windowStats) }}
          </span>
          <span v-if="row.sub" class="row-sub">{{ row.sub(windowStats) }}</span>
        </div>
        <div class="row-value">
          <span :class="row.emphasis ? 'text-accent font-semibold' : 'text-content'">
            {{ row.format(sessionStats) }}
          </span>
          <span v-if="row.sub" class="row-sub">{{ row.sub(sessionStats) }}</span>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useNativeGuiderStore } from '@/store/nativeGuiderStore';
import { fmt } from '@/utils/nativeGuider';
import { formatElapsed } from './graphData';

const { t } = useI18n();
const store = useNativeGuiderStore();

const windowStats = computed(() => store.windowStats);
const sessionStats = computed(() => store.sessionStats);

const ARCSEC = '″';
const ARCMIN = '′';

function missing(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value));
}

function withSuffix(value, digits, suffix) {
  return missing(value) ? '–' : `${fmt(value, digits)}${suffix}`;
}

function pair(a, b, digits, suffix = '') {
  if (missing(a) && missing(b)) return '–';
  return `${missing(a) ? '–' : fmt(a, digits)} / ${missing(b) ? '–' : fmt(b, digits)}${suffix}`;
}

function signed(value, digits, suffix) {
  if (missing(value)) return '–';
  const v = Number(value);
  return `${v > 0 ? '+' : ''}${v.toFixed(digits)}${suffix}`;
}

// Each row formats one AdvancedGuiderStats object (null-safe); `sub` is a faint second line.
const rows = [
  {
    key: 'rmsTotal',
    emphasis: true,
    format: (s) => withSuffix(s?.rmsTotalArcsec, 2, ARCSEC),
    sub: (s) => withSuffix(s?.rmsTotalPx, 2, ' px'),
  },
  {
    key: 'rmsRa',
    format: (s) => withSuffix(s?.rmsRaArcsec, 2, ARCSEC),
    sub: (s) => withSuffix(s?.rmsRaPx, 2, ' px'),
  },
  {
    key: 'rmsDec',
    format: (s) => withSuffix(s?.rmsDecArcsec, 2, ARCSEC),
    sub: (s) => withSuffix(s?.rmsDecPx, 2, ' px'),
  },
  {
    key: 'peak',
    format: (s) => pair(s?.peakRaArcsec, s?.peakDecArcsec, 2, ARCSEC),
  },
  {
    key: 'driftRa',
    format: (s) => signed(s?.driftRaArcsecPerMin, 2, `${ARCSEC}/min`),
  },
  {
    key: 'driftDec',
    format: (s) => signed(s?.driftDecArcsecPerMin, 2, `${ARCSEC}/min`),
  },
  {
    key: 'polarAlignment',
    format: (s) => withSuffix(s?.polarAlignmentErrorArcmin, 1, ARCMIN),
  },
  {
    key: 'oscillation',
    format: (s) => withSuffix(s?.oscillationIndex, 2, ''),
  },
  {
    key: 'duty',
    format: (s) => pair(s?.raDutyPercent, s?.decDutyPercent, 0, ' %'),
  },
  {
    key: 'snr',
    format: (s) => pair(s?.snrMin, s?.snrAvg, 1),
    sub: (s) =>
      missing(s?.snrLast)
        ? ''
        : t('components.guider.native.stats.snrLast', { value: fmt(s.snrLast, 1) }),
  },
  {
    key: 'stars',
    format: (s) => withSuffix(s?.avgStarCount, 1, ''),
  },
  {
    key: 'starLost',
    format: (s) => (missing(s?.starLostCount) ? '–' : String(s.starLostCount)),
  },
  {
    key: 'frames',
    format: (s) => (missing(s?.frames) ? '–' : String(s.frames)),
  },
  {
    key: 'elapsed',
    format: (s) => formatElapsed(s?.elapsedSeconds),
  },
];
</script>

<style scoped>
@reference '../../../assets/tailwind.css';

.stats-grid {
  @apply grid items-baseline gap-x-3 gap-y-1.5;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1fr);
}

.col-head {
  @apply text-right text-[10px] font-bold uppercase tracking-wider text-content-faint truncate;
}

.row-label {
  @apply text-content-muted truncate;
}

.row-value {
  @apply flex flex-col items-end text-right tabular-nums leading-tight min-w-0;
}

.row-sub {
  @apply text-[10px] text-content-faint;
}
</style>

<template>
  <div class="tns-card p-3! flex flex-col gap-2">
    <!-- State badge + feed indicator + last error -->
    <div class="flex flex-wrap items-center gap-2">
      <div
        class="flex items-center gap-2 rounded-chip px-3 py-1.5 border"
        :class="[badgeClasses, { 'state-pulse': pulsing }]"
        data-testid="native-guider-state"
      >
        <span class="tns-dot w-2.5! h-2.5!" :class="TONE_BG[tone]"></span>
        <span class="text-base font-bold tracking-wide" :class="TONE_TEXT[tone]">
          {{ stateLabel }}
        </span>
        <span
          v-if="store.isSettling"
          class="text-xs font-semibold uppercase text-status-warn ml-1"
          >{{ t('components.guider.native.strip.settling') }}</span
        >
      </div>

      <span
        class="flex items-center gap-1 text-[11px] uppercase tracking-wider text-content-faint"
        :title="
          store.wsConnected
            ? t('components.guider.native.strip.liveHint')
            : t('components.guider.native.strip.pollHint')
        "
      >
        <span
          class="tns-dot w-1.5! h-1.5!"
          :class="store.wsConnected ? 'bg-status-ok' : 'bg-status-warn'"
        ></span>
        {{
          store.wsConnected
            ? t('components.guider.native.strip.live')
            : t('components.guider.native.strip.poll')
        }}
      </span>

      <button
        v-if="lastError"
        type="button"
        class="ml-auto flex items-center gap-1.5 rounded-chip px-2.5 py-1 text-xs font-semibold border max-w-full min-w-0"
        :class="errorChipClasses"
        @click="showError = true"
      >
        <ExclamationTriangleIcon class="w-4 h-4 shrink-0" />
        <span class="truncate">{{ lastError.title || lastError.codeName }}</span>
      </button>
    </div>

    <!-- Calibration progress -->
    <div v-if="calibrationStep" class="flex flex-col gap-1">
      <div class="flex justify-between text-xs text-content-muted">
        <span class="truncate">{{ calibrationStep }}</span>
        <span v-if="calibrationPercent !== null" class="tabular-nums"
          >{{ calibrationPercent }}%</span
        >
      </div>
      <div class="h-1.5 rounded-full bg-surface-3 overflow-hidden">
        <div
          class="h-full bg-accent transition-all duration-500"
          :style="{ width: `${calibrationPercent ?? 0}%` }"
        ></div>
      </div>
    </div>

    <!-- Settle status -->
    <p v-if="settleText" class="text-xs text-status-warn truncate">{{ settleText }}</p>

    <!-- Live numbers -->
    <div class="grid grid-cols-4 gap-1.5">
      <div class="tns-stat-tile min-h-12! px-2!">
        <span class="tns-stat-label">{{ t('components.guider.native.strip.rmsTotal') }}</span>
        <span class="tns-stat-value" :class="rmsTone">{{ fmt(rms.total, 2) }}″</span>
        <span class="text-[10px] text-content-faint tabular-nums"
          >{{ fmt(rms.totalPx, 2) }} px</span
        >
      </div>
      <div class="tns-stat-tile min-h-12! px-2!">
        <span class="tns-stat-label">{{ t('components.guider.native.strip.rmsRa') }}</span>
        <span class="tns-stat-value text-ra">{{ fmt(rms.ra, 2) }}″</span>
        <span class="text-[10px] text-content-faint tabular-nums">{{ fmt(rms.raPx, 2) }} px</span>
      </div>
      <div class="tns-stat-tile min-h-12! px-2!">
        <span class="tns-stat-label">{{ t('components.guider.native.strip.rmsDec') }}</span>
        <span class="tns-stat-value text-dec">{{ fmt(rms.dec, 2) }}″</span>
        <span class="text-[10px] text-content-faint tabular-nums">{{ fmt(rms.decPx, 2) }} px</span>
      </div>
      <div class="tns-stat-tile min-h-12! px-2!" :class="snrTileClass">
        <span class="tns-stat-label">{{ t('components.guider.native.strip.snr') }}</span>
        <span class="tns-stat-value" :class="TONE_TEXT[snrToneValue]">{{
          fmt(primary?.snr, 1)
        }}</span>
        <span class="text-[10px] text-content-faint tabular-nums"
          >{{ t('components.guider.native.strip.mass') }} {{ fmt(primary?.mass, 0) }}</span
        >
      </div>
      <div class="tns-stat-tile min-h-12! px-2!">
        <span class="tns-stat-label">{{ t('components.guider.native.strip.hfd') }}</span>
        <span class="tns-stat-value">{{ fmt(primary?.hfd, 2) }}</span>
        <span class="text-[10px] text-content-faint">px</span>
      </div>
      <div class="tns-stat-tile min-h-12! px-2!">
        <span class="tns-stat-label">{{ t('components.guider.native.strip.stars') }}</span>
        <span class="tns-stat-value">
          {{ status?.starsUsed ?? '–' }}<span class="text-content-faint">/</span
          >{{ status?.starCount ?? '–' }}
        </span>
        <span class="text-[10px] text-content-faint">{{
          t('components.guider.native.strip.usedTotal')
        }}</span>
      </div>
      <div class="tns-stat-tile min-h-12! px-2!">
        <span class="tns-stat-label">{{ t('components.guider.native.strip.frame') }}</span>
        <span class="tns-stat-value">{{ status?.frameNumber ?? '–' }}</span>
        <span class="text-[10px] text-content-faint tabular-nums"
          >{{ fmt(status?.exposureSeconds, 1) }} s</span
        >
      </div>
      <div class="tns-stat-tile min-h-12! px-2!" :class="processingTileClass">
        <span class="tns-stat-label">{{ t('components.guider.native.strip.processing') }}</span>
        <span class="tns-stat-value">{{ fmt(status?.lastProcessingMs, 0) }}</span>
        <span class="text-[10px] text-content-faint">ms</span>
      </div>
    </div>

    <!-- Error detail -->
    <Modal :show="showError" max-width="max-w-lg" @close="showError = false">
      <template #header>
        <h2 class="text-lg font-bold flex items-center gap-2" :class="errorTextClass">
          <ExclamationTriangleIcon class="w-5 h-5" />
          {{ lastError?.title || lastError?.codeName }}
        </h2>
      </template>
      <template #body>
        <NativeAlertDetail v-if="lastError" :alert="lastError" />
      </template>
    </Modal>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ExclamationTriangleIcon } from '@heroicons/vue/24/outline';
import Modal from '@/components/helpers/Modal.vue';
import NativeAlertDetail from './NativeAlertDetail.vue';
import { useNativeGuiderStore } from '@/store/nativeGuiderStore';
import {
  TONE_BG,
  TONE_TEXT,
  fmt,
  severityTone,
  snrTone,
  stateTone,
  windowRms,
} from '@/utils/nativeGuider';

const { t, te } = useI18n();
const store = useNativeGuiderStore();
const showError = ref(false);

const status = computed(() => store.status);
const primary = computed(() => store.status?.primaryStar || null);
const tone = computed(() => stateTone(store.state));

const stateLabel = computed(() => {
  const key = `components.guider.native.states.${store.state}`;
  return te(key) ? t(key) : store.state;
});

const pulsing = computed(
  () => store.isSettling || ['Calibrating', 'Reacquiring'].includes(store.state)
);

const badgeClasses = computed(
  () =>
    ({
      ok: 'border-status-ok/40 bg-status-ok/10',
      info: 'border-accent/40 bg-accent/10',
      warn: 'border-status-warn/40 bg-status-warn/10',
      danger: 'border-status-danger/50 bg-status-danger/15',
      idle: 'border-line-strong bg-surface-2',
    })[tone.value]
);

// Backend window statistics first; the client-side window of the last 100 steps covers
// guiders/moments without stats (e.g. right after a reconnect).
const rms = computed(() => {
  const w = store.windowStats;
  if (w && Number.isFinite(w.rmsTotalArcsec) && w.frames > 0) {
    return {
      total: w.rmsTotalArcsec,
      ra: w.rmsRaArcsec,
      dec: w.rmsDecArcsec,
      totalPx: w.rmsTotalPx,
      raPx: w.rmsRaPx,
      decPx: w.rmsDecPx,
    };
  }
  const recent = store.steps.slice(-100);
  const arcsec = windowRms(recent, 'arcsec');
  const px = windowRms(recent, 'px');
  return {
    total: arcsec.total,
    ra: arcsec.ra,
    dec: arcsec.dec,
    totalPx: px.total,
    raPx: px.ra,
    decPx: px.dec,
  };
});

const rmsTone = computed(() => {
  const v = rms.value.total;
  if (!Number.isFinite(v)) return '';
  if (v > 2) return 'text-status-danger';
  if (v > 1.2) return 'text-status-warn';
  return 'text-status-ok';
});

const snrToneValue = computed(() => snrTone(primary.value?.snr));
const snrTileClass = computed(() =>
  snrToneValue.value === 'danger'
    ? 'tns-stat-tile-danger'
    : snrToneValue.value === 'warn'
      ? 'tns-stat-tile-warn'
      : ''
);

const processingTileClass = computed(() => {
  const ms = status.value?.lastProcessingMs;
  const exposureMs = (status.value?.exposureSeconds || 0) * 1000;
  return Number.isFinite(ms) && exposureMs > 0 && ms > exposureMs * 0.5 ? 'tns-stat-tile-warn' : '';
});

const calibrationStep = computed(() =>
  store.state === 'Calibrating' ? store.status?.calibrationStep || '' : ''
);
const calibrationPercent = computed(() => {
  const p = store.status?.calibrationProgress;
  if (!Number.isFinite(p)) return null;
  return Math.round(Math.min(100, Math.max(0, p <= 1 ? p * 100 : p)));
});

const settleText = computed(() => (store.isSettling ? store.status?.settleStatus || '' : ''));

const lastError = computed(() => store.status?.lastError || null);
const errorTone = computed(() => severityTone(lastError.value?.severity));
const errorChipClasses = computed(
  () =>
    ({
      danger: 'border-status-danger/50 bg-status-danger/15 text-status-danger',
      warn: 'border-status-warn/50 bg-status-warn/10 text-status-warn',
      info: 'border-accent/40 bg-accent/10 text-accent',
    })[errorTone.value]
);
const errorTextClass = computed(() => TONE_TEXT[errorTone.value]);
</script>

<style scoped>
.text-ra {
  color: #60a5fa;
}
.text-dec {
  color: #f87171;
}
.state-pulse {
  animation: state-pulse 1.4s ease-in-out infinite;
}
@keyframes state-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.55;
  }
}
</style>

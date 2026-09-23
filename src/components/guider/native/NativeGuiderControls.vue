<template>
  <div class="tns-card p-2! grid grid-cols-3 sm:grid-cols-6 gap-1.5">
    <!-- Loop / Stop -->
    <button
      v-if="showLoop"
      type="button"
      class="tns-btn-secondary flex-col gap-0.5! px-1! text-xs!"
      :disabled="!can('loop') || busy"
      @click="run('loop')"
    >
      <ArrowPathIcon class="w-5 h-5" :class="{ 'animate-spin': pending === 'loop' }" />
      {{ t('components.guider.native.controls.loop') }}
    </button>
    <button
      v-else
      type="button"
      class="tns-btn-danger flex-col gap-0.5! px-1! text-xs!"
      :disabled="!can('stop') || busy"
      @click="stop"
    >
      <StopIcon class="w-5 h-5" />
      {{ t('components.guider.native.controls.stop') }}
    </button>

    <!-- Guide (calibrates when needed) -->
    <button
      type="button"
      class="tns-btn-primary flex-col gap-0.5! px-1! text-xs!"
      :disabled="!can('guide') || busy"
      @click="guide(false)"
    >
      <PlayIcon class="w-5 h-5" :class="{ 'animate-pulse': pending === 'start-guiding' }" />
      {{ t('components.guider.native.controls.guide') }}
    </button>

    <!-- Force calibration -->
    <button
      type="button"
      class="tns-btn-secondary flex-col gap-0.5! px-1! text-xs!"
      :disabled="!can('calibrate') || busy"
      @click="guide(true)"
    >
      <ArrowsPointingOutIcon class="w-5 h-5" />
      {{ t('components.guider.native.controls.calibrate') }}
    </button>

    <!-- Pause / Resume -->
    <button
      v-if="store.state === 'Paused'"
      type="button"
      class="tns-btn-secondary flex-col gap-0.5! px-1! text-xs! border-status-warn/60!"
      :disabled="!can('resume') || busy"
      @click="run('resume')"
    >
      <PlayPauseIcon class="w-5 h-5 text-status-warn" />
      {{ t('components.guider.native.controls.resume') }}
    </button>
    <button
      v-else
      type="button"
      class="tns-btn-secondary flex-col gap-0.5! px-1! text-xs!"
      :disabled="!can('pause') || busy"
      @click="run('pause')"
    >
      <PauseIcon class="w-5 h-5" />
      {{ t('components.guider.native.controls.pause') }}
    </button>

    <!-- Dither -->
    <button
      type="button"
      class="tns-btn-secondary flex-col gap-0.5! px-1! text-xs!"
      :disabled="!can('dither') || busy"
      @click="showDither = true"
    >
      <ArrowsRightLeftIcon class="w-5 h-5" />
      {{ t('components.guider.native.controls.dither') }}
    </button>

    <!-- Clear calibration -->
    <button
      type="button"
      class="tns-btn-secondary flex-col gap-0.5! px-1! text-xs!"
      :disabled="!can('clearCalibration') || busy"
      @click="clearCalibration"
    >
      <TrashIcon class="w-5 h-5" />
      {{ t('components.guider.native.controls.clearCalibration') }}
    </button>

    <!-- Dither dialog -->
    <Modal :show="showDither" max-width="max-w-sm" @close="showDither = false">
      <template #header>
        <h2 class="text-lg font-bold">{{ t('components.guider.native.controls.ditherTitle') }}</h2>
      </template>
      <template #body>
        <div class="flex flex-col gap-4 w-full">
          <label class="flex flex-col gap-1 text-sm text-content">
            {{ t('components.guider.native.controls.ditherPixels') }}
            <input
              v-model="ditherPixels"
              type="text"
              inputmode="decimal"
              class="tns-input"
              @keyup.enter="dither"
            />
            <span v-if="ditherError" class="text-xs text-status-danger">{{ ditherError }}</span>
          </label>
          <div class="flex items-center justify-between gap-3 text-sm text-content">
            <span>{{ t('components.guider.native.controls.ditherRaOnly') }}</span>
            <toggleButton v-model:statusValue="ditherRaOnly" />
          </div>
          <p class="text-xs text-content-muted">
            {{ t('components.guider.native.controls.ditherHint') }}
          </p>
          <div class="flex gap-2">
            <button type="button" class="tns-btn-secondary" @click="showDither = false">
              {{ t('common.cancel') }}
            </button>
            <button type="button" class="tns-btn-primary" :disabled="busy" @click="dither">
              {{ t('components.guider.native.controls.dither') }}
            </button>
          </div>
        </div>
      </template>
    </Modal>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  ArrowPathIcon,
  ArrowsPointingOutIcon,
  ArrowsRightLeftIcon,
  PauseIcon,
  PlayIcon,
  PlayPauseIcon,
  StopIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline';
import Modal from '@/components/helpers/Modal.vue';
import toggleButton from '@/components/helpers/toggleButton.vue';
import { useNativeGuiderStore } from '@/store/nativeGuiderStore';
import { useToastStore } from '@/store/toastStore';
import { canPerform } from '@/utils/nativeGuider';

const { t } = useI18n();
const store = useNativeGuiderStore();
const toastStore = useToastStore();

const showDither = ref(false);
const ditherPixels = ref(readStored('nativeGuider.ditherPixels', '3'));
const ditherRaOnly = ref(readStored('nativeGuider.ditherRaOnly', 'false') === 'true');
const ditherError = ref('');

const pending = computed(() => store.pendingAction);
const busy = computed(() => !!store.pendingAction);
const showLoop = computed(() =>
  ['Stopped', 'Failed', 'Disconnected', 'Unknown'].includes(store.state)
);

function readStored(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStored(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // storage unavailable (private mode) - the value just is not remembered
  }
}

function can(action) {
  return canPerform(action, store.state, {
    connected: store.isAvailable,
    isCalibrated: store.isCalibrated,
  });
}

function confirm(titleKey, messageKey) {
  return toastStore.showConfirmation(
    t(titleKey),
    t(messageKey),
    t('common.confirm'),
    t('common.cancel')
  );
}

function run(action, params = {}) {
  return store.runAction(action, params, {
    title: t('components.guider.native.controls.failed', {
      action: t(`components.guider.native.controls.actions.${action}`),
    }),
  });
}

async function stop() {
  const guiding = ['Guiding', 'Calibrating', 'Paused', 'LostLock', 'Reacquiring'].includes(
    store.state
  );
  if (
    guiding &&
    !(await confirm(
      'components.guider.native.controls.confirmStopTitle',
      'components.guider.native.controls.confirmStop'
    ))
  ) {
    return;
  }
  await run('stop');
}

async function guide(forceCalibration) {
  if (
    forceCalibration &&
    store.isCalibrated &&
    !(await confirm(
      'components.guider.native.controls.confirmCalibrateTitle',
      'components.guider.native.controls.confirmCalibrate'
    ))
  ) {
    return;
  }
  await run('start-guiding', { calibrate: forceCalibration });
}

async function clearCalibration() {
  if (
    !(await confirm(
      'components.guider.native.controls.confirmClearTitle',
      'components.guider.native.controls.confirmClear'
    ))
  ) {
    return;
  }
  await run('clear-calibration');
}

async function dither() {
  const pixels = Number(String(ditherPixels.value).replace(',', '.'));
  if (!Number.isFinite(pixels) || pixels <= 0 || pixels > 100) {
    ditherError.value = t('components.guider.native.controls.ditherInvalid');
    return;
  }
  ditherError.value = '';
  writeStored('nativeGuider.ditherPixels', pixels);
  writeStored('nativeGuider.ditherRaOnly', ditherRaOnly.value);
  showDither.value = false;
  await run('dither', { pixels, raOnly: ditherRaOnly.value });
}
</script>

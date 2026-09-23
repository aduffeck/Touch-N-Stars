<template>
  <div class="native-guider">
    <SubNav :items="tabs" v-model:activeItem="currentTab" />

    <div class="px-2 sm:px-3 py-3 mx-auto w-full max-w-7xl flex flex-col gap-3">
      <!-- Not connected: status + settings stay usable (camera setup before the first connect) -->
      <div
        v-if="!store.isAvailable"
        class="rounded-card border border-status-warn/40 bg-status-warn/10 p-3 flex flex-col gap-1"
      >
        <p class="text-sm font-semibold text-status-warn">
          {{ t('components.guider.native.notConnected') }}
        </p>
        <p class="text-xs text-content-muted">
          {{ store.summary.reason || t('components.guider.native.notConnectedHint') }}
        </p>
      </div>

      <template v-if="currentTab !== 'settings'">
        <NativeStateStrip />
        <NativeGuiderControls v-if="currentTab !== 'coach'" />
      </template>

      <!-- A coach session runs while another tab is shown: one tap back to it -->
      <button
        v-if="store.coachRunning && currentTab !== 'coach'"
        type="button"
        class="flex min-h-touch w-full items-center gap-2 rounded-card border border-accent/40 bg-accent/10 px-3 text-left text-sm"
        data-testid="coach-running-banner"
        @click="currentTab = 'coach'"
      >
        <AcademicCapIcon class="h-5 w-5 shrink-0 text-accent" />
        <span class="min-w-0 flex-1 truncate font-semibold text-accent">{{ coachBannerText }}</span>
        <span class="shrink-0 text-xs font-semibold uppercase text-accent">
          {{ t('components.guider.native.coach.banner.open') }}
        </span>
      </button>

      <!-- Phone / small tablet: one panel per tab -->
      <template v-if="!isWide">
        <NativeFrameView v-if="currentTab === 'frame'" :active="pageVisible" />
        <template v-else-if="currentTab === 'graph'">
          <NativeGuideGraph v-model:window="graphWindow" v-model:unit="graphUnit" />
          <NativeTargetPlot :window="graphWindow" :unit="graphUnit" />
        </template>
        <NativeStatsCard v-else-if="currentTab === 'stats'" />
        <NativeCalibrationCard v-else-if="currentTab === 'calibration'" />
        <NativeEventLog v-else-if="currentTab === 'log'" max-height="60vh" />
        <NativeCoachTab v-else-if="currentTab === 'coach'" />
        <NativeSettingsSheet v-else-if="currentTab === 'settings'" />
      </template>

      <!-- Tablet landscape / desktop: dashboard grid -->
      <template v-else>
        <div v-if="currentTab === 'dashboard'" class="grid grid-cols-12 gap-3">
          <div class="col-span-7 min-w-0">
            <NativeFrameView :active="pageVisible" max-height="58vh" />
          </div>
          <div class="col-span-5 min-w-0 flex flex-col gap-3">
            <NativeTargetPlot :window="graphWindow" :unit="graphUnit" />
            <NativeStatsCard />
          </div>
          <div class="col-span-12 min-w-0">
            <NativeGuideGraph v-model:window="graphWindow" v-model:unit="graphUnit" compact />
          </div>
          <div class="col-span-5 min-w-0">
            <NativeCalibrationCard />
          </div>
          <div class="col-span-7 min-w-0">
            <NativeEventLog max-height="24rem" />
          </div>
        </div>
        <div v-else-if="currentTab === 'coach'" class="max-w-3xl w-full mx-auto">
          <NativeCoachTab />
        </div>
        <div v-else class="max-w-3xl w-full mx-auto">
          <NativeSettingsSheet />
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { AcademicCapIcon } from '@heroicons/vue/24/outline';
import SubNav from '@/components/SubNav.vue';
import { useOrientation } from '@/composables/useOrientation';
import { useNativeGuiderStore } from '@/store/nativeGuiderStore';
import { isAppBackgrounded, useBackgroundAwarePolling } from '@/utils/appLifecycle';
import NativeStateStrip from './NativeStateStrip.vue';
import NativeGuiderControls from './NativeGuiderControls.vue';
import NativeFrameView from './NativeFrameView.vue';
import NativeGuideGraph from './NativeGuideGraph.vue';
import NativeTargetPlot from './NativeTargetPlot.vue';
import NativeStatsCard from './NativeStatsCard.vue';
import NativeCalibrationCard from './NativeCalibrationCard.vue';
import NativeEventLog from './NativeEventLog.vue';
import NativeSettingsSheet from './NativeSettingsSheet.vue';
import NativeCoachTab from './coach/NativeCoachTab.vue';

// Remember the tab and graph options across visits within one app session.
let lastPhoneTab = 'frame';
let lastWideTab = 'dashboard';
let lastGraphWindow = 100;
let lastGraphUnit = 'arcsec';

const WIDE_MIN_WIDTH = 1024;

const { t, te } = useI18n();
const store = useNativeGuiderStore();
const { orientation } = useOrientation();

const isWide = computed(() => orientation.value.width >= WIDE_MIN_WIDTH);
const pageVisible = computed(() => !isAppBackgrounded.value);

const tabs = computed(() =>
  isWide.value
    ? [
        { name: t('components.guider.native.tabs.dashboard'), value: 'dashboard' },
        { name: t('components.guider.native.tabs.coach'), value: 'coach' },
        { name: t('components.guider.native.tabs.settings'), value: 'settings' },
      ]
    : [
        { name: t('components.guider.native.tabs.frame'), value: 'frame' },
        { name: t('components.guider.native.tabs.graph'), value: 'graph' },
        { name: t('components.guider.native.tabs.stats'), value: 'stats' },
        { name: t('components.guider.native.tabs.calibration'), value: 'calibration' },
        { name: t('components.guider.native.tabs.log'), value: 'log' },
        { name: t('components.guider.native.tabs.coach'), value: 'coach' },
        { name: t('components.guider.native.tabs.settings'), value: 'settings' },
      ]
);

const currentTab = ref(isWide.value ? lastWideTab : lastPhoneTab);
// Shared by the guide graph and the target plot.
const graphWindow = ref(lastGraphWindow);
const graphUnit = ref(lastGraphUnit);
watch(graphWindow, (value) => (lastGraphWindow = value));
watch(graphUnit, (value) => (lastGraphUnit = value));

watch(isWide, (wide) => {
  if (currentTab.value === 'settings' || currentTab.value === 'coach') return;
  currentTab.value = wide ? lastWideTab : lastPhoneTab;
});
watch(currentTab, (tab) => {
  if (isWide.value) lastWideTab = tab;
  else lastPhoneTab = tab;
});

const coachBannerText = computed(() => {
  const coach = store.coach;
  const step = coach?.step;
  const stepKey = `components.guider.native.coach.steps.${step}.name`;
  const stepName = step && te(stepKey) ? t(stepKey) : step || '';
  const progress = Number(coach?.progress);
  return t('components.guider.native.coach.banner.running', {
    step: stepName || t('components.guider.native.coach.title'),
    percent: Number.isFinite(progress) ? Math.round(Math.min(1, Math.max(0, progress)) * 100) : 0,
  });
});

// Status every 2 s as the source of truth next to the WebSocket feed (see nativeGuiderStore).
const pollActive = ref(true);
useBackgroundAwarePolling(() => store.refreshStatus(), 2000, pollActive, { immediate: true });

// A newly available guider loads its history in the store (refreshStatus / 'hello').
onMounted(() => {
  if (store.isAvailable) store.loadHistory();
});
</script>

<template>
  <div>
    <!-- PINS native guider: rich page (frame, graph, stats, calibration, log, settings).
         Also shown while it is the selected but not yet connected guider, so the guide
         camera can be set up before the first connect. -->
    <NativeGuiderLayout v-if="isNativeGuider" />

    <!-- PHD2 Mode: New layout with image background -->
    <Phd2GuiderLayout v-else-if="store.guiderInfo.DeviceId === 'PHD2_Single'" />

    <!-- Non-PHD2 Mode: Original layout -->
    <template v-else>
      <div class="container max-w-3xl mx-auto p-4">
        <h5 class="text-xl text-center font-bold text-white mb-4">
          {{ $t('components.guider.title') }}
        </h5>
        <div
          v-if="!store.guiderInfo.Connected"
          class="p-4 bg-status-danger/10 border border-status-danger/30 rounded-card"
        >
          <p class="text-status-danger font-medium text-center">
            {{ $t('components.guider.notConnected') }}
          </p>
        </div>
        <div v-else>
          <!-- Original control buttons layout -->
          <div
            class="flex flex-col md:flex-row gap-1 md:space-x-4 mt-4 border border-line rounded-card bg-surface-1 shadow-lg p-5"
          >
            <ControlGuider />
          </div>

          <!-- Status Component -->
          <div class="mt-4">
            <GuiderStatus />
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, watch } from 'vue';
import { apiStore } from '@/store/store';
import { useStatusBarStore } from '@/store/statusBarStore';
import Phd2GuiderLayout from '@/components/guider/PHD2/Phd2GuiderLayout.vue';
import NativeGuiderLayout from '@/components/guider/native/NativeGuiderLayout.vue';
import ControlGuider from '@/components/guider/ControlGuider.vue';
import GuiderStatus from '@/components/guider/GuiderStatus.vue';
import { isNativeGuiderSelected } from '@/utils/nativeGuider';
import { useI18n } from 'vue-i18n';

const store = apiStore();
const statusBarStore = useStatusBarStore();
const { t: $t } = useI18n();

const isNativeGuider = computed(() =>
  isNativeGuiderSelected({
    guiderInfo: store.guiderInfo,
    profileGuiderName: store.profileInfo?.GuiderSettings?.GuiderName,
  })
);

// Open the guider graph panel while on this page. Leaving restores the panel
// that was open before - unless the user switched panels in the meantime, then
// their choice stays. The native guider page has its own graph and needs the
// height, so it leaves the status bar panel alone.
let panelToRestore = null;
let openedGuiderPanel = false;

function syncGuiderPanel(native) {
  if (!native && !openedGuiderPanel) {
    panelToRestore = statusBarStore.activePanel;
    statusBarStore.openPanel('guider');
    openedGuiderPanel = true;
  } else if (native && openedGuiderPanel) {
    statusBarStore.activePanel = panelToRestore;
    openedGuiderPanel = false;
  }
}

onMounted(() => {
  syncGuiderPanel(isNativeGuider.value);
  watch(isNativeGuider, syncGuiderPanel);

  watch(
    () => statusBarStore.activePanel,
    (panel) => {
      if (openedGuiderPanel && panel !== 'guider') {
        panelToRestore = panel;
      }
    }
  );
});

onUnmounted(() => {
  if (openedGuiderPanel) {
    statusBarStore.activePanel = panelToRestore;
  }
});
</script>

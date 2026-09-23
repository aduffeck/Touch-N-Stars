<template>
  <div class="tns-card p-2! flex flex-col gap-2 min-w-0">
    <!-- Toolbar -->
    <div class="flex items-center gap-2 min-w-0">
      <div class="flex flex-col min-w-0 text-xs leading-tight">
        <span class="text-content font-semibold tabular-nums truncate">
          {{ t('components.guider.native.frame.title') }}
        </span>
        <span class="text-content-faint tabular-nums truncate">{{ subtitle }}</span>
      </div>
      <div class="ml-auto flex items-center gap-1 shrink-0">
        <div class="flex rounded-control border border-line-strong overflow-hidden">
          <button
            v-for="option in STRETCH_OPTIONS"
            :key="option.id"
            type="button"
            class="px-2 h-9 text-xs font-semibold"
            :class="
              stretchId === option.id
                ? 'bg-accent/20 text-accent'
                : 'bg-surface-2 text-content-muted'
            "
            :title="t('components.guider.native.frame.stretch')"
            @click="setStretch(option.id)"
          >
            {{ t(`components.guider.native.frame.stretch_${option.id}`) }}
          </button>
        </div>
        <button
          type="button"
          class="tns-btn-secondary w-auto! h-9! min-h-9! min-w-9! px-2!"
          :title="t('components.guider.native.frame.overlay')"
          @click="toggleOverlay"
        >
          <EyeIcon v-if="showOverlay" class="w-5 h-5" />
          <EyeSlashIcon v-else class="w-5 h-5" />
        </button>
        <button
          v-if="isZoomed"
          type="button"
          class="tns-btn-secondary w-auto! h-9! min-h-9! min-w-9! px-2!"
          :title="t('components.guider.native.frame.resetZoom')"
          @click="resetZoom"
        >
          <ArrowsPointingInIcon class="w-5 h-5" />
        </button>
      </div>
    </div>

    <!-- Frame -->
    <div
      ref="viewport"
      class="relative w-full overflow-hidden rounded-control bg-black"
      :style="viewportStyle"
      @pointerdown="onPointerDown"
      @click="onTap"
    >
      <!-- The stage fills the viewport; image (object-contain) and overlay (viewBox in frame
           pixels, "meet") are letterboxed identically, and Panzoom moves both together. -->
      <div
        v-if="displayed.src"
        ref="stage"
        class="absolute inset-0"
        data-testid="native-guider-frame"
      >
        <img
          :src="displayed.src"
          class="absolute inset-0 w-full h-full object-contain select-none pointer-events-none"
          draggable="false"
          alt=""
        />
        <svg
          v-if="showOverlay && displayed.info"
          class="absolute inset-0 w-full h-full pointer-events-none"
          :viewBox="`0 0 ${frameWidth} ${frameHeight}`"
          preserveAspectRatio="xMidYMid meet"
        >
          <!-- Rejected / unused stars -->
          <g v-for="(star, i) in rejectedStars" :key="`r${i}`">
            <circle
              :cx="star.x"
              :cy="star.y"
              :r="sizes.star"
              fill="none"
              stroke="#94a3b8"
              stroke-opacity="0.8"
              stroke-dasharray="3 3"
              vector-effect="non-scaling-stroke"
              stroke-width="1.2"
            />
          </g>
          <!-- Secondary stars, coloured by weight -->
          <g v-for="(star, i) in secondaryStars" :key="`s${i}`">
            <circle
              :cx="star.x"
              :cy="star.y"
              :r="sizes.star"
              fill="none"
              stroke="#22d3ee"
              :stroke-opacity="weightOpacity(star)"
              vector-effect="non-scaling-stroke"
              stroke-width="1.6"
            />
            <text
              v-if="showLabels"
              :x="star.x + sizes.star * 1.15"
              :y="star.y - sizes.star * 0.6"
              :font-size="sizes.font"
              fill="#a5f3fc"
              fill-opacity="0.9"
            >
              {{ fmt(star.snr, 0) }}
            </text>
          </g>
          <!-- Lock position: a "+" with an open centre so the star under it stays visible -->
          <g v-if="lock" stroke="#fbbf24" stroke-width="1.5">
            <line
              v-for="(seg, i) in reticleSegments(lock, sizes.gap, sizes.lock)"
              :key="`lock-${i}`"
              :x1="seg[0]"
              :y1="seg[1]"
              :x2="seg[2]"
              :y2="seg[3]"
              vector-effect="non-scaling-stroke"
            />
          </g>
          <!-- Primary star: ticks and corner brackets outside the star, nothing on top of it -->
          <g v-if="primaryStar" stroke="#34d399" fill="none">
            <line
              v-for="(seg, i) in reticleSegments(primaryStar, primaryGap, primaryGap + sizes.tick)"
              :key="`pt-${i}`"
              :x1="seg[0]"
              :y1="seg[1]"
              :x2="seg[2]"
              :y2="seg[3]"
              stroke-width="1.6"
              vector-effect="non-scaling-stroke"
            />
            <path
              :d="cornerBrackets(primaryStar, primaryGap * 0.9, sizes.tick * 0.55)"
              stroke-width="1.4"
              vector-effect="non-scaling-stroke"
            />
            <text
              v-if="showLabels"
              :x="primaryStar.x + primaryGap + sizes.tick * 0.5"
              :y="primaryStar.y - primaryGap - sizes.tick * 0.2"
              :font-size="sizes.font * 1.1"
              fill="#6ee7b7"
              stroke="none"
              font-weight="bold"
            >
              {{ fmt(primaryStar.snr, 0) }}
            </text>
          </g>
          <!-- Selected star highlight -->
          <circle
            v-if="selected"
            :cx="selected.x"
            :cy="selected.y"
            :r="sizes.star * 1.6"
            fill="none"
            stroke="#f8fafc"
            stroke-width="1"
            vector-effect="non-scaling-stroke"
          />
        </svg>
      </div>

      <!-- Placeholder -->
      <div
        v-if="!displayed.src"
        class="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center"
      >
        <span
          v-if="loading"
          class="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin"
        ></span>
        <p class="text-sm text-content-muted">{{ placeholderText }}</p>
      </div>

      <!-- Tapped star details -->
      <div
        v-if="selected"
        class="absolute left-2 top-2 z-10 rounded-control bg-surface-1/90 border border-line-strong px-2.5 py-2 text-xs text-content max-w-[70%] pointer-events-none"
      >
        <p class="font-semibold mb-0.5" :class="selectedTitleClass">{{ selectedTitle }}</p>
        <p class="tabular-nums text-content-muted">
          x {{ fmt(selected.x, 1) }} · y {{ fmt(selected.y, 1) }}
        </p>
        <p class="tabular-nums">
          SNR {{ fmt(selected.snr, 1) }} · HFD {{ fmt(selected.hfd, 2) }} ·
          {{ t('components.guider.native.strip.mass') }} {{ fmt(selected.mass, 0) }}
        </p>
        <p v-if="!selected.isPrimary && selected.used" class="tabular-nums text-content-muted">
          {{ t('components.guider.native.frame.weight') }} {{ fmt(selected.weight, 2) }}
        </p>
        <p v-if="selected.rejectReason" class="text-status-warn">
          {{ t('components.guider.native.frame.rejected') }}: {{ selected.rejectReason }}
        </p>
      </div>

      <div
        v-if="(error && displayed.src) || levelWarning"
        class="absolute bottom-1 left-1 right-1 flex flex-col items-stretch gap-1 pointer-events-none"
      >
        <!-- Frame levels: saturated or signal-free frames explain a white or black image -->
        <p
          v-if="levelWarning"
          class="self-start rounded border px-2 py-1 text-xs leading-snug bg-surface-1/90"
          :class="
            levelWarning.kind === 'partlySaturated'
              ? 'border-status-warn/40 text-status-warn text-[11px]!'
              : 'border-status-danger/50 text-status-danger font-semibold'
          "
          data-testid="native-guider-frame-levels"
        >
          {{ levelWarningText }}
        </p>
        <p
          v-if="error && displayed.src"
          class="text-[11px] text-status-danger bg-surface-1/80 rounded px-2 py-1 truncate"
        >
          {{ error }}
        </p>
      </div>
    </div>

    <!-- Legend -->
    <div v-if="showOverlay" class="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-content-muted">
      <span class="flex items-center gap-1"
        ><span class="legend-swatch border-[#34d399]"></span
        >{{ t('components.guider.native.frame.legendPrimary') }}</span
      >
      <span class="flex items-center gap-1"
        ><span class="legend-swatch rounded-full border-[#22d3ee]"></span
        >{{ t('components.guider.native.frame.legendSecondary') }}</span
      >
      <span class="flex items-center gap-1"
        ><span class="legend-swatch rounded-full border-dashed border-[#94a3b8]"></span
        >{{ t('components.guider.native.frame.legendRejected') }}</span
      >
      <span class="flex items-center gap-1 text-[#fbbf24]"
        >+ {{ t('components.guider.native.frame.legendLock') }}</span
      >
      <span class="ml-auto text-content-faint">{{
        t('components.guider.native.frame.tapHint')
      }}</span>
    </div>

    <NativeStarProfile
      :crop="displayed.info?.primaryCrop || null"
      :star="primaryStar"
      :bit-depth="displayed.info?.bitDepth || 16"
    />
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Panzoom from '@panzoom/panzoom';
import { ArrowsPointingInIcon, EyeIcon, EyeSlashIcon } from '@heroicons/vue/24/outline';
import apiService from '@/services/apiService';
import { useNativeGuiderStore } from '@/store/nativeGuiderStore';
import { fmt, frameLevelWarning } from '@/utils/nativeGuider';
import NativeStarProfile from './NativeStarProfile.vue';

const props = defineProps({
  /** Only an active (visible) view fetches frames. */
  active: { type: Boolean, default: true },
  /** Max viewport height (CSS length). */
  maxHeight: { type: String, default: '62vh' },
});

const { t } = useI18n();
const store = useNativeGuiderStore();

const STRETCH_OPTIONS = [
  { id: 'low', value: 0.1 },
  { id: 'medium', value: 0.2 },
  { id: 'high', value: 0.33 },
];
// Rendered JPEG widths - a few fixed sizes keep the backend's JPEG cache effective.
const WIDTHS = [512, 768, 1024, 1536, 2048];
const TAP_RADIUS_PX = 28;

const viewport = ref(null);
const stage = ref(null);
const displayed = ref({ src: null, info: null, loadedAt: 0 });
const loading = ref(false);
const error = ref(null);
const noFrame = ref(false);

/** Saturated / signal-free frame warning from the levels of the shown frame. */
const levelWarning = computed(() =>
  displayed.value.src ? frameLevelWarning(displayed.value.info?.levels) : null
);
const levelWarningText = computed(() => {
  const w = levelWarning.value;
  if (!w) return '';
  const percent = w.percent >= 10 ? Math.round(w.percent) : Math.round(w.percent * 10) / 10;
  switch (w.kind) {
    case 'saturated':
      return t('components.guider.native.frame.levelSaturated', { percent });
    case 'flat':
      return t('components.guider.native.frame.levelFlat', {
        level: w.level,
        fullScale: w.fullScale,
      });
    default:
      return t('components.guider.native.frame.levelPartlySaturated', { percent });
  }
});
const viewportSize = ref({ width: 0, height: 0 });
const zoom = ref(1);
/** Frame position of the tapped star; the popup follows the nearest star across frames. */
const selectedPos = ref(null);
const stretchId = ref(readStored('nativeGuider.frame.stretch', 'medium'));
const showOverlay = ref(readStored('nativeGuider.frame.overlay', 'true') !== 'false');
const now = ref(Date.now());

let panzoom = null;
let resizeObserver = null;
let queued = false;
let pointerStart = null;
let clock = null;

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
    // not remembered without storage
  }
}

const frameWidth = computed(() => displayed.value.info?.width || 1936);
const frameHeight = computed(() => displayed.value.info?.height || 1216);

const viewportStyle = computed(() => ({
  aspectRatio: `${frameWidth.value} / ${frameHeight.value}`,
  maxHeight: props.maxHeight,
}));

/** Screen pixels per frame pixel of the contained image at zoom 1. */
const fitScale = computed(() => {
  const { width, height } = viewportSize.value;
  if (!width || !height) return 0.5;
  return Math.min(width / frameWidth.value, height / frameHeight.value);
});

/** Overlay sizes in frame pixels for a constant on-screen size. */
const sizes = computed(() => {
  const f = 1 / (fitScale.value * zoom.value || 1);
  // gap: free space kept around a star by reticles (screen px converted to image px)
  return { star: 11 * f, box: 10 * f, lock: 16 * f, gap: 6 * f, tick: 9 * f, font: 11 * f };
});

// Clear radius around the primary star: at least 8 screen px, more when zoomed in on a big star.
const primaryGap = computed(() => {
  const f = 1 / (fitScale.value * zoom.value || 1);
  const hfd = Number(primaryStar.value?.hfd);
  return Math.max(8 * f, Number.isFinite(hfd) ? hfd * 1.3 : 0);
});

/** Four line segments of a "+" around p that leave a hole of radius `inner`. */
function reticleSegments(p, inner, outer) {
  return [
    [p.x - outer, p.y, p.x - inner, p.y],
    [p.x + inner, p.y, p.x + outer, p.y],
    [p.x, p.y - outer, p.x, p.y - inner],
    [p.x, p.y + inner, p.x, p.y + outer],
  ];
}

/** SVG path of four corner brackets of a square with half-size `r` around p. */
function cornerBrackets(p, r, len) {
  const c = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  return c
    .map(([sx, sy]) => {
      const x = p.x + sx * r;
      const y = p.y + sy * r;
      return `M ${x - sx * len} ${y} L ${x} ${y} L ${x} ${y - sy * len}`;
    })
    .join(' ');
}

const stars = computed(() => displayed.value.info?.stars || []);
const primaryStar = computed(() => stars.value.find((s) => s.isPrimary) || null);
const secondaryStars = computed(() => stars.value.filter((s) => !s.isPrimary && s.used));
const rejectedStars = computed(() => stars.value.filter((s) => !s.isPrimary && !s.used));
const maxWeight = computed(() =>
  Math.max(0.0001, ...secondaryStars.value.map((s) => Number(s.weight) || 0))
);
const showLabels = computed(() => stars.value.length <= 30 || zoom.value > 1.5);
const lock = computed(() => {
  const info = displayed.value.info;
  if (!info || info.lockX === null || info.lockX === undefined) return null;
  return { x: info.lockX, y: info.lockY };
});
const selected = computed(() => {
  const pos = selectedPos.value;
  if (!pos) return null;
  let best = null;
  let bestDistance = 15;
  for (const star of stars.value) {
    const d = Math.hypot(star.x - pos.x, star.y - pos.y);
    if (d <= bestDistance) {
      best = star;
      bestDistance = d;
    }
  }
  return best;
});
const selectedTitle = computed(() => {
  const s = selected.value;
  if (!s) return '';
  if (s.isPrimary) return t('components.guider.native.frame.legendPrimary');
  return s.used
    ? t('components.guider.native.frame.legendSecondary')
    : t('components.guider.native.frame.legendRejected');
});
const selectedTitleClass = computed(() => {
  const s = selected.value;
  if (!s) return '';
  if (s.isPrimary) return 'text-status-ok';
  return s.used ? 'text-accent' : 'text-content-muted';
});
const isZoomed = computed(() => Math.abs(zoom.value - 1) > 0.05);

const subtitle = computed(() => {
  const info = displayed.value.info;
  if (!info) return '';
  const ms = Date.parse(info.timestamp);
  const age = Number.isFinite(ms) ? Math.max(0, Math.round((now.value - ms) / 1000)) : null;
  const parts = [`${info.width}×${info.height}`];
  const exposure = Number(store.status?.exposureSeconds);
  if (Number.isFinite(exposure) && exposure > 0) parts.push(`${fmt(exposure, 1)} s`);
  parts.push(t('components.guider.native.frame.starCount', { count: stars.value.length }));
  if (age !== null) parts.push(t('components.guider.native.frame.age', { seconds: age }));
  return parts.join(' · ');
});

const placeholderText = computed(() => {
  if (!store.isAvailable) return t('components.guider.native.notConnected');
  if (error.value) return error.value;
  if (noFrame.value || !loading.value) return t('components.guider.native.frame.noFrame');
  return t('common.loading');
});

function weightOpacity(star) {
  const w = Math.max(0, Number(star.weight) || 0) / maxWeight.value;
  return 0.35 + 0.65 * Math.min(1, w);
}

function targetWidth() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const needed = Math.max(fitScale.value * frameWidth.value, 320) * dpr;
  const width = WIDTHS.find((w) => w >= needed) || WIDTHS[WIDTHS.length - 1];
  return Math.min(width, displayed.value.info?.width || width);
}

function preload(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => reject(new Error('timeout')), 20000);
    image.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    image.onerror = () => {
      clearTimeout(timer);
      reject(new Error(t('components.guider.native.frame.imageFailed')));
    };
    image.src = src;
  });
}

/** Loads frame-info, then the JPEG of exactly that frame, and swaps both at once. */
async function refresh({ force = false } = {}) {
  if (!props.active || !store.isAvailable) return;
  if (loading.value) {
    queued = true;
    return;
  }
  loading.value = true;
  try {
    const info = await apiService.getNativeGuiderFrameInfo({ cropSize: 31 });
    if (!info) return;
    noFrame.value = false;
    if (!force && displayed.value.src && displayed.value.info?.frameNumber === info.frameNumber) {
      displayed.value = { ...displayed.value, info };
      return;
    }
    const stretch = STRETCH_OPTIONS.find((o) => o.id === stretchId.value)?.value ?? 0.2;
    const src = apiService.getNativeGuiderImageUrl({
      maxWidth: targetWidth(),
      stretch,
      frame: info.frameNumber,
    });
    await preload(src);
    const firstImage = !displayed.value.src;
    displayed.value = { src, info, loadedAt: Date.now() };
    error.value = null;
    if (firstImage) nextTick(initPanzoom);
  } catch (e) {
    if (e?.cancelled) return;
    if (e?.status === 404) {
      noFrame.value = true;
      error.value = null;
    } else {
      error.value = e?.message || String(e);
    }
  } finally {
    loading.value = false;
    if (queued) {
      queued = false;
      refresh();
    }
  }
}

function setStretch(id) {
  stretchId.value = id;
  writeStored('nativeGuider.frame.stretch', id);
  refresh({ force: true });
}

function toggleOverlay() {
  showOverlay.value = !showOverlay.value;
  writeStored('nativeGuider.frame.overlay', showOverlay.value);
}

// --- Zoom / pan ---------------------------------------------------------------

function onPanzoomChange() {
  if (panzoom) zoom.value = panzoom.getScale();
}

function onWheel(event) {
  if (panzoom) panzoom.zoomWithWheel(event);
}

function initPanzoom() {
  destroyPanzoom();
  if (!stage.value || !viewport.value) return;
  panzoom = Panzoom(stage.value, {
    maxScale: 12,
    minScale: 1,
    contain: 'outside',
    step: 0.6,
  });
  stage.value.addEventListener('panzoomchange', onPanzoomChange);
  viewport.value.addEventListener('wheel', onWheel, { passive: false });
  zoom.value = 1;
}

function destroyPanzoom() {
  if (stage.value) stage.value.removeEventListener('panzoomchange', onPanzoomChange);
  if (viewport.value) viewport.value.removeEventListener('wheel', onWheel);
  if (panzoom) {
    try {
      panzoom.destroy();
    } catch {
      // already gone
    }
    panzoom = null;
  }
}

function resetZoom() {
  panzoom?.reset();
  zoom.value = 1;
}

// --- Tap to inspect a star ------------------------------------------------------

function onPointerDown(event) {
  pointerStart = { x: event.clientX, y: event.clientY };
}

function onTap(event) {
  // A pan gesture also ends with a click; only a (nearly) stationary tap selects.
  if (
    pointerStart &&
    Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 8
  ) {
    return;
  }
  if (!stage.value || !stars.value.length) {
    selectedPos.value = null;
    return;
  }
  // The stage rect includes the Panzoom transform; the image is letterboxed inside it.
  const rect = stage.value.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const scale = Math.min(rect.width / frameWidth.value, rect.height / frameHeight.value);
  const left = rect.left + (rect.width - frameWidth.value * scale) / 2;
  const top = rect.top + (rect.height - frameHeight.value * scale) / 2;
  const fx = (event.clientX - left) / scale;
  const fy = (event.clientY - top) / scale;
  let best = null;
  let bestDistance = TAP_RADIUS_PX / scale;
  for (const star of stars.value) {
    const d = Math.hypot(star.x - fx, star.y - fy);
    if (d <= bestDistance) {
      best = star;
      bestDistance = d;
    }
  }
  const same = best && selected.value && best.x === selected.value.x && best.y === selected.value.y;
  selectedPos.value = best && !same ? { x: best.x, y: best.y } : null;
}

// --- Lifecycle --------------------------------------------------------------------

function measure() {
  if (!viewport.value) return;
  const rect = viewport.value.getBoundingClientRect();
  viewportSize.value = { width: rect.width, height: rect.height };
}

watch(
  () => store.latestFrameNumber,
  () => refresh()
);
watch(
  () => [props.active, store.isAvailable],
  ([active, available]) => {
    if (active && available) refresh();
  },
  { immediate: true }
);
watch(viewportSize, () => {
  // Pan limits depend on the viewport size; start from a clean transform after a resize.
  if (panzoom && isZoomed.value) resetZoom();
});

onMounted(() => {
  measure();
  if (typeof ResizeObserver !== 'undefined' && viewport.value) {
    resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(viewport.value);
  }
  clock = setInterval(() => {
    now.value = Date.now();
  }, 1000);
});

onBeforeUnmount(() => {
  destroyPanzoom();
  resizeObserver?.disconnect();
  resizeObserver = null;
  if (clock) clearInterval(clock);
});
</script>

<style scoped>
.legend-swatch {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-width: 2px;
}
</style>

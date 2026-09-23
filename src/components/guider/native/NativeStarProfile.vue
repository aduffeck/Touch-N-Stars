<template>
  <div class="flex gap-2 items-stretch min-w-0">
    <!-- Profile plot: compact 4:3 box zoomed to the star (a few HFD), not the whole crop -->
    <div
      class="relative w-1/2 max-w-60 shrink-0 rounded-control bg-surface-2 border border-line p-1.5"
    >
      <svg
        v-if="profiles"
        :viewBox="`0 0 ${W} ${H}`"
        class="w-full aspect-[4/3] block"
        preserveAspectRatio="none"
      >
        <line :x1="0" :y1="H - 1" :x2="W" :y2="H - 1" stroke="rgba(148,163,184,0.25)" />
        <polyline
          :points="radialPoints"
          fill="none"
          stroke="#22d3ee"
          stroke-width="1.5"
          stroke-opacity="0.35"
          vector-effect="non-scaling-stroke"
        />
        <polyline
          :points="horizontalPoints"
          fill="none"
          stroke="#60a5fa"
          stroke-width="1.5"
          vector-effect="non-scaling-stroke"
        />
        <polyline
          :points="verticalPoints"
          fill="none"
          stroke="#f87171"
          stroke-width="1.5"
          vector-effect="non-scaling-stroke"
        />
        <!-- Half maximum -->
        <line
          :x1="0"
          :y1="halfMaxY"
          :x2="W"
          :y2="halfMaxY"
          stroke="rgba(251,191,36,0.5)"
          stroke-dasharray="4 3"
          vector-effect="non-scaling-stroke"
        />
      </svg>
      <p
        v-else
        class="aspect-[4/3] flex items-center justify-center text-center text-xs text-content-faint"
      >
        {{ t('components.guider.native.profile.noStar') }}
      </p>
      <div
        v-if="profiles"
        class="absolute top-1 right-2 flex gap-2 text-[10px] text-content-faint pointer-events-none"
      >
        <span class="text-[#60a5fa]">{{ t('components.guider.native.profile.horizontal') }}</span>
        <span class="text-[#f87171]">{{ t('components.guider.native.profile.vertical') }}</span>
        <span class="text-accent/70">{{ t('components.guider.native.profile.radial') }}</span>
      </div>
      <span
        v-if="profiles"
        class="absolute top-1 left-2 text-[10px] text-content-faint tabular-nums pointer-events-none"
      >
        ±{{ halfWindow }} px
      </span>
    </div>

    <!-- Numbers -->
    <div class="grid flex-1 min-w-0 grid-cols-2 grid-rows-[1fr_1fr_auto] gap-1 text-xs">
      <div class="flex flex-col justify-center rounded-chip bg-surface-2 px-2 py-1">
        <div class="tns-stat-label">SNR</div>
        <div class="text-sm sm:text-lg font-semibold tabular-nums" :class="TONE_TEXT[snrToneValue]">
          {{ fmt(star?.snr, 1) }}
        </div>
      </div>
      <div class="flex flex-col justify-center rounded-chip bg-surface-2 px-2 py-1">
        <div class="tns-stat-label">HFD</div>
        <div class="text-sm sm:text-lg font-semibold tabular-nums text-content">
          {{ fmt(star?.hfd, 2) }}
        </div>
      </div>
      <div class="flex flex-col justify-center rounded-chip bg-surface-2 px-2 py-1">
        <div class="tns-stat-label">{{ t('components.guider.native.strip.mass') }}</div>
        <div class="text-sm sm:text-lg font-semibold tabular-nums text-content">
          {{ fmt(star?.mass, 0) }}
        </div>
      </div>
      <div
        class="flex flex-col justify-center rounded-chip bg-surface-2 px-2 py-1"
        :class="{ 'bg-status-danger/15!': saturated }"
      >
        <div class="tns-stat-label">{{ t('components.guider.native.profile.peak') }}</div>
        <div
          class="text-sm sm:text-lg font-semibold tabular-nums"
          :class="saturated ? 'text-status-danger' : 'text-content'"
        >
          {{ profiles ? Math.round(profiles.max) : '–' }}
        </div>
      </div>
      <p v-if="saturated" class="col-span-2 text-[10px] text-status-danger leading-tight">
        {{ t('components.guider.native.profile.saturated') }}
      </p>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { TONE_TEXT, fmt, snrTone, starProfiles } from '@/utils/nativeGuider';

const props = defineProps({
  /** Raw crop { x0, y0, width, height, pixels } around the primary star. */
  crop: { type: Object, default: null },
  /** Primary star { x, y, snr, hfd, mass }. */
  star: { type: Object, default: null },
  bitDepth: { type: Number, default: 16 },
});

const { t } = useI18n();
const W = 160;
const H = 120;

const profiles = computed(() =>
  props.crop && props.star ? starProfiles(props.crop, props.star.x, props.star.y) : null
);

// Half-width (px) of the plotted window: ±2.5 HFD around the centre, at least ±5 px,
// never more than the crop - the flat background beyond that only wastes space.
const half = computed(() => {
  const p = profiles.value;
  return p ? Math.max(1, Math.floor((p.horizontal.length - 1) / 2)) : 1;
});
const halfWindow = computed(() => {
  const hfd = Number(props.star?.hfd);
  const wanted = Number.isFinite(hfd) && hfd > 0 ? Math.ceil(2.5 * hfd) : half.value;
  return Math.min(half.value, Math.max(5, wanted));
});

function windowed(values) {
  if (!values?.length) return [];
  const centre = Math.floor((values.length - 1) / 2);
  return values.slice(Math.max(0, centre - halfWindow.value), centre + halfWindow.value + 1);
}

const snrToneValue = computed(() => snrTone(props.star?.snr));

function scaleY(value) {
  const p = profiles.value;
  const range = Math.max(1, p.max - p.min);
  return H - 2 - ((value - p.min) / range) * (H - 6);
}

function toPoints(values) {
  if (!values?.length) return '';
  const step = values.length > 1 ? W / (values.length - 1) : W;
  return values.map((v, i) => `${(i * step).toFixed(1)},${scaleY(v).toFixed(1)}`).join(' ');
}

const horizontalPoints = computed(() =>
  profiles.value ? toPoints(windowed(profiles.value.horizontal)) : ''
);
const verticalPoints = computed(() =>
  profiles.value ? toPoints(windowed(profiles.value.vertical)) : ''
);

// Radial profile mirrored around the centre so it overlays the cuts at the same scale.
const radialPoints = computed(() => {
  const p = profiles.value;
  if (!p) return '';
  const pxPerUnit = W / (2 * halfWindow.value);
  const inside = p.radial.filter((e) => e.r <= halfWindow.value);
  const left = [...inside]
    .reverse()
    .map((e) => `${(W / 2 - e.r * pxPerUnit).toFixed(1)},${scaleY(e.value).toFixed(1)}`);
  const right = inside.map(
    (e) => `${(W / 2 + e.r * pxPerUnit).toFixed(1)},${scaleY(e.value).toFixed(1)}`
  );
  return [...left, ...right].join(' ');
});

const halfMaxY = computed(() => {
  const p = profiles.value;
  if (!p) return H;
  return scaleY(p.min + (p.max - p.min) / 2);
});

const saturated = computed(() => {
  const p = profiles.value;
  if (!p) return false;
  const full = Math.pow(2, Math.min(16, Math.max(8, props.bitDepth || 16))) - 1;
  return p.max >= full * 0.97;
});
</script>

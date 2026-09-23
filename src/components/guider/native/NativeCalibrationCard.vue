<template>
  <div class="tns-card flex flex-col gap-3">
    <div class="flex items-center justify-between gap-2">
      <h3 class="text-sm font-semibold uppercase tracking-wide text-content-muted">
        {{ t('components.guider.native.calibration.title') }}
      </h3>
      <span v-if="calibration && calibratedAgo" class="text-xs text-content-faint">
        {{ calibratedAgo }}
      </span>
    </div>

    <!-- Calibration in progress -->
    <div
      v-if="isCalibrating"
      class="flex flex-col gap-2 rounded-control border border-accent/40 bg-accent/5 p-3"
    >
      <div class="flex items-center justify-between gap-2 text-sm">
        <span class="font-semibold text-accent">
          {{ t('components.guider.native.calibration.inProgress') }}
        </span>
        <span v-if="progressPercent !== null" class="tabular-nums text-content-muted">
          {{ progressPercent.toFixed(0) }}%
        </span>
      </div>
      <p v-if="stepLabel" class="text-sm text-content break-words">{{ stepLabel }}</p>
      <div class="h-2 w-full overflow-hidden rounded-full bg-surface-3">
        <div
          class="h-full rounded-full bg-accent transition-all duration-500"
          :class="{ 'animate-pulse': progressPercent === null }"
          :style="{ width: `${progressPercent === null ? 100 : progressPercent}%` }"
        ></div>
      </div>
      <dl
        v-if="progressFields.length"
        class="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-content-muted"
      >
        <template v-for="field in progressFields" :key="field.key">
          <dt class="truncate">{{ field.key }}</dt>
          <dd class="truncate text-right tabular-nums text-content">{{ field.value }}</dd>
        </template>
      </dl>
    </div>

    <!-- Empty state -->
    <div
      v-if="!calibration"
      class="rounded-control border border-dashed border-line-strong p-4 text-center text-sm text-content-muted"
    >
      {{ t('components.guider.native.calibration.notCalibrated') }}
    </div>

    <template v-else>
      <!-- Vector diagram: camera frame with the RA and Dec axes as measured -->
      <div class="flex justify-center">
        <svg
          viewBox="0 0 200 160"
          class="w-full max-w-xs h-auto"
          role="img"
          :aria-label="t('components.guider.native.calibration.diagram')"
        >
          <rect
            x="16"
            y="12"
            width="168"
            height="136"
            rx="6"
            fill="none"
            stroke="currentColor"
            stroke-opacity="0.25"
            stroke-dasharray="4 3"
            class="text-content-muted"
          />
          <!-- Camera axes (reference) -->
          <line
            :x1="CX - 70"
            :y1="CY"
            :x2="CX + 70"
            :y2="CY"
            stroke="currentColor"
            stroke-opacity="0.12"
            class="text-content"
          />
          <line
            :x1="CX"
            :y1="CY - 62"
            :x2="CX"
            :y2="CY + 62"
            stroke="currentColor"
            stroke-opacity="0.12"
            class="text-content"
          />

          <!-- RA-Dec angle arc -->
          <path
            v-if="arcPath"
            :d="arcPath"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            :class="orthoToneText"
          />
          <text
            v-if="arcLabelPos"
            :x="arcLabelPos.x"
            :y="arcLabelPos.y"
            font-size="9"
            text-anchor="middle"
            dominant-baseline="middle"
            fill="currentColor"
            :class="orthoToneText"
          >
            {{ fmt(axisAngle, 1) }}°
          </text>

          <!-- RA vector -->
          <line
            :x1="CX"
            :y1="CY"
            :x2="raTip.x"
            :y2="raTip.y"
            :stroke="RA_COLOR"
            stroke-width="3"
            stroke-linecap="round"
          />
          <polygon :points="raHead" :fill="RA_COLOR" />
          <text
            :x="raLabel.x"
            :y="raLabel.y"
            font-size="10"
            font-weight="700"
            text-anchor="middle"
            dominant-baseline="middle"
            :fill="RA_COLOR"
          >
            {{ t('components.guider.native.calibration.raAxisLabel') }}
          </text>

          <!-- Dec vector -->
          <line
            :x1="CX"
            :y1="CY"
            :x2="decTip.x"
            :y2="decTip.y"
            :stroke="DEC_COLOR"
            stroke-width="3"
            stroke-linecap="round"
          />
          <polygon :points="decHead" :fill="DEC_COLOR" />
          <text
            :x="decLabel.x"
            :y="decLabel.y"
            font-size="10"
            font-weight="700"
            text-anchor="middle"
            dominant-baseline="middle"
            :fill="DEC_COLOR"
          >
            {{ t('components.guider.native.calibration.decAxisLabel') }}
          </text>

          <circle :cx="CX" :cy="CY" r="2.5" fill="currentColor" class="text-content" />
        </svg>
      </div>

      <!-- Angles legend -->
      <div class="grid grid-cols-2 gap-2 text-xs">
        <div class="tns-stat-tile">
          <span class="tns-stat-label" :style="{ color: RA_COLOR }">
            {{ t('components.guider.native.calibration.raAngle') }}
          </span>
          <span class="tns-stat-value">{{ fmt(calibration.raAngleDeg, 1) }}°</span>
        </div>
        <div class="tns-stat-tile">
          <span class="tns-stat-label" :style="{ color: DEC_COLOR }">
            {{ t('components.guider.native.calibration.decAngle') }}
          </span>
          <span class="tns-stat-value">{{ fmt(calibration.decAngleDeg, 1) }}°</span>
        </div>
      </div>

      <!-- Numeric details -->
      <dl class="flex flex-col divide-y divide-line text-sm">
        <div class="flex items-center justify-between gap-3 py-1.5">
          <dt class="text-content-muted">{{ t('components.guider.native.calibration.raRate') }}</dt>
          <dd class="text-right tabular-nums text-content">
            {{ fmt(calibration.raRateArcsecPerSec, 2) }} ″/s
            <span class="text-content-faint">· {{ fmt(calibration.raRatePxPerSec, 2) }} px/s</span>
          </dd>
        </div>
        <div class="flex items-center justify-between gap-3 py-1.5">
          <dt class="text-content-muted">
            {{ t('components.guider.native.calibration.decRate') }}
          </dt>
          <dd class="text-right tabular-nums text-content">
            {{ fmt(calibration.decRateArcsecPerSec, 2) }} ″/s
            <span class="text-content-faint">· {{ fmt(calibration.decRatePxPerSec, 2) }} px/s</span>
          </dd>
        </div>
        <div class="flex items-center justify-between gap-3 py-1.5">
          <dt class="text-content-muted">
            {{ t('components.guider.native.calibration.orthogonality') }}
          </dt>
          <dd class="text-right tabular-nums font-semibold" :class="orthoToneText">
            {{ fmt(calibration.orthogonalityErrorDeg, 1) }}°
          </dd>
        </div>
        <div class="flex items-center justify-between gap-3 py-1.5">
          <dt class="text-content-muted">
            {{ t('components.guider.native.calibration.declination') }}
          </dt>
          <dd class="text-right tabular-nums text-content">
            {{
              calibration.declinationDeg === null || calibration.declinationDeg === undefined
                ? '–'
                : `${fmt(calibration.declinationDeg, 1)}°`
            }}
          </dd>
        </div>
        <div class="flex items-center justify-between gap-3 py-1.5">
          <dt class="text-content-muted">
            {{ t('components.guider.native.calibration.pierSide') }}
          </dt>
          <dd class="text-right text-content">{{ pierSideText }}</dd>
        </div>
        <div class="flex items-center justify-between gap-3 py-1.5">
          <dt class="text-content-muted">
            {{ t('components.guider.native.calibration.binning') }}
          </dt>
          <dd class="text-right tabular-nums text-content">
            {{ calibration.binning ? `${calibration.binning}×${calibration.binning}` : '–' }}
          </dd>
        </div>
        <div class="flex items-center justify-between gap-3 py-1.5">
          <dt class="text-content-muted">{{ t('components.guider.native.calibration.steps') }}</dt>
          <dd class="text-right tabular-nums">
            <span :class="stepsTone(calibration.raSteps)">
              {{ t('components.guider.native.calibration.raShort') }}
              {{ calibration.raSteps ?? '–' }}
            </span>
            <span class="text-content-faint"> · </span>
            <span :class="stepsTone(calibration.decSteps)">
              {{ t('components.guider.native.calibration.decShort') }}
              {{ calibration.decSteps ?? '–' }}
            </span>
          </dd>
        </div>
        <div class="flex items-center justify-between gap-3 py-1.5">
          <dt class="text-content-muted">
            {{ t('components.guider.native.calibration.decFlip') }}
          </dt>
          <dd class="text-right text-content">
            {{
              calibration.decFlipRequired
                ? t('components.guider.native.calibration.decFlipYes')
                : t('components.guider.native.calibration.decFlipNo')
            }}
          </dd>
        </div>
      </dl>

      <div
        v-if="calibration.lastIssue"
        class="flex items-start gap-2 rounded-chip border border-status-warn/40 bg-status-warn/10 px-3 py-2 text-sm text-status-warn"
      >
        <ExclamationTriangleIcon class="mt-0.5 h-4 w-4 shrink-0" />
        <span class="break-words">
          <span class="font-semibold"
            >{{ t('components.guider.native.calibration.lastIssue') }}:</span
          >
          {{ calibration.lastIssue }}
        </span>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ExclamationTriangleIcon } from '@heroicons/vue/24/outline';
import { useNativeGuiderStore } from '@/store/nativeGuiderStore';
import { fmt } from '@/utils/nativeGuider';

const { t, te } = useI18n();
const store = useNativeGuiderStore();

const RA_COLOR = '#60a5fa';
const DEC_COLOR = '#f87171';

// Diagram geometry (viewBox 200 x 160). The guider reports PHD2 camera angles, atan2(dy, dx) in
// image coordinates (x right, y down), so the diagram uses the same orientation as the guide
// frame view: the arrows point where a star moves on the displayed frame.
const CX = 100;
const CY = 80;
const VECTOR_LENGTH = 52;
const ARC_RADIUS = 18;

const calibration = computed(() => store.calibration);

const isCalibrating = computed(
  () => store.state === 'Calibrating' || Boolean(store.status?.calibrationStep)
);

const stepLabel = computed(() => store.status?.calibrationStep || '');

const progressPercent = computed(() => {
  const raw = Number(store.status?.calibrationProgress);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  const percent = raw <= 1 ? raw * 100 : raw;
  return Math.min(100, Math.max(0, percent));
});

// Any primitive fields of the latest 'calibration' progress event, shown as a compact list.
const progressFields = computed(() => {
  const payload = store.calibrationProgress;
  if (!payload || typeof payload !== 'object') return [];
  return Object.entries(payload)
    .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
    .slice(0, 8)
    .map(([key, value]) => ({
      key,
      value:
        typeof value === 'number'
          ? Number.isInteger(value)
            ? value
            : value.toFixed(2)
          : String(value),
    }));
});

function toRad(deg) {
  return (Number(deg) * Math.PI) / 180;
}

function polar(deg, length) {
  const a = toRad(deg);
  return { x: CX + length * Math.cos(a), y: CY + length * Math.sin(a) };
}

function arrowHead(deg) {
  const tip = polar(deg, VECTOR_LENGTH + 4);
  const a = toRad(deg);
  const back = 9;
  const half = 4.5;
  // Base centre of the arrow head, then two corners perpendicular to the vector.
  const bx = tip.x - back * Math.cos(a);
  const by = tip.y - back * Math.sin(a);
  const px = -half * Math.sin(a);
  const py = half * Math.cos(a);
  return `${tip.x},${tip.y} ${bx + px},${by + py} ${bx - px},${by - py}`;
}

const raAngle = computed(() => Number(calibration.value?.raAngleDeg) || 0);
const decAngle = computed(() => Number(calibration.value?.decAngleDeg) || 0);

const raTip = computed(() => polar(raAngle.value, VECTOR_LENGTH));
const decTip = computed(() => polar(decAngle.value, VECTOR_LENGTH));
const raHead = computed(() => arrowHead(raAngle.value));
const decHead = computed(() => arrowHead(decAngle.value));
const raLabel = computed(() => polar(raAngle.value, VECTOR_LENGTH + 16));
const decLabel = computed(() => polar(decAngle.value, VECTOR_LENGTH + 16));

// Signed difference Dec - RA folded into (-180, 180].
const angleDelta = computed(() => {
  let d = (decAngle.value - raAngle.value) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
});

const axisAngle = computed(() => Math.abs(angleDelta.value));

const arcPath = computed(() => {
  if (!calibration.value) return null;
  const start = polar(raAngle.value, ARC_RADIUS);
  const end = polar(decAngle.value, ARC_RADIUS);
  // Image coordinates like SVG: a positive delta runs clockwise on screen = sweep-flag 1.
  const sweep = angleDelta.value > 0 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${ARC_RADIUS} ${ARC_RADIUS} 0 0 ${sweep} ${end.x} ${end.y}`;
});

const arcLabelPos = computed(() => {
  if (!calibration.value) return null;
  return polar(raAngle.value + angleDelta.value / 2, ARC_RADIUS + 11);
});

const orthoToneText = computed(() => {
  const err = Math.abs(Number(calibration.value?.orthogonalityErrorDeg));
  if (!Number.isFinite(err)) return 'text-content-muted';
  if (err < 5) return 'text-status-ok';
  if (err < 12.5) return 'text-status-warn';
  return 'text-status-danger';
});

function stepsTone(steps) {
  const n = Number(steps);
  if (!Number.isFinite(n)) return 'text-content-muted';
  return n < 4 ? 'text-status-warn font-semibold' : 'text-content';
}

const pierSideText = computed(() => {
  const side = calibration.value?.pierSide;
  if (!side) return '–';
  const key = `components.guider.native.calibration.pierSides.${side}`;
  return te(key) ? t(key) : side;
});

// Relative "calibrated x min ago", refreshed every 30 s.
const now = ref(Date.now());
let nowTimer = null;
onMounted(() => {
  nowTimer = setInterval(() => {
    now.value = Date.now();
  }, 30000);
});
onUnmounted(() => {
  if (nowTimer) clearInterval(nowTimer);
});

const calibratedAgo = computed(() => {
  const ts = Date.parse(calibration.value?.timestamp);
  if (!Number.isFinite(ts)) return '';
  const minutes = Math.max(0, Math.round((now.value - ts) / 60000));
  if (minutes < 1) return t('components.guider.native.calibration.justNow');
  if (minutes < 120) return t('components.guider.native.calibration.minutesAgo', { minutes });
  return t('components.guider.native.calibration.hoursAgo', { hours: Math.round(minutes / 60) });
});
</script>

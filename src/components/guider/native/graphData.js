// Pure data shaping for the native guider graph, target plot and stats card. No Vue, no uPlot,
// so it can be unit tested with node --test.
import { signedPulse, stepError, toEpochSeconds } from '@/utils/nativeGuider';

/** Graph window sizes (steps) offered by the selector. */
export const GRAPH_WINDOWS = [50, 100, 200, 400];

/** Fixed y ranges (± value) offered next to 'auto'. */
export const Y_SCALES = [1, 2, 4, 8];

/** Marker kinds and their colours (canvas + legend). */
export const MARKER_COLORS = {
  dither: '#a78bfa',
  starlost: '#f87171',
  settled: '#34d399',
  settleFailed: '#fbbf24',
  calibration: '#22d3ee',
};

const finiteOrNull = (v) => (Number.isFinite(v) ? v : null);

/** The last `window` steps with a usable timestamp. */
export function lastSteps(steps, window) {
  const list = Array.isArray(steps) ? steps : [];
  const tail = window > 0 && list.length > window ? list.slice(list.length - window) : list;
  return tail.filter((s) => s && Number.isFinite(toEpochSeconds(s.timestamp)));
}

/**
 * Columns for uPlot: x (epoch seconds, strictly increasing), RA/Dec error in the unit, signed
 * correction pulses (null when no pulse, so no zero-height bars), settling flags, SNR and the
 * star mass normalised to its window maximum.
 */
export function buildGraphData(steps, { window = 100, unit = 'arcsec' } = {}) {
  const selected = lastSteps(steps, window);
  const xs = [];
  const ra = [];
  const dec = [];
  const raPulse = [];
  const decPulse = [];
  const settling = [];
  const snr = [];
  const mass = [];
  let lastX = -Infinity;

  for (const step of selected) {
    let x = toEpochSeconds(step.timestamp);
    // uPlot needs strictly increasing x; nudge duplicates (same-millisecond timestamps).
    if (x <= lastX) x = lastX + 0.001;
    lastX = x;
    const error = stepError(step, unit);
    xs.push(x);
    ra.push(finiteOrNull(error.ra));
    dec.push(finiteOrNull(error.dec));
    const rp = signedPulse(step.raDuration, step.raDirection);
    const dp = signedPulse(step.decDuration, step.decDirection);
    raPulse.push(rp ? rp : null);
    decPulse.push(dp ? dp : null);
    settling.push(step.isSettling === true);
    snr.push(finiteOrNull(step.snr));
    mass.push(finiteOrNull(step.starMass));
  }

  let massMax = 0;
  for (const m of mass) if (m !== null && m > massMax) massMax = m;
  const massNorm = mass.map((m) => (m === null || massMax <= 0 ? null : m / massMax));

  return { xs, ra, dec, raPulse, decPulse, settling, snr, massNorm, count: xs.length };
}

/** Symmetric y range: fixed ±scale, or auto with headroom and a minimum of ±minAbs. */
export function symmetricRange(values, { scale = 'auto', minAbs = 1 } = {}) {
  if (scale !== 'auto' && Number.isFinite(Number(scale)) && Number(scale) > 0) {
    const s = Number(scale);
    return [-s, s];
  }
  let maxAbs = 0;
  for (const series of values) {
    for (const v of series) {
      if (Number.isFinite(v) && Math.abs(v) > maxAbs) maxAbs = Math.abs(v);
    }
  }
  const limit = Math.max(minAbs, niceCeil(maxAbs * 1.1));
  return [-limit, limit];
}

/** Symmetric range for the pulse axis in ms (at least ±100 ms). */
export function pulseRange(raPulse, decPulse) {
  let maxAbs = 0;
  for (const series of [raPulse, decPulse]) {
    for (const v of series) {
      if (Number.isFinite(v) && Math.abs(v) > maxAbs) maxAbs = Math.abs(v);
    }
  }
  // Bars use at most ~60 % of the height so they stay behind the error lines.
  const limit = Math.max(100, niceCeil(maxAbs / 0.6));
  return [-limit, limit];
}

/** Rounds up to 1, 1.5, 2, 3, 4, 5, 6, 8 × 10^n. */
export function niceCeil(value) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const exponent = Math.floor(Math.log10(value));
  const base = Math.pow(10, exponent);
  const fraction = value / base;
  const steps = [1, 1.5, 2, 3, 4, 5, 6, 8, 10];
  const nice = steps.find((s) => fraction <= s + 1e-9) ?? 10;
  return Number((nice * base).toPrecision(6));
}

/** Contiguous settling runs as [x0, x1] spans (for shading). */
export function settlingSpans(xs, settling) {
  const spans = [];
  let start = null;
  for (let i = 0; i < xs.length; i++) {
    if (settling[i] && start === null) start = xs[i];
    const endsHere = settling[i] && (i === xs.length - 1 || !settling[i + 1]);
    if (endsHere && start !== null) {
      spans.push([start, xs[i]]);
      start = null;
    }
  }
  return spans;
}

/** Markers whose time falls into [x0, x1]. */
export function markersInRange(markers, x0, x1) {
  if (!Array.isArray(markers) || !Number.isFinite(x0) || !Number.isFinite(x1)) return [];
  return markers.filter((m) => m && Number.isFinite(m.t) && m.t >= x0 && m.t <= x1);
}

/**
 * Points of the target plot (RA x, Dec y) with an opacity that grows towards the newest point.
 */
export function targetPoints(steps, { window = 100, unit = 'arcsec' } = {}) {
  const selected = (Array.isArray(steps) ? steps : []).slice(-Math.max(1, window));
  const points = [];
  for (const step of selected) {
    const error = stepError(step, unit);
    if (!Number.isFinite(error.ra) || !Number.isFinite(error.dec)) continue;
    points.push({ x: error.ra, y: error.dec, settling: step.isSettling === true });
  }
  const n = points.length;
  return points.map((p, i) => ({ ...p, opacity: n <= 1 ? 1 : 0.15 + 0.85 * (i / (n - 1)) }));
}

/** Outer radius of the target plot: nice value covering the points and the RMS circle. */
export function targetRadius(points, rmsTotal, minRadius = 1) {
  let maxAbs = Number.isFinite(rmsTotal) ? rmsTotal : 0;
  for (const p of points) {
    maxAbs = Math.max(maxAbs, Math.abs(p.x), Math.abs(p.y));
  }
  return Math.max(minRadius, niceCeil(maxAbs * 1.05));
}

/** Seconds as h:mm:ss ('–' when missing). */
export function formatElapsed(seconds) {
  if (seconds === null || seconds === undefined || !Number.isFinite(Number(seconds))) return '–';
  const total = Math.max(0, Math.floor(Number(seconds)));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

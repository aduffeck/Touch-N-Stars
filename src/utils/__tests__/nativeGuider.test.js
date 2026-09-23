import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendMarker,
  appendSteps,
  canPerform,
  groupSettings,
  isBasicSetting,
  isNativeGuiderSelected,
  markerFromMessage,
  settingFormValue,
  severityTone,
  signedPulse,
  snrTone,
  starProfiles,
  stateTone,
  validateSettingValue,
  windowRms,
} from '../nativeGuider.js';

test('native guider selection follows the connected device, then the chooser, then the profile', () => {
  assert.equal(
    isNativeGuiderSelected({ guiderInfo: { Connected: true, DeviceId: 'PinsNativeGuider' } }),
    true
  );
  assert.equal(
    isNativeGuiderSelected({
      guiderInfo: { Connected: true, DeviceId: 'PHD2_Single' },
      profileGuiderName: 'PinsNativeGuider',
    }),
    false
  );
  assert.equal(
    isNativeGuiderSelected({ guiderInfo: { Connected: false }, selectedDisplayName: 'PHD2' }),
    false
  );
  assert.equal(
    isNativeGuiderSelected({
      guiderInfo: { Connected: false },
      selectedDisplayName: 'PINS Native Guider',
    }),
    true
  );
  assert.equal(
    isNativeGuiderSelected({ guiderInfo: {}, profileGuiderName: 'PinsNativeGuider' }),
    true
  );
});

test('state and SNR tones', () => {
  assert.equal(stateTone('Guiding'), 'ok');
  assert.equal(stateTone('Calibrating'), 'info');
  assert.equal(stateTone('Paused'), 'warn');
  assert.equal(stateTone('LostLock'), 'danger');
  assert.equal(stateTone('Stopped'), 'idle');
  assert.equal(snrTone(5), 'danger');
  assert.equal(snrTone(15), 'warn');
  assert.equal(snrTone(20), 'ok');
  assert.equal(snrTone(null), 'idle');
  assert.equal(snrTone(NaN), 'idle');
  assert.equal(severityTone('Critical'), 'danger');
  assert.equal(severityTone('Warning'), 'warn');
  assert.equal(severityTone('Info'), 'info');
});

test('controls are enabled per state', () => {
  assert.equal(canPerform('loop', 'Stopped'), true);
  assert.equal(canPerform('loop', 'Guiding'), false);
  assert.equal(canPerform('guide', 'Looping'), true);
  assert.equal(canPerform('guide', 'Guiding'), false);
  assert.equal(canPerform('pause', 'Guiding'), true);
  assert.equal(canPerform('resume', 'Paused'), true);
  assert.equal(canPerform('resume', 'Guiding'), false);
  assert.equal(canPerform('dither', 'Looping'), false);
  assert.equal(canPerform('stop', 'Stopped'), false);
  assert.equal(canPerform('stop', 'LostLock'), true);
  assert.equal(canPerform('clearCalibration', 'Looping', { isCalibrated: true }), true);
  assert.equal(canPerform('clearCalibration', 'Looping', { isCalibrated: false }), false);
  assert.equal(canPerform('darks', 'Stopped'), true);
  assert.equal(canPerform('darks', 'Looping'), false);
  assert.equal(canPerform('loop', 'Stopped', { connected: false }), false);
});

test('appendSteps merges by frame, trims, and restarts on a new session', () => {
  let steps = appendSteps([], [{ frame: 1 }, { frame: 2 }, { frame: 3 }], 3);
  steps = appendSteps(steps, { frame: 4 }, 3);
  assert.deepEqual(
    steps.map((s) => s.frame),
    [2, 3, 4]
  );
  // Duplicate replaces, out-of-order inserts sorted.
  steps = appendSteps(steps, { frame: 3, snr: 9 }, 10);
  assert.equal(steps.find((s) => s.frame === 3).snr, 9);
  // A slightly older frame is inserted in order; a restart far below means a new session.
  steps = appendSteps(steps, { frame: 1 }, 10);
  assert.deepEqual(
    steps.map((s) => s.frame),
    [1, 2, 3, 4]
  );
  steps = appendSteps(steps, { frame: 100 }, 10);
  steps = appendSteps(steps, { frame: 1 }, 10);
  assert.deepEqual(
    steps.map((s) => s.frame),
    [1]
  );
  // Steps without frame are ignored.
  assert.equal(appendSteps([], { foo: 1 }).length, 0);
});

test('windowRms uses the standard deviation and skips settling steps', () => {
  const steps = [
    { raArcsec: 1, decArcsec: 0, raDistanceRaw: 0.5, decDistanceRaw: 0 },
    { raArcsec: -1, decArcsec: 0, raDistanceRaw: -0.5, decDistanceRaw: 0 },
    { raArcsec: 50, decArcsec: 50, isSettling: true },
  ];
  const arcsec = windowRms(steps, 'arcsec');
  assert.equal(arcsec.ra, 1);
  assert.equal(arcsec.dec, 0);
  assert.equal(arcsec.total, 1);
  assert.equal(arcsec.count, 2);
  assert.equal(windowRms(steps, 'px').ra, 0.5);
  assert.equal(windowRms([]).total, null);
});

test('signedPulse: East/North positive, West/South negative', () => {
  assert.equal(signedPulse(120, 'East'), 120);
  assert.equal(signedPulse(120, 'West'), -120);
  assert.equal(signedPulse(80, 'North'), 80);
  assert.equal(signedPulse(80, 'South'), -80);
  assert.equal(signedPulse(0, 'South'), 0);
});

test('starProfiles cuts through the star and bins the radial profile', () => {
  // 5x5 crop at (10, 20) with a peak in the middle.
  const pixels = [1, 1, 1, 1, 1, 1, 2, 3, 2, 1, 1, 3, 9, 3, 1, 1, 2, 3, 2, 1, 1, 1, 1, 1, 1];
  const p = starProfiles({ x0: 10, y0: 20, width: 5, height: 5, pixels }, 12, 22);
  assert.deepEqual(p.horizontal, [1, 3, 9, 3, 1]);
  assert.deepEqual(p.vertical, [1, 3, 9, 3, 1]);
  assert.equal(p.radial[0].r, 0);
  assert.equal(p.radial[0].value, 9);
  assert.equal(p.max, 9);
  assert.equal(p.min, 1);
  assert.equal(starProfiles(null, 0, 0), null);
});

test('settings: basic flag from the backend wins over the name list', () => {
  const settings = [
    { name: 'ExposureSeconds', group: 'Camera', basic: false },
    { name: 'SearchRegion', group: 'Stars', basic: true },
  ];
  assert.equal(isBasicSetting(settings[0], settings), false);
  assert.equal(isBasicSetting(settings[1], settings), true);
  // Without backend flags the essentials list applies.
  const legacy = [{ name: 'ExposureSeconds' }, { name: 'SearchRegion' }];
  assert.equal(isBasicSetting(legacy[0], legacy), true);
  assert.equal(isBasicSetting(legacy[1], legacy), false);
});

test('groupSettings orders known groups first and filters basic', () => {
  const settings = [
    { name: 'A', group: 'Safety', basic: true },
    { name: 'B', group: 'Camera', basic: true },
    { name: 'C', group: 'Zeta', basic: false },
    { name: 'D', group: 'Algorithms', basic: false },
  ];
  assert.deepEqual(
    groupSettings(settings).map((g) => g.group),
    ['Camera', 'Safety']
  );
  assert.deepEqual(
    groupSettings(settings, { advanced: true }).map((g) => g.group),
    ['Camera', 'Algorithms', 'Safety', 'Zeta']
  );
});

test('validateSettingValue checks type and range', () => {
  const exposure = { type: 'double', min: 0.05, max: 30 };
  assert.deepEqual(validateSettingValue(exposure, '1,5'), { ok: true, value: 1.5 });
  assert.equal(validateSettingValue(exposure, '').error, 'required');
  assert.equal(validateSettingValue(exposure, 'abc').error, 'number');
  assert.deepEqual(validateSettingValue(exposure, '60'), {
    ok: false,
    error: 'max',
    params: { max: 30 },
  });
  assert.equal(validateSettingValue({ type: 'int', min: 1 }, '2.5').error, 'integer');
  assert.equal(validateSettingValue({ type: 'int', min: 1 }, '0').error, 'min');
  assert.deepEqual(validateSettingValue({ type: 'bool' }, 'true'), { ok: true, value: true });
  assert.equal(
    validateSettingValue({ type: 'enum', options: ['Auto', 'Off'] }, 'North').error,
    'option'
  );
  assert.deepEqual(validateSettingValue({ type: 'string' }, 'x'), { ok: true, value: 'x' });
  assert.equal(settingFormValue({ type: 'bool', value: 'True' }), true);
  assert.equal(settingFormValue({ type: 'double', value: '1.5' }), '1.5');
});

test('graph markers from feed messages', () => {
  const ts = '2026-09-23T21:00:00Z';
  assert.equal(markerFromMessage({ type: 'dither', timestamp: ts }).kind, 'dither');
  assert.equal(markerFromMessage({ type: 'starlost', timestamp: ts }).kind, 'starlost');
  assert.equal(
    markerFromMessage({ type: 'settle', timestamp: ts, payload: { status: 'done' } }).kind,
    'settled'
  );
  assert.equal(
    markerFromMessage({ type: 'settle', timestamp: ts, payload: { status: 'settling' } }),
    null
  );
  assert.equal(
    markerFromMessage({ type: 'calibration', timestamp: ts, payload: { raAngleDeg: 10 } }).kind,
    'calibration'
  );
  assert.equal(markerFromMessage({ type: 'calibration', timestamp: ts, payload: {} }), null);
  assert.equal(markerFromMessage({ type: 'step', timestamp: ts }), null);
  assert.equal(markerFromMessage({ type: 'dither' }), null);
  const markers = appendMarker([{ t: 1 }, { t: 2 }], { t: 3 }, 2);
  assert.deepEqual(
    markers.map((m) => m.t),
    [2, 3]
  );
});

test('frame level warnings: saturated before flat before a saturated share', async () => {
  const { frameLevelWarning } = await import('../nativeGuider.js');
  const saturated = frameLevelWarning({
    min: 65520,
    median: 65520,
    max: 65520,
    fullScale: 65535,
    saturatedPercent: 100,
    flat: true,
  });
  assert.equal(saturated.kind, 'saturated');
  assert.equal(saturated.percent, 100);

  const flat = frameLevelWarning({
    min: 212,
    median: 214.4,
    max: 215,
    fullScale: 65535,
    saturatedPercent: 0,
    flat: true,
  });
  assert.deepEqual(flat, { kind: 'flat', percent: 0, level: 214, fullScale: 65535 });

  assert.equal(frameLevelWarning({ saturatedPercent: 7.5, flat: false }).kind, 'partlySaturated');
  assert.equal(frameLevelWarning({ saturatedPercent: 0.2, flat: false }), null);
  assert.equal(frameLevelWarning(null), null);
});

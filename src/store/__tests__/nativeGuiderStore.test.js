import test from 'node:test';
import assert from 'node:assert/strict';
import {
  installBrowserGlobals,
  freshPinia,
  lastSocket,
  resetSockets,
} from '../../test-helpers/browserEnv.js';

installBrowserGlobals();

const { useNativeGuiderStore } = await import('@/store/nativeGuiderStore');
const { useToastStore } = await import('@/store/toastStore');
const { useSettingsStore } = await import('@/store/settingsStore');
const { apiStore } = await import('@/store/store');
const { default: apiService } = await import('@/services/apiService');

function setup(t) {
  resetSockets();
  freshPinia();
  const settingsStore = useSettingsStore();
  settingsStore.connection.ip = '10.0.0.5';
  settingsStore.connection.port = 5000;
  apiStore().isTnsPluginConnected = true;
  const store = useNativeGuiderStore();
  t.after(() => store.stopFeed());
  return store;
}

function stubApi(t, stubs) {
  const originals = Object.fromEntries(Object.keys(stubs).map((k) => [k, apiService[k]]));
  Object.assign(apiService, stubs);
  t.after(() => Object.assign(apiService, originals));
}

test('the feed dials /ws/native-guider on the plugin port and applies messages', async (t) => {
  const store = setup(t);
  stubApi(t, {
    getNativeGuiderSteps: async () => [],
    getNativeGuiderAlerts: async () => [],
    getNativeGuiderCalibration: async () => null,
  });
  store.startFeed();
  const socket = lastSocket();
  assert.equal(socket.url, 'ws://10.0.0.5:5000/ws/native-guider');
  socket.emitOpen();
  assert.equal(store.wsConnected, true);

  socket.emitMessage(
    JSON.stringify({
      type: 'hello',
      timestamp: '2026-09-23T21:00:00Z',
      payload: { available: true, connected: true, deviceId: 'PinsNativeGuider', isNative: true },
    })
  );
  assert.equal(store.isAvailable, true);

  socket.emitMessage(
    JSON.stringify({
      type: 'step',
      timestamp: '2026-09-23T21:00:01Z',
      payload: { frame: 7, raArcsec: 0.2, decArcsec: -0.1 },
    })
  );
  assert.equal(store.steps.length, 1);
  assert.equal(store.steps[0].frame, 7);

  socket.emitMessage(
    JSON.stringify({ type: 'frame', timestamp: 'x', payload: { frameNumber: 42 } })
  );
  assert.equal(store.latestFrameNumber, 42);

  socket.emitMessage(
    JSON.stringify({ type: 'dither', timestamp: '2026-09-23T21:00:02Z', payload: { dx: 1 } })
  );
  assert.equal(store.markers.length, 1);
  assert.equal(store.markers[0].kind, 'dither');

  socket.emitClose();
  assert.equal(store.wsConnected, false);
});

test('critical alerts toast once, info alerts do not', (t) => {
  const store = setup(t);
  const toast = useToastStore();
  const shown = [];
  t.mock.method(toast, 'showToast', (options) => shown.push(options));

  const critical = {
    timestamp: '2026-09-23T21:00:00Z',
    code: 301,
    severity: 'Critical',
    title: 'Star lost',
    explanation: 'Clouds?',
    fix: 'Wait or pick another star.',
  };
  store.handleMessage({ type: 'alert', timestamp: critical.timestamp, payload: critical });
  store.handleMessage({ type: 'alert', timestamp: critical.timestamp, payload: critical });
  store.handleMessage({
    type: 'alert',
    timestamp: critical.timestamp,
    payload: { ...critical, severity: 'Info', code: 1 },
  });

  assert.equal(store.alerts.length, 3);
  assert.equal(shown.length, 1);
  assert.equal(shown[0].type, 'error');
  assert.equal(shown[0].title, 'Star lost');
  assert.match(shown[0].message, /Wait or pick another star/);
  assert.equal(store.criticalAlertCount, 2);
});

test('state, settle, calibration and stats messages update the status', (t) => {
  const store = setup(t);
  store.status = { state: 'Looping', isSettling: false };

  store.handleMessage({ type: 'state', payload: 'Guiding' });
  assert.equal(store.state, 'Guiding');

  store.handleMessage({ type: 'settle', payload: { status: 'settling' } });
  assert.equal(store.isSettling, true);
  store.handleMessage({
    type: 'settle',
    timestamp: '2026-09-23T21:00:00Z',
    payload: { status: 'done' },
  });
  assert.equal(store.isSettling, false);
  assert.equal(store.markers.at(-1).kind, 'settled');

  store.handleMessage({ type: 'calibration', payload: { step: 'West 3/12' } });
  assert.equal(store.calibrationProgress.step, 'West 3/12');
  store.handleMessage({
    type: 'calibration',
    timestamp: '2026-09-23T21:00:00Z',
    payload: { raAngleDeg: 12, decAngleDeg: 101 },
  });
  assert.equal(store.calibration.raAngleDeg, 12);
  assert.equal(store.calibrationProgress, null);

  store.handleMessage({ type: 'stats', payload: { window: { rmsTotalArcsec: 0.7 } } });
  assert.equal(store.windowStats.rmsTotalArcsec, 0.7);
});

test('failed background actions are toasted with the backend reason', (t) => {
  const store = setup(t);
  const toast = useToastStore();
  const shown = [];
  t.mock.method(toast, 'showToast', (options) => shown.push(options));

  store.handleMessage({
    type: 'action',
    payload: { action: 'start-guiding', success: false, error: 'Calibration failed' },
  });
  store.handleMessage({ type: 'action', payload: { action: 'dither', success: true } });
  assert.equal(shown.length, 1);
  assert.equal(shown[0].message, 'Calibration failed');
  assert.equal(store.lastActionResult.action, 'dither');
});

test('runAction toasts the error and releases the pending flag', async (t) => {
  const store = setup(t);
  const toast = useToastStore();
  const shown = [];
  t.mock.method(toast, 'showToast', (options) => shown.push(options));
  const error = new Error('The guider rejected pause in state Looping.');
  error.status = 409;
  stubApi(t, {
    nativeGuiderAction: async () => {
      throw error;
    },
  });

  const ok = await store.runAction('pause', {}, { title: 'Pause failed' });
  assert.equal(ok, false);
  assert.equal(store.pendingAction, null);
  assert.equal(shown[0].title, 'Pause failed');
  assert.equal(shown[0].message, error.message);
});

test('refreshStatus maps the pollable status and loads history on first availability', async (t) => {
  const store = setup(t);
  let historyLoads = 0;
  stubApi(t, {
    getNativeGuiderStatus: async () => ({
      available: true,
      connected: true,
      deviceId: 'PinsNativeGuider',
      isNative: true,
      status: { state: 'Guiding', frameNumber: 12, isCalibrated: true },
    }),
    getNativeGuiderSteps: async () => {
      historyLoads++;
      return [{ frame: 1 }, { frame: 2 }];
    },
    getNativeGuiderAlerts: async () => [],
    getNativeGuiderCalibration: async () => ({ raAngleDeg: 5 }),
  });

  await store.refreshStatus();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(store.state, 'Guiding');
  assert.equal(store.isCalibrated, true);
  assert.equal(store.latestFrameNumber, 12);
  assert.equal(historyLoads, 1);
  assert.equal(store.steps.length, 2);

  await store.refreshStatus();
  assert.equal(historyLoads, 1);
});

const { default: apiPinsService } = await import('@/services/apiPinsService');

function stubPins(t, stubs) {
  const originals = Object.fromEntries(Object.keys(stubs).map((k) => [k, apiPinsService[k]]));
  Object.assign(apiPinsService, stubs);
  t.after(() => Object.assign(apiPinsService, originals));
}

function deviceSetting(value) {
  return { name: 'GuideCameraDevice', value, type: 'string', requiresReconnect: true };
}

test('a single guide camera is selected automatically', async (t) => {
  const store = setup(t);
  store.settings = [deviceSetting('')];
  const saved = [];
  stubApi(t, {
    getNativeGuiderCameras: async () => ['ZWO CCD ASI120MM-S'],
    setNativeGuiderSetting: async (name, value) => {
      saved.push([name, value]);
      return { ...deviceSetting(value) };
    },
  });
  await store.loadCameras();
  assert.deepEqual(saved, [['GuideCameraDevice', 'ZWO CCD ASI120MM-S']]);
  assert.equal(store.settings[0].value, 'ZWO CCD ASI120MM-S');
});

test('an existing valid selection or several cameras are left alone', async (t) => {
  const store = setup(t);
  const saved = [];
  stubApi(t, {
    setNativeGuiderSetting: async (name, value) => {
      saved.push([name, value]);
      return deviceSetting(value);
    },
  });
  store.settings = [deviceSetting('ZWO CCD ASI120MM-S')];
  stubApi(t, { getNativeGuiderCameras: async () => ['ZWO CCD ASI120MM-S'] });
  await store.loadCameras();
  store.settings = [deviceSetting('')];
  stubApi(t, { getNativeGuiderCameras: async () => ['Cam A', 'Cam B'] });
  await store.loadCameras();
  assert.deepEqual(saved, []);
});

test('camera drivers come from the INDI registry, sorted by label', async (t) => {
  const store = setup(t);
  stubPins(t, {
    getINDIDeviceList: async (type) => {
      assert.equal(type, 'camera');
      return {
        Response: [
          { Name: 'indi_qhy_ccd', Label: 'QHY CCD' },
          { Name: 'indi_asi_ccd', Label: 'ZWO ASI Camera' },
          { Name: 'indi_canon_ccd', Label: 'Canon DSLR' },
        ],
      };
    },
  });
  await store.loadCameraDrivers();
  assert.deepEqual(
    store.cameraDrivers.map((d) => d.Label),
    ['Canon DSLR', 'Guide Simulator', 'QHY CCD', 'ZWO ASI Camera']
  );
  assert.equal(store.cameraDriversError, null);
});

test('changing a reconnect setting while connected asks for a reconnect, which reconnects', async (t) => {
  const store = setup(t);
  store.summary = { ...store.summary, connected: true };
  store.settings = [deviceSetting('')];
  const calls = [];
  stubApi(t, {
    setNativeGuiderSetting: async (name, value) => deviceSetting(value),
    guiderAction: async (action) => {
      calls.push(action);
      return { Success: true };
    },
    getNativeGuiderSettings: async () => ({ connected: true, settings: [deviceSetting('Cam')] }),
    getNativeGuiderCameras: async () => ['Cam'],
  });
  await store.saveSetting('GuideCameraDevice', 'Cam');
  assert.equal(store.reconnectNeeded, true);
  await store.reconnectGuider();
  assert.deepEqual(calls, ['disconnect', 'connect?to=PinsNativeGuider']);
  assert.equal(store.reconnectNeeded, false);
  assert.equal(store.reconnectError, null);
});

test('the imaging camera is never auto-selected as guide camera', async (t) => {
  const store = setup(t);
  apiStore().profileInfo = { CameraSettings: { Id: 'CCD Simulator' } };
  store.settings = [deviceSetting('')];
  const saved = [];
  stubApi(t, {
    getNativeGuiderCameras: async () => ['CCD Simulator'],
    setNativeGuiderSetting: async (name, value) => {
      saved.push([name, value]);
      return deviceSetting(value);
    },
  });
  await store.loadCameras();
  assert.deepEqual(saved, []);
  assert.deepEqual(store.cameras, ['CCD Simulator']);
});

// --- Guiding Coach -------------------------------------------------------------------

function coachSession(overrides = {}) {
  return {
    phase: 'Complete',
    sessionId: 's1',
    findings: [
      {
        id: 'drift.minMove',
        code: 'drift.minMove',
        step: 'Drift',
        severity: 'info',
        changes: [{ name: 'RaMinMove', value: '0.2', currentValue: '0' }],
        applied: false,
      },
    ],
    trials: [{ id: 'B', kind: 'suggestion', settings: [{ name: 'RaAggression', value: '0.6' }] }],
    report: {
      id: 'r1',
      grade: 'good',
      findings: [{ id: 'drift.minMove', code: 'drift.minMove', applied: false }],
      trials: [{ id: 'B' }],
    },
    ...overrides,
  };
}

test('coach and hint messages update the coach state and the active hint', (t) => {
  const store = setup(t);
  let historyLoads = 0;
  stubApi(t, {
    getNativeGuiderCoachHistory: async () => {
      historyLoads++;
      return [{ id: 'r1' }];
    },
  });

  store.handleMessage({
    type: 'coach',
    payload: { phase: 'Running', step: 'Drift', progress: 0.3 },
  });
  assert.equal(store.coachPhase, 'Running');
  assert.equal(store.coachRunning, true);
  assert.equal(historyLoads, 0);

  // A completed session refreshes the history once.
  store.handleMessage({ type: 'coach', payload: coachSession() });
  store.handleMessage({ type: 'coach', payload: coachSession() });
  assert.equal(store.coachRunning, false);
  assert.equal(historyLoads, 1);

  store.handleMessage({
    type: 'hint',
    payload: { id: 'hint.lowSnr', code: 'hint.lowSnr', severity: 'warning', timestamp: 'x' },
  });
  store.handleMessage({
    type: 'hint',
    payload: { id: 'hint.seeingBound', code: 'hint.seeingBound', severity: 'good' },
  });
  assert.equal(store.hints.length, 2);
  assert.equal(store.currentHint.id, 'hint.lowSnr', 'the more severe hint wins');
});

test('the status poll is the source of truth for hints and the running flag', async (t) => {
  const store = setup(t);
  store.hints = [{ id: 'stale', severity: 'warning' }];
  stubApi(t, {
    getNativeGuiderStatus: async () => ({
      available: true,
      connected: true,
      status: {
        state: 'Guiding',
        coachRunning: true,
        hints: [{ id: 'hint.raOscillation', code: 'hint.raOscillation', severity: 'warning' }],
      },
    }),
    getNativeGuiderSteps: async () => [],
    getNativeGuiderAlerts: async () => [],
    getNativeGuiderCalibration: async () => null,
  });

  await store.refreshStatus();

  assert.deepEqual(
    store.hints.map((h) => h.id),
    ['hint.raOscillation']
  );
  assert.equal(store.coachRunning, true);
  assert.equal(store.currentHint.id, 'hint.raOscillation');
});

test('startCoach passes the options and returns the localized rejection code', async (t) => {
  const store = setup(t);
  const sent = [];
  stubApi(t, {
    startNativeGuiderCoach: async (options) => {
      sent.push(options);
      const error = new Error('Another coach session is running.');
      error.status = 409;
      error.messageCode = 'coach.busy';
      throw error;
    },
  });

  const result = await store.startCoach({ steps: ['Drift'], driftSeconds: 300 });

  assert.deepEqual(sent, [{ steps: ['Drift'], driftSeconds: 300 }]);
  assert.equal(result.ok, false);
  assert.equal(result.messageCode, 'coach.busy');
  assert.equal(result.message, 'Another coach session is running.');
  assert.equal(store.coachPending, null);
});

test('startCoach applies the accepted status', async (t) => {
  const store = setup(t);
  stubApi(t, {
    startNativeGuiderCoach: async () => ({
      action: 'coach-start',
      status: { phase: 'Running', step: 'CameraCheck' },
    }),
    getNativeGuiderStatus: async () => null,
  });

  const result = await store.startCoach({});

  assert.equal(result.ok, true);
  assert.equal(store.coach.step, 'CameraCheck');
  assert.equal(store.coachRunning, true);
});

test('applying coach actions marks them applied and reloads the settings', async (t) => {
  const store = setup(t);
  store.coach = coachSession();
  const applied = [];
  let settingsLoads = 0;
  stubApi(t, {
    applyNativeGuiderCoachActions: async (ids) => {
      applied.push(ids);
      return { applied: ids };
    },
    getNativeGuiderSettings: async () => {
      settingsLoads++;
      return { connected: true, settings: [] };
    },
  });

  const ok = await store.applyCoachActions(['drift.minMove', 'trial:B']);

  assert.equal(ok, true);
  assert.deepEqual(applied, [['drift.minMove', 'trial:B']]);
  assert.equal(store.coach.findings[0].applied, true);
  assert.equal(store.coach.report.findings[0].applied, true);
  assert.equal(store.coach.trials[0].applied, true);
  assert.equal(store.coach.report.trials[0].applied, true);
  assert.equal(settingsLoads, 1);
});

test('a failed coach call is toasted with the backend reason', async (t) => {
  const store = setup(t);
  const toast = useToastStore();
  const shown = [];
  t.mock.method(toast, 'showToast', (options) => shown.push(options));
  stubApi(t, {
    skipNativeGuiderCoachStep: async () => {
      throw new Error('No Guiding Coach session is running.');
    },
  });

  const ok = await store.skipCoachStep({ title: 'Skipping failed' });

  assert.equal(ok, false);
  assert.equal(shown[0].title, 'Skipping failed');
  assert.equal(shown[0].message, 'No Guiding Coach session is running.');
  assert.equal(store.coachPending, null);
});

test('dismissing a hint hides it at once, also when the guider no longer knows it', async (t) => {
  const store = setup(t);
  store.hints = [
    { id: 'hint.lowSnr', severity: 'warning' },
    { id: 'hint.seeingBound', severity: 'good' },
  ];
  const dismissed = [];
  stubApi(t, {
    dismissNativeGuiderHint: async (id) => {
      dismissed.push(id);
      const error = new Error('The hint is no longer active.');
      error.status = 409;
      throw error;
    },
  });

  await store.dismissHint(store.hints[0]);

  assert.deepEqual(dismissed, ['hint.lowSnr']);
  assert.equal(store.currentHint.id, 'hint.seeingBound');
});

test('loading the coach without a native guider is not an error', async (t) => {
  const store = setup(t);
  stubApi(t, {
    getNativeGuiderCoach: async () => {
      const error = new Error('No guider is connected.');
      error.status = 409;
      throw error;
    },
  });

  await store.loadCoach();

  assert.equal(store.coach, null);
  assert.equal(store.coachError, null);
});

test('the newer of status poll and coach status decides whether the coach runs', (t) => {
  const store = setup(t);
  store.setCoach({ phase: 'Running', step: 'Drift' });
  store.status = { state: 'Guiding', coachRunning: false };
  store.lastStatusAt = store.coachUpdatedAt - 1000;
  assert.equal(store.coachRunning, true, 'a start is ahead of the last poll');

  store.lastStatusAt = store.coachUpdatedAt + 1000;
  assert.equal(store.coachRunning, false, 'a later poll ends a stale running session');

  store.status = { state: 'Guiding', coachRunning: true };
  assert.equal(store.coachRunning, true);
});

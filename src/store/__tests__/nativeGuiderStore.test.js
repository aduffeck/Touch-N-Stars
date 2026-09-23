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

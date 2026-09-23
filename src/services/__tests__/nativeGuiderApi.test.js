import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowserGlobals, freshPinia } from '../../test-helpers/browserEnv.js';

installBrowserGlobals();

const { default: apiService } = await import('@/services/apiService');
const { nativeGuiderHttp, mapNativeGuiderError } = await import('@/services/api/nativeGuider');
const { useSettingsStore } = await import('@/store/settingsStore');
const { apiStore } = await import('@/store/store');

// One Pinia for the whole file (apiService caches its store references).
freshPinia();
const settingsStore = useSettingsStore();
settingsStore.connection.ip = '10.0.0.5';
settingsStore.connection.port = 5000;
apiStore().apiPort = 1888;

function recordRequests(t, data = { success: true, response: { ok: 1 } }) {
  const calls = [];
  t.mock.method(nativeGuiderHttp, 'request', async (config) => {
    calls.push(config);
    return { status: 200, data };
  });
  return calls;
}

test('native guider calls go to the plugin server port and unwrap response', async (t) => {
  const calls = recordRequests(t);

  const result = await apiService.getNativeGuiderStatus();
  await apiService.getNativeGuiderSteps(200);
  await apiService.setNativeGuiderSetting('Gain', 120);
  await apiService.nativeGuiderAction('dither', { pixels: 3, raOnly: true });
  await apiService.buildNativeGuiderDarks({ minExposure: 1, maxExposure: 2, frames: 3 });

  assert.deepEqual(result, { ok: 1 });
  assert.equal(calls[0].method, 'get');
  assert.equal(calls[0].url, 'http://10.0.0.5:5000/api/native-guider/status');
  assert.deepEqual(calls[1].params, { max: 200 });
  assert.equal(calls[2].method, 'post');
  assert.equal(calls[2].url, 'http://10.0.0.5:5000/api/native-guider/settings');
  assert.deepEqual(calls[2].data, { name: 'Gain', value: 120 });
  assert.equal(calls[3].url, 'http://10.0.0.5:5000/api/native-guider/dither');
  assert.deepEqual(calls[3].params, { pixels: 3, raOnly: true });
  assert.equal(calls[4].url, 'http://10.0.0.5:5000/api/native-guider/darks/build');
  assert.deepEqual(calls[4].data, { minExposure: 1, maxExposure: 2, frames: 3 });
});

test('frame-info passes the pinned frame and the image URL carries the render options', async (t) => {
  const calls = recordRequests(t);
  await apiService.getNativeGuiderFrameInfo({ cropSize: 21, frame: 17 });
  assert.equal(calls[0].url, 'http://10.0.0.5:5000/api/native-guider/frame-info');
  assert.deepEqual(calls[0].params, { cropSize: 21, frame: 17 });

  const url = apiService.getNativeGuiderImageUrl({ maxWidth: 768.4, stretch: 0.33, frame: 17 });
  assert.equal(
    url,
    'http://10.0.0.5:5000/api/native-guider/image?maxWidth=768&stretch=0.33&quality=80&frame=17'
  );
});

test('failures carry the backend reason, status and code', async (t) => {
  t.mock.method(nativeGuiderHttp, 'request', async () => {
    const error = new Error('Request failed with status code 409');
    error.response = {
      status: 409,
      data: { success: false, error: 'No guider is connected.', code: 'NotAvailable' },
    };
    throw error;
  });

  await assert.rejects(apiService.nativeGuiderAction('loop'), (error) => {
    assert.equal(error.message, 'No guider is connected.');
    assert.equal(error.status, 409);
    assert.equal(error.code, 'NotAvailable');
    return true;
  });
});

test('cancelled requests are flagged, network errors keep their message', () => {
  const cancelled = mapNativeGuiderError({ code: 'ERR_CANCELED' });
  assert.equal(cancelled.cancelled, true);
  const network = mapNativeGuiderError(new Error('Network Error'));
  assert.equal(network.message, 'Network Error');
  assert.equal(network.status, undefined);
});

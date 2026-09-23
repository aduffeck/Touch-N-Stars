import { defineStore } from 'pinia';
import apiService from '@/services/apiService';
import websocketNativeGuiderService from '@/services/websocketNativeGuider';
import { useToastStore } from '@/store/toastStore';
import { appendMarker, appendSteps, markerFromMessage } from '@/utils/nativeGuider';

// Client-side history: enough for the 400-step graph window plus the target plot.
const MAX_STEPS = 2000;
const MAX_ALERTS = 200;
const MAX_MARKERS = 300;

function emptySummary() {
  return {
    available: false,
    connected: false,
    deviceId: null,
    deviceName: null,
    isNative: false,
    reason: null,
  };
}

/**
 * State of the PINS native guider (IAdvancedGuider behind /api/native-guider and
 * /ws/native-guider).
 *
 * Two feeds, deliberately redundant:
 * - the WebSocket pushes every step/alert/state/settle/frame event (app-scoped while a native
 *   guider is connected, so critical alerts toast on every page), and
 * - the guider page polls /status every 2 s (useBackgroundAwarePolling), which stays the
 *   source of truth when the socket is down or missed something.
 */
export const useNativeGuiderStore = defineStore('nativeGuiderStore', {
  state: () => ({
    feedActive: false,
    wsConnected: false,
    summary: emptySummary(),
    status: null,
    lastStatusAt: 0,
    statusError: null,

    steps: [],
    alerts: [],
    markers: [],
    calibration: null,
    calibrationProgress: null,
    settle: null,
    stats: null,
    darks: null,

    /** Latest frame notification { frameNumber, width, height, timestamp }. */
    frame: null,

    settings: [],
    settingsConnected: false,
    settingsLoading: false,
    settingsError: null,
    savingSetting: null,

    cameras: [],
    camerasLoading: false,
    camerasError: null,

    pendingAction: null,
    lastActionResult: null,
    _toastedAlertKeys: [],
  }),

  getters: {
    state: (s) => s.status?.state || (s.summary.connected ? 'Unknown' : 'Disconnected'),
    isAvailable: (s) => s.summary.available === true,
    isSettling: (s) => s.status?.isSettling === true,
    isCalibrated: (s) => s.status?.isCalibrated === true,
    pixelScale: (s) => s.status?.pixelScale || null,
    windowStats: (s) => s.stats?.window || s.status?.windowStats || null,
    sessionStats: (s) => s.stats?.session || s.status?.sessionStats || null,
    /** Highest frame number known from the socket or the status poll. */
    latestFrameNumber: (s) =>
      Math.max(Number(s.frame?.frameNumber) || 0, Number(s.status?.frameNumber) || 0),
    criticalAlertCount: (s) =>
      s.alerts.filter((a) => String(a.severity).toLowerCase() === 'critical').length,
  },

  actions: {
    // --- Feed lifecycle ---------------------------------------------------------

    /** Opens the live feed (idempotent). Called while a native guider is connected. */
    startFeed() {
      if (this.feedActive) return;
      this.feedActive = true;
      websocketNativeGuiderService.setMessageCallback((message) => this.handleMessage(message));
      websocketNativeGuiderService.setStatusCallback((status) => {
        this.wsConnected = status === 'open';
      });
      websocketNativeGuiderService.connect();
    },

    stopFeed() {
      if (!this.feedActive) return;
      this.feedActive = false;
      this.wsConnected = false;
      websocketNativeGuiderService.disconnect();
    },

    resumeAfterBackground() {
      if (this.feedActive) websocketNativeGuiderService.resumeAfterBackground();
    },

    // --- REST loads -------------------------------------------------------------

    async refreshStatus() {
      try {
        const result = await apiService.getNativeGuiderStatus();
        if (!result) return;
        const wasAvailable = this.summary.available;
        this.summary = {
          available: result.available === true,
          connected: result.connected === true,
          deviceId: result.deviceId ?? null,
          deviceName: result.deviceName ?? null,
          isNative: result.isNative === true,
          reason: result.reason ?? null,
        };
        this.status = result.status ?? null;
        this.lastStatusAt = Date.now();
        this.statusError = null;
        if (!wasAvailable && this.summary.available) {
          // (Re)connected: the history may belong to a previous session.
          this.loadHistory();
        }
      } catch (error) {
        if (!error?.cancelled) this.statusError = error?.message || String(error);
      }
    },

    async loadHistory() {
      await Promise.allSettled([this.loadSteps(), this.loadAlerts(), this.loadCalibration()]);
    },

    async loadSteps(max = 1000) {
      try {
        const steps = await apiService.getNativeGuiderSteps(max);
        if (Array.isArray(steps)) {
          this.steps = appendSteps([], steps, MAX_STEPS);
        }
      } catch (error) {
        this.logLoadError('steps', error);
      }
    },

    async loadAlerts(max = 100) {
      try {
        const alerts = await apiService.getNativeGuiderAlerts(max);
        if (Array.isArray(alerts)) {
          this.alerts = alerts.slice(-MAX_ALERTS);
          // Alerts already in the history are not news: never toast them again.
          this._toastedAlertKeys = alerts.map((a) => this.alertKey(a)).slice(-MAX_ALERTS);
        }
      } catch (error) {
        this.logLoadError('alerts', error);
      }
    },

    async loadCalibration() {
      try {
        this.calibration = await apiService.getNativeGuiderCalibration();
      } catch (error) {
        this.logLoadError('calibration', error);
      }
    },

    async loadSettings() {
      this.settingsLoading = true;
      try {
        const result = await apiService.getNativeGuiderSettings();
        this.settings = Array.isArray(result?.settings) ? result.settings : [];
        this.settingsConnected = result?.connected === true;
        this.settingsError = null;
      } catch (error) {
        if (!error?.cancelled) this.settingsError = error?.message || String(error);
      } finally {
        this.settingsLoading = false;
      }
    },

    /**
     * Saves one setting. Resolves to the updated setting; rejects with the backend's
     * validation message (the caller shows it next to the field).
     */
    async saveSetting(name, value) {
      this.savingSetting = name;
      try {
        const updated = await apiService.setNativeGuiderSetting(name, value);
        if (updated) {
          const index = this.settings.findIndex((s) => s.name === updated.name);
          if (index >= 0) this.settings.splice(index, 1, updated);
        }
        return updated;
      } finally {
        this.savingSetting = null;
      }
    },

    async loadCameras() {
      this.camerasLoading = true;
      try {
        const cameras = await apiService.getNativeGuiderCameras();
        this.cameras = Array.isArray(cameras) ? cameras : [];
        this.camerasError = null;
      } catch (error) {
        if (!error?.cancelled) this.camerasError = error?.message || String(error);
      } finally {
        this.camerasLoading = false;
      }
    },

    logLoadError(what, error) {
      // 409 just means "no native guider connected" - the page shows that state already.
      if (error?.cancelled || error?.status === 409) return;
      console.warn(`[NativeGuider] loading ${what} failed:`, error?.message || error);
    },

    // --- Actions ----------------------------------------------------------------

    /**
     * Runs a guider action. Resolves true when accepted; failures are toasted with the
     * backend's reason and resolve false.
     * @param {string} action loop | stop | start-guiding | stop-guiding | pause | resume | dither | clear-calibration
     */
    async runAction(action, params = {}, { title } = {}) {
      if (this.pendingAction) return false;
      this.pendingAction = action;
      try {
        await apiService.nativeGuiderAction(action, params);
        // Pick up the new state without waiting for the next poll tick.
        this.refreshStatus();
        if (action === 'clear-calibration') this.loadCalibration();
        return true;
      } catch (error) {
        if (!error?.cancelled) {
          useToastStore().showToast({
            type: 'error',
            title: title || action,
            message: error?.message || String(error),
          });
        }
        return false;
      } finally {
        this.pendingAction = null;
      }
    },

    async buildDarks(options, { title } = {}) {
      try {
        await apiService.buildNativeGuiderDarks(options);
        this.darks = { status: 'starting', index: 0, total: 0 };
        return true;
      } catch (error) {
        useToastStore().showToast({
          type: 'error',
          title: title || 'Dark library',
          message: error?.message || String(error),
        });
        return false;
      }
    },

    async cancelDarks() {
      try {
        await apiService.cancelNativeGuiderDarks();
      } catch (error) {
        console.warn('[NativeGuider] cancel darks failed:', error?.message || error);
      }
    },

    // --- Feed messages ----------------------------------------------------------

    alertKey(alert) {
      return `${alert?.code ?? ''}|${alert?.timestamp ?? ''}|${alert?.title ?? ''}`;
    },

    /** Applies one { type, timestamp, payload } message from /ws/native-guider. */
    handleMessage(message) {
      const payload = message?.payload;
      switch (message?.type) {
        case 'hello':
        case 'device':
        case 'heartbeat':
          if (payload && typeof payload === 'object') {
            const wasAvailable = this.summary.available;
            this.summary = { ...this.summary, ...payload };
            if (!wasAvailable && this.summary.available) this.loadHistory();
          }
          break;
        case 'step':
          if (payload) this.steps = appendSteps(this.steps, payload, MAX_STEPS);
          break;
        case 'alert':
          if (payload) this.addAlert(payload);
          break;
        case 'state':
          this.applyState(payload);
          break;
        case 'calibration':
          if (payload && payload.raAngleDeg !== undefined) {
            this.calibration = payload;
            this.calibrationProgress = null;
          } else if (payload) {
            this.calibrationProgress = payload;
          }
          break;
        case 'settle':
          this.settle = payload || null;
          if (this.status && payload?.status) {
            const s = String(payload.status).toLowerCase();
            this.status = { ...this.status, isSettling: s === 'begin' || s === 'settling' };
          }
          break;
        case 'frame':
          if (payload) this.frame = payload;
          break;
        case 'stats':
          if (payload) this.stats = payload;
          break;
        case 'darks':
          this.darks = payload || null;
          break;
        case 'action':
          this.lastActionResult = { ...(payload || {}), at: Date.now() };
          if (payload && payload.success === false && payload.error) {
            useToastStore().showToast({
              type: 'error',
              title: payload.action || 'Guider',
              message: payload.error,
            });
          }
          break;
        default:
          break;
      }
      const marker = markerFromMessage(message);
      if (marker) this.markers = appendMarker(this.markers, marker, MAX_MARKERS);
    },

    applyState(payload) {
      if (!payload) return;
      if (typeof payload === 'string') {
        this.status = { ...(this.status || {}), state: payload };
      } else if (typeof payload === 'object') {
        this.status = { ...(this.status || {}), ...payload };
      }
    },

    addAlert(alert) {
      const key = this.alertKey(alert);
      this.alerts = [...this.alerts, alert].slice(-MAX_ALERTS);
      if (String(alert.severity).toLowerCase() !== 'critical') return;
      if (this._toastedAlertKeys.includes(key)) return;
      this._toastedAlertKeys = [...this._toastedAlertKeys, key].slice(-MAX_ALERTS);
      const message = [alert.explanation, alert.fix].filter(Boolean).join(' ');
      useToastStore().showToast({
        type: 'error',
        title: alert.title || alert.codeName || 'Guider',
        message: message || alert.detail || '',
        autoClose: false,
      });
    },

    /** Forget everything instance-bound (used when the guider disconnects). */
    resetLive() {
      this.status = null;
      this.steps = [];
      this.markers = [];
      this.frame = null;
      this.settle = null;
      this.stats = null;
      this.calibrationProgress = null;
    },
  },
});

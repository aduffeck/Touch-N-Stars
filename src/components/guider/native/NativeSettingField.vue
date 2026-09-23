<template>
  <div class="flex flex-col gap-1.5 py-3" :class="compact ? 'py-2' : ''">
    <!-- Label row -->
    <div class="flex items-start justify-between gap-2">
      <label :for="inputId" class="flex min-w-0 flex-col">
        <span class="text-sm font-medium text-content break-words">
          {{ setting.label || setting.name }}
        </span>
        <span
          v-if="setting.requiresReconnect"
          class="mt-0.5 w-fit rounded-chip border border-status-warn/40 bg-status-warn/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-status-warn"
        >
          {{ t('components.guider.native.settings.requiresReconnect') }}
        </span>
      </label>

      <!-- Save state -->
      <span class="flex h-6 w-6 shrink-0 items-center justify-center" aria-live="polite">
        <ArrowPathIcon v-if="saving" class="h-4 w-4 animate-spin text-content-muted" />
        <CheckIcon v-else-if="saved" class="h-5 w-5 text-status-ok" />
        <ExclamationTriangleIcon v-else-if="error" class="h-5 w-5 text-status-danger" />
      </span>
    </div>

    <!-- bool -->
    <div v-if="type === 'bool'" class="flex min-h-touch items-center">
      <toggleButton
        :statusValue="Boolean(draft)"
        :disabled="saving"
        @update:statusValue="onToggle"
      />
    </div>

    <!-- enum -->
    <select
      v-else-if="type === 'enum'"
      :id="inputId"
      v-model="draft"
      class="tns-select"
      :disabled="saving"
      @change="commit"
    >
      <option v-if="!optionList.includes(String(draft))" :value="draft">{{ draft }}</option>
      <option v-for="option in optionList" :key="option" :value="option">{{ option }}</option>
    </select>

    <!-- Guide camera driver: pick a camera type, never type driver names -->
    <div v-else-if="isCameraDriver" class="flex flex-col gap-1.5">
      <select
        :id="inputId"
        v-model="draft"
        class="tns-select"
        :disabled="saving || store.cameraDriversLoading"
        @change="commit"
      >
        <option :value="SIMULATOR_DRIVER">
          {{ t('components.guider.native.settings.driverSimulator') }}
        </option>
        <optgroup :label="t('components.guider.native.settings.indiCameras')">
          <option v-for="driver in store.cameraDrivers" :key="driver.Name" :value="driver.Name">
            {{ driver.Label }}
          </option>
        </optgroup>
        <option v-if="unknownDriver" :value="draft">{{ draft }}</option>
      </select>
      <span v-if="store.cameraDriversLoading" class="text-xs text-content-muted">
        {{ t('components.guider.native.settings.loadingDrivers') }}
      </span>
      <p v-if="store.cameraDriversError" class="text-xs text-status-danger break-words">
        {{ store.cameraDriversError }}
      </p>
      <div
        v-if="store.reconnectNeeded"
        class="flex flex-wrap items-center justify-between gap-2 rounded-chip border border-status-warn/40 bg-status-warn/10 p-2"
      >
        <span class="text-xs text-status-warn">
          {{ t('components.guider.native.settings.reconnectNeeded') }}
        </span>
        <button
          type="button"
          class="tns-btn-secondary w-auto! px-3! text-xs!"
          :disabled="store.reconnecting"
          @click="store.reconnectGuider()"
        >
          {{
            store.reconnecting
              ? t('components.guider.native.settings.reconnecting')
              : t('components.guider.native.settings.reconnectNow')
          }}
        </button>
      </div>
      <p v-if="store.reconnectError" class="text-xs text-status-danger break-words">
        {{
          t('components.guider.native.settings.reconnectFailed', { message: store.reconnectError })
        }}
      </p>
    </div>

    <!-- The built-in simulator needs no camera device -->
    <p v-else-if="isCameraDevice && driverIsSimulator" class="text-sm text-content-muted">
      {{ t('components.guider.native.settings.simulatorNoCamera') }}
    </p>

    <!-- Guide camera device picker -->
    <div v-else-if="isCameraDevice" class="flex flex-col gap-1.5">
      <div class="flex items-center gap-2">
        <select
          v-if="!manualDevice"
          :id="inputId"
          v-model="draft"
          class="tns-select min-w-0 flex-1"
          :disabled="saving || store.camerasLoading"
          @change="commit"
        >
          <option value="" disabled>
            {{ t('components.guider.native.settings.selectCamera') }}
          </option>
          <option v-for="camera in cameraOptions" :key="camera" :value="camera">
            {{ camera }}
          </option>
        </select>
        <input
          v-else
          :id="inputId"
          v-model="draft"
          type="text"
          class="tns-input min-w-0 flex-1"
          :placeholder="t('components.guider.native.settings.cameraNamePlaceholder')"
          :disabled="saving"
          @blur="commit"
          @keydown.enter.prevent="commit"
        />
        <button
          type="button"
          class="tns-btn-secondary w-auto! shrink-0 px-3!"
          :disabled="store.camerasLoading"
          :title="t('components.guider.native.settings.refreshCameras')"
          :aria-label="t('components.guider.native.settings.refreshCameras')"
          @click="refreshCameras"
        >
          <ArrowPathIcon class="h-5 w-5" :class="{ 'animate-spin': store.camerasLoading }" />
        </button>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <button
          v-if="manualDevice || (camerasLoaded && !store.camerasLoading && !store.cameras.length)"
          type="button"
          class="flex min-h-touch items-center gap-1 text-xs text-accent"
          @click="manualDevice = !manualDevice"
        >
          <component :is="manualDevice ? ListBulletIcon : PencilSquareIcon" class="h-4 w-4" />
          {{
            manualDevice
              ? t('components.guider.native.settings.pickFromList')
              : t('components.guider.native.settings.enterManually')
          }}
        </button>
        <span v-if="store.camerasLoading" class="text-xs text-content-muted">
          {{ t('components.guider.native.settings.loadingCameras') }}
        </span>
        <span
          v-else-if="!store.camerasError && camerasLoaded && !store.cameras.length"
          class="text-xs text-content-muted"
        >
          {{ t('components.guider.native.settings.noCamerasForDriver', { driver: driverLabel }) }}
        </span>
      </div>
      <p v-if="store.camerasError" class="text-xs text-status-danger break-words">
        {{ store.camerasError }}
      </p>
    </div>

    <!-- int / double -->
    <div v-else-if="isNumeric" class="relative">
      <input
        :id="inputId"
        v-model="draft"
        type="text"
        :inputmode="type === 'int' ? 'numeric' : 'decimal'"
        class="tns-input tabular-nums"
        :class="[setting.unit ? 'pr-14' : '', error ? 'border-status-danger!' : '']"
        :disabled="saving"
        @blur="commit"
        @keydown.enter.prevent="onEnter"
      />
      <span
        v-if="setting.unit"
        class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-content-muted"
      >
        {{ setting.unit }}
      </span>
    </div>

    <!-- string -->
    <input
      v-else
      :id="inputId"
      v-model="draft"
      type="text"
      class="tns-input"
      :class="error ? 'border-status-danger!' : ''"
      :disabled="saving"
      @blur="commit"
      @keydown.enter.prevent="onEnter"
    />

    <!-- Hints / errors -->
    <p v-if="error" class="text-xs text-status-danger break-words">{{ error }}</p>
    <div
      v-if="rangeHint || showReset"
      class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"
    >
      <span v-if="rangeHint" class="text-xs text-content-faint tabular-nums">{{ rangeHint }}</span>
      <button
        v-if="showReset"
        type="button"
        class="ml-auto flex min-h-8 items-center gap-1 text-xs text-accent"
        :disabled="saving"
        @click="resetToDefault"
      >
        <ArrowUturnLeftIcon class="h-3.5 w-3.5" />
        {{ t('components.guider.native.settings.resetToDefault', { value: defaultLabel }) }}
      </button>
    </div>
    <p
      v-if="setting.description && !compact"
      class="text-xs text-content-muted break-words leading-snug"
    >
      {{ setting.description }}
    </p>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  ArrowPathIcon,
  ArrowUturnLeftIcon,
  CheckIcon,
  ExclamationTriangleIcon,
  ListBulletIcon,
  PencilSquareIcon,
} from '@heroicons/vue/24/outline';
import toggleButton from '@/components/helpers/toggleButton.vue';
import { useNativeGuiderStore } from '@/store/nativeGuiderStore';
import { settingFormValue, validateSettingValue } from '@/utils/nativeGuider';

const props = defineProps({
  setting: { type: Object, required: true },
  compact: { type: Boolean, default: false },
});

const { t } = useI18n();
const store = useNativeGuiderStore();

const CAMERA_DEVICE = 'GuideCameraDevice';
const CAMERA_DRIVER = 'GuideCameraDriver';
const SIMULATOR_DRIVER = 'simulator';

const inputId = computed(() => `native-guider-setting-${props.setting.name}`);
const type = computed(() => String(props.setting.type || 'string').toLowerCase());
const isNumeric = computed(() => type.value === 'int' || type.value === 'double');
const isCameraDevice = computed(() => props.setting.name === CAMERA_DEVICE);
const isCameraDriver = computed(() => props.setting.name === CAMERA_DRIVER);

// Current guide camera driver (from the settings list; the device field depends on it).
const currentDriver = computed(() =>
  String(store.settings.find((s) => s.name === CAMERA_DRIVER)?.value ?? '')
);
const driverIsSimulator = computed(() => currentDriver.value.toLowerCase() === SIMULATOR_DRIVER);
const driverLabel = computed(
  () =>
    store.cameraDrivers.find((d) => d.Name === currentDriver.value)?.Label || currentDriver.value
);
// A driver that isn't in the registry (set via API or an older version) stays selectable.
const unknownDriver = computed(() => {
  const value = String(draft.value ?? '');
  if (!value || value.toLowerCase() === SIMULATOR_DRIVER || store.cameraDriversLoading)
    return false;
  return !store.cameraDrivers.some((d) => d.Name === value);
});
const optionList = computed(() =>
  Array.isArray(props.setting.options) ? props.setting.options.map(String) : []
);

const draft = ref(settingFormValue(props.setting));
const saving = ref(false);
const saved = ref(false);
const error = ref('');
const manualDevice = ref(false);
const camerasLoaded = ref(false);
let savedTimer = null;

// Follow backend updates (poll/refresh) unless the user is editing a changed value.
watch(
  () => props.setting.value,
  () => {
    if (!saving.value) draft.value = settingFormValue(props.setting);
  }
);

const currentValue = computed(() => settingFormValue(props.setting));

const cameraOptions = computed(() => {
  const list = [...store.cameras];
  const current = String(props.setting.value || '');
  if (current && !list.includes(current)) list.unshift(current);
  return list;
});

const rangeHint = computed(() => {
  if (!isNumeric.value) return '';
  const { min, max } = props.setting;
  const hasMin = min !== null && min !== undefined;
  const hasMax = max !== null && max !== undefined;
  if (hasMin && hasMax) return t('components.guider.native.settings.range', { min, max });
  if (hasMin) return t('components.guider.native.settings.rangeMin', { min });
  if (hasMax) return t('components.guider.native.settings.rangeMax', { max });
  return '';
});

const defaultLabel = computed(() => {
  const value = props.setting.defaultValue;
  if (type.value === 'bool') {
    return String(value).toLowerCase() === 'true'
      ? t('components.guider.native.settings.on')
      : t('components.guider.native.settings.off');
  }
  return props.setting.unit ? `${value} ${props.setting.unit}` : String(value);
});

const showReset = computed(() => {
  const def = props.setting.defaultValue;
  if (def === null || def === undefined || def === '') return false;
  if (type.value === 'bool') {
    return String(def).toLowerCase() !== String(props.setting.value).toLowerCase();
  }
  if (isNumeric.value) {
    const a = Number(String(def).replace(',', '.'));
    const b = Number(String(props.setting.value).replace(',', '.'));
    if (Number.isFinite(a) && Number.isFinite(b)) return Math.abs(a - b) > 1e-9;
  }
  return String(def) !== String(props.setting.value ?? '');
});

function isUnchanged(value) {
  if (type.value === 'bool') return Boolean(value) === Boolean(currentValue.value);
  if (isNumeric.value) {
    const a = Number(String(value).replace(',', '.'));
    const b = Number(String(currentValue.value).replace(',', '.'));
    return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-12;
  }
  return String(value ?? '') === String(currentValue.value ?? '');
}

async function save(rawValue) {
  error.value = '';
  const result = validateSettingValue(props.setting, rawValue);
  if (!result.ok) {
    error.value = t(
      `components.guider.native.settings.errors.${result.error}`,
      result.params || {}
    );
    return;
  }
  if (isUnchanged(result.value)) return;

  saving.value = true;
  saved.value = false;
  try {
    await store.saveSetting(props.setting.name, result.value);
    saved.value = true;
    if (savedTimer) clearTimeout(savedTimer);
    savedTimer = setTimeout(() => {
      saved.value = false;
    }, 2000);
    if (props.setting.name === CAMERA_DRIVER) {
      refreshCameras();
    }
  } catch (err) {
    error.value = err?.message || t('components.guider.native.settings.saveFailed');
    // Back to the value the backend holds.
    draft.value = settingFormValue(props.setting);
  } finally {
    saving.value = false;
  }
}

function commit() {
  if (saving.value) return;
  save(draft.value);
}

function onEnter(event) {
  commit();
  event?.target?.blur?.();
}

function onToggle(value) {
  draft.value = value;
  save(value);
}

function resetToDefault() {
  const def = props.setting.defaultValue;
  draft.value = type.value === 'bool' ? String(def).toLowerCase() === 'true' : String(def);
  save(draft.value);
}

async function refreshCameras() {
  await store.loadCameras();
  camerasLoaded.value = true;
}

onMounted(() => {
  if (isCameraDriver.value && !store.cameraDrivers.length) {
    store.loadCameraDrivers();
  }
  if (isCameraDevice.value && !store.camerasLoading && !driverIsSimulator.value) {
    refreshCameras();
  }
});

onUnmounted(() => {
  if (savedTimer) clearTimeout(savedTimer);
});
</script>

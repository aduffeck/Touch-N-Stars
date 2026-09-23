import { useI18n } from 'vue-i18n';
import {
  findingText,
  formatDuration,
  messageText,
  parseStepDetail,
} from '@/utils/nativeGuiderCoach';

const BASE = 'components.guider.native.coach';

/** Localized texts of the Guiding Coach (finding/message codes, step names, step details). */
export function useCoachText() {
  const { t, te } = useI18n();

  /** t() relative to components.guider.native.coach. */
  const k = (key, params) => t(`${BASE}.${key}`, params ?? {});

  function stepName(step) {
    return te(`${BASE}.steps.${step}.name`) ? k(`steps.${step}.name`) : step || '';
  }

  function stepState(state) {
    return te(`${BASE}.stepStates.${state}`) ? k(`stepStates.${state}`) : state || '';
  }

  function stepDetail(detail) {
    const parsed = parseStepDetail(detail);
    if (!parsed) return '';
    if (parsed.key && te(`${BASE}.details.${parsed.key}`)) {
      return k(`details.${parsed.key}`, parsed.params);
    }
    return parsed.text ?? '';
  }

  return {
    t,
    te,
    k,
    stepName,
    stepState,
    stepDetail,
    duration: formatDuration,
    finding: (f) => findingText({ t, te }, f),
    message: (code, fallback) => messageText({ t, te }, code, fallback),
  };
}

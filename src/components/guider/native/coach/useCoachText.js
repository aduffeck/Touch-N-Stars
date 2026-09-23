import { useI18n } from 'vue-i18n';
import {
  findingText,
  formatDuration,
  messageText,
  stepDetailText,
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

  /** Localized sub-phase of an AdvancedCoachStepStatus (DetailCode + DetailParameters). */
  function stepDetail(step) {
    return stepDetailText({ t, te }, step);
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
    message: (code, fallback, parameters) => messageText({ t, te }, code, fallback, parameters),
  };
}

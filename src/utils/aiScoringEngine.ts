import { BehavioralTelemetryVector } from '../types/veloztix';

export interface SilentEvaluationResult {
  fraudScore: number;
  buyerProfile: 'fan_directo' | 'indeciso' | 'bot_bloqueado';
  approved: boolean;
}

/**
 * Evaluación silenciosa en segundo plano del comportamiento en página
 */
export function evaluateSilentTelemetry(
  telemetry: BehavioralTelemetryVector
): SilentEvaluationResult {
  let score = 0.08;

  const {
    dwell_time_ms,
    scroll_depth_pct,
    keystroke_dynamics,
    tab_switch_count,
    pointer_events_count,
  } = telemetry;

  if (
    keystroke_dynamics.checkout_fill_time_ms > 0 &&
    keystroke_dynamics.checkout_fill_time_ms < 100 &&
    keystroke_dynamics.copy_paste_flag &&
    pointer_events_count < 3
  ) {
    score = 0.92;
  } else {
    if (keystroke_dynamics.copy_paste_flag) score += 0.14;
    if (scroll_depth_pct > 20) score -= 0.02;
    if (
      keystroke_dynamics.avg_inter_key_ms >= 60 &&
      keystroke_dynamics.avg_inter_key_ms <= 350
    ) {
      score -= 0.02;
    }
  }

  const normalizedScore = Number(Math.min(0.99, Math.max(0.02, score)).toFixed(2));

  if (normalizedScore >= 0.85) {
    return {
      fraudScore: normalizedScore,
      buyerProfile: 'bot_bloqueado',
      approved: false,
    };
  }

  const buyerProfile =
    tab_switch_count >= 2 ||
    dwell_time_ms > 35000 ||
    keystroke_dynamics.backspace_corrections >= 5
      ? 'indeciso'
      : 'fan_directo';

  return {
    fraudScore: normalizedScore,
    buyerProfile,
    approved: true,
  };
}

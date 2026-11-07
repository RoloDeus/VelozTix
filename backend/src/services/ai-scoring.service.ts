import { ProfileTag, Verdict } from '../types/domain.js';
import { AiEvaluationDto, WebBehaviorTelemetryDto } from '../types/openapi.js';

export interface IBehaviorAiEngine {
  evaluate(telemetry: WebBehaviorTelemetryDto): Promise<AiEvaluationDto>;
}

export class BehaviorAiService implements IBehaviorAiEngine {
  async evaluate(telemetry: WebBehaviorTelemetryDto): Promise<AiEvaluationDto> {
    const startTime = performance.now();

    const {
      dwell_time,
      scroll_depth,
      checkout_fill_time_ms,
      keystroke_dynamics,
      copy_paste_flag,
      tab_switch_count,
    } = telemetry;

    const linearity = keystroke_dynamics?.cursor_linearity_index ?? 0.3;
    const avgFlight = keystroke_dynamics?.avg_flight_time_ms ?? 120;

    // Directiva técnica de detección antifraude:
    // Bot si checkout_fill_time_ms < 800 O (copy_paste_flag == true con cursor_linearity_index > 0.8)
    const isBotDetected =
      checkout_fill_time_ms < 800 ||
      (copy_paste_flag === true && linearity > 0.8);

    let score = 0.08;

    if (isBotDetected) {
      score = 0.96;
    } else {
      if (copy_paste_flag) score += 0.12;
      if (linearity > 0.7) score += 0.15;
      if (scroll_depth > 20) score -= 0.03;
      if (avgFlight >= 60 && avgFlight <= 350) score -= 0.03;
      if (dwell_time < 3000) score += 0.2;
    }

    const normalizedScore = Number(Math.min(0.99, Math.max(0.02, score)).toFixed(2));
    const isBot = isBotDetected || normalizedScore >= 0.85;
    const verdict: Verdict = isBot ? 'REJECT_BOT' : 'APPROVE';

    let profileTag: ProfileTag = 'FAN_DECIDIDO';
    if (isBot) {
      profileTag = 'RIESGO_MODERADO';
    } else if (tab_switch_count >= 2 || dwell_time > 35000) {
      profileTag = 'COMPRADOR_INDECISO';
    } else if (normalizedScore >= 0.4) {
      profileTag = 'RIESGO_MODERADO';
    }

    const elapsedMs = Math.max(1, Math.round(performance.now() - startTime));

    return {
      verdict,
      risk_score: isBot ? Math.max(0.92, normalizedScore) : normalizedScore,
      profile_tag: profileTag,
      inference_latency_ms: elapsedMs,
    };
  }
}

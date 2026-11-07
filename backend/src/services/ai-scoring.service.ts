import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProfileTag, Verdict } from '../types/domain.js';
import { AiEvaluationDto, WebBehaviorTelemetryDto } from '../types/openapi.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface AiEvaluationContext {
  ticketQuantity?: number;
  ipRequests5m?: number;
}

export interface IBehaviorAiEngine {
  evaluate(
    telemetry: WebBehaviorTelemetryDto,
    context?: AiEvaluationContext
  ): Promise<AiEvaluationDto>;
}

interface RfTreeNode {
  leaf: boolean;
  prob?: number;
  feature_index?: number;
  threshold?: number;
  left?: RfTreeNode;
  right?: RfTreeNode;
}

interface IfTreeNode {
  external: boolean;
  size?: number;
  feature_index?: number;
  split?: number;
  left?: IfTreeNode;
  right?: IfTreeNode;
}

interface TrainedBaselineArtifact {
  model_name: string;
  features: string[];
  decision_threshold: number;
  random_forest: {
    trees: RfTreeNode[];
  };
  isolation_forest: {
    c_norm: number;
    trees: IfTreeNode[];
  };
}

/**
 * Motor de Inferencia IA de Comportamiento y Antifraude (VelozTix Behavior & Fraud Intelligence).
 * Ejecuta el artefacto entrenado en Python (`ai_service/models/baseline_rf_iforest_model.json`:
 * Random Forest Classifier 25 árboles + Isolation Forest 25 árboles) o invoca el microservicio
 * FastAPI (`AI_SERVICE_URL`), garantizando un SLA < 80 ms para detección de bots, compras masivas
 * y patrones de scalping.
 */
export class BehaviorAiService implements IBehaviorAiEngine {
  private artifact: TrainedBaselineArtifact | null = null;
  private fingerprintWindow = new Map<string, number[]>();
  private fastApiUrl = process.env.AI_SERVICE_URL || '';

  constructor() {
    this.loadModelArtifact();
  }

  private loadModelArtifact(): void {
    const candidatePaths = [
      path.resolve(__dirname, '../../../ai_service/models/baseline_rf_iforest_model.json'),
      path.resolve(process.cwd(), 'ai_service/models/baseline_rf_iforest_model.json'),
      path.resolve(process.cwd(), '../ai_service/models/baseline_rf_iforest_model.json'),
    ];

    for (const p of candidatePaths) {
      try {
        if (fs.existsSync(p)) {
          const raw = fs.readFileSync(p, 'utf8');
          this.artifact = JSON.parse(raw) as TrainedBaselineArtifact;
          break;
        }
      } catch {
        // Continúa al siguiente candidato si no se puede leer
      }
    }
  }

  private static cFactor(n: number): number {
    if (n <= 1) return 0;
    if (n === 2) return 1;
    return 2.0 * (Math.log(n - 1.0) + 0.5772156649) - (2.0 * (n - 1.0)) / n;
  }

  private evalRfTree(node: RfTreeNode, vec: number[]): number {
    let curr = node;
    while (!curr.leaf) {
      const val = vec[curr.feature_index ?? 0];
      curr = val <= (curr.threshold ?? 0) ? curr.left! : curr.right!;
    }
    return curr.prob ?? 0;
  }

  private evalIfTreePath(node: IfTreeNode, vec: number[]): number {
    let curr = node;
    let h = 0;
    while (!curr.external) {
      h += 1;
      const val = vec[curr.feature_index ?? 0];
      curr = val < (curr.split ?? 0) ? curr.left! : curr.right!;
    }
    return h + BehaviorAiService.cFactor(curr.size ?? 1);
  }

  private recordBurstRequest(fingerprint: string): number {
    const now = Date.now();
    const cutoff = now - 5 * 60 * 1000;
    const prev = (this.fingerprintWindow.get(fingerprint) || []).filter((t) => t >= cutoff);
    prev.push(now);
    this.fingerprintWindow.set(fingerprint, prev);
    return prev.length;
  }

  async evaluate(
    telemetry: WebBehaviorTelemetryDto,
    context?: AiEvaluationContext
  ): Promise<AiEvaluationDto> {
    const startTime = performance.now();

    // Si se configuró explícitamente el microservicio FastAPI externo y está activo, consultarlo con timeout de 45ms
    if (this.fastApiUrl) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 45);
        const res = await fetch(`${this.fastApiUrl}/api/v1/ai/evaluate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...telemetry,
            ticket_quantity: context?.ticketQuantity ?? 1,
            ip_requests_5m: context?.ipRequests5m ?? 1,
          }),
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (res.ok) {
          const data = (await res.json()) as AiEvaluationDto;
          return data;
        }
      } catch {
        // Fallback inmediato en memoria al artefacto entrenado
      }
    }

    const {
      dwell_time,
      scroll_depth,
      checkout_fill_time_ms,
      keystroke_dynamics,
      copy_paste_flag,
      tab_switch_count,
      device_fingerprint,
    } = telemetry;

    const linearity = keystroke_dynamics?.cursor_linearity_index ?? 0.3;
    const avgFlight = keystroke_dynamics?.avg_flight_time_ms ?? 120;
    const copyPasteNum = copy_paste_flag ? 1.0 : 0.0;
    const ticketQty = context?.ticketQuantity ?? 1;
    const burstHits = context?.ipRequests5m ?? this.recordBurstRequest(device_fingerprint || 'dfp_anon');

    const pointerVelocity = linearity > 0.8 ? 3200.0 : 460.0;
    const backspaceCorrections = copy_paste_flag ? 0 : 1;
    const sessionInactivityMs =
      checkout_fill_time_ms < 800 ? 40.0 : Math.min(dwell_time * 0.25, 15000.0);

    // Vector de 13 características idéntico a `ai_service/train_baseline.py`
    const featureVector: number[] = [
      dwell_time,
      scroll_depth,
      pointerVelocity,
      checkout_fill_time_ms,
      avgFlight,
      linearity,
      copyPasteNum,
      backspaceCorrections,
      tab_switch_count,
      sessionInactivityMs,
      0, // failed_order_retries
      burstHits,
      ticketQty,
    ];

    let ensembleScore = 0.08;

    if (this.artifact && this.artifact.random_forest.trees.length > 0) {
      const rfTrees = this.artifact.random_forest.trees;
      const rfProb =
        rfTrees.reduce((acc, tree) => acc + this.evalRfTree(tree, featureVector), 0) /
        rfTrees.length;

      const ifTrees = this.artifact.isolation_forest.trees;
      const cNorm = this.artifact.isolation_forest.c_norm || 1;
      const avgPath =
        ifTrees.reduce((acc, tree) => acc + this.evalIfTreePath(tree, featureVector), 0) /
        ifTrees.length;
      const ifAnomaly = Math.pow(2.0, -avgPath / cNorm);
      const ifScaled = Math.max(0.0, Math.min(1.0, (ifAnomaly - 0.35) / 0.45));

      ensembleScore = 0.78 * rfProb + 0.22 * ifScaled;
    } else {
      if (copy_paste_flag) ensembleScore += 0.12;
      if (linearity > 0.7) ensembleScore += 0.15;
      if (scroll_depth > 20) ensembleScore -= 0.03;
      if (avgFlight >= 60 && avgFlight <= 350) ensembleScore -= 0.03;
      if (dwell_time < 3000) ensembleScore += 0.2;
    }

    // Directivas técnicas antifraude y anti-scalping:
    // 1. Bot si checkout_fill_time_ms < 800 O (copy_paste_flag == true con cursor_linearity_index > 0.8)
    // 2. Patrón de compras masivas / scalping si ráfaga >= 12 peticiones con >= 5 boletos o >= 20 peticiones por huella
    const isBotDetected =
      checkout_fill_time_ms < 800 ||
      (copy_paste_flag === true && linearity > 0.8) ||
      (burstHits >= 12 && ticketQty >= 5) ||
      burstHits >= 20;

    if (isBotDetected) {
      ensembleScore = Math.max(0.96, ensembleScore);
    }

    const normalizedScore = Number(Math.min(0.99, Math.max(0.02, ensembleScore)).toFixed(2));
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

#!/usr/bin/env python3
"""
VelozTix — Microservicio de IA de Análisis de Comportamiento y Antifraude (FastAPI)
===================================================================================
Cátedra: Desarrollo de Software Fintech (UCAB) — Prof. José Leonardo González Villanueva
Equipo A: Rolando Rodrigo Varela, Jesús Acosta, Leonel Rojas (Responsable IA)

Implementa el Recurso Clave descrito en la Sección 5 y 6.7 del Documento de Concepto:
  - Microservicio de IA en Python con FastAPI para inferencia en tiempo real (< 80 ms)
  - Carga el modelo entrenado `models/baseline_rf_iforest_model.json` (Random Forest + Isolation Forest)
  - Expone endpoints REST:
      * POST /api/v1/ai/evaluate        -> Evaluación antifraude y segmentación B2B de sesión
      * GET  /api/v1/ai/model-metrics   -> Métricas de entrenamiento, ROC-AUC, F1 e importancia Gini
      * GET  /api/v1/ai/dataset-summary -> Estadísticas y diccionario del dataset sintético normalizado
      * GET  /health                    -> Estado operativo del motor de IA

Ejecución:
  - Con FastAPI/Uvicorn instalado: `uvicorn ai_service.app:app --host 0.0.0.0 --port 8001 --reload`
  - Directamente con Python: `python ai_service/app.py` (levanta Uvicorn si está instalado, o servidor ASGI/HTTP compatible en el puerto 8001).
"""

from __future__ import annotations

import json
import math
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any, Dict, List, Optional

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "models" / "baseline_rf_iforest_model.json"
METRICS_PATH = BASE_DIR / "models" / "evaluation_metrics.json"
STATS_PATH = BASE_DIR / "dataset" / "normalization_stats.json"


# ============================================================================
# Motor de Inferencia en Memoria (< 5 ms) sobre el Artefacto Entrenado
# ============================================================================
class BehaviorFraudEngine:
    def __init__(self, model_path: Path = MODEL_PATH):
        if not model_path.exists():
            from train_baseline import main as train_main
            train_main()

        with model_path.open("r", encoding="utf-8") as f:
            self.artifact: Dict[str, Any] = json.load(f)

        self.features: List[str] = self.artifact["features"]
        self.rf_trees: List[Dict[str, Any]] = self.artifact["random_forest"]["trees"]
        self.if_trees: List[Dict[str, Any]] = self.artifact["isolation_forest"]["trees"]
        self.c_norm: float = float(self.artifact["isolation_forest"]["c_norm"])
        self.threshold: float = float(self.artifact.get("decision_threshold", 0.85))
        self.norm_stats: Dict[str, Any] = self.artifact.get("normalization_stats", {})

        # Ventana deslizante en memoria para detección de compras masivas / scalping por huella o hash
        self._recent_fingerprint_hits: Dict[str, List[float]] = {}

    @staticmethod
    def _c_factor(n: int) -> float:
        if n <= 1:
            return 0.0
        if n == 2:
            return 1.0
        return 2.0 * (math.log(n - 1.0) + 0.5772156649) - (2.0 * (n - 1.0) / n)

    def _predict_rf_tree(self, node: Dict[str, Any], vec: List[float]) -> float:
        curr = node
        while not curr.get("leaf", False):
            val = vec[int(curr["feature_index"])]
            curr = curr["left"] if val <= float(curr["threshold"]) else curr["right"]
        return float(curr["prob"])

    def _path_if_tree(self, node: Dict[str, Any], vec: List[float]) -> float:
        curr = node
        h = 0.0
        while not curr.get("external", False):
            h += 1.0
            val = vec[int(curr["feature_index"])]
            curr = curr["left"] if val < float(curr["split"]) else curr["right"]
        return h + self._c_factor(int(curr.get("size", 1)))

    def _track_burst_frequency(self, device_fingerprint: str) -> int:
        now = time.time()
        window_start = now - 300.0  # ventana de 5 minutos
        history = [t for t in self._recent_fingerprint_hits.get(device_fingerprint, []) if t >= window_start]
        history.append(now)
        self._recent_fingerprint_hits[device_fingerprint] = history
        return len(history)

    def evaluate_telemetry(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        start_ns = time.perf_counter_ns()

        kd = payload.get("keystroke_dynamics") or {}
        dwell_time = float(payload.get("dwell_time", 12000))
        scroll_depth = float(payload.get("scroll_depth", 50.0))
        checkout_fill_time_ms = float(payload.get("checkout_fill_time_ms", 5000))
        avg_flight_time_ms = float(kd.get("avg_flight_time_ms", 120.0))
        cursor_linearity_index = float(kd.get("cursor_linearity_index", 0.30))
        copy_paste_flag = 1.0 if payload.get("copy_paste_flag", False) else 0.0
        tab_switch_count = float(payload.get("tab_switch_count", 0))
        device_fingerprint = str(payload.get("device_fingerprint", "dfp_anonymous"))

        # Variables extendidas del Documento de Concepto (Sección 5) con defaults orgánicos si vienen del DTO mínimo
        pointer_velocity = float(
            payload.get(
                "pointer_velocity_px_s",
                3200.0 if cursor_linearity_index > 0.80 else 460.0,
            )
        )
        backspace_corrections = float(
            payload.get("backspace_corrections", 0.0 if copy_paste_flag >= 1.0 else 1.0)
        )
        session_inactivity_ms = float(
            payload.get(
                "session_inactivity_ms",
                40.0 if checkout_fill_time_ms < 800 else min(dwell_time * 0.25, 15000.0),
            )
        )
        failed_order_retries = float(payload.get("failed_order_retries", 0.0))
        tracked_burst = self._track_burst_frequency(device_fingerprint)
        ip_requests_5m = float(payload.get("ip_requests_5m", max(1, tracked_burst)))
        ticket_quantity = float(payload.get("ticket_quantity", 1.0))

        feature_map = {
            "dwell_time": dwell_time,
            "scroll_depth": scroll_depth,
            "pointer_velocity_px_s": pointer_velocity,
            "checkout_fill_time_ms": checkout_fill_time_ms,
            "avg_flight_time_ms": avg_flight_time_ms,
            "cursor_linearity_index": cursor_linearity_index,
            "copy_paste_flag": copy_paste_flag,
            "backspace_corrections": backspace_corrections,
            "tab_switch_count": tab_switch_count,
            "session_inactivity_ms": session_inactivity_ms,
            "failed_order_retries": failed_order_retries,
            "ip_requests_5m": ip_requests_5m,
            "ticket_quantity": ticket_quantity,
        }

        vec = [feature_map[f] for f in self.features]

        # 1. Probabilidad Supervisada (Random Forest Classifier - 25 árboles)
        rf_prob = (
            sum(self._predict_rf_tree(t, vec) for t in self.rf_trees) / len(self.rf_trees)
            if self.rf_trees
            else 0.1
        )

        # 2. Score de Anomalía No Supervisado (Isolation Forest - 25 árboles)
        if self.if_trees and self.c_norm > 0:
            avg_path = sum(self._path_if_tree(t, vec) for t in self.if_trees) / len(self.if_trees)
            if_anomaly = math.pow(2.0, -avg_path / self.c_norm)
        else:
            if_anomaly = 0.35

        if_scaled = max(0.0, min(1.0, (if_anomaly - 0.35) / 0.45))

        # 3. Reglas invariantes de política de seguridad (Bots y Acaparamiento Masivo / Scalping)
        is_bot_speed = checkout_fill_time_ms < 800
        is_linear_paste_bot = copy_paste_flag >= 1.0 and cursor_linearity_index > 0.80
        is_mass_scalping = (ip_requests_5m >= 12 and ticket_quantity >= 5) or ip_requests_5m >= 20

        ensemble_score = 0.78 * rf_prob + 0.22 * if_scaled

        if is_bot_speed or is_linear_paste_bot or is_mass_scalping:
            ensemble_score = max(0.95, ensemble_score)

        risk_score = round(max(0.02, min(0.99, ensemble_score)), 2)
        is_rejected = is_bot_speed or is_linear_paste_bot or is_mass_scalping or risk_score >= self.threshold
        verdict = "REJECT_BOT" if is_rejected else "APPROVE"

        # 4. Clasificación Comercial B2B (Sección 5 Documento de Concepto)
        if is_rejected or risk_score >= 0.40:
            profile_tag = "RIESGO_MODERADO"
        elif tab_switch_count >= 2 or dwell_time > 35000:
            profile_tag = "COMPRADOR_INDECISO"
        else:
            profile_tag = "FAN_DECIDIDO"

        elapsed_ms = max(1, int(round((time.perf_counter_ns() - start_ns) / 1_000_000)))

        return {
            "verdict": verdict,
            "risk_score": risk_score,
            "profile_tag": profile_tag,
            "inference_latency_ms": elapsed_ms,
            "model_details": {
                "algorithm": "RandomForest(25) + IsolationForest(25)",
                "rf_probability": round(rf_prob, 4),
                "isolation_anomaly_score": round(if_anomaly, 4),
                "scalping_burst_detected": is_mass_scalping,
            },
        }


engine = BehaviorFraudEngine()

# ============================================================================
# Definición FastAPI (si está instalado en el entorno) + Fallback HTTP Nativo
# ============================================================================
try:
    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel, Field

    class KeystrokeDynamicsSchema(BaseModel):
        avg_flight_time_ms: Optional[float] = Field(default=120.0, ge=0)
        cursor_linearity_index: Optional[float] = Field(default=0.30, ge=0.0, le=1.0)

    class TelemetryEvaluationRequest(BaseModel):
        dwell_time: int = Field(..., ge=0, description="Tiempo de permanencia en página (ms)")
        scroll_depth: float = Field(..., ge=0.0, le=100.0, description="Profundidad de scroll (%)")
        checkout_fill_time_ms: int = Field(..., ge=0, description="Tiempo de llenado del checkout (ms)")
        keystroke_dynamics: KeystrokeDynamicsSchema = Field(default_factory=KeystrokeDynamicsSchema)
        copy_paste_flag: bool = Field(default=False, description="Uso de copiar/pegar en formulario")
        tab_switch_count: int = Field(default=0, ge=0, description="Cambios de pestaña en la sesión")
        device_fingerprint: str = Field(..., description="Huella anonimizada del dispositivo (dfp_*)")
        pointer_velocity_px_s: Optional[float] = Field(default=None, ge=0)
        backspace_corrections: Optional[int] = Field(default=None, ge=0)
        session_inactivity_ms: Optional[int] = Field(default=None, ge=0)
        failed_order_retries: Optional[int] = Field(default=0, ge=0)
        ip_requests_5m: Optional[int] = Field(default=1, ge=1)
        ticket_quantity: Optional[int] = Field(default=1, ge=1, le=10)

    app = FastAPI(
        title="VelozTix Behavior & Fraud Intelligence Microservice",
        description=(
            "Microservicio comercializable de IA (Random Forest + Isolation Forest) para detección "
            "de bots, compras masivas (scalping) y analítica de comportamiento en < 80 ms."
        ),
        version="1.0.0",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_Methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health_check() -> Dict[str, Any]:
        return {
            "status": "ok",
            "service": "veloztix-ai-fastapi",
            "model_loaded": engine.artifact["model_name"],
            "trees_count": len(engine.rf_trees) + len(engine.if_trees),
        }

    @app.post("/api/v1/ai/evaluate")
    def evaluate_session(req: TelemetryEvaluationRequest) -> Dict[str, Any]:
        payload = req.model_dump() if hasattr(req, "model_dump") else req.dict()
        return engine.evaluate_telemetry(payload)

    @app.get("/api/v1/ai/model-metrics")
    def get_model_metrics() -> Dict[str, Any]:
        with METRICS_PATH.open("r", encoding="utf-8") as f:
            return json.load(f)

    @app.get("/api/v1/ai/dataset-summary")
    def get_dataset_summary() -> Dict[str, Any]:
        with STATS_PATH.open("r", encoding="utf-8") as f:
            return json.load(f)

    FASTAPI_AVAILABLE = True

except ImportError:
    app = None
    FASTAPI_AVAILABLE = False


class _FallbackHttpHandler(BaseHTTPRequestHandler):
    def _send_json(self, status: int, data: Dict[str, Any]) -> None:
        raw = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:
        if self.path == "/health":
            self._send_json(
                200,
                {
                    "status": "ok",
                    "service": "veloztix-ai-microservice",
                    "model_loaded": engine.artifact["model_name"],
                    "trees_count": len(engine.rf_trees) + len(engine.if_trees),
                },
            )
        elif self.path == "/api/v1/ai/model-metrics":
            with METRICS_PATH.open("r", encoding="utf-8") as f:
                self._send_json(200, json.load(f))
        elif self.path == "/api/v1/ai/dataset-summary":
            with STATS_PATH.open("r", encoding="utf-8") as f:
                self._send_json(200, json.load(f))
        else:
            self._send_json(404, {"error": "Not found"})

    def do_POST(self) -> None:
        if self.path == "/api/v1/ai/evaluate":
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
            result = engine.evaluate_telemetry(body)
            self._send_json(200, result)
        else:
            self._send_json(404, {"error": "Not found"})


if __name__ == "__main__":
    port = 8001
    if FASTAPI_AVAILABLE:
        import uvicorn
        uvicorn.run(app, host="127.0.0.1", port=port)
    else:
        print(f"[VelozTix AI Microservice] Escuchando en http://127.0.0.1:{port}")
        server = HTTPServer(("127.0.0.1", port), _FallbackHttpHandler)
        server.serve_forever()


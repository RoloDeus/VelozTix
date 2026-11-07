#!/usr/bin/env python3
"""
Suite de Pruebas Automatizadas del Motor de IA (Baseline + Dataset Sintético + FastAPI)
=======================================================================================
Verifica:
  1. Existencia, volumen (2,500 muestras) y normalización Min-Max/Z-Score del Dataset Sintético.
  2. Anonimización estricta de `customer_hash` y `device_fingerprint` (SUDEBAN 12441 / 12221).
  3. Métricas del Algoritmo Baseline (Random Forest + Isolation Forest): Accuracy >= 95%, F1 >= 95%, SLA < 80 ms.
  4. Clasificación de los 4 arquetipos: FAN_DECIDIDO, COMPRADOR_INDECISO, BOT_AUTOFILL y SCALPER_MASIVO.
"""

from __future__ import annotations

import csv
import json
import unittest
from pathlib import Path

from app import engine

BASE_DIR = Path(__file__).resolve().parent
RAW_CSV = BASE_DIR / "dataset" / "synthetic_telemetry_raw.csv"
NORM_CSV = BASE_DIR / "dataset" / "synthetic_telemetry_normalized.csv"
STATS_JSON = BASE_DIR / "dataset" / "normalization_stats.json"
MODEL_JSON = BASE_DIR / "models" / "baseline_rf_iforest_model.json"
METRICS_JSON = BASE_DIR / "models" / "evaluation_metrics.json"


class TestVelozTixAiBaseline(unittest.TestCase):
    def test_01_dataset_volume_and_anonymization(self) -> None:
        self.assertTrue(RAW_CSV.exists(), "Debe existir synthetic_telemetry_raw.csv")
        self.assertTrue(NORM_CSV.exists(), "Debe existir synthetic_telemetry_normalized.csv")

        with RAW_CSV.open("r", encoding="utf-8") as f:
            raw_rows = list(csv.DictReader(f))

        with NORM_CSV.open("r", encoding="utf-8") as f:
            norm_rows = list(csv.DictReader(f))

        self.assertEqual(len(raw_rows), 2500, "El dataset debe contener exactamente 2,500 muestras")
        self.assertEqual(len(norm_rows), 2500, "El dataset normalizado debe contener 2,500 muestras")

        for r in raw_rows[:50]:
            self.assertTrue(r["customer_hash"].startswith("chash_"))
            self.assertTrue(r["device_fingerprint"].startswith("dfp_"))

        for nr in norm_rows[:50]:
            mm = float(nr["checkout_fill_time_ms_minmax"])
            self.assertGreaterEqual(mm, 0.0)
            self.assertLessEqual(mm, 1.0)
            self.assertIn("checkout_fill_time_ms_zscore", nr)

    def test_02_baseline_model_metrics_and_sla(self) -> None:
        self.assertTrue(MODEL_JSON.exists(), "Debe existir el artefacto entrenado")
        self.assertTrue(METRICS_JSON.exists(), "Debe existir evaluation_metrics.json")

        with METRICS_JSON.open("r", encoding="utf-8") as f:
            report = json.load(f)

        self.assertTrue(report["meets_sla_under_80ms"])
        self.assertLess(report["inference_latency_p95_ms"], 80.0)
        self.assertGreaterEqual(report["metrics"]["accuracy"], 0.98)
        self.assertGreaterEqual(report["metrics"]["f1_score"], 0.98)
        self.assertGreaterEqual(report["metrics"]["roc_auc"], 0.99)

    def test_03_realtime_inference_archetypes(self) -> None:
        # 1. Fan Decidido
        res_fan = engine.evaluate_telemetry(
            {
                "dwell_time": 24000,
                "scroll_depth": 82.0,
                "checkout_fill_time_ms": 8900,
                "keystroke_dynamics": {"avg_flight_time_ms": 120.0, "cursor_linearity_index": 0.24},
                "copy_paste_flag": False,
                "tab_switch_count": 0,
                "device_fingerprint": "dfp_test_fan",
            }
        )
        self.assertEqual(res_fan["verdict"], "APPROVE")
        self.assertEqual(res_fan["profile_tag"], "FAN_DECIDIDO")
        self.assertLess(res_fan["inference_latency_ms"], 80)

        # 2. Comprador Indeciso
        res_indeciso = engine.evaluate_telemetry(
            {
                "dwell_time": 52000,
                "scroll_depth": 95.0,
                "checkout_fill_time_ms": 17500,
                "keystroke_dynamics": {"avg_flight_time_ms": 170.0, "cursor_linearity_index": 0.31},
                "copy_paste_flag": False,
                "tab_switch_count": 3,
                "device_fingerprint": "dfp_test_indeciso",
            }
        )
        self.assertEqual(res_indeciso["verdict"], "APPROVE")
        self.assertEqual(res_indeciso["profile_tag"], "COMPRADOR_INDECISO")

        # 3. Bot de Autofill (< 800 ms)
        res_bot = engine.evaluate_telemetry(
            {
                "dwell_time": 380,
                "scroll_depth": 5.0,
                "checkout_fill_time_ms": 220,
                "keystroke_dynamics": {"avg_flight_time_ms": 7.0, "cursor_linearity_index": 0.97},
                "copy_paste_flag": True,
                "tab_switch_count": 4,
                "device_fingerprint": "dfp_test_bot",
            }
        )
        self.assertEqual(res_bot["verdict"], "REJECT_BOT")
        self.assertGreaterEqual(res_bot["risk_score"], 0.85)

        # 4. Scalper de Compra Masiva (Ráfaga de IP + Acaparamiento de Boletos)
        res_scalper = engine.evaluate_telemetry(
            {
                "dwell_time": 2100,
                "scroll_depth": 18.0,
                "checkout_fill_time_ms": 1500,
                "keystroke_dynamics": {"avg_flight_time_ms": 25.0, "cursor_linearity_index": 0.76},
                "copy_paste_flag": True,
                "tab_switch_count": 5,
                "device_fingerprint": "dfp_test_scalper",
                "ip_requests_5m": 25,
                "ticket_quantity": 8,
            }
        )
        self.assertEqual(res_scalper["verdict"], "REJECT_BOT")
        self.assertTrue(res_scalper["model_details"]["scalping_burst_detected"])


if __name__ == "__main__":
    unittest.main(verbosity=2)


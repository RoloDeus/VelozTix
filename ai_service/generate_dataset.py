#!/usr/bin/env python3
"""
VelozTix — Generador del Dataset Sintético Estructurado de Telemetría Web Anonimizada
=====================================================================================
Cátedra: Desarrollo de Software Fintech (UCAB)
Equipo A: Rolando Rodrigo Varela, Jesús Acosta, Leonel Rojas (Responsable IA)

Genera un volumen de 2,500 muestras sintéticas realistas basadas en las 4 categorías
de telemetría del Documento de Concepto (Sección 5):
  1. Navegación e Interacción UI (dwell_time, scroll_depth, pointer_velocity_px_s)
  2. Dinámica en el Formulario de Orden (checkout_fill_time_ms, avg_flight_time_ms,
     cursor_linearity_index, copy_paste_flag, backspace_corrections)
  3. Contexto de Sesión y Atención (tab_switch_count, session_inactivity_ms,
     failed_order_retries)
  4. Velocidad de Red y Acaparamiento (ip_requests_5m, ticket_quantity,
     customer_hash, device_fingerprint, geo_region_code)

Perfiles simulados:
  - FAN_DECIDIDO (46% -> 1,150 muestras): Comprador humano orgánico directo.
  - COMPRADOR_INDECISO (24% -> 600 muestras): Humano que compara precios, cambia de pestaña y corrige campos.
  - BOT_AUTOFILL (16% -> 400 muestras): Script automatizado con llenado < 800 ms y trayectoria lineal > 0.80.
  - SCALPER_MASIVO (14% -> 350 muestras): Acaparador de entradas con alta frecuencia por IP/dispositivo y múltiples boletos.

Salidas generadas en `ai_service/dataset/`:
  - synthetic_telemetry_raw.csv: Datos con unidades originales y hashes anonimizados.
  - synthetic_telemetry_normalized.csv: Datos numéricos normalizados (Min-Max [0,1] y Z-Score).
  - normalization_stats.json: Parámetros estadísticos (min, max, mean, std) por variable.
"""

from __future__ import annotations

import csv
import hashlib
import json
import math
import random
from pathlib import Path
from typing import Dict, List, Any

SEED = 20261107
TOTAL_SAMPLES = 2500
PRIVACY_SALT = "veloztix_ucab_fintech_privacy_salt_2026"

NUMERIC_FEATURES = [
    "dwell_time",
    "scroll_depth",
    "pointer_velocity_px_s",
    "checkout_fill_time_ms",
    "avg_flight_time_ms",
    "cursor_linearity_index",
    "copy_paste_flag",
    "backspace_corrections",
    "tab_switch_count",
    "session_inactivity_ms",
    "failed_order_retries",
    "ip_requests_5m",
    "ticket_quantity",
]

EVENTS = [
    "evt-cyberfest-26",
    "evt-sunset-vinyl",
    "evt-standup-chacao",
    "evt-neon-rave",
    "evt_ucab_fest_2026",
]

GEO_REGIONS = ["VE-DC", "VE-MI", "VE-CA", "VE-ZU", "VE-LA", "VE-AR"]


def sha256_salted(prefix: str, raw_value: str) -> str:
    digest = hashlib.sha256(f"{PRIVACY_SALT}:{raw_value}".encode("utf-8")).hexdigest()
    return f"{prefix}_{digest[:16]}"


def clamp(val: float, low: float, high: float) -> float:
    return max(low, min(high, val))


def generate_sample(idx: int, rng: random.Random, scalper_pool: List[tuple[str, str]]) -> Dict[str, Any]:
    """Genera una muestra sintética estructurada según la distribución de clases."""
    u = idx / TOTAL_SAMPLES

    if u < 0.46:
        archetype = "FAN_DECIDIDO"
    elif u < 0.70:
        archetype = "COMPRADOR_INDECISO"
    elif u < 0.86:
        archetype = "BOT_AUTOFILL"
    else:
        archetype = "SCALPER_MASIVO"

    session_id = f"ses_vz_{idx + 1:05d}_{rng.randint(1000, 9999)}"
    event_id = rng.choice(EVENTS)
    geo_region = rng.choices(GEO_REGIONS, weights=[0.48, 0.24, 0.10, 0.08, 0.05, 0.05])[0]

    if archetype == "FAN_DECIDIDO":
        customer_hash = sha256_salted("chash", f"V-{rng.randint(18000000, 31999999)}")
        device_fingerprint = sha256_salted("dfp", f"human_dev_{idx}_{rng.randint(1, 999999)}")

        # En un 4% de los casos de humanos muy rápidos (autofill de navegador legítimo pero con scroll y mouse orgánico)
        is_borderline_fast = rng.random() < 0.04
        dwell_time = int(clamp(rng.gauss(24500, 6200), 2800, 42000)) if not is_borderline_fast else int(rng.uniform(2200, 4500))
        scroll_depth = round(clamp(rng.gauss(78.0, 14.0), 35.0, 100.0), 2)
        pointer_velocity = round(clamp(rng.gauss(480.0, 140.0), 140.0, 1100.0), 2)
        checkout_fill_time_ms = int(clamp(rng.gauss(8900, 2300), 3200, 18000)) if not is_borderline_fast else int(rng.uniform(1100, 2400))
        avg_flight_time_ms = round(clamp(rng.gauss(125.0, 28.0), 65.0, 240.0), 2)
        cursor_linearity_index = round(clamp(rng.gauss(0.26, 0.09), 0.08, 0.58), 4) if not is_borderline_fast else round(rng.uniform(0.62, 0.78), 4)
        copy_paste_flag = 1 if (rng.random() < 0.06 or is_borderline_fast) else 0
        backspace_corrections = rng.choices([0, 1, 2, 3], weights=[0.45, 0.35, 0.15, 0.05])[0]
        tab_switch_count = rng.choices([0, 1], weights=[0.82, 0.18])[0]
        session_inactivity_ms = int(clamp(rng.gauss(1400, 650), 150, 4500))
        failed_order_retries = rng.choices([0, 1], weights=[0.94, 0.06])[0]
        ip_requests_5m = rng.choices([1, 2, 3], weights=[0.78, 0.17, 0.05])[0] if not is_borderline_fast else rng.randint(4, 10)
        ticket_quantity = rng.choices([1, 2, 3, 4], weights=[0.42, 0.38, 0.14, 0.06])[0]

        is_fraud_or_bot = 0
        verdict = "APPROVE"
        profile_tag = "FAN_DECIDIDO"

    elif archetype == "COMPRADOR_INDECISO":
        customer_hash = sha256_salted("chash", f"V-{rng.randint(12000000, 30999999)}")
        device_fingerprint = sha256_salted("dfp", f"indeciso_dev_{idx}_{rng.randint(1, 999999)}")

        dwell_time = int(clamp(rng.gauss(54000, 14500), 35500, 115000))
        scroll_depth = round(clamp(rng.gauss(91.0, 8.5), 60.0, 100.0), 2)
        pointer_velocity = round(clamp(rng.gauss(340.0, 110.0), 95.0, 780.0), 2)
        checkout_fill_time_ms = int(clamp(rng.gauss(18500, 5200), 9500, 38000))
        avg_flight_time_ms = round(clamp(rng.gauss(185.0, 45.0), 95.0, 340.0), 2)
        cursor_linearity_index = round(clamp(rng.gauss(0.31, 0.11), 0.10, 0.64), 4)
        copy_paste_flag = 1 if rng.random() < 0.18 else 0
        backspace_corrections = rng.randint(3, 11)
        tab_switch_count = rng.randint(2, 6)
        session_inactivity_ms = int(clamp(rng.gauss(12500, 4800), 4200, 32000))
        failed_order_retries = rng.choices([0, 1, 2], weights=[0.65, 0.25, 0.10])[0]
        ip_requests_5m = rng.choices([1, 2, 3, 4], weights=[0.55, 0.30, 0.10, 0.05])[0]
        ticket_quantity = rng.choices([1, 2, 3], weights=[0.55, 0.35, 0.10])[0]

        is_fraud_or_bot = 0
        verdict = "APPROVE"
        profile_tag = "COMPRADOR_INDECISO"

    elif archetype == "BOT_AUTOFILL":
        customer_hash = sha256_salted("chash", f"V-99{rng.randint(100000, 999999)}")
        device_fingerprint = sha256_salted("dfp", f"headless_bot_{rng.randint(1, 60)}")

        dwell_time = int(clamp(rng.gauss(620, 290), 80, 1850))
        scroll_depth = round(clamp(rng.gauss(6.5, 5.5), 0.0, 22.0), 2)
        pointer_velocity = round(clamp(rng.gauss(3400.0, 680.0), 1900.0, 5800.0), 2)
        checkout_fill_time_ms = int(clamp(rng.gauss(340, 165), 45, 760))
        avg_flight_time_ms = round(clamp(rng.gauss(9.5, 4.5), 1.0, 25.0), 2)
        cursor_linearity_index = round(clamp(rng.gauss(0.94, 0.04), 0.83, 0.999), 4)
        copy_paste_flag = 1 if rng.random() < 0.92 else 0
        backspace_corrections = 0
        tab_switch_count = rng.choices([0, 1, 4, 6], weights=[0.40, 0.20, 0.20, 0.20])[0]
        session_inactivity_ms = int(clamp(rng.gauss(35, 20), 0, 120))
        failed_order_retries = rng.randint(1, 6)
        ip_requests_5m = rng.randint(14, 55)
        ticket_quantity = rng.choices([2, 4, 6, 8, 10], weights=[0.10, 0.25, 0.25, 0.20, 0.20])[0]

        is_fraud_or_bot = 1
        verdict = "REJECT_BOT"
        profile_tag = "RIESGO_MODERADO"

    else:  # SCALPER_MASIVO (acaparamiento y compras masivas en ráfaga)
        customer_hash, device_fingerprint = rng.choice(scalper_pool)

        is_stealth_scalper = rng.random() < 0.06
        dwell_time = int(clamp(rng.gauss(1950, 720), 450, 4100)) if not is_stealth_scalper else int(rng.uniform(4500, 9500))
        scroll_depth = round(clamp(rng.gauss(16.0, 8.0), 0.0, 38.0), 2) if not is_stealth_scalper else round(rng.uniform(35.0, 65.0), 2)
        pointer_velocity = round(clamp(rng.gauss(2150.0, 520.0), 1150.0, 4200.0), 2) if not is_stealth_scalper else round(rng.uniform(600.0, 1150.0), 2)
        # Algunos scalpers usan macros (<800ms) y otros scripts de pegado rápido (800-2400ms) con alta linealidad
        if rng.random() < 0.50 and not is_stealth_scalper:
            checkout_fill_time_ms = int(clamp(rng.gauss(520, 140), 180, 780))
        else:
            checkout_fill_time_ms = int(clamp(rng.gauss(1450, 420), 810, 4200))
        avg_flight_time_ms = round(clamp(rng.gauss(24.0, 10.0), 4.0, 52.0), 2) if not is_stealth_scalper else round(rng.uniform(55.0, 95.0), 2)
        cursor_linearity_index = round(clamp(rng.gauss(0.89, 0.05), 0.81, 0.99), 4) if not is_stealth_scalper else round(rng.uniform(0.68, 0.79), 4)
        copy_paste_flag = 1 if not is_stealth_scalper else (1 if rng.random() < 0.5 else 0)
        backspace_corrections = rng.choices([0, 1], weights=[0.90, 0.10])[0]
        tab_switch_count = rng.randint(3, 9)
        session_inactivity_ms = int(clamp(rng.gauss(140, 60), 10, 400))
        failed_order_retries = rng.randint(2, 8) if not is_stealth_scalper else rng.randint(1, 3)
        ip_requests_5m = rng.randint(18, 75) if not is_stealth_scalper else rng.randint(7, 13)
        ticket_quantity = rng.randint(6, 10) if not is_stealth_scalper else rng.randint(3, 6)

        is_fraud_or_bot = 1
        verdict = "REJECT_BOT"
        profile_tag = "RIESGO_MODERADO"

    return {
        "session_id": session_id,
        "customer_hash": customer_hash,
        "device_fingerprint": device_fingerprint,
        "event_id": event_id,
        "geo_region": geo_region,
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
        "archetype_label": archetype,
        "profile_tag": profile_tag,
        "verdict": verdict,
        "is_fraud_or_bot": is_fraud_or_bot,
    }


def compute_normalization_stats(rows: List[Dict[str, Any]]) -> Dict[str, Dict[str, float]]:
    stats: Dict[str, Dict[str, float]] = {}
    n = len(rows)
    for feat in NUMERIC_FEATURES:
        vals = [float(r[feat]) for r in rows]
        f_min = min(vals)
        f_max = max(vals)
        mean = sum(vals) / n
        variance = sum((v - mean) ** 2 for v in vals) / n
        std = math.sqrt(variance) if variance > 0 else 1.0
        stats[feat] = {
            "min": round(f_min, 6),
            "max": round(f_max, 6),
            "mean": round(mean, 6),
            "std": round(std, 6),
        }
    return stats


def build_normalized_rows(
    rows: List[Dict[str, Any]], stats: Dict[str, Dict[str, float]]
) -> List[Dict[str, Any]]:
    norm_rows: List[Dict[str, Any]] = []
    for r in rows:
        item: Dict[str, Any] = {
            "session_id": r["session_id"],
            "customer_hash": r["customer_hash"],
            "device_fingerprint": r["device_fingerprint"],
            "event_id": r["event_id"],
            "geo_region": r["geo_region"],
        }
        for feat in NUMERIC_FEATURES:
            val = float(r[feat])
            st = stats[feat]
            denom = (st["max"] - st["min"]) if (st["max"] - st["min"]) != 0 else 1.0
            minmax = (val - st["min"]) / denom
            zscore = (val - st["mean"]) / (st["std"] if st["std"] != 0 else 1.0)
            item[f"{feat}_minmax"] = round(minmax, 6)
            item[f"{feat}_zscore"] = round(zscore, 6)

        item["archetype_label"] = r["archetype_label"]
        item["profile_tag"] = r["profile_tag"]
        item["verdict"] = r["verdict"]
        item["is_fraud_or_bot"] = r["is_fraud_or_bot"]
        norm_rows.append(item)
    return norm_rows


def main() -> None:
    rng = random.Random(SEED)
    dataset_dir = Path(__file__).resolve().parent / "dataset"
    dataset_dir.mkdir(parents=True, exist_ok=True)

    # Pool de identidades repetidas para simular granjas de scalping (mismo hash/fingerprint atacando en ráfaga)
    scalper_pool = [
        (
            sha256_salted("chash", f"V-88000{i:03d}"),
            sha256_salted("dfp", f"scalper_rig_cluster_{i:02d}"),
        )
        for i in range(1, 26)
    ]

    raw_rows = [generate_sample(i, rng, scalper_pool) for i in range(TOTAL_SAMPLES)]
    rng.shuffle(raw_rows)

    stats = compute_normalization_stats(raw_rows)
    norm_rows = build_normalized_rows(raw_rows, stats)

    raw_csv_path = dataset_dir / "synthetic_telemetry_raw.csv"
    norm_csv_path = dataset_dir / "synthetic_telemetry_normalized.csv"
    stats_json_path = dataset_dir / "normalization_stats.json"

    with raw_csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(raw_rows[0].keys()))
        writer.writeheader()
        writer.writerows(raw_rows)

    with norm_csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(norm_rows[0].keys()))
        writer.writeheader()
        writer.writerows(norm_rows)

    summary_payload = {
        "dataset_name": "VelozTix Synthetic Web Behavior & Anti-Scalping Telemetry Dataset",
        "version": "1.0.0",
        "seed": SEED,
        "total_samples": TOTAL_SAMPLES,
        "class_distribution": {
            "legitimate_human_total": sum(1 for r in raw_rows if r["is_fraud_or_bot"] == 0),
            "fraud_or_bot_total": sum(1 for r in raw_rows if r["is_fraud_or_bot"] == 1),
            "by_archetype": {
                label: sum(1 for r in raw_rows if r["archetype_label"] == label)
                for label in ["FAN_DECIDIDO", "COMPRADOR_INDECISO", "BOT_AUTOFILL", "SCALPER_MASIVO"]
            },
        },
        "anonymization_scheme": {
            "customer_hash": "SHA-256(PRIVACY_SALT + national_id) prefixed with chash_",
            "device_fingerprint": "SHA-256(PRIVACY_SALT + browser_canvas_ua) prefixed with dfp_",
            "regulatory_alignment": ["SUDEBAN 12441", "SUDEBAN 12221", "Privacy by Design"],
        },
        "feature_statistics": stats,
    }

    with stats_json_path.open("w", encoding="utf-8") as f:
        json.dump(summary_payload, f, indent=2, ensure_ascii=False)

    print("================================================================================")
    print("  VELOZTIX AI - DATASET SINTÉTICO ESTRUCTURADO GENERADO EXITOSAMENTE")
    print("================================================================================")
    print(f"Total de muestras           : {TOTAL_SAMPLES}")
    print(f"Archivo Raw CSV             : {raw_csv_path}")
    print(f"Archivo Normalizado CSV     : {norm_csv_path}")
    print(f"Estadísticas Normalización  : {stats_json_path}")
    print("Distribución por Arquetipo  :", summary_payload["class_distribution"]["by_archetype"])


if __name__ == "__main__":
    main()

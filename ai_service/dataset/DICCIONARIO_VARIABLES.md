# Diccionario de Variables y Especificación del Dataset Sintético Estructurado
**Proyecto:** VelozTix — Mediador Comercial de Boletería y Motor Comercializable de IA (VelozTix Behavior & Fraud Intelligence)  
**Cátedra:** Desarrollo de Software Fintech (UCAB) — Prof. José Leonardo González Villanueva  
**Entregable 6:** Baseline de IA y Dataset Sintético Estructurado  
**Responsable:** Leonel Rojas · Equipo A (Rolando Rodrigo Varela, Jesús Acosta, Leonel Rojas)

---

## 1. Resumen del Dataset Sintético Estructurado

El dataset sintético ha sido diseñado siguiendo las **4 categorías de telemetría ética y anonimizada** definidas en la **Sección 5 del Documento de Concepto** de VelozTix, garantizando cero exposición de datos personales identificables (PII) en estricto cumplimiento de las normativas **SUDEBAN 12441 y 12221** y el principio de *Privacy by Design*.

* **Volumen total de muestras:** `2,500` sesiones estructuradas (`2,000` de entrenamiento / `500` de evaluación).
* **Archivos generados en `ai_service/dataset/`:**
  1. [`synthetic_telemetry_raw.csv`](file:///c:/Users/User/OneDrive/Desktop/VelozTix/VelozTix/ai_service/dataset/synthetic_telemetry_raw.csv): Muestras con unidades físicas reales y hashes criptográficos con sal.
  2. [`synthetic_telemetry_normalized.csv`](file:///c:/Users/User/OneDrive/Desktop/VelozTix/VelozTix/ai_service/dataset/synthetic_telemetry_normalized.csv): Muestras con todas las variables numéricas escaladas mediante **Min-Max ($[0, 1]$)** y **Z-Score ($\mu=0, \sigma=1$)**.
  3. [`normalization_stats.json`](file:///c:/Users/User/OneDrive/Desktop/VelozTix/VelozTix/ai_service/dataset/normalization_stats.json): Parámetros estadísticos ($\min, \max, \mu, \sigma$) empleados por el pipeline de inferencia.

### Distribución de Clases y Arquetipos Simulados

| Arquetipo (`archetype_label`) | Volumen (Muestras) | Proporción | Clase Objetivo (`is_fraud_or_bot`) | Veredicto (`verdict`) | Etiqueta B2B (`profile_tag`) |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **`FAN_DECIDIDO`** | 1,150 | 46.0 % | `0` (Humano Legítimo) | `APPROVE` | `FAN_DECIDIDO` |
| **`COMPRADOR_INDECISO`** | 600 | 24.0 % | `0` (Humano Legítimo) | `APPROVE` | `COMPRADOR_INDECISO` |
| **`BOT_AUTOFILL`** | 400 | 16.0 % | `1` (Bot / Automatización) | `REJECT_BOT` | `RIESGO_MODERADO` |
| **`SCALPER_MASIVO`** | 350 | 14.0 % | `1` (Acaparamiento / Scalping) | `REJECT_BOT` | `RIESGO_MODERADO` |
| **Total** | **2,500** | **100.0 %** | **70% Legítimo / 30% Fraude** | — | — |

---

## 2. Diccionario de Variables (Feature Dictionary)

### A. Identificadores Anonimizados y Contexto (Privacy by Design)

| Variable | Tipo | Ejemplo | Descripción y Esquema de Anonimización |
| :--- | :---: | :--- | :--- |
| `session_id` | `string` | `ses_vz_00142_8391` | Identificador único efímero de la sesión de telemetría en página. |
| `customer_hash` | `string` | `chash_7f83b1657ff1fc53` | Seudónimo irreversible calculado con `SHA-256(PRIVACY_SALT + national_id)`. Permite detectar compras masivas recurrentes sin conocer la cédula del comprador. |
| `device_fingerprint` | `string` | `dfp_3a91c08b4e1290fa` | Huella anonimizada del navegador/dispositivo (`SHA-256`). Identifica granjas de dispositivos y emuladores headless. |
| `event_id` | `string` | `evt-cyberfest-26` | Identificador del evento consultado en la cartelera de VelozTix. |
| `geo_region` | `string` | `VE-DC` | Código ISO regional aproximado (`VE-DC`, `VE-MI`, `VE-CA`, `VE-ZU`, `VE-LA`, `VE-AR`) para mapa de calor de demanda B2B. |

---

### B. Variables Numéricas de Telemetría Conductual (Features de Entrenamiento)

Todas las variables numéricas se encuentran normalizadas en `synthetic_telemetry_normalized.csv` bajo las columnas `<variable>_minmax` y `<variable>_zscore`:

$$\text{MinMax}(x) = \frac{x - x_{\min}}{x_{\max} - x_{\min}}, \qquad \text{Z-Score}(x) = \frac{x - \mu}{\sigma}$$

| # | Variable | Categoría (Doc. Concepto §5) | Tipo / Unidad | Rango en Dataset | Media ($\mu$) | Desv. Est. ($\sigma$) | Interpretación Antifraude y Comercial B2B |
| :-: | :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| 1 | `dwell_time` | 1. Navegación e Interacción UI | `int` (ms) | $80 - 98,176$ | $24,499.6$ | $21,367.2$ | Tiempo de permanencia en página. Bots operan en $< 2,000\text{ ms}$; compradores indecisos superan los $35,000\text{ ms}$. |
| 2 | `scroll_depth` | 1. Navegación e Interacción UI | `float` (%) | $0.0 - 100.0$ | $61.36$ | $33.99$ | Porcentaje de desplazamiento vertical. Scripts directos no hacen scroll ($< 20\%$); humanos exploran afiche y precios ($60\% - 100\%$). |
| 3 | `pointer_velocity_px_s` | 1. Navegación e Interacción UI | `float` (px/s) | $95.0 - 5,326.7$ | $1,123.5$ | $1,148.2$ | Velocidad media del puntero/touch. Saltos instantáneos ($> 1,800\text{ px/s}$) delatan automatización DOM. |
| 4 | `checkout_fill_time_ms` | 2. Dinámica en Formulario | `int` (ms) | $45 - 33,221$ | $8,844.5$ | $7,269.1$ | Tiempo de llenado del checkout. **Regla crítica:** valores $< 800\text{ ms}$ indican inyección automática de campos (`REJECT_BOT`). |
| 5 | `avg_flight_time_ms` | 2. Dinámica en Formulario | `float` (ms) | $1.0 - 333.2$ | $107.3$ | $66.3$ | Latencia media entre teclas (*inter-key flight time*). Humanos teclean entre $60\text{ ms}$ y $340\text{ ms}$; macros bajan de $30\text{ ms}$. |
| 6 | `cursor_linearity_index` | 2. Dinámica en Formulario | `float` ($[0,1]$) | $0.08 - 0.999$ | $0.470$ | $0.289$ | Índice de rectitud del trazo del cursor ($1.0 = \text{línea recta perfecta}$). Combinado con `copy_paste_flag` ($> 0.80$) identifica bots. |
| 7 | `copy_paste_flag` | 2. Dinámica en Formulario | `binary` ($0/1$) | $0 - 1$ | $0.365$ | $0.481$ | Indica si se dispararon eventos `onPaste` en campos sensibles del checkout. |
| 8 | `backspace_corrections` | 2. Dinámica en Formulario | `int` (conteo) | $0 - 11$ | $2.19$ | $2.91$ | Correcciones con tecla Backspace/Delete. Humanos indecisos corrigen múltiples veces; bots no cometen errores tipográficos ($0$). |
| 9 | `tab_switch_count` | 3. Contexto de Sesión | `int` (conteo) | $0 - 9$ | $2.03$ | $2.33$ | Cambios de pestaña (`visibilitychange`/`blur`). En humanos refleja consulta de tasa BCV/cuenta bancaria; en scalpers refleja multi-pestaña. |
| 10 | `session_inactivity_ms` | 3. Contexto de Sesión | `int` (ms) | $0 - 27,825$ | $3,670.5$ | $5,321.1$ | Pausas de lectura antes de confirmar la orden. Permite segmentar al `COMPRADOR_INDECISO`. |
| 11 | `failed_order_retries` | 3. Contexto de Sesión | `int` (conteo) | $0 - 8$ | $1.23$ | $1.97$ | Reintentos previos en la misma sesión. Valores altos alertan ataques de fuerza bruta o acaparamiento. |
| 12 | `ip_requests_5m` | 4. Velocidad de Red / Scalping | `int` (req/5m) | $1 - 75$ | $12.69$ | $18.67$ | Peticiones por IP/dispositivo en ventana móvil de 5 min. **Variable #1 en importancia Gini** para frenar granjas de scalping. |
| 13 | `ticket_quantity` | 4. Velocidad de Red / Scalping | `int` (boletos) | $1 - 10$ | $3.14$ | $2.69$ | Cantidad de entradas solicitadas en la orden. Detecta compras masivas cuando concurre con alta frecuencia de red. |

---

### C. Variables de Salida / Etiquetas (Targets)

| Variable | Tipo | Valores Posibles | Uso en el Sistema |
| :--- | :---: | :--- | :--- |
| `is_fraud_or_bot` | `int` | `0` (Humano), `1` (Bot/Scalper) | Variable objetivo binaria para el entrenamiento supervisado del **Random Forest**. |
| `verdict` | `enum` | `APPROVE`, `REJECT_BOT` | Decisión transaccional en tiempo real ($< 80\text{ ms}$) antes de bloquear inventario en Redis. |
| `profile_tag` | `enum` | `FAN_DECIDIDO`, `COMPRADOR_INDECISO`, `RIESGO_MODERADO` | Segmentación analítica comercializable en el Dashboard B2B del organizador. |

---

## 3. Resultados de Entrenamiento y Validación del Algoritmo Baseline

El script [`ai_service/train_baseline.py`](file:///c:/Users/User/OneDrive/Desktop/VelozTix/VelozTix/ai_service/train_baseline.py) entrena un ensamble híbrido compuesto por:
1. **Random Forest Classifier (25 árboles CART con impureza Gini):** Clasificación supervisada multiparámetro.
2. **Isolation Forest (25 árboles de aislamiento aleatorio):** Detección no supervisada de anomalías y ráfagas de compras masivas (*scalping*).

| Métrica de Evaluación (Test Set = 500 sesiones) | Valor Obtenido | Criterio / SLA |
| :--- | :---: | :---: |
| **Accuracy (Exactitud Global)** | **99.80 %** | $\ge 95.0\%$ |
| **Precision (Precisión Antifraude — Cero Falsos Bloqueos)** | **100.00 %** | $\ge 95.0\%$ |
| **Recall (Sensibilidad ante Bots y Scalpers)** | **99.39 %** | $\ge 95.0\%$ |
| **F1-Score** | **99.69 %** | $\ge 95.0\%$ |
| **ROC-AUC** | **1.0000** | $\ge 0.95$ |
| **Latencia de Inferencia p95** | **0.0645 ms** | **$< 80.0\text{ ms}$ (Cumple)** |


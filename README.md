# VelozTix — Boletería Comercial con Pago Móvil Instantáneo y QR Digital

**Cátedra:** Desarrollo de Software Fintech (Universidad Católica Andrés Bello - UCAB)  
**Proyecto:** Plataforma de Boletería y Pasarela Merchant Mediator con Conciliación ISO 8583 y Bóveda PII  
**Equipo A:** Rolando Rodrigo Varela · Jesús Acosta · Leonel Rojas  

---

## 1. Descripción General del Sistema

**VelozTix** es una plataforma integral de boletería digital orientada a micro-eventos, festivales independientes y eventos universitarios de alta demanda en redes sociales. 

El ecosistema está integrado por:
1. **Front-End Interactivo en Modo Oscuro (Vite + React + TypeScript):** Inspirado en experiencias como Dice.fm y Eventbrite, incluye exploración de cartelera, checkout rápido con recolección silenciosa de telemetría conductual anti-bot, generación de QR dinámico para Pago Móvil y emisión de boletos con pases de acceso QR verificables.
2. **Backend Merchant & Ticketing Mediator API (Node.js + Express + TypeScript):** Implementación estricta del contrato **OpenAPI 3.0** (`openapi.yaml`), emulador de mensajería financiera **ISO 8583**, almacenamiento transaccional en **SQLite** nativo (`node:sqlite`), simulador de **Redis en memoria** para reservas atómicas con TTL y control de idempotencia (< 15 ms), y **Bóveda Criptográfica PII** con `AES-256-GCM` y `customer_hash` con sal irreversible.
3. **Cliente Front-End Híbrido con Modo Resiliente:** Se conecta de forma fluida a `http://localhost:8000/api/v1` cuando el servidor está encendido, y conmuta automáticamente a un mock en memoria si el backend se encuentra fuera de línea, garantizando que la navegación visual nunca se interrumpa.

### Modelo de Ingresos Comercial
- **Comisión Mixta por Entrada:** Tarifa de servicio VelozTix de **`4.5% + $0.20 USD` por cada entrada vendida** (`(subtotal * 4.5%) + ($0.20 * cantidad)`).
- **Suscripción Organizadora SaaS (`VelozTix Pro`):** Plan recurrente para productores y organizadores que habilita analítica avanzada de audiencia, métricas de conversión y resguardo antibots en preventas.

---

## 2. Estructura de Vistas y Flujos (Front-End)

### 1. Explorar Eventos (Vista Comprador)
- **Cartelera y Detalle del Evento (`src/views/CatalogView.tsx`):** Catálogo filtrable de eventos con póster, fecha, lugar, precio en USD/Bs, cupos disponibles en tiempo real y resumen transparente con **Tarifa de servicio VelozTix: `4.5% + $0.20` por entrada**.
- **Paso 1 — Datos del Asistente (`src/views/BuyerCheckoutView.tsx`):** Formulario comercial limpio (Nombre, Cédula, Teléfono, Correo) con protección y enmascaramiento automático de datos personales (`V-**.*45.892`), desglose de tarifa mixta (`4.5% + $0.20` por entrada) y selección de **Pago Móvil Instantáneo (QR Dinámico)**.
- **Paso 2 — Pantalla de Pago con QR Dinámico (`src/views/PaymentQRView.tsx`):** Reserva temporal con reloj regresivo de `05:00` minutos, datos del Pago Móvil, código QR dinámico central con el monto exacto actualizado y acciones limpias para **confirmar el pago** (Secuencia de Captura) o **cancelar/agotar tiempo** (Secuencia de Reverso con liberación inmediata de cupo).
- **Paso 3 — Boleto Digital Emitido (`src/views/TicketSuccessView.tsx`):** Ticket digital moderno con bordes troquelados, datos protegidos del titular, **QR de Acceso en Puerta** y descarga real de la entrada en formato `.png`.

### 2. Portal Organizador (`src/views/OrganizerPortalView.tsx`)
Incluye 4 pestañas comerciales sincronizadas en vivo con las compras realizadas:
1. **Mis Eventos:** Tarjetas de ocupación (vendidas vs. disponibles), enlace y modal de QR para Historias de Instagram, y modal **Crear Nuevo Evento**.
2. **Gestión de Compras y Órdenes:** Tabla en vivo con estado comercial (*Pagada*, *Pendiente de pago*, *Anulada / Reversada*), verificación manual de entrada en puerta y gestión rápida de estado.
3. **Cierre y Conciliación de Pagos:** Resumen financiero comercial (Total Recaudado en Pago Móvil, **Comisión VelozTix (`4.5% + $0.20/ticket`)** y **Monto Neto a Liquidar al Organizador**) + botón **Ejecutar Cuadre de Pagos**.
4. **Analítica de Audiencia (Suscripción SaaS `VelozTix Pro`):** Panel comercial para organizadores suscritos con visitas al evento, tasa de conversión, perfiles de compradores (*Fans directos* vs. *Indecisos*) e intentos de reventa/bots bloqueados automáticamente.

### 3. Telemetría Silenciosa en Segundo Plano
- El hook `src/hooks/useBehavioralTelemetry.ts` instrumenta el DOM silenciosamente (`dwell_time_ms`, `scroll_depth_pct`, `keystroke_dynamics`, `tab_switch_count` y eventos de puntero) sin mostrar paneles técnicos al usuario, registrando el resumen de forma discreta en la consola del navegador al generar una orden.

---

## 3. Arquitectura del Backend Merchant y Base de Datos

El backend adopta un diseño limpio, modular e impulsado por inyección de dependencias (`AppContainer`):

```
                   ┌──────────────────────────────────────────────┐
                   │               CLIENTE FRONTEND               │
                   │      (Vite + React + Telemetría DOM)         │
                   └──────────────────────┬───────────────────────┘
                                          │ HTTP / REST (OpenAPI 3.0)
                                          ▼
                   ┌──────────────────────────────────────────────┐
                   │             EXPRESS API GATEWAY              │
                   │  - CORS + rawBody Buffer (Firma HMAC)        │
                   │  - Middlewares: Idempotencia & API Key       │
                   └──────────────────────┬───────────────────────┘
                                          │
            ┌─────────────────────────────┼─────────────────────────────┐
            ▼                             ▼                             ▼
  ┌───────────────────┐         ┌───────────────────┐         ┌───────────────────┐
  │   OrderService    │         │  WebhookService   │         │ Reconciliation    │
  │ - Anti-Tampering  │         │ - HMAC-SHA256     │         │ - Caso A: Match   │
  │ - AI Telemetría   │         │ - ISO 8583 MTI    │         │ - Caso B: Auto-rep│
  │ - ISO 0100 / 0110 │         │ - Emisión Boletos │         │ - Caso C: Revoke  │
  └─────────┬─────────┘         └─────────┬─────────┘         └─────────┬─────────┘
            │                             │                             │
            └─────────────────────────────┼─────────────────────────────┘
                                          │
                                          ▼
                     ┌─────────────────────────────────────────┐
                     │          SERVICIOS TRANSVERSALES        │
                     │  - InMemoryRedisService (Stock/TTL/Idemp│
                     │  - PrivacyCryptoService (AES-256-GCM)   │
                     │  - IsoSwitchSimulator (MTI 0100/0200)   │
                     └────────────────────┬────────────────────┘
                                          │
                                          ▼
                     ┌─────────────────────────────────────────┐
                     │        BASE DE DATOS RELACIONAL         │
                     │        SQLite (node:sqlite WAL)         │
                     │  - EVENTS          - MERCHANTS          │
                     │  - ORDERS          - TICKETS            │
                     │  - AUDIT_LEDGER    - BUYERS_PII_VAULT   │
                     └─────────────────────────────────────────┘
```

### Modelo de Datos Relacional (SQLite)
* **`EVENTS`:** Catálogo de eventos, aforo total, inventario disponible/vendido/reservado y precios oficiales en USD y Bs.
* **`MERCHANTS`:** Comercios organizadores asociados, credenciales bancarias para Pago Móvil (banco, RIF enmascarado, teléfono enmascarado) y comisiones pactadas (4.5%).
* **`ORDERS`:** Maestro de órdenes comerciales con trazabilidad ISO 8583 (DE11 STAN, DE37 RRN, DE38 Auth Code), estado transaccional (`AUTHORIZED`, `SETTLED`, `RECONCILED`, `REVERSED`, `REFUND_PENDING`) y referencia de pago bancario.
* **`TICKETS`:** Boletos emitidos individualmente con UUID único, nonce aleatorio y token QR JWT firmado sin datos personales.
* **`AUDIT_LEDGER`:** Libro contable inmutable para cumplimiento normativo (SUDEBAN Resoluciones 12441/12221), registrando cada transición (`AUTHORIZED`, `CAPTURED`, `REVERSED`, `RECONCILED`, `REVOKED`, `ANOMALY`).
* **`BUYERS_PII_VAULT`:** Bóveda aislada que almacena la cédula, teléfono y correo electrónico cifrados con `AES-256-GCM` bajo clave maestra criptográfica, indexada exclusivamente por `customer_hash`.

### Simulador de Redis en Memoria (`InMemoryRedisService`)
* **Bloqueo Atómico de Inventario:** Reserva atómica de cupos por evento (`reserveStock`) evitando sobreventas concurrentes (*race conditions*).
* **TTL de 300 Segundos:** Expiración automática de órdenes no pagadas a los 5 minutos con liberación inmediata de cupo hacia el aforo disponible.
* **Caché de Idempotencia (24 Horas):** Almacena el hash SHA-256 del cuerpo y la respuesta HTTP para devolver el resultado original en < 15 ms ante reintentos de red.

---

## 3. Arquitectura de Seguridad Financiera (Zero-Trust Frontend)

En cumplimiento de las directivas de seguridad bancaria y comercio electrónico seguro:

### 1. Cero Secretos Criptográficos en el Front-End
* Se eliminó cualquier referencia a `WEBHOOK_SECRET` o cálculo de firmas `HMAC-SHA256` en el código cliente (`src/`).
* **Endpoint de Desarrollo Sandbox (`POST /api/v1/sandbox/trigger-webhook`):** Para simular la confirmación del pago en la interfaz, el navegador invoca este endpoint pasando `{ order_id, event_type }`. El servidor backend es quien lee de forma segura el secreto privado de entorno, ensambla el payload bancario, calcula la firma digital `X-Signature` e invoca la lógica de captura interna.

### 2. Prevención de Manipulación de Precios (Anti-Price Tampering)
* En `POST /api/v1/orders/authorize`, aunque el cliente envíe `unit_price_bs` para satisfacer el esquema OpenAPI, el backend valida estrictamente contra la tabla `EVENTS` en SQLite.
* Si el precio unitario del request difiere del valor oficial en base de datos, el backend rechaza la transacción de inmediato con **HTTP 400 Bad Request** (`PRICE_TAMPERING_DETECTED`), calculando el monto bruto (`gross_amount_bs`) exclusivamente a partir del catálogo oficial.

### 3. Aislamiento Estricto de la Bóveda PII y Minimización de Datos
* Ningún endpoint público ni vista de cliente expone datos sensibles desencriptados.
* Las respuestas de orden retornan exclusivamente datos enmascarados comercialmente (`V-28.***.***`, `0414***1234`), el seudónimo `customer_hash` (`SHA-256(DNI + Sal Secreta)`) y el token del boleto QR.
* La tabla `BUYERS_PII_VAULT` permanece estrictamente encapsulada en la capa de servicios del backend.

---

## 4. Cumplimiento OpenAPI 3.0, ISO 8583 y Conciliación

| Endpoint | Método | Descripción y Reglas de Negocio |
| :--- | :---: | :--- |
| `/api/v1/orders/authorize` | `POST` | Valida telemetría (< 80 ms), bloquea bots (`REJECT_BOT` 403), reserva stock con TTL (300s), genera traza ISO 8583 MTI 0100/0110 y emite QR dinámico firmado. Requiere header `Idempotency-Key`. |
| `/api/v1/orders/{order_id}/status` | `GET` | Consulta estado en tiempo real. Retorna `ticket_qr` como `null` en `AUTHORIZED`, y entrega el JWT firmado cuando el estado es `SETTLED` o `RECONCILED`. |
| `/api/v1/webhooks/pago-movil` | `POST` | Webhook de pasarela bancaria. Valida firma `X-Signature` HMAC-SHA256 sobre `req.rawBody` (401 si falla) e idempotencia (< 15 ms). Procesa `payment.captured` (MTI 0200) o `payment.failed` (MTI 0400). |
| `/api/v1/settlements/reconcile` | `POST` | Motor de conciliación contable de 3 vías contra reporte del banco/adquirente. |
| `/api/v1/sandbox/trigger-webhook` | `POST` | Disparador de pruebas seguro del lado del servidor para emular confirmaciones bancarias sin filtrar secretos. |
| `/settlements/report` | `GET` | Mock del reporte de liquidación bancaria del adquirente externo. |

### Lógica del Motor de Conciliación (Worker de 3 Vías)
* **Caso A (Matched):** Orden en `SETTLED` que coincide por `order_id`, `payment_reference` o `de37_rrn` con el mismo monto en el reporte bancario. Pasa a estado **`RECONCILED`**.
* **Caso B (Auto-reparación / Pasarela Caída):** Pago registrado en el banco pero la orden quedó en `AUTHORIZED` o `REVERSED` debido a falla en la entrega del webhook. El motor verifica stock:
  * Si hay inventario disponible, emite los boletos automáticamente y pasa la orden a **`RECONCILED`**.
  * Si el evento ya se agotó (`SOLD_OUT`), marca la orden como **`REFUND_PENDING`** y genera una alerta contable para evitar sobreventa.
* **Caso C (Revocación Inmediata / Fraude):** Orden con boletos emitidos en `SETTLED` pero sin ningún respaldo de cobro en el reporte bancario externo. Los boletos se revocan inmediatamente a estado **`REVOKED`** y se audita la discrepancia.

---

## 5. Matriz de Certificación Técnica (TC-01 a TC-10)

Ubicada en `backend/tests/certification.test.ts`, valida los 10 casos de prueba esenciales:

* **TC-01:** Autorización exitosa con telemetría orgánica (HTTP 201, bloqueo atómico en caché, estado `AUTHORIZED`).
* **TC-02:** Captura exitosa por webhook con firma `X-Signature` válida (HTTP 200, estado `SETTLED`, boleto JWT sin PII).
* **TC-03:** Rechazo en tiempo real por telemetría de bot/scalping (HTTP 403 `REJECT_BOT` en < 80 ms, inventario intacto).
* **TC-04:** Rechazo de webhook por firma HMAC corrupta o ausente (HTTP 401 Unauthorized `INVALID_SIGNATURE`).
* **TC-05:** Idempotencia ante webhook duplicado con misma `Idempotency-Key` (HTTP 200 `already_processed` en < 15 ms).
* **TC-06:** Reverso automático ante expiración de los 300s de TTL (Orden pasa a `REVERSED` y libera el stock).
* **TC-07:** Reverso por rechazo bancario externo `payment.failed` (HTTP 200 `reversed`, libera stock).
* **TC-08:** Webhook tardío o monto discrepante (HTTP 200 `acknowledge_with_internal_alert`, auditoría de anomalía).
* **TC-09:** Conciliación Caso B / Auto-reparación (Emite boletos si hay cupo ante caída del webhook).
* **TC-10:** Conciliación Caso C / Discrepancia crítica (Revocación inmediata a `REVOKED` sin cobro externo).

---

## 6. Benchmark de Rendimiento Transaccional (200 TXS)

El script `backend/scripts/kpi_benchmark.ts` somete el servidor HTTP Express y la base de datos SQLite en memoria a un lote concurrente de **200 transacciones reales**, evaluando latencias p95 y rendimiento sostenido (TPS):

| KPI Operacional | Resultado Obtenido | Objetivo / SLA | Cumplimiento |
| :--- | :---: | :---: | :---: |
| **Tasa de Aprobación (Legítimos)** | **91.18 %** | $\ge$ 90.0 % | **CUMPLE** |
| **Rendimiento Sostenido (TPS)** | **152.41 TPS** | $\ge$ 30.0 TPS | **CUMPLE** |
| **Latencia Inferencia IA p95** | **18 ms** | < 80.0 ms | **CUMPLE** |
| **Tasa de Reversos (% Total)** | **7.5 %** | $\le$ 10.0 % | **CUMPLE** |
| **Integridad Transaccional** | **100 % (0 errores SQLite)** | 100 % | **CUMPLE** |

*Los resultados se exportan automáticamente en formato JSON estructurado a `kpi_results.json`.*

---

## 7. Instrucciones de Instalación y Ejecución

### Prerrequisitos
* **Node.js:** v22.x o superior (utiliza el módulo nativo `node:sqlite` y `node:crypto`).
* **npm:** v10.x o superior.

### 1. Instalación de Dependencias
Ejecuta en la raíz del repositorio:
```bash
# Instala dependencias del frontend y del backend
npm install
npm --prefix backend install
```

### 2. Inicializar la Base de Datos (Seed)
Puebla los eventos y comercios iniciales en la base de datos SQLite:
```bash
npm run backend:seed
```

### 3. Ejecutar los Servidores en Modo Desarrollo

#### Opción A: Orquestador Completo (Frontend + Backend Simultáneos)
Inicia el backend en el puerto `8000` y el frontend en el puerto `5173`:
```bash
npm run dev:all
```

#### Opción B: Ejecución en Terminales Separadas
```bash
# Terminal 1: Backend Merchant API (http://localhost:8000)
npm run dev:backend

# Terminal 2: Frontend Vite React (http://localhost:5173)
npm run dev
```

### 4. Ejecutar la Suite de Pruebas Automatizadas
Ejecuta la suite completa de 29 pruebas (incluyendo los 10 casos de certificación técnica TC-01 a TC-10 y las pruebas de seguridad financiera Zero-Trust):
```bash
npm run test:backend
```

### 5. Ejecutar el Benchmark de Rendimiento y KPIs
Ejecuta el benchmark transaccional de 200 operaciones y genera el archivo `kpi_results.json`:
```bash
npm run benchmark
```

---

## 8. Estructura del Repositorio

```
VelozTix/
├── backend/
│   ├── scripts/
│   │   └── kpi_benchmark.ts        # Generador de carga de 200 TXS y tablero de métricas
│   ├── src/
│   │   ├── config/env.ts           # Variables de entorno y llaves maestras
│   │   ├── db/                     # Conexión SQLite, esquemas y seed inicial
│   │   ├── middlewares/            # Idempotencia (< 15 ms), firma HMAC y auth
│   │   ├── routes/                 # Endpoints REST (orders, webhooks, merchant, sandbox)
│   │   ├── services/               # Lógica de órdenes, webhook, reconciliación y cripto
│   │   ├── types/                  # Tipado estricto OpenAPI 3.0 e ISO 8583
│   │   ├── app.ts                  # Configuración de Express y captura de rawBody Buffer
│   │   ├── container.ts            # Contenedor de Inyección de Dependencias
│   │   └── server.ts               # Punto de entrada del servidor HTTP
│   └── tests/
│       ├── certification.test.ts   # Suite de certificación técnica TC-01 a TC-10
│       └── backend.spec.ts         # Pruebas integrales de endpoints y seguridad
├── src/                            # Aplicación Front-End React + TypeScript
│   ├── components/                 # Componentes UI en modo oscuro (Navbar, Modal, QR)
│   ├── hooks/                      # useBehavioralTelemetry (recolección silenciosa)
│   ├── services/
│   │   └── apiClient.ts            # Cliente híbrido con fallback transparente en memoria
│   ├── types/                      # Modelos comerciales y tipos de telemetría
│   ├── utils/                      # Criptografía ligera de interfaz (enmascaramiento)
│   └── views/                      # Catálogo, Checkout, Pago Móvil QR y Portal Organizador
├── scripts/
│   └── dev-all.js                  # Script orquestador multiplataforma para dev:all
├── openapi.yaml                    # Especificación OpenAPI 3.0 de VelozTix
├── kpi_results.json                # Resultados del último benchmark transaccional
└── package.json                    # Scripts de orquestación del proyecto
```

---
**VelozTix** — Proyecto Académico UCAB 2026. Todos los derechos reservados.

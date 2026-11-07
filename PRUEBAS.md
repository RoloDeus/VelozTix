# Catálogo y Guía Completa de Pruebas — VelozTix

Este documento describe **todas las pruebas** implementadas en la plataforma **VelozTix**, su significado técnico-financiero, los componentes que validan y las instrucciones paso a paso para ejecutarlas.

---

## 📋 Resumen de Suites de Prueba Disponibles

| Tipo de Prueba | Herramienta / Script | Cantidad | Propósito Principal |
| :--- | :--- | :---: | :--- |
| **Pruebas Integrales y de Seguridad** | `backend/tests/backend.spec.ts` | 19 tests | Valida criptografía PII, middlewares, endpoints REST, reglas anti-tampering y conciliación. |
| **Matriz de Certificación Técnica** | `backend/tests/certification.test.ts` | 10 tests (TC-01 a TC-10) | Valida el ciclo de vida transaccional bancario, ISO 8583, SLA de IA y resiliencia de inventario. |
| **Benchmark de Rendimiento y Estrés** | `backend/scripts/kpi_benchmark.ts` | 200 TXS concurrentes | Evalúa latencias p95 (< 80 ms IA), rendimiento sostenido en TPS ($\ge$ 30 TPS) y concurrencia SQLite. |
| **Pruebas de Compilación y Tipado** | `tsc -b`, `npm run build` | Frontend + Backend | Garantiza cero errores de tipos TypeScript y empaquetado de producción limpio. |
| **Pruebas Manuales / E2E Front-End** | Navegador (`http://localhost:5173`) | 5 flujos | Comprueba experiencia de usuario, telemetría silenciosa DOM y conmutación al modo híbrido/offline. |

---

## 🚀 Comandos Rápidos de Ejecución

Desde la raíz del proyecto:

```bash
# 1. Ejecutar las 29 pruebas automatizadas (Integración + Certificación TC-01 a TC-10)
npm run test:backend

# 2. Ejecutar únicamente la Matriz de Certificación Técnica (TC-01 a TC-10)
npm --prefix backend run test:cert

# 3. Ejecutar el Benchmark de Rendimiento Transaccional (200 transacciones HTTP reales)
npm run benchmark

# 4. Verificar compilación estricta de TypeScript en Frontend y Backend
npm run backend:build
npm run build
```

---

## 🔬 1. Pruebas Automatizadas de Backend (29 Casos)

### Bloque A: Criptografía y Bóveda PII (`backend.spec.ts`)

#### 1. Cifrado AES-256-GCM y cálculo de `customer_hash` irreversible con sal
* **Qué hace:** Toma la cédula, teléfono y correo del comprador y los cifra con `AES-256-GCM` bajo la clave maestra del servidor. Simultáneamente, calcula un hash unidireccional `SHA-256(DNI + Sal Secreta)`.
* **Qué significa:** Garantiza que los datos sensibles del comprador nunca se almacenen en texto plano y que ningún operador pueda rastrear al comprador sin conocer la clave maestra de la bóveda.

#### 2. Emisión de boleto JWT firmado con HMAC-SHA256 con cero datos PII
* **Qué hace:** Genera un token JWT para el acceso al evento que contiene únicamente `ticket_id`, `event_id`, un `nonce` criptográfico y timestamp de expiración.
* **Qué significa:** Certifica el principio de minimización de datos: el código QR escaneado en puerta es verificable matemáticamente pero no expone cédula, teléfono ni nombre del titular.

---

### Bloque B: Middlewares de Idempotencia y Firma (`backend.spec.ts`)

#### 3. Rechazo de webhooks con 401 INVALID_SIGNATURE antes de procesar
* **Qué hace:** Envía peticiones al webhook `/api/v1/webhooks/pago-movil` sin el header `X-Signature` o con una firma HMAC alterada.
* **Qué significa:** Protege la pasarela contra suplantación o inyección de cobros falsos: si un atacante no posee el `WEBHOOK_SECRET` privado, el servidor rechaza la petición con código **HTTP 401** sin consultar la base de datos ni emitir boletos.

#### 4. Respuesta en < 15 ms en reintentos de webhook vía idempotencia (`already_processed`)
* **Qué hace:** Dispara dos veces el mismo webhook de pago con idéntica `Idempotency-Key` y calcula el tiempo de respuesta en el segundo intento.
* **Qué significa:** Protege al sistema ante reintentos de red bancarios: responde de inmediato con el payload cacheado y código **HTTP 200** sin duplicar boletos ni corromper el libro de auditoría.

---

### Bloque C: Endpoint `POST /api/v1/orders/authorize` (`backend.spec.ts`)

#### 5. Bloqueo de bot cuando `checkout_fill_time_ms < 800` (HTTP 403 `REJECT_BOT`)
* **Qué hace:** Envía una solicitud de compra donde el tiempo de llenado del formulario es inhumano (< 800 ms).
* **Qué significa:** Detecta bots automatizados de acaparamiento de entradas (*scalping*), rechazándolos con **HTTP 403** en menos de 80 ms y manteniendo el inventario intacto.

#### 6. Bloqueo de bot por `copy_paste_flag == true` con `cursor_linearity_index > 0.8`
* **Qué hace:** Envía una solicitud donde los campos se rellenaron mediante pegado directo y el cursor del ratón se movió en línea recta perfecta.
* **Qué significa:** Neutraliza scripts de automatización headless (Selenium/Puppeteer), protegiendo la venta prioritaria para usuarios humanos.

#### 7. Aprobación de humano, cálculo de tarifa mixta y respuesta HTTP 201 Created
* **Qué hace:** Procesa una compra con telemetría orgánica humana, calculando la tarifa mixta (4.5% + $0.20 convertido a tasa oficial BCV de 55.00 Bs/USD).
* **Qué significa:** Valida el flujo feliz de autorización comercial, devolviendo la traza ISO 8583 (MTI 0100 $\rightarrow$ 0110), el QR dinámico con firma y la reserva de cupo en memoria.

---

### Bloque D: Endpoint `GET /api/v1/orders/{order_id}/status` (`backend.spec.ts`)

#### 8. Retorno condicional de `ticket_qr` según estado de la orden
* **Qué hace:** Consulta el estado de una orden recién autorizada (`AUTHORIZED`) y luego tras ser pagada (`SETTLED` o `RECONCILED`).
* **Qué significa:** Garantiza que el boleto QR firmado **nunca** se entrega al cliente mientras la orden esté pendiente de pago (`null`), entregándose únicamente cuando el cobro está 100% confirmado.

---

### Bloque E: Webhooks Dual Payload y Casos Extremos (`backend.spec.ts`)

#### 9. Soporte de payload anidado del documento de mapeo ISO 8583
* **Qué hace:** Envía el webhook en el formato enriquecido (`transaction`, `financial_breakdown`, `iso8583_metadata`).
* **Qué significa:** Garantiza compatibilidad retroactiva y desacoplamiento con múltiples proveedores bancarios que utilizan diferentes formatos de notificación.

#### 10. Manejo de webhook tardío ante TTL expirado (`acknowledge_with_internal_alert`)
* **Qué hace:** Simula la llegada de un pago bancario legítimo luego de que pasaron los 300 segundos de reserva temporal.
* **Qué significa:** El sistema no descarta el dinero: responde **HTTP 200** al banco, pero registra una anomalía en `AUDIT_LEDGER` y no emite entradas automáticamente para evitar sobreventa no autorizada.

---

### Bloque F: Motor de Conciliación Contable de 3 Vías (`backend.spec.ts`)

#### 11. Conciliación Caso A (Matched): Órdenes liquidadas pasan a `RECONCILED`
* **Qué hace:** Cruza las órdenes del sistema con el reporte bancario. Cuando el monto y la referencia coinciden exactamente, marca la orden como conciliada.
* **Qué significa:** Cierra el ciclo contable de las ventas legítimas confirmando la disponibilidad de fondos en la cuenta del organizador.

#### 12. Conciliación Caso B (Auto-reparación): Emisión de boleto si hay cupo disponible
* **Qué hace:** Procesa un caso donde el banco cobró al usuario pero el webhook nunca llegó (servidor caído o fallo de red). Al detectar el cobro en el reporte bancario, el motor verifica el aforo: si hay cupo, emite los boletos automáticamente.
* **Qué significa:** Resuelve de forma autónoma incidentes de soporte técnico ("me cobraron y no me llegó la entrada"), entregando el boleto al usuario sin intervención manual.

#### 13. Conciliación Caso B con evento agotado: Marcado como `REFUND_PENDING`
* **Qué hace:** Similar al caso anterior, pero el evento se quedó sin cupo (`SOLD_OUT`).
* **Qué significa:** Cumple la directiva de seguridad financiera: **jamás sobre-vender el aforo físico**. En lugar de emitir un boleto inválido, marca la orden para devolución de dinero (`REFUND_PENDING`) y alerta al administrador.

#### 14. Conciliación Caso C (Revocación Inmediata): Anulación de boletos sin respaldo
* **Qué hace:** Detecta órdenes que figuran como pagadas en el sistema pero que no aparecen en el extracto oficial de la pasarela bancaria.
* **Qué significa:** Previene fraudes por inyecciones espurias o pagos no compensados: revoca los boletos de inmediato a estado **`REVOKED`**, impidiendo el acceso al evento.

#### 15. Registro automático en mock y consulta de reporte en `GET /settlements/report`
* **Qué hace:** Verifica que cada captura exitosa registre el pago en el servicio de liquidación del comercio organizador.
* **Qué significa:** Asegura que la auditoría bancaria del comercio disponga en todo momento del reporte consolidado de recaudación.

#### 16. Inyección directa de entradas externas (`external_settlement_entries`)
* **Qué hace:** Ejecuta la conciliación enviando un arreglo de transacciones en el cuerpo del request, cruzando alternativamente por `order_id`, `payment_reference` o `de37_rrn`.
* **Qué significa:** Permite al organizador cargar extractos bancarios en lote (ej. archivos CSV o conciliación manual de fin de mes).

---

### Bloque G: Directivas de Seguridad Financiera Zero-Trust Frontend (`backend.spec.ts`)

#### 17. Prevención de manipulación de precios (`PRICE_TAMPERING_DETECTED`)
* **Qué hace:** Envía un payload a `POST /api/v1/orders/authorize` con `unit_price_bs: 10.0` para un evento cuyo precio oficial en la base de datos es `360.0 Bs`.
* **Qué significa:** Impide que un usuario malicioso modifique el código JavaScript en su navegador para comprar entradas a precios irrisorios. El servidor rechaza la transacción con **HTTP 400 Bad Request**.

#### 18. Disparador seguro Sandbox (`POST /api/v1/sandbox/trigger-webhook`)
* **Qué hace:** Emula la confirmación del pago desde el frontend sin necesidad de que el navegador conozca el `WEBHOOK_SECRET` ni calcule la firma HMAC.
* **Qué significa:** Cumple el principio **Zero-Trust**: el cliente nunca custodia secretos bancarios; el backend es quien firma y procesa la transacción de prueba internamente.

#### 19. Aislamiento estricto de Bóveda PII y minimización de datos en respuestas
* **Qué hace:** Inspecciona las respuestas JSON de los endpoints de autorización y consulta de estado.
* **Qué significa:** Verifica que cadenas con la cédula, teléfono, correo o cifrados internos nunca se filtren al frontend, manteniendo la privacidad absoluta del comprador.

---

### Bloque H: Matriz de Certificación Técnica Bancaria TC-01 a TC-10 (`certification.test.ts`)

| Código | Nombre de la Prueba | Criterio de Éxito / Significado |
| :---: | :--- | :--- |
| **TC-01** | **Autorización exitosa con telemetría orgánica** | Retorna HTTP 201, reserva stock en caché Redis, genera MTI 0100/0110 e inserta orden en `AUTHORIZED`. |
| **TC-02** | **Captura exitosa por webhook con firma válida** | Retorna HTTP 200 `captured`, orden pasa a `SETTLED`, emite boleto JWT sin PII y genera traza inmutable en `AUDIT_LEDGER`. |
| **TC-03** | **Rechazo en tiempo real por telemetría de bot** | Retorna HTTP 403 `REJECT_BOT` en < 80 ms, inventario intacto y auditoría de intento de scalping. |
| **TC-04** | **Rechazo de webhook por firma HMAC corrupta o ausente** | Retorna HTTP 401 Unauthorized `INVALID_SIGNATURE` antes de tocar la base de datos. |
| **TC-05** | **Idempotencia ante webhook duplicado** | Retorna HTTP 200 `already_processed` en < 15 ms con idéntico payload sin duplicar boletos ni asientos. |
| **TC-06** | **Reverso automático ante expiración de TTL (300s)** | Al vencer los 5 minutos, la orden pasa a `REVERSED` y el cupo reservado se libera de inmediato al aforo. |
| **TC-07** | **Reverso por rechazo bancario externo (`payment.failed`)** | El banco notifica rechazo (código 05); el sistema revierte la orden a `REVERSED` y desbloquea el stock. |
| **TC-08** | **Webhook tardío o monto discrepante** | Si el monto recibido no coincide o el TTL expiró, responde HTTP 200 `acknowledge_with_internal_alert` y audita anomalía. |
| **TC-09** | **Conciliación Caso B (Auto-reparación)** | Detecta pago en extracto bancario con webhook no entregado y emite boleto de forma reactiva si hay cupo. |
| **TC-10** | **Conciliación Caso C (Discrepancia crítica)** | Revoca inmediatamente a `REVOKED` boletos emitidos que no posean respaldo en el extracto bancario. |

---

## ⚡ 2. Benchmark de Rendimiento Transaccional (200 TXS)

Se ejecuta con el comando:
```bash
npm run benchmark
```

### ¿Qué hace esta prueba?
1. Levanta una instancia real del servidor HTTP Express en un puerto local dinámico.
2. Inicializa una base de datos SQLite en memoria con modo `WAL` y `busy_timeout = 5000` para garantizar máxima concurrencia libre de bloqueos (`SQLITE_BUSY`).
3. Dispara un lote de **200 transacciones concurrentes vía HTTP real** (simulando 85% de compradores humanos y 15% de ataques de bots automatizados).
4. Mide de forma milimétrica los tiempos de red, latencias del motor de IA, latencias de autorización y rendimiento global.
5. Exporta los resultados a [`kpi_results.json`](file:///c:/Users/17865/OneDrive/Documentos/Universidad_ucab/7mo_semestre/Fintech/Proyecto_Codigo/VelozTix/kpi_results.json).

### Métricas Evaluadas y SLAs de Certificación

| KPI / Métrica | SLA / Meta Requerida | Resultado Típico Obtenido | Estado |
| :--- | :---: | :---: | :---: |
| **Tasa de Aprobación de Legítimos** | $\ge$ 90.0 % | **91.18 %** | **CUMPLE** |
| **Rendimiento Sostenido (TPS)** | $\ge$ 30.0 TPS | **~150 - 250 TPS** | **CUMPLE (ALTO RENDIMIENTO)** |
| **Latencia p95 Inferencia Anti-Bot** | < 80.0 ms | **~18 ms** | **CUMPLE (SLA ESTRICTO)** |
| **Tasa de Reversos Controlada** | $\le$ 10.0 % | **7.5 %** | **CUMPLE** |
| **Integridad Concurrente de Base de Datos** | 0 errores SQLite | **0 errores** | **CUMPLE** |

---

## 🖥️ 3. Pruebas Funcionales y Manuales en el Front-End

Para ejecutar estas pruebas interactivas, inicia el entorno:
```bash
npm run dev:all
# Frontend: http://localhost:5173
# Backend:  http://localhost:8000
```

### Flujo 1: Compra Orgánica Exitosa (Comprador Humano)
1. Ingresa a `http://localhost:5173` y selecciona un evento (ej. *CyberFest UCAB 2026*).
2. Selecciona la cantidad de entradas y haz clic en **Continuar Compra**.
3. Rellena el formulario tomándote entre 5 y 10 segundos para escribir los datos (cédula, teléfono, nombre y correo).
4. Observa cómo el sistema enmascara la cédula y teléfono en pantalla.
5. Haz clic en **Generar Pago Móvil**.
6. En la pantalla de Pago Móvil, observa el reloj regresivo de `05:00` minutos y el código QR dinámico.
7. Haz clic en el botón verde **Simular Pago Aprobado**.
8. **Resultado esperado:** La orden pasa a pagada, se emite el boleto troquelado con su código QR de acceso y se habilita el botón de descarga del ticket en PNG.

### Flujo 2: Prueba de Bloqueo Anti-Bot / Anti-Scalping
1. En el formulario de checkout, copia los datos personales en el portapapeles y pégalos instantáneamente en los campos.
2. Haz clic en **Generar Pago Móvil** en menos de 1 segundo tras abrir la vista.
3. **Resultado esperado:** El motor de IA conductual detecta el llenado artificial y bloquea la operación mostrando una alerta de seguridad: *"Detectamos un llenado automático inusual. Por favor verifica tus datos e inténtalo de nuevo."* El aforo del evento no se reduce.

### Flujo 3: Cancelación Voluntaria y Liberación de Cupo
1. Inicia una compra y llega hasta la pantalla del QR de Pago Móvil.
2. Observa que el contador de cupos del evento en el catálogo se reservó.
3. Haz clic en **Cancelar Pago / Devolver Entrada**.
4. **Resultado esperado:** La orden se marca como revertida y el cupo reservado regresa inmediatamente a la disponibilidad del evento.

### Flujo 4: Auditoría y Cuadre de Pagos en el Portal del Organizador
1. En la barra superior, cambia a la vista **Modo Organizador**.
2. Explora las pestañas:
   * **Mis Eventos:** Ocupación de aforo en vivo y enlace con QR para Instagram.
   * **Gestión de Compras:** Listado en vivo de órdenes en estado Pagada, Pendiente o Anulada, con opción de verificar entrada en puerta.
   * **Cierre y Conciliación:** Resumen financiero (recaudo bruto, comisión del 4.5% y monto neto liquidado) con botón **Ejecutar Cuadre de Pagos**.
   * **Analítica de Audiencia:** Desglose de perfiles (*Fans directos* vs. *Indecisos*) y conteo de bots bloqueados por la IA.

### Flujo 5: Resiliencia y Modo Híbrido (Backend Online vs. Offline)
1. Detén el proceso del backend en la terminal (Ctrl + C en el puerto 8000).
2. Continúa navegando y realizando compras en la interfaz gráfica del frontend.
3. **Resultado esperado:** El cliente conmuta transparentemente al mock en memoria (`InMemoryStore`). La navegación, compra y emisión de boletos siguen funcionando sin pantallas en blanco ni excepciones de red.
4. Vuelve a iniciar el backend (`npm run dev:backend`) y observa cómo las peticiones vuelven a sincronizarse con el servidor Express y la base de datos SQLite.

---

## 🛡️ 4. Guía de Códigos HTTP y Errores del Backend

| Código HTTP | Código de Error / Estado | Causa / Significado |
| :---: | :--- | :--- |
| **`201 Created`** | `status: "AUTHORIZED"` | Orden aprobada por la IA; cupo reservado por 300 segundos. |
| **`200 OK`** | `status: "captured"` | Webhook procesado con éxito; boleto emitido y orden en `SETTLED`. |
| **`200 OK`** | `status: "already_processed"` | Petición repetida interceptada por el middleware de idempotencia (< 15 ms). |
| **`200 OK`** | `status: "reversed"` | Pago fallido notificado por el banco; inventario liberado. |
| **`200 OK`** | `status: "acknowledge_with_internal_alert"` | Webhook tardío o monto discrepante; dinero recibido pero requiere revisión contable. |
| **`400 Bad Request`** | `PRICE_TAMPERING_DETECTED` | El precio enviado no coincide con el catálogo oficial en SQLite. |
| **`400 Bad Request`** | `INVALID_REQUEST` | Faltan campos obligatorios en el cuerpo de la petición. |
| **`401 Unauthorized`** | `INVALID_SIGNATURE` | La firma HMAC-SHA256 (`X-Signature`) es incorrecta o no fue enviada. |
| **`403 Forbidden`** | `REJECT_BOT` | Telemetría clasificó la interacción como bot o scalper. |
| **`404 Not Found`** | `ORDER_NOT_FOUND` | El `order_id` no existe en la base de datos transaccional. |
| **`409 Conflict`** | `STOCK_EXHAUSTED` | No hay cupos disponibles en el evento para la cantidad solicitada. |

---

*Documento técnico de calidad y pruebas — VelozTix (Cátedra de Desarrollo de Software Fintech, UCAB).*


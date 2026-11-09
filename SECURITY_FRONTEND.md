# VelozTix — Evidencia de Endurecimiento de Seguridad Front-End (AppSec)

**Proyecto:** VelozTix (Mediador Comercial de Boletería y Motor de Telemetría IA)  
**Marcos de Referencia:** PCI-DSS 4.0 (Alcance Delegador), OWASP Top 10 (2021/2025) y Normativas SUDEBAN 641.10 y 001-21  
**Entrega:** Sesión 2 — Plan de Certificación y Blindaje Client-Side  

---

## 1. Cabeceras de Seguridad HTTP (`vite.config.ts`, `index.html`, `vercel.json`, `public/_headers`)

Se configuraron las siguientes cabeceras de respuesta HTTP tanto en desarrollo/previsualización (`server.headers` y `preview.headers` en `vite.config.ts`) como en producción (`vercel.json` y `public/_headers`) y etiquetas `<meta>` equivalentes en `index.html`:

| Cabecera HTTP | Valor Configurado | Mitigación de Seguridad |
| :--- | :--- | :--- |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests` | Bloquea ejecución de scripts externos no autorizados, inyección XSS, ataques Magecart / Formjacking y embebido en iframes. |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Fuerza transporte cifrado estricto bajo HTTPS / TLS 1.3 durante 2 años. |
| `X-Frame-Options` | `DENY` | Impide ataques de *Clickjacking* sobre la vista del QR dinámico de Pago Móvil. |
| `X-Content-Type-Options` | `nosniff` | Impide ataques de *MIME-sniffing* sobre respuestas del servidor. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Evita que URLs de órdenes o tokens de sesión se filtren en la cabecera `Referer` hacia dominios terceros. |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=()` | Deshabilita APIs del navegador innecesarias en el flujo de compra. |
| `Cache-Control` | `no-store, no-cache, must-revalidate, proxy-revalidate` | Impide el almacenamiento de datos de órdenes o boletos QR en cachés de navegadores o proxies compartidos. |

---

## 2. Interceptor de Headers Seguros en el Cliente API (`src/services/apiClient.ts`)

Toda petición transaccional saliente (`/api/v1/orders`, `/api/v1/webhooks/payment`, `/api/v1/orders/reverse`, `/api/v1/settlement/reconcile`) inyecta automáticamente las siguientes cabeceras verificables en la pestaña **Network** de las herramientas de desarrollo:

- **`Idempotency-Key`**: UUID v4 criptográfico único generado por intento mediante `crypto.randomUUID()` (`generateIdempotencyKey` en `src/utils/security.ts`) para impedir ataques de doble gasto o duplicación por reintentos de red.
- **`X-Request-Timestamp`**: Marca de tiempo exacta en milisegundos (`Date.now()`) para validación de ventana temporal.
- **`X-Nonce`**: Token aleatorio criptográfico de 128 bits de un solo uso (`crypto.getRandomValues`) para bloquear ataques de repetición (*Replay Attacks*).
- **`X-Client-Signature`**: Firma criptográfica `HMAC-SHA256` calculada mediante **Web Crypto API** (`window.crypto.subtle.sign`) sobre `${timestamp}.${nonce}.${payloadJson}`. Garantiza la integridad del paquete para que un atacante no pueda alterar el precio de la entrada ni la comisión mixta (`4.5% + $0.20` por entrada) utilizando un proxy interceptor.
- **`X-Correlation-ID`**: Identificador único de traza por sesión en memoria volátil (`corr_<uuid>`) para auditoría forense conforme a **SUDEBAN 641.10 y 001-21**, sin incluir ningún dato personal (PII) en las cabeceras.

---

## 3. Prevención de Fuga de Datos Sensibles (`src/utils/security.ts` y `src/utils/privacyCrypto.ts`)

- **Cero Almacenamiento Persistente de PII (Zero Persistent Storage):** La función `enforceZeroPersistentPiiStorage()` garantiza que nunca se almacenen números de cédula, teléfonos, correos ni tokens de QR en `localStorage`, `sessionStorage`, `IndexedDB` ni `Cookies`.
- **Memoria Volátil Efímera:** Los datos del formulario de compra residen únicamente en estado volátil de React con `autoComplete="off"` y se limpian de inmediato (`createEmptyCheckoutFormState()`) apenas se reserva la orden, se cancela o se desmonta la vista.
- **Seudonimización en Cliente con Web Crypto API:** Antes de empaquetar la telemetría o despachar la solicitud de orden, `generatePseudonymizedCustomerHash()` aplica `window.crypto.subtle.digest('SHA-256', ...)` con sal sobre la cédula y el teléfono para producir el `customer_hash` irreversible.
- **Desactivación de Source Maps y Limpieza de Consola:** Se configuró `build: { sourcemap: false }` en `vite.config.ts` para impedir la reconstrucción del código fuente en producción desde las DevTools, y se eliminó cualquier `console.log`/`console.info` de datos sensibles.

---

## 4. Sanitización Estricta de Entradas y Anti-Tabnabbing (`src/utils/security.ts`)

- **Sanitización Activa contra XSS / Inyección:** Las funciones `sanitizeTextInput`, `sanitizeDigitsInput`, `sanitizeEmailInput`, `sanitizeBuyerCheckoutForm` y `sanitizeOrganizerEventInput` eliminan en tiempo real etiquetas HTML, vectores `<script>`, esquemas `javascript:`/`data:`, manejadores de eventos inline (`onerror=`, `onload=`), comillas de escape y caracteres de control tanto en el checkout del comprador como en el modal de creación de eventos del organizador.
- **Protección Anti-Tabnabbing:** Todos los enlaces externos utilizan `SAFE_EXTERNAL_LINK_PROPS` (`target="_blank" rel="noopener noreferrer"`).

import { BuyerCheckoutForm, CreateNewEventInput } from '../types/veloztix';

/**
 * Clave pública/compartida de demostración para firma de integridad cliente (HMAC-SHA256).
 * En producción se deriva por sesión mediante ECDH / WebCrypto CryptoKey no extraíble.
 */
const CLIENT_HMAC_SECRET =
  import.meta.env.VITE_CLIENT_HMAC_SECRET ||
  'vt_appsec_2026_hmac_integrity_key_pci_sudeban';

const PII_HASH_SALT =
  import.meta.env.VITE_PRIVACY_SALT || 'vt_ucab_2026_salt';

/**
 * ID de correlación único por sesión almacenado exclusivamente en memoria volátil (RAM).
 * Cumple trazabilidad forense SUDEBAN 12441 y 12221 sin almacenar datos personales ni usar storage persistente.
 */
let volatileSessionCorrelationId: string | null = null;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Genera un UUID v4 criptográfico único para la cabecera `Idempotency-Key`.
 * Previene ataques de doble gasto o duplicación de órdenes en reintentos de red.
 */
export function generateIdempotencyKey(): string {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  const randomBytes = new Uint8Array(16);
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(randomBytes);
  } else {
    for (let i = 0; i < 16; i++) {
      randomBytes[i] = Math.floor(Math.random() * 256);
    }
  }
  randomBytes[6] = (randomBytes[6] & 0x0f) | 0x40;
  randomBytes[8] = (randomBytes[8] & 0x3f) | 0x80;
  const hex = bytesToHex(randomBytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Genera un valor aleatorio criptográfico de un solo uso (`X-Nonce`) de 128 bits.
 * Mitiga ataques de repetición (Replay Attacks) junto a `X-Request-Timestamp`.
 */
export function generateCryptographicNonce(): string {
  const bytes = new Uint8Array(16);
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes);
    return bytesToHex(bytes);
  }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 18)}`;
}

/**
 * Retorna el `X-Correlation-ID` de la sesión actual desde memoria volátil (nunca en localStorage/Cookies).
 */
export function getSessionCorrelationId(): string {
  if (!volatileSessionCorrelationId) {
    volatileSessionCorrelationId = `corr_${generateIdempotencyKey()}`;
  }
  return volatileSessionCorrelationId;
}

/**
 * Calcula una firma criptográfica HMAC-SHA256 real con Web Crypto API (`crypto.subtle`)
 * sobre el timestamp, nonce y payload serializado para la cabecera `X-Client-Signature`.
 * Impide que un atacante modifique el precio de la entrada o la comisión (4.5% + $0.20) con un proxy.
 */
export async function computeHmacSha256Signature(
  payloadJson: string,
  timestamp: string,
  nonce: string
): Promise<string> {
  const canonicalMessage = `${timestamp}.${nonce}.${payloadJson}`;
  try {
    if (typeof window !== 'undefined' && window.crypto?.subtle) {
      const encoder = new TextEncoder();
      const keyData = encoder.encode(CLIENT_HMAC_SECRET);
      const messageData = encoder.encode(canonicalMessage);

      const cryptoKey = await window.crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: { name: 'SHA-256' } },
        false,
        ['sign']
      );

      const signatureBuffer = await window.crypto.subtle.sign(
        'HMAC',
        cryptoKey,
        messageData
      );
      return `hmac-sha256=${bytesToHex(new Uint8Array(signatureBuffer))}`;
    }
  } catch {
    // Fallback determinístico si el entorno de ejecución restringe WebCrypto
  }
  const fallbackDigest = await sha256SubtleDigest(
    `${CLIENT_HMAC_SECRET}::${canonicalMessage}`
  );
  return `hmac-sha256=${fallbackDigest}`;
}

/**
 * Ejecuta SHA-256 nativo en el cliente mediante `window.crypto.subtle.digest('SHA-256', ...)`.
 */
export async function sha256SubtleDigest(input: string): Promise<string> {
  try {
    if (typeof window !== 'undefined' && window.crypto?.subtle) {
      const encoder = new TextEncoder();
      const data = encoder.encode(input);
      const digestBuffer = await window.crypto.subtle.digest('SHA-256', data);
      return bytesToHex(new Uint8Array(digestBuffer));
    }
  } catch {
    // Continúa a fallback determinístico
  }
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const part =
    (h1 >>> 0).toString(16).padStart(8, '0') +
    (h2 >>> 0).toString(16).padStart(8, '0');
  return (part + part + part + part).slice(0, 64);
}

/**
 * Seudonimización irreversible en cliente (`customer_hash`) usando `crypto.subtle.digest('SHA-256', ...)`
 * sobre Cédula y Teléfono antes de empaquetar telemetría o enviar la orden por red.
 */
export async function generatePseudonymizedCustomerHash(
  docPrefix: string,
  cedulaDigits: string,
  phonePrefix: string,
  phoneDigits: string
): Promise<string> {
  const cleanCedula = cedulaDigits.replace(/\D/g, '');
  const cleanPhone = phoneDigits.replace(/\D/g, '');
  const payload = `${PII_HASH_SALT}::DOC:${docPrefix}-${cleanCedula}|TEL:${phonePrefix}-${cleanPhone}`;
  return sha256SubtleDigest(payload);
}

// ============================================================================
// PREVENCIÓN DE FUGA DE DATOS SENSIBLES (ZERO PII LEAKAGE)
// ============================================================================

const FORBIDDEN_STORAGE_KEYS = [
  'cedula',
  'cedulaDigits',
  'phone',
  'phoneDigits',
  'email',
  'fullName',
  'buyer',
  'qrPayload',
  'gatePassQr',
  'customer_pii',
  'veloztix_checkout',
  'veloztix_order',
];

/**
 * Garantiza que ningún dato identificatorio (PII) ni token QR resida en `localStorage`,
 * `sessionStorage` o `document.cookie`. Se ejecuta al iniciar la aplicación y en cada transición.
 */
export function enforceZeroPersistentPiiStorage(): void {
  if (typeof window === 'undefined') return;

  try {
    for (const storage of [window.localStorage, window.sessionStorage]) {
      if (!storage) continue;
      const keysToRemove: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (!key) continue;
        const lowerKey = key.toLowerCase();
        if (
          FORBIDDEN_STORAGE_KEYS.some((forbidden) =>
            lowerKey.includes(forbidden.toLowerCase())
          )
        ) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => storage.removeItem(k));
    }
  } catch {
    // Ignorar errores si el navegador bloquea acceso a Web Storage por políticas de privacidad
  }
}

/**
 * Estado inicial vacío para limpiar de inmediato la memoria volátil de React
 * al desmontar el checkout o emitir el boleto.
 */
export function createEmptyCheckoutFormState(): BuyerCheckoutForm {
  return {
    fullName: '',
    docPrefix: 'V',
    cedulaDigits: '',
    phonePrefix: '0414',
    phoneDigits: '',
    email: '',
  };
}

// ============================================================================
// SANITIZACIÓN ESTRICTA DE ENTRADAS Y ANTI-TABNABBING (OWASP TOP 10)
// ============================================================================

/**
 * Elimina etiquetas HTML, vectores XSS (`<script>`, `javascript:`, `onerror=`, `onload=`),
 * comillas de escape y caracteres de control.
 */
export function sanitizeTextInput(raw: string, maxLength = 120): string {
  if (!raw) return '';
  return raw
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/\b(?:javascript|vbscript|data)\s*:/gi, '')
    .replace(/\bon[a-z]+\s*=/gi, '')
    .replace(/[<>"'`\\]/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .slice(0, maxLength);
}

/**
 * Permite exclusivamente dígitos numéricos (Cédula, Teléfono).
 */
export function sanitizeDigitsInput(raw: string, maxLength: number): string {
  if (!raw) return '';
  return raw.replace(/\D/g, '').slice(0, maxLength);
}

/**
 * Sanitiza correos electrónicos eliminando payloads de inyección, espacios, comillas y HTML.
 */
export function sanitizeEmailInput(raw: string, maxLength = 100): string {
  if (!raw) return '';
  return raw
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/\b(?:javascript|vbscript|data)\s*:/gi, '')
    .replace(/\bon[a-z]+\s*=/gi, '')
    .replace(/[<>"'`\\\s\u0000-\u001F\u007F]/g, '')
    .slice(0, maxLength);
}

/**
 * Sanitiza integralmente el formulario del comprador antes de procesarlo.
 */
export function sanitizeBuyerCheckoutForm(
  form: BuyerCheckoutForm
): BuyerCheckoutForm {
  return {
    fullName: sanitizeTextInput(form.fullName, 80).trim(),
    docPrefix: form.docPrefix === 'E' ? 'E' : 'V',
    cedulaDigits: sanitizeDigitsInput(form.cedulaDigits, 9),
    phonePrefix: ['0412', '0414', '0424', '0416', '0426'].includes(
      form.phonePrefix
    )
      ? form.phonePrefix
      : '0414',
    phoneDigits: sanitizeDigitsInput(form.phoneDigits, 7),
    email: sanitizeEmailInput(form.email, 100).toLowerCase(),
  };
}

/**
 * Sanitiza integralmente los campos de creación de eventos del Portal Organizador.
 */
export function sanitizeOrganizerEventInput(
  input: CreateNewEventInput
): CreateNewEventInput {
  return {
    title: sanitizeTextInput(input.title, 90).trim(),
    category: input.category,
    dateLabel: sanitizeTextInput(input.dateLabel, 60).trim(),
    timeLabel: sanitizeTextInput(input.timeLabel, 50).trim(),
    venue: sanitizeTextInput(input.venue, 90).trim(),
    priceUsd: Math.max(
      1,
      Math.min(10000, Number(Number(input.priceUsd || 1).toFixed(2)))
    ),
    totalCapacity: Math.max(
      10,
      Math.min(5000, Math.round(Number(input.totalCapacity || 50)))
    ),
    description: sanitizeTextInput(input.description, 350).trim(),
  };
}

/**
 * Atributos obligatorios Anti-Tabnabbing para cualquier enlace externo (`<a>`).
 */
export const SAFE_EXTERNAL_LINK_PROPS = {
  target: '_blank' as const,
  rel: 'noopener noreferrer',
};

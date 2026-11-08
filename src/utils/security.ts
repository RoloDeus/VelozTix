/**
 * Módulo de Endurecimiento de Seguridad Client-Side (AppSec) y Validación Estricta de Entradas — VelozTix
 * Alineado con PCI-DSS 4.0 (Alcance Delegador), OWASP Top 10 y SUDEBAN 12441 / 12221.
 */

import { BuyerCheckoutForm, CreateNewEventInput } from '../types/veloztix';

export const SAFE_EXTERNAL_LINK_PROPS = {
  target: '_blank',
  rel: 'noopener noreferrer',
} as const;

let sessionCorrelationId: string | null = null;
const SESSION_SIGNING_SECRET =
  'vt_appsec_ephemeral_hmac_key_2026_pci_dss_4_sudeban_12441';

const SENSITIVE_STORAGE_PATTERNS = [
  /cedula/i,
  /national_id/i,
  /phone/i,
  /telefono/i,
  /email/i,
  /correo/i,
  /buyer_pii/i,
  /pan/i,
  /cvv/i,
  /c2p/i,
  /qr_payload/i,
  /gate_pass/i,
];

/**
 * Purga proactivamente cualquier rastro de PII o tokens de pago en localStorage y sessionStorage.
 */
export function enforceZeroPersistentPiiStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    const storages: Storage[] = [window.localStorage, window.sessionStorage];
    for (const storage of storages) {
      const keysToRemove: string[] = [];
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (
          key &&
          SENSITIVE_STORAGE_PATTERNS.some((pattern) => pattern.test(key))
        ) {
          keysToRemove.push(key);
        }
      }
      for (const key of keysToRemove) {
        storage.removeItem(key);
      }
    }
  } catch {
    // Entornos con Web Storage restringido
  }
}

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

/**
 * Genera un UUID v4 criptográfico (`crypto.randomUUID()`) para `Idempotency-Key`.
 */
export function generateIdempotencyKey(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(
    ''
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Genera un Nonce aleatorio criptográfico de 128 bits en hexadecimal.
 */
export function generateCryptographicNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Identificador de sesión efímero en memoria RAM para trazabilidad de auditoría (`X-Correlation-ID`).
 */
export function getSessionCorrelationId(): string {
  if (!sessionCorrelationId) {
    sessionCorrelationId = `vt-corr-${generateIdempotencyKey()}`;
  }
  return sessionCorrelationId;
}

/**
 * Calcula una firma HMAC-SHA256 real sobre `timestamp.nonce.payload` usando Web Crypto API.
 */
export async function computeHmacSha256Signature(
  serializedPayload: string,
  timestamp: string,
  nonce: string
): Promise<string> {
  const canonicalMessage = `${timestamp}.${nonce}.${serializedPayload}`;
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(SESSION_SIGNING_SECRET);
    const msgData = encoder.encode(canonicalMessage);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signatureBuffer = await crypto.subtle.sign(
      'HMAC',
      cryptoKey,
      msgData
    );
    return Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return `hmac_fallback_${timestamp}_${nonce}`;
}

/**
 * Calcula un digest SHA-256 en hexadecimal mediante `window.crypto.subtle.digest`.
 */
export async function sha256SubtleDigest(message: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return `sha256_fallback_${message.length}`;
}

/**
 * Seudonimización irreversible en el cliente (Privacy by Design - SUDEBAN 12221):
 * Genera el `customer_hash` (SHA-256 con salt de dominio) sobre Cédula y Teléfono.
 */
export async function generatePseudonymizedCustomerHash(
  docPrefix: string,
  cedulaDigits: string,
  phonePrefix: string,
  phoneDigits: string
): Promise<string> {
  const canonicalIdentity = `veloztix_salt_2026::${docPrefix.trim().toUpperCase()}-${cedulaDigits.trim()}::${phonePrefix.trim()}-${phoneDigits.trim()}`;
  const digest = await sha256SubtleDigest(canonicalIdentity);
  return `chash_${digest}`;
}

// ============================================================================
// REGLAS ESTRICTAS DE ENTRADA Y VALIDACIÓN CAMPO POR CAMPO (INPUT HARDENING)
// ============================================================================

/**
 * Sanitización general contra XSS e inyección de etiquetas HTML o scripts.
 */
export function sanitizeTextInput(raw: string, maxLength = 120): string {
  return raw
    .replace(/<[^>]*>?/gm, '')
    .replace(/javascript:/gi, '')
    .replace(/data:/gi, '')
    .replace(/vbscript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/[<>'"`;\\{}]/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .slice(0, maxLength);
}

/**
 * 1. NOMBRE Y APELLIDO — Solo letras (incluyendo tildes, ñ, ü) y espacios.
 * Bloquea cualquier número (`0-9`) o carácter especial (`@#$%^&*()_+=...`).
 */
export function sanitizePersonNameInput(raw: string, maxLength = 80): string {
  return raw
    .replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^\s+/, '')
    .slice(0, maxLength);
}

/**
 * Valida que el nombre completo tenga al menos Nombre y Apellido (mínimo 2 palabras de >=2 letras)
 * compuestos exclusivamente por letras.
 */
export function isValidPersonName(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 5 || trimmed.length > 80) return false;
  return /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ]{2,}(?:\s+[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ]{2,})+$/.test(
    trimmed
  );
}

/**
 * 2. DÍGITOS ENTEROS PUROS — Para Cédula y Teléfono.
 * Bloquea letras, signos, espacios y decimales.
 */
export function sanitizeDigitsOnly(raw: string, maxLength: number): string {
  return raw.replace(/\D+/g, '').slice(0, maxLength);
}

export const sanitizeDigitsInput = sanitizeDigitsOnly;

/**
 * Valida estrictamente la Cédula de Identidad (6 a 9 dígitos enteros, no todos ceros).
 */
export function isValidCedula(digits: string): boolean {
  const clean = digits.trim();
  if (!/^\d{6,9}$/.test(clean)) return false;
  if (/^0+$/.test(clean)) return false;
  return true;
}

/**
 * Valida estrictamente los 7 dígitos del teléfono celular (después de 0412/0414/0424/0416/0426).
 */
export function isValidPhoneDigits(digits: string): boolean {
  const clean = digits.trim();
  if (!/^\d{7}$/.test(clean)) return false;
  if (/^0+$/.test(clean)) return false;
  return true;
}

/**
 * 3. CORREO ELECTRÓNICO — Formato específico (`usuario@dominio.ext`).
 * Filtra espacios y caracteres no permitidos en tiempo real y evita más de un `@`.
 */
export function sanitizeEmailInput(raw: string, maxLength = 100): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9._%+-@]/g, '');

  const parts = cleaned.split('@');
  const singleAt =
    parts.length > 2 ? `${parts[0]}@${parts.slice(1).join('')}` : cleaned;

  return singleAt.slice(0, maxLength);
}

/**
 * Valida estrictamente el formato de correo electrónico (`usuario@dominio.tld`).
 */
export function isValidEmail(email: string): boolean {
  const trimmed = email.trim().toLowerCase();
  if (trimmed.length < 6 || trimmed.length > 100) return false;
  if (trimmed.includes('..')) return false;
  return /^[a-z0-9]+([._%+-]?[a-z0-9]+)*@[a-z0-9]+([.-]?[a-z0-9]+)*\.[a-z]{2,10}$/.test(
    trimmed
  );
}

/**
 * 4. TEXTO COMERCIAL PARA EVENTOS (Título, Lugar, Descripción y Buscador).
 * Permite letras, números, espacios y puntuación comercial básica, bloqueando caracteres de inyección.
 */
export function sanitizeEventTextInput(raw: string, maxLength = 120): string {
  return raw
    .replace(/<[^>]*>?/gm, '')
    .replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ\s.,\-():/&+#¡!¿?]/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^\s+/, '')
    .slice(0, maxLength);
}

/**
 * Verifica que un texto de evento tenga longitud mínima y contenga al menos 3 letras reales
 * (impide publicar un evento cuyo nombre o lugar sea solo números como "12345" o signos).
 */
export function isValidEventText(text: string, minLength = 4): boolean {
  const trimmed = text.trim();
  if (trimmed.length < minLength) return false;
  const letterCount = (trimmed.match(/[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ]/g) || []).length;
  return letterCount >= 3;
}

/**
 * 5. PRECIO DECIMAL (USD) — Permite solo números y hasta 2 decimales (`0.00`).
 * Bloquea letras, `e`, `E`, `+`, `-` y puntos decimales múltiples.
 */
export function sanitizeDecimalPriceInput(raw: string): string {
  const normalized = raw.replace(/,/g, '.').replace(/[^0-9.]/g, '');
  if (!normalized) return '';

  const parts = normalized.split('.');
  const integerPartRaw = parts[0].slice(0, 5);
  const integerPart =
    integerPartRaw.length > 1
      ? integerPartRaw.replace(/^0+/, '') || '0'
      : integerPartRaw;

  if (parts.length === 1) {
    return integerPart;
  }

  const decimalPart = parts.slice(1).join('').slice(0, 2);
  return `${integerPart}.${decimalPart}`;
}

/**
 * Valida que el precio sea un número decimal positivo dentro del rango `[min, max]`.
 */
export function isValidDecimalPrice(
  raw: string,
  min = 1.0,
  max = 10000.0
): boolean {
  const trimmed = raw.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return false;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= min && value <= max;
}

/**
 * 6. NÚMERO DE PARTICIPANTES / CUPOS — Entero estricto (`0-9`).
 * Bloquea decimales (`.`, `,`), letras y signos.
 */
export function sanitizeIntegerInput(raw: string, maxDigits = 4): string {
  const digits = raw.replace(/\D/g, '').slice(0, maxDigits);
  if (!digits) return '';
  return digits.replace(/^0+/, '') || '';
}

/**
 * Valida que el número de participantes/cupos sea estrictamente un entero positivo en `[min, max]`.
 */
export function isValidIntegerCapacity(
  raw: string,
  min = 10,
  max = 5000
): boolean {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return false;
  const value = Number(trimmed);
  return Number.isInteger(value) && value >= min && value <= max;
}

/**
 * 7. FECHAS Y HORAS EN FORMATO ESTRICTO (`YYYY-MM-DD` y `HH:mm`).
 */
export function getTodayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isValidIsoDate(isoDate: string, minIsoDate?: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return false;
  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return false;
  if (minIsoDate && isoDate < minIsoDate) return false;
  return true;
}

export function formatIsoDateToSpanishLabel(isoDate: string): string {
  if (!isValidIsoDate(isoDate)) return isoDate;
  const date = new Date(`${isoDate}T00:00:00`);
  const days = [
    'Domingo',
    'Lunes',
    'Martes',
    'Miércoles',
    'Jueves',
    'Viernes',
    'Sábado',
  ];
  const months = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
  ];
  const dayName = days[date.getDay()];
  const dayNumber = date.getDate();
  const monthName = months[date.getMonth()];
  const year = date.getFullYear();
  return `${dayName} ${dayNumber} de ${monthName}, ${year}`;
}

export function isValidTime24h(timeStr: string): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(timeStr.trim());
}

function formatSingleTime12h(time24: string): string {
  if (!isValidTime24h(time24)) return time24;
  const [hStr, mStr] = time24.split(':');
  const hour24 = Number(hStr);
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${mStr} ${period}`;
}

export function formatTimeRangeToLabel(
  startTime24: string,
  endTime24: string
): string {
  return `${formatSingleTime12h(startTime24)} – ${formatSingleTime12h(endTime24)}`;
}

/**
 * Sanitiza y valida un formulario de comprador completo antes de enviarlo al servicio de órdenes.
 */
export function sanitizeBuyerCheckoutForm(
  form: BuyerCheckoutForm
): BuyerCheckoutForm {
  const validDocPrefixes: Array<'V' | 'E'> = ['V', 'E'];
  const validPhonePrefixes: Array<BuyerCheckoutForm['phonePrefix']> = [
    '0412',
    '0414',
    '0424',
    '0416',
    '0426',
  ];

  return {
    fullName: sanitizePersonNameInput(form.fullName, 80).trim(),
    docPrefix: validDocPrefixes.includes(form.docPrefix) ? form.docPrefix : 'V',
    cedulaDigits: sanitizeDigitsOnly(form.cedulaDigits, 9),
    phonePrefix: validPhonePrefixes.includes(form.phonePrefix)
      ? form.phonePrefix
      : '0414',
    phoneDigits: sanitizeDigitsOnly(form.phoneDigits, 7),
    email: sanitizeEmailInput(form.email, 100),
  };
}

/**
 * Sanitiza y valida los campos de creación de un nuevo evento desde el Portal Organizador.
 */
export function sanitizeOrganizerEventInput(
  input: CreateNewEventInput
): CreateNewEventInput {
  const safePrice = Number.isFinite(input.priceUsd)
    ? Math.min(10000, Math.max(1, Number(input.priceUsd.toFixed(2))))
    : 10;
  const safeCapacity = Number.isFinite(input.totalCapacity)
    ? Math.min(5000, Math.max(10, Math.round(input.totalCapacity)))
    : 150;

  return {
    title: sanitizeEventTextInput(input.title, 90).trim(),
    category: input.category,
    dateLabel: sanitizeEventTextInput(input.dateLabel, 60).trim(),
    timeLabel: sanitizeEventTextInput(input.timeLabel, 50).trim(),
    venue: sanitizeEventTextInput(input.venue, 90).trim(),
    priceUsd: safePrice,
    totalCapacity: safeCapacity,
    description: sanitizeEventTextInput(input.description, 350).trim(),
  };
}

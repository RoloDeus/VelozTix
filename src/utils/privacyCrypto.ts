import { BuyerCheckoutForm } from '../types/veloztix';
import {
  generatePseudonymizedCustomerHash,
  sha256SubtleDigest,
} from './security';

export async function sha256Hex(message: string): Promise<string> {
  return sha256SubtleDigest(message);
}

/**
 * Enmascara automáticamente la cédula: Ej. V-**.*45.892
 */
export function maskCedula(prefix: 'V' | 'E', rawDigits: string): string {
  const digits = rawDigits.replace(/\D/g, '');
  if (!digits) return `${prefix}-**.*45.892`;

  if (digits.length <= 4) {
    return `${prefix}-***${digits}`;
  }

  const visibleCount = Math.min(5, Math.max(3, digits.length - 3));
  const maskedChars = digits
    .split('')
    .map((ch, idx) => (idx < digits.length - visibleCount ? '*' : ch));

  let formatted = '';
  let countFromRight = 0;
  for (let i = maskedChars.length - 1; i >= 0; i--) {
    if (countFromRight > 0 && countFromRight % 3 === 0) {
      formatted = '.' + formatted;
    }
    formatted = maskedChars[i] + formatted;
    countFromRight++;
  }

  return `${prefix}-${formatted}`;
}

/**
 * Enmascara teléfono: Ej. 0414-***-4821
 */
export function maskPhone(prefix: string, rawDigits: string): string {
  const digits = rawDigits.replace(/\D/g, '');
  if (!digits) return `${prefix}-***-****`;
  const last4 = digits.slice(-4).padStart(4, '*');
  return `${prefix}-***-${last4}`;
}

/**
 * Enmascara correo: Ej. ro***@correo.com
 */
export function maskEmail(email: string): string {
  const trimmed = email.trim();
  if (!trimmed || !trimmed.includes('@')) {
    return 'us***@correo.com';
  }
  const [local, domain] = trimmed.split('@');
  const visibleLocal = local.slice(0, Math.min(2, local.length));
  return `${visibleLocal}***@${domain}`;
}

/**
 * Genera internamente el customer_hash irreversible mediante SHA-256 (window.crypto.subtle.digest)
 * sobre la cédula y el teléfono antes de empaquetar telemetría o enviar la orden.
 */
export async function generateCustomerHash(
  buyer: BuyerCheckoutForm
): Promise<string> {
  return generatePseudonymizedCustomerHash(
    buyer.docPrefix,
    buyer.cedulaDigits,
    buyer.phonePrefix,
    buyer.phoneDigits
  );
}

export async function generateDeviceFingerprint(): Promise<string> {
  const screenInfo =
    typeof window !== 'undefined'
      ? `${window.screen.width}x${window.screen.height}`
      : '1080x1920';
  const tz =
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Caracas';
  const fullHash = await sha256Hex(`fp|${screenInfo}|${tz}`);
  return `dfp_${fullHash.slice(0, 12)}`;
}

export async function generateSignedGateToken(
  orderId: string,
  eventId: string,
  qty: number
): Promise<string> {
  const nonce = Math.random().toString(36).slice(2, 10).toUpperCase();
  const sig = (await sha256Hex(`VT_GATE::${orderId}::${eventId}::${qty}::${nonce}`)).slice(
    0,
    18
  );
  return `https://veloztix.app/verify/${orderId}?evt=${eventId}&q=${qty}&s=${sig}`;
}

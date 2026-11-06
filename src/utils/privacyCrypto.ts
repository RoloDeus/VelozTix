import { BuyerCheckoutForm } from '../types/veloztix';

const PRIVACY_SALT =
  import.meta.env.VITE_PRIVACY_SALT || 'vt_ucab_2026_salt';

function fallbackHexHash(input: string): string {
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

export async function sha256Hex(message: string): Promise<string> {
  try {
    if (typeof window !== 'undefined' && window.crypto?.subtle) {
      const encoder = new TextEncoder();
      const data = encoder.encode(message);
      const digest = await window.crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch {
    // Fallback
  }
  return fallbackHexHash(message);
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
 * Genera internamente (en segundo plano) el customer_hash irreversible
 */
export async function generateCustomerHash(
  buyer: BuyerCheckoutForm
): Promise<string> {
  const normalizedCedula = buyer.cedulaDigits.replace(/\D/g, '');
  const normalizedPhone = buyer.phoneDigits.replace(/\D/g, '');
  const normalizedEmail = buyer.email.trim().toLowerCase();
  const canonical = `${PRIVACY_SALT}::${buyer.docPrefix}-${normalizedCedula}|${buyer.phonePrefix}-${normalizedPhone}|${normalizedEmail}`;
  return sha256Hex(canonical);
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

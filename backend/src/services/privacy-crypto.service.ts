import crypto from 'node:crypto';
import { BuyerPiiDto } from '../types/openapi.js';

export interface EncryptedPayload {
  ivHex: string;
  tagHex: string;
  cipherHex: string;
  serialized: string;
}

export class PrivacyCryptoService {
  private masterKey: Buffer;
  private salt: string;
  private jwtSecret: string;
  private webhookSecret: string;

  constructor(
    masterKey: Buffer,
    salt: string,
    jwtSecret: string,
    webhookSecret: string
  ) {
    if (masterKey.length !== 32) {
      // Ensure 32 bytes for AES-256
      this.masterKey = crypto.createHash('sha256').update(masterKey).digest();
    } else {
      this.masterKey = masterKey;
    }
    this.salt = salt;
    this.jwtSecret = jwtSecret;
    this.webhookSecret = webhookSecret;
  }

  // ==========================================
  // AES-256-GCM Encryption / Decryption
  // ==========================================
  encryptGcm(plainText: string): string {
    const iv = crypto.randomBytes(12); // 96-bit IV recommended for GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', this.masterKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(plainText, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    // Format: iv:tag:ciphertext in hex
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  decryptGcm(serialized: string): string {
    const parts = serialized.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted payload format');
    }
    const [ivHex, tagHex, cipherHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const encrypted = Buffer.from(cipherHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', this.masterKey, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }

  // ==========================================
  // SHA-256 + Salt (Customer Hash)
  // ==========================================
  generateCustomerHash(buyer: BuyerPiiDto): string {
    const normDni = buyer.national_id.toUpperCase().replace(/\s+/g, '');
    const normPhone = buyer.phone_number.replace(/\D/g, '');
    const normEmail = buyer.email.trim().toLowerCase();
    const canonical = `${this.salt}::${normDni}|${normPhone}|${normEmail}`;

    const hash = crypto.createHash('sha256').update(canonical).digest('hex');
    return `chash_${hash}`;
  }

  // ==========================================
  // Masking Helpers
  // ==========================================
  maskCedula(rawDni: string): string {
    const trimmed = rawDni.trim().toUpperCase();
    const prefix = trimmed.startsWith('E') ? 'E' : 'V';
    const digits = trimmed.replace(/\D/g, '');
    if (!digits) return `${prefix}-28.***.***`;

    if (digits.length <= 4) {
      return `${prefix}-***${digits}`;
    }

    const firstTwo = digits.slice(0, 2);
    const lastThree = digits.slice(-3);
    return `${prefix}-${firstTwo}.***.${lastThree}`;
  }

  maskPhone(rawPhone: string): string {
    const digits = rawPhone.replace(/\D/g, '');
    if (digits.length < 7) {
      return '0414***1234';
    }
    const prefix = digits.startsWith('58')
      ? digits.slice(2, 6)
      : digits.slice(0, 4);
    const lastFour = digits.slice(-4);
    return `${prefix}***${lastFour}`;
  }

  maskAccount(accountNumber: string): string {
    const digits = accountNumber.replace(/\D/g, '');
    if (digits.length < 8) return '01050012************';
    const firstEight = digits.slice(0, 8);
    return `${firstEight}${'*'.repeat(Math.max(12, digits.length - 8))}`;
  }

  maskRif(rif: string): string {
    const trimmed = rif.trim().toUpperCase();
    if (!trimmed.includes('-')) {
      const p = trimmed.charAt(0);
      const rest = trimmed.slice(1);
      return `${p}-${rest.slice(0, 2)}***${rest.slice(-4)}`;
    }
    return trimmed;
  }

  // ==========================================
  // Ticket JWT (HMAC-SHA256, strictly ZERO PII)
  // ==========================================
  generateTicketJwt(payload: {
    ticket_id: string;
    event_id: string;
    nonce: string;
  }): { token: string; hash: string } {
    const header = { alg: 'HS256', typ: 'JWT' };
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');

    const dataToSign = `${encodedHeader}.${encodedPayload}`;
    const signature = crypto
      .createHmac('sha256', this.jwtSecret)
      .update(dataToSign)
      .digest('base64url');

    const token = `${dataToSign}.${signature}`;
    const hash = crypto.createHash('sha256').update(token).digest('hex');

    return { token, hash };
  }

  verifyTicketJwt(token: string): {
    valid: boolean;
    payload?: { ticket_id: string; event_id: string; nonce: string };
  } {
    const parts = token.split('.');
    if (parts.length !== 3) return { valid: false };
    const [encodedHeader, encodedPayload, signature] = parts;

    const dataToSign = `${encodedHeader}.${encodedPayload}`;
    const expectedSig = crypto
      .createHmac('sha256', this.jwtSecret)
      .update(dataToSign)
      .digest('base64url');

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return { valid: false };
    }

    try {
      const payloadJson = Buffer.from(encodedPayload, 'base64url').toString('utf8');
      const parsed = JSON.parse(payloadJson);
      return { valid: true, payload: parsed };
    } catch {
      return { valid: false };
    }
  }

  // ==========================================
  // Dynamic QR Payload & Signature
  // ==========================================
  generateDynamicQrPayload(params: {
    bankCode: string;
    rif: string;
    phoneMasked: string;
    exactAmountBs: number;
    rrn: string;
    ttlSeconds: number;
    expiresAtUnix: number;
  }): { qrToken: string; hmacSignature: string } {
    const dataToSign = `bnk=${params.bankCode}&rif=${params.rif}&amt=${params.exactAmountBs.toFixed(2)}&rrn=${params.rrn}&exp=${params.expiresAtUnix}`;
    const hmacSignature = crypto
      .createHmac('sha256', this.jwtSecret)
      .update(dataToSign)
      .digest('hex');

    const qrToken = `VELOZTIX://PM?${dataToSign}&sig=${hmacSignature.slice(0, 16)}`;
    return { qrToken, hmacSignature };
  }

  // ==========================================
  // Webhook Signature Validation (HMAC-SHA256)
  // ==========================================
  validateWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
    if (!signatureHeader || !rawBody) {
      return false;
    }

    const cleanSig = signatureHeader.trim().replace(/^sha256=/, '');
    const computed = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex');

    if (cleanSig.length !== computed.length) {
      return false;
    }

    try {
      return crypto.timingSafeEqual(
        Buffer.from(cleanSig, 'hex'),
        Buffer.from(computed, 'hex')
      );
    } catch {
      return false;
    }
  }

  generateWebhookSignature(rawBody: Buffer | string): string {
    const bodyBuf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
    return crypto
      .createHmac('sha256', this.webhookSecret)
      .update(bodyBuf)
      .digest('hex');
  }

  // Helper for SHA-256 fingerprinting
  sha256(data: string | Buffer): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }
}


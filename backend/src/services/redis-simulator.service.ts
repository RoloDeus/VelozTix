import { IClock } from './clock.js';

export interface StockState {
  totalStock: number;
  availableStock: number;
  reservedStock: number;
  soldStock: number;
}

export interface ReservationRecord {
  orderId: string;
  eventId: string;
  quantity: number;
  expiresAtMs: number;
}

export interface IdempotencyRecord {
  key: string;
  fingerprint: string;
  statusCode: number;
  responseBody: any;
  headers?: Record<string, string>;
  expiresAtMs: number;
}

export type ReservationExpiredListener = (
  orderId: string,
  eventId: string,
  quantity: number
) => void;

export class InMemoryRedisService {
  private clock: IClock;
  private stockMap = new Map<string, StockState>();
  private reservations = new Map<string, ReservationRecord>();
  private idempotencyStore = new Map<string, IdempotencyRecord>();
  private expirationListeners: ReservationExpiredListener[] = [];
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(clock: IClock, startAutoSweep = true) {
    this.clock = clock;
    if (startAutoSweep) {
      // Auto-sweep expired reservations every 5 seconds
      this.sweepTimer = setInterval(() => {
        this.sweepExpiredReservations();
      }, 5000);
      if (this.sweepTimer.unref) {
        this.sweepTimer.unref();
      }
    }
  }

  stop(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  // ==========================================
  // Stock & Reservation Management
  // ==========================================
  initEventStock(eventId: string, totalStock: number, soldStock = 0): void {
    const existing = this.stockMap.get(eventId);
    const sold = existing ? existing.soldStock : soldStock;
    const reserved = existing ? existing.reservedStock : 0;
    const available = Math.max(0, totalStock - sold - reserved);

    this.stockMap.set(eventId, {
      totalStock,
      availableStock: available,
      reservedStock: reserved,
      soldStock: sold,
    });
  }

  getStock(eventId: string): StockState | null {
    this.sweepExpiredReservations();
    const state = this.stockMap.get(eventId);
    return state ? { ...state } : null;
  }

  reserveStock(
    eventId: string,
    orderId: string,
    quantity: number,
    ttlSeconds = 300
  ): boolean {
    this.sweepExpiredReservations();

    const state = this.stockMap.get(eventId);
    if (!state || state.availableStock < quantity) {
      return false;
    }

    state.availableStock -= quantity;
    state.reservedStock += quantity;

    const expiresAtMs = this.clock.nowMs() + ttlSeconds * 1000;
    this.reservations.set(orderId, {
      orderId,
      eventId,
      quantity,
      expiresAtMs,
    });

    return true;
  }

  confirmReservation(orderId: string): boolean {
    this.sweepExpiredReservations();

    const res = this.reservations.get(orderId);
    if (!res) {
      return false;
    }

    const state = this.stockMap.get(res.eventId);
    if (state) {
      state.reservedStock = Math.max(0, state.reservedStock - res.quantity);
      state.soldStock += res.quantity;
    }

    this.reservations.delete(orderId);
    return true;
  }

  releaseReservation(orderId: string, reason?: string): boolean {
    const res = this.reservations.get(orderId);
    if (!res) {
      return false;
    }

    const state = this.stockMap.get(res.eventId);
    if (state) {
      state.reservedStock = Math.max(0, state.reservedStock - res.quantity);
      state.availableStock += res.quantity;
    }

    this.reservations.delete(orderId);
    return true;
  }

  getReservation(orderId: string): ReservationRecord | null {
    this.sweepExpiredReservations();
    const res = this.reservations.get(orderId);
    return res ? { ...res } : null;
  }

  onReservationExpired(listener: ReservationExpiredListener): void {
    this.expirationListeners.push(listener);
  }

  sweepExpiredReservations(): string[] {
    const now = this.clock.nowMs();
    const expiredOrderIds: string[] = [];

    for (const [orderId, res] of this.reservations.entries()) {
      if (res.expiresAtMs <= now) {
        expiredOrderIds.push(orderId);
        const state = this.stockMap.get(res.eventId);
        if (state) {
          state.reservedStock = Math.max(0, state.reservedStock - res.quantity);
          state.availableStock += res.quantity;
        }
        this.reservations.delete(orderId);

        for (const listener of this.expirationListeners) {
          try {
            listener(res.orderId, res.eventId, res.quantity);
          } catch {
            // Ignore listener errors during sweep
          }
        }
      }
    }

    return expiredOrderIds;
  }

  // ==========================================
  // Idempotency Storage (TTL: 24h = 86400s)
  // ==========================================
  getIdempotency(key: string): IdempotencyRecord | null {
    const record = this.idempotencyStore.get(key);
    if (!record) return null;

    if (record.expiresAtMs <= this.clock.nowMs()) {
      this.idempotencyStore.delete(key);
      return null;
    }

    return record;
  }

  setIdempotency(
    key: string,
    data: {
      fingerprint: string;
      statusCode: number;
      responseBody: any;
      headers?: Record<string, string>;
    },
    ttlSeconds = 86400
  ): void {
    const expiresAtMs = this.clock.nowMs() + ttlSeconds * 1000;
    this.idempotencyStore.set(key, {
      key,
      fingerprint: data.fingerprint,
      statusCode: data.statusCode,
      responseBody: data.responseBody,
      headers: data.headers,
      expiresAtMs,
    });
  }

  clearAll(): void {
    this.stockMap.clear();
    this.reservations.clear();
    this.idempotencyStore.clear();
  }
}


export type AppRole = 'buyer' | 'organizer';

export type BuyerStep =
  | 'catalog'
  | 'event_detail'
  | 'checkout'
  | 'payment_qr'
  | 'ticket_issued';

export type OrganizerTab =
  | 'events'
  | 'orders'
  | 'reconciliation'
  | 'analytics';

export type EventCategory =
  | 'Música & Fiestas'
  | 'Gaming & Tech'
  | 'Comedia & Cultura';

export type PosterTheme = 'violet' | 'emerald' | 'amber' | 'rose';

export interface EventItem {
  id: string;
  slug: string;
  title: string;
  tagline: string;
  description: string;
  highlights: string[];
  category: EventCategory;
  posterTheme: PosterTheme;
  posterEmoji: string;
  organizerName: string;
  instagramHandle: string;
  dateLabel: string;
  shortDateBadge: string;
  timeLabel: string;
  venue: string;
  city: string;
  priceUsd: number;
  priceBs: number;
  totalCapacity: number;
  soldCount: number;
  reservedCount: number;
  availableCount: number;
  maxPerOrder: number;
  viewsCount: number;
}

export interface BuyerCheckoutForm {
  fullName: string;
  docPrefix: 'V' | 'E';
  cedulaDigits: string;
  phonePrefix: '0412' | '0414' | '0424' | '0416' | '0426';
  phoneDigits: string;
  email: string;
}

export type OrderCommercialStatus = 'paid' | 'pending' | 'cancelled';

export interface PagoMovilInstructions {
  bankName: string;
  bankCode: string;
  rif: string;
  phone: string;
  conceptRef: string;
  qrPayload: string;
  expiresAtIso: string;
  ttlSeconds: number;
}

export const COMMISSION_RATE = 0.045; // Esquema mixto VelozTix: 4.5% + $0.20 USD por entrada
export const FLAT_FEE_PER_TICKET_USD = 0.2;
export const BCV_RATE_BS = 45.0;

export interface OrderPricingBreakdown {
  subtotalUsd: number;
  percentageFeeUsd: number;
  flatFeeUsd: number;
  totalCommissionUsd: number;
  totalUsd: number;
  totalBs: number;
  netOrganizerUsd: number;
}

/**
 * Fórmula central de comisión mixta VelozTix (4.5% + $0.20 por entrada):
 * - subtotal = N * P
 * - comision_porcentual = subtotal * 0.045
 * - comision_fija = N * 0.20
 * - comision_total_veloztix = comision_porcentual + comision_fija
 */
export function calculateVelozTixPricing(
  unitPriceUsd: number,
  quantity: number
): OrderPricingBreakdown {
  const subtotal = Number((quantity * unitPriceUsd).toFixed(2));
  const comisionPorcentual = Number((subtotal * COMMISSION_RATE).toFixed(2));
  const comisionFija = Number((quantity * FLAT_FEE_PER_TICKET_USD).toFixed(2));
  const comisionTotalVeloztix = Number(
    (comisionPorcentual + comisionFija).toFixed(2)
  );
  const totalUsd = Number((subtotal + comisionTotalVeloztix).toFixed(2));
  const totalBs = Number((totalUsd * BCV_RATE_BS).toFixed(2));
  const netOrganizerUsd = Number((totalUsd - comisionTotalVeloztix).toFixed(2));

  return {
    subtotalUsd: subtotal,
    percentageFeeUsd: comisionPorcentual,
    flatFeeUsd: comisionFija,
    totalCommissionUsd: comisionTotalVeloztix,
    totalUsd,
    totalBs,
    netOrganizerUsd,
  };
}

export interface TicketOrder {
  id: string; // Ej: VT-84920
  eventId: string;
  eventTitle: string;
  eventDateLabel: string;
  eventTimeLabel: string;
  eventVenue: string;
  posterTheme: PosterTheme;
  quantity: number;
  unitPriceUsd: number;
  subtotalTicketsUsd: number;
  percentageFeeUsd: number;
  flatFeeUsd: number;
  totalCommissionUsd: number; // Comisión VelozTix (4.5% + $0.20/ticket)
  totalUsd: number;
  totalBs: number;
  netOrganizerUsd: number; // Total Recaudado - Comisión Total VelozTix
  status: OrderCommercialStatus;
  createdAtIso: string;
  buyerName: string;
  maskedCedula: string; // Ej: V-**.*45.892
  maskedPhone: string;  // Ej: 0414-***-4821
  maskedEmail: string;
  customerHashInternal: string; // Solo en código/memoria, invisible en UI
  pagoMovil: PagoMovilInstructions;
  gatePassQr: string;
  reconciled: boolean;
  buyerProfileInternal: 'fan_directo' | 'indeciso';
}

export type ReconciliationRowState =
  | 'matched'
  | 'payment_without_ticket'
  | 'ticket_without_payment';

export interface ReconciliationRow {
  id: string;
  orderId: string;
  eventId: string;
  eventTitle: string;
  buyerDisplay: string;
  quantity: number;
  subtotalTicketsUsd: number;
  amountUsd: number;
  amountBs: number;
  percentageFeeUsd: number;
  flatFeeUsd: number;
  veloztixCommissionUsd: number;
  netOrganizerUsd: number;
  paymentRef: string;
  state: ReconciliationRowState;
  note: string;
}

export interface KeystrokeDynamics {
  avg_inter_key_ms: number;
  checkout_fill_time_ms: number;
  copy_paste_flag: boolean;
  paste_events_count: number;
  keystrokes_count: number;
  backspace_corrections: number;
}

export interface BehavioralTelemetryVector {
  session_id: string;
  dwell_time_ms: number;
  scroll_depth_pct: number;
  keystroke_dynamics: KeystrokeDynamics;
  tab_switch_count: number;
  pointer_events_count: number;
  interaction_speed: number;
  device_fingerprint: string;
}

export interface CreateNewEventInput {
  title: string;
  category: EventCategory;
  dateLabel: string;
  timeLabel: string;
  venue: string;
  priceUsd: number;
  totalCapacity: number;
  description: string;
}

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
  totalUsd: number;
  totalBs: number;
  commissionUsd: number; // 4.5%
  netOrganizerUsd: number; // 95.5%
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
  amountUsd: number;
  amountBs: number;
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

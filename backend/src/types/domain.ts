export type EventStatus = 'ACTIVE' | 'SOLD_OUT' | 'CLOSED';
export type OrderStatus =
  | 'AUTHORIZED'
  | 'PENDING_PAYMENT'
  | 'CAPTURED'
  | 'SETTLED'
  | 'REVERSED'
  | 'RECONCILED';
export type TicketStatus = 'ACTIVE' | 'USED' | 'REVOKED';
export type Verdict = 'APPROVE' | 'REJECT_BOT';
export type ProfileTag = 'FAN_DECIDIDO' | 'COMPRADOR_INDECISO' | 'RIESGO_MODERADO';
export type AuditEventType =
  | 'REJECT_BOT'
  | 'AUTHORIZED'
  | 'CAPTURED'
  | 'REVERSED'
  | 'RECONCILED'
  | 'ANOMALY';

export interface Merchant {
  merchant_id: string;
  name: string;
  rif_masked: string;
  bank_code: string;
  phone_masked: string;
  account_masked: string;
  commission_pct: number;
  fixed_fee_usd: number;
  created_at: string;
}

export interface EventRecord {
  event_id: string;
  merchant_id: string;
  event_name: string;
  ticket_price_bs: number;
  total_stock: number;
  status: EventStatus;
  event_date: string;
}

export interface BuyerPiiVault {
  customer_hash: string;
  encrypted_dni: string;
  encrypted_phone: string;
  encrypted_email: string;
  phone_masked: string;
  dni_masked: string;
  created_at: string;
}

export interface TelemetrySession {
  session_id: string;
  customer_hash: string;
  event_id: string;
  dwell_time: number;
  scroll_depth: number;
  checkout_fill_time_ms: number;
  avg_flight_time_ms: number;
  cursor_linearity_index: number;
  copy_paste_flag: number; // 0 or 1
  tab_switch_count: number;
  device_fingerprint: string;
  risk_score: number;
  verdict: Verdict;
  profile_tag: ProfileTag;
  inference_latency_ms: number;
  evaluated_at: string;
}

export interface OrderRecord {
  order_id: string;
  event_id: string;
  merchant_id: string;
  customer_hash: string;
  session_id: string;
  status: OrderStatus;
  ticket_tier_id: string;
  quantity: number;
  bcv_exchange_rate: number;
  gross_amount_bs: number;
  fee_amount_bs: number;
  net_amount_bs: number;
  de11_stan: string;
  de37_rrn: string;
  de38_auth_code: string;
  payment_reference: string | null;
  qr_dynamic_payload: string; // JSON
  expires_at: string;
  updated_at: string;
  created_at: string;
}

export interface TicketRecord {
  ticket_id: string;
  order_id: string;
  event_id: string;
  nonce: string;
  token_hash: string;
  ticket_qr: string; // JWT HMAC-SHA256
  status: TicketStatus;
  issued_at: string;
  used_at: string | null;
}

export interface AuditLedgerRecord {
  audit_trace_id: string;
  order_id: string | null;
  session_id: string;
  customer_hash: string;
  event_type: AuditEventType;
  mti_code: string;
  de11_stan: string;
  de37_rrn: string;
  de39_response_code: string;
  metadata_snapshot: string; // JSON
  created_at_utc: string;
}

export interface SettlementReport {
  settlement_id: string;
  merchant_id: string;
  period_start: string;
  period_end: string;
  total_orders_matched: number;
  total_auto_repaired: number;
  total_revoked_discrepancy: number;
  total_gross_bs: number;
  total_commission_bs: number;
  total_net_bs: number;
  executed_at: string;
}


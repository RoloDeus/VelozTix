import { ProfileTag, Verdict } from './domain.js';

export interface KeystrokeDynamicsDto {
  avg_flight_time_ms?: number;
  cursor_linearity_index?: number;
}

export interface WebBehaviorTelemetryDto {
  dwell_time: number;
  scroll_depth: number;
  checkout_fill_time_ms: number;
  keystroke_dynamics: KeystrokeDynamicsDto;
  copy_paste_flag: boolean;
  tab_switch_count: number;
  device_fingerprint: string;
}

export interface BuyerPiiDto {
  national_id: string;
  phone_number: string;
  email: string;
}

export interface OrderItemDto {
  ticket_tier_id: string;
  quantity: number;
  unit_price_bs: number;
}

export interface OrderAuthorizationRequestDto {
  event_id: string;
  items: OrderItemDto[];
  buyer_pii: BuyerPiiDto;
  telemetry: WebBehaviorTelemetryDto;
}

export interface Iso8583AuthorizationTraceDto {
  mti_request: string;
  mti_response: string;
  de3_processing_code: string;
  de4_transaction_amount: string;
  de11_stan: string;
  de37_rrn: string;
  de38_auth_code: string;
  de39_response_code: string;
  de42_merchant_id: string;
}

export interface DynamicQrPayloadDto {
  qr_string_token: string;
  destination_bank_code: string;
  merchant_phone_masked: string;
  merchant_tax_id: string;
  exact_amount_bs: number;
  de37_rrn: string;
  ttl_seconds: number;
  hmac_signature: string;
}

export interface AiEvaluationDto {
  verdict: Verdict;
  risk_score: number;
  profile_tag: ProfileTag;
  inference_latency_ms: number;
}

export interface OrderAuthorizationResponseDto {
  order_id: string;
  status: 'AUTHORIZED' | 'PENDING_PAYMENT';
  amount_bs: number;
  customer_hash: string;
  ai_evaluation: AiEvaluationDto;
  iso8583_trace: Iso8583AuthorizationTraceDto;
  qr_dynamic_payload: DynamicQrPayloadDto;
  expires_at: string;
}

export interface FraudRejectionResponseDto {
  status: 403;
  verdict: 'REJECT_BOT';
  risk_score: number;
  message: string;
  audit_trace_id: string;
}

export interface OrderStatusResponseDto {
  order_id: string;
  status:
    | 'AUTHORIZED'
    | 'PENDING_PAYMENT'
    | 'CAPTURED'
    | 'SETTLED'
    | 'REVERSED'
    | 'RECONCILED';
  amount_bs: number;
  payment_reference: string | null;
  ticket_qr: string | null;
  updated_at: string;
}

export interface Iso8583SettlementDto {
  mti: string;
  de11_stan?: string;
  de37_rrn: string;
  de38_auth_code?: string;
  de39_response_code: string;
}

export interface PagoMovilWebhookPayloadDto {
  event_type: 'payment.captured' | 'payment.failed';
  order_id: string;
  payment_reference: string;
  amount_bs: number;
  rejection_reason?: string | null;
  iso8583_settlement: Iso8583SettlementDto;
  timestamp: string;
}

export interface WebhookAckResponseDto {
  status:
    | 'captured'
    | 'already_processed'
    | 'reversed'
    | 'acknowledge_with_internal_alert';
  order_id: string;
  ticket_id?: string | null;
  audit_trace_id: string;
}

export interface ErrorResponseDto {
  error_code: string;
  message: string;
  details?: string | null;
}


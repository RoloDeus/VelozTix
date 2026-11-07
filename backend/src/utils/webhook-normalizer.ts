import { PagoMovilWebhookPayloadDto } from '../types/openapi.js';

export function normalizePagoMovilWebhook(body: any): PagoMovilWebhookPayloadDto | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  // 1. Check if already standard openapi format
  if (body.event_type && body.order_id) {
    const rawEventType = String(body.event_type).toLowerCase();
    const event_type =
      rawEventType === 'payment.failed' ? 'payment.failed' : 'payment.captured';

    return {
      event_type,
      order_id: String(body.order_id),
      payment_reference: String(body.payment_reference || body.iso8583_settlement?.de37_rrn || ''),
      amount_bs: Number(body.amount_bs) || 0,
      rejection_reason: body.rejection_reason || null,
      iso8583_settlement: {
        mti: body.iso8583_settlement?.mti || '0210',
        de11_stan: body.iso8583_settlement?.de11_stan || '000000',
        de37_rrn: body.iso8583_settlement?.de37_rrn || String(body.payment_reference || ''),
        de38_auth_code: body.iso8583_settlement?.de38_auth_code || 'AUTH_00',
        de39_response_code: body.iso8583_settlement?.de39_response_code || '00',
      },
      timestamp: body.timestamp || new Date().toISOString(),
    };
  }

  // 2. Check if nested PDF format (event, transaction, financial_breakdown, iso8583_metadata)
  const rawEvent = String(body.event || body.event_type || '').toLowerCase();
  const isFailed = rawEvent.includes('fail') || rawEvent.includes('reject');
  const event_type: 'payment.captured' | 'payment.failed' = isFailed
    ? 'payment.failed'
    : 'payment.captured';

  const orderId =
    body.transaction?.order_id ||
    body.iso8583_metadata?.field_62_order_ref ||
    body.order_id;

  const paymentRef =
    body.transaction?.payment_reference ||
    body.iso8583_metadata?.field_37_rrn ||
    body.payment_reference ||
    '';

  const amountBs = Number(
    body.financial_breakdown?.gross_amount ??
    body.amount_bs ??
    body.transaction?.amount_bs ??
    0
  );

  const stan =
    body.iso8583_metadata?.field_11_stan ||
    body.transaction?.internal_trace_id ||
    '000000';

  const rrn =
    body.iso8583_metadata?.field_37_rrn ||
    body.transaction?.payment_reference ||
    paymentRef;

  const authCode =
    body.iso8583_metadata?.field_38_auth_code ||
    body.transaction?.auth_code ||
    'AUTH_00';

  const responseCode =
    body.iso8583_metadata?.field_39_response_code ||
    (isFailed ? '05' : '00');

  const mti = body.mti || (isFailed ? '0400' : '0200');

  if (!orderId) {
    return null;
  }

  return {
    event_type,
    order_id: String(orderId),
    payment_reference: String(paymentRef),
    amount_bs: amountBs,
    rejection_reason: body.rejection_reason || (isFailed ? 'RECHAZO_BANCARIO' : null),
    iso8583_settlement: {
      mti,
      de11_stan: String(stan),
      de37_rrn: String(rrn),
      de38_auth_code: String(authCode),
      de39_response_code: String(responseCode),
    },
    timestamp: body.timestamp || body.transaction?.paid_at || new Date().toISOString(),
  };
}


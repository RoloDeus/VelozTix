import crypto from 'node:crypto';
import { IClock } from './clock.js';
import { InMemoryRedisService } from './redis-simulator.service.js';
import { PrivacyCryptoService } from './privacy-crypto.service.js';
import { OrderRepository } from '../db/repositories/order.repository.js';
import { TicketRepository } from '../db/repositories/ticket.repository.js';
import { AuditRepository } from '../db/repositories/audit.repository.js';
import { ExternalSettlementMockService } from './external-settlement-mock.service.js';
import {
  PagoMovilWebhookPayloadDto,
  WebhookAckResponseDto,
} from '../types/openapi.js';

export class WebhookService {
  constructor(
    private clock: IClock,
    private redis: InMemoryRedisService,
    private cryptoService: PrivacyCryptoService,
    private orderRepo: OrderRepository,
    private ticketRepo: TicketRepository,
    private auditRepo: AuditRepository,
    private externalMockService?: ExternalSettlementMockService
  ) {}

  async processPagoMovilWebhook(params: {
    payload: PagoMovilWebhookPayloadDto;
    rawBody: Buffer;
    signatureHeader?: string;
    idempotencyKey?: string;
  }): Promise<
    | { success: true; response: WebhookAckResponseDto }
    | { success: false; status: 401; message: string; errorCode: string }
    | { success: false; status: 400; message: string; errorCode: string }
  > {
    const { payload, rawBody, signatureHeader, idempotencyKey } = params;
    const nowIso = this.clock.toISOString();

    // 1. Validate HMAC-SHA256 Signature over rawBody
    const isValidSignature = this.cryptoService.validateWebhookSignature(
      rawBody,
      signatureHeader
    );
    if (!isValidSignature) {
      return {
        success: false,
        status: 401,
        message: 'La firma criptográfica HMAC-SHA256 del webhook no es válida o no coincide con el payload.',
        errorCode: 'INVALID_SIGNATURE',
      };
    }

    // 2. Check Idempotency by key or by payment_reference
    if (idempotencyKey) {
      const cached = this.redis.getIdempotency(idempotencyKey);
      if (cached) {
        return {
          success: true,
          response: cached.responseBody as WebhookAckResponseDto,
        };
      }
    }

    // Check if payment reference already processed
    if (payload.payment_reference) {
      const existingRef = this.orderRepo.findByPaymentReference(
        payload.payment_reference
      );
      if (existingRef && (existingRef.status === 'CAPTURED' || existingRef.status === 'SETTLED')) {
        const auditTrace = `aud_dup_${crypto.randomBytes(4).toString('hex')}`;
        return {
          success: true,
          response: {
            status: 'already_processed',
            order_id: existingRef.order_id,
            audit_trace_id: auditTrace,
          },
        };
      }
    }

    // 3. Find Order
    let order = this.orderRepo.findById(payload.order_id);
    if (!order && payload.iso8583_settlement?.de37_rrn) {
      order = this.orderRepo.findByRrn(payload.iso8583_settlement.de37_rrn);
    }

    if (!order) {
      const anomalyTraceId = `aud_anom_${crypto.randomBytes(4).toString('hex')}`;
      this.auditRepo.insert({
        audit_trace_id: anomalyTraceId,
        order_id: null,
        session_id: 'unknown_session',
        customer_hash: 'unknown_customer',
        event_type: 'ANOMALY',
        mti_code: payload.iso8583_settlement?.mti || '0200',
        de11_stan: payload.iso8583_settlement?.de11_stan || '000000',
        de37_rrn: payload.iso8583_settlement?.de37_rrn || '000000000000',
        de39_response_code: payload.iso8583_settlement?.de39_response_code || '96',
        metadata_snapshot: JSON.stringify({
          error: 'ORDER_NOT_FOUND',
          payload,
        }),
        created_at_utc: nowIso,
      });

      return {
        success: true,
        response: {
          status: 'acknowledge_with_internal_alert',
          order_id: payload.order_id,
          audit_trace_id: anomalyTraceId,
        },
      };
    }

    // If order is already settled/captured
    if (order.status === 'CAPTURED' || order.status === 'SETTLED' || order.status === 'RECONCILED') {
      const tickets = this.ticketRepo.findByOrderId(order.order_id);
      const ackResponse: WebhookAckResponseDto = {
        status: 'already_processed',
        order_id: order.order_id,
        ticket_id: tickets[0]?.ticket_id ?? null,
        audit_trace_id: `aud_dup_${crypto.randomBytes(4).toString('hex')}`,
      };

      if (idempotencyKey) {
        this.redis.setIdempotency(idempotencyKey, {
          fingerprint: this.cryptoService.sha256(rawBody),
          statusCode: 200,
          responseBody: ackResponse,
        });
      }

      return {
        success: true,
        response: ackResponse,
      };
    }

    // 4. Handle Failure Event (payment.failed) -> REVERSED
    if (payload.event_type === 'payment.failed') {
      this.redis.releaseReservation(order.order_id, payload.rejection_reason || 'EXT_REJECT');
      this.orderRepo.updateStatus(order.order_id, 'REVERSED', null, nowIso);

      const auditTraceId = `aud_rev_${crypto.randomBytes(4).toString('hex')}`;
      this.auditRepo.insert({
        audit_trace_id: auditTraceId,
        order_id: order.order_id,
        session_id: order.session_id,
        customer_hash: order.customer_hash,
        event_type: 'REVERSED',
        mti_code: payload.iso8583_settlement?.mti || '0400',
        de11_stan: payload.iso8583_settlement?.de11_stan || order.de11_stan,
        de37_rrn: payload.iso8583_settlement?.de37_rrn || order.de37_rrn,
        de39_response_code: payload.iso8583_settlement?.de39_response_code || '05',
        metadata_snapshot: JSON.stringify({
          rejection_reason: payload.rejection_reason,
          payload,
        }),
        created_at_utc: nowIso,
      });

      const response: WebhookAckResponseDto = {
        status: 'reversed',
        order_id: order.order_id,
        audit_trace_id: auditTraceId,
      };

      if (idempotencyKey) {
        this.redis.setIdempotency(idempotencyKey, {
          fingerprint: this.cryptoService.sha256(rawBody),
          statusCode: 200,
          responseBody: response,
        });
      }

      return { success: true, response };
    }

    // 5. Handle Capture Event (payment.captured)
    // Check amount discrepancy
    const amountDifference = Math.abs(payload.amount_bs - order.gross_amount_bs);
    if (amountDifference > 0.05) {
      const auditTraceId = `aud_anom_${crypto.randomBytes(4).toString('hex')}`;
      this.auditRepo.insert({
        audit_trace_id: auditTraceId,
        order_id: order.order_id,
        session_id: order.session_id,
        customer_hash: order.customer_hash,
        event_type: 'ANOMALY',
        mti_code: '0200',
        de11_stan: payload.iso8583_settlement?.de11_stan || order.de11_stan,
        de37_rrn: payload.iso8583_settlement?.de37_rrn || order.de37_rrn,
        de39_response_code: '13', // Invalid amount
        metadata_snapshot: JSON.stringify({
          reason: 'AMOUNT_MISMATCH',
          expected: order.gross_amount_bs,
          received: payload.amount_bs,
        }),
        created_at_utc: nowIso,
      });

      return {
        success: true,
        response: {
          status: 'acknowledge_with_internal_alert',
          order_id: order.order_id,
          audit_trace_id: auditTraceId,
        },
      };
    }

    // Check TTL expiration
    const isTtlExpired = new Date(order.expires_at).getTime() < this.clock.nowMs();
    if (isTtlExpired) {
      const auditTraceId = `aud_anom_${crypto.randomBytes(4).toString('hex')}`;
      this.auditRepo.insert({
        audit_trace_id: auditTraceId,
        order_id: order.order_id,
        session_id: order.session_id,
        customer_hash: order.customer_hash,
        event_type: 'ANOMALY',
        mti_code: '0200',
        de11_stan: payload.iso8583_settlement?.de11_stan || order.de11_stan,
        de37_rrn: payload.iso8583_settlement?.de37_rrn || order.de37_rrn,
        de39_response_code: '54', // Expired
        metadata_snapshot: JSON.stringify({
          reason: 'TTL_EXPIRED_UPON_WEBHOOK',
          expires_at: order.expires_at,
          received_at: nowIso,
        }),
        created_at_utc: nowIso,
      });

      return {
        success: true,
        response: {
          status: 'acknowledge_with_internal_alert',
          order_id: order.order_id,
          audit_trace_id: auditTraceId,
        },
      };
    }

    // Confirm reservation in memory (converts reserved to sold)
    this.redis.confirmReservation(order.order_id);

    // Update order to SETTLED
    this.orderRepo.updateStatus(
      order.order_id,
      'SETTLED',
      payload.payment_reference,
      nowIso
    );

    // Registro automático en Captura para conciliación con proveedor externo
    if (this.externalMockService) {
      this.externalMockService.recordSettlement({
        order_id: order.order_id,
        merchant_id: order.merchant_id,
        payment_reference: payload.payment_reference,
        de37_rrn: payload.iso8583_settlement?.de37_rrn || order.de37_rrn,
        amount_bs: payload.amount_bs,
        status: 'SETTLED',
        paid_at: new Date().toISOString(),
      });
    }

    // Issue cryptographic tickets (Zero PII in JWT!)
    let firstTicketId: string | null = null;
    for (let i = 0; i < order.quantity; i++) {
      const ticketId = `tkt_vz_${Math.floor(100000 + Math.random() * 899999)}`;
      if (!firstTicketId) firstTicketId = ticketId;

      const nonce = crypto.randomBytes(4).toString('hex').toUpperCase();
      const { token, hash } = this.cryptoService.generateTicketJwt({
        ticket_id: ticketId,
        event_id: order.event_id,
        nonce,
      });

      this.ticketRepo.insert({
        ticket_id: ticketId,
        order_id: order.order_id,
        event_id: order.event_id,
        nonce,
        token_hash: hash,
        ticket_qr: token,
        status: 'ACTIVE',
        issued_at: nowIso,
        used_at: null,
      });
    }

    // Insert into immutable AUDIT_LEDGER (SUDEBAN 12441/12221)
    const auditTraceId = `aud_cap_${crypto.randomBytes(4).toString('hex')}`;
    this.auditRepo.insert({
      audit_trace_id: auditTraceId,
      order_id: order.order_id,
      session_id: order.session_id,
      customer_hash: order.customer_hash,
      event_type: 'CAPTURED',
      mti_code: '0200',
      de11_stan: payload.iso8583_settlement?.de11_stan || order.de11_stan,
      de37_rrn: payload.iso8583_settlement?.de37_rrn || order.de37_rrn,
      de39_response_code: '00',
      metadata_snapshot: JSON.stringify({
        payment_reference: payload.payment_reference,
        amount_bs: payload.amount_bs,
        ticket_id: firstTicketId,
      }),
      created_at_utc: nowIso,
    });

    const response: WebhookAckResponseDto = {
      status: 'captured',
      order_id: order.order_id,
      ticket_id: firstTicketId,
      audit_trace_id: auditTraceId,
    };

    if (idempotencyKey) {
      this.redis.setIdempotency(idempotencyKey, {
        fingerprint: this.cryptoService.sha256(rawBody),
        statusCode: 200,
        responseBody: response,
      });
    }

    return { success: true, response };
  }
}


import crypto from 'node:crypto';
import { IClock } from './clock.js';
import { InMemoryRedisService } from './redis-simulator.service.js';
import { PrivacyCryptoService } from './privacy-crypto.service.js';
import { IBehaviorAiEngine } from './ai-scoring.service.js';
import { IIsoSwitchGateway } from './iso8583-switch.service.js';
import { OrderRepository } from '../db/repositories/order.repository.js';
import { EventRepository } from '../db/repositories/event.repository.js';
import { MerchantRepository } from '../db/repositories/merchant.repository.js';
import { VaultRepository } from '../db/repositories/vault.repository.js';
import { TelemetryRepository } from '../db/repositories/telemetry.repository.js';
import { TicketRepository } from '../db/repositories/ticket.repository.js';
import { AuditRepository } from '../db/repositories/audit.repository.js';
import {
  OrderAuthorizationRequestDto,
  OrderAuthorizationResponseDto,
  OrderStatusResponseDto,
  FraudRejectionResponseDto,
} from '../types/openapi.js';

export class OrderService {
  constructor(
    private clock: IClock,
    private redis: InMemoryRedisService,
    private cryptoService: PrivacyCryptoService,
    private aiEngine: IBehaviorAiEngine,
    private isoSwitch: IIsoSwitchGateway,
    private orderRepo: OrderRepository,
    private eventRepo: EventRepository,
    private merchantRepo: MerchantRepository,
    private vaultRepo: VaultRepository,
    private telemetryRepo: TelemetryRepository,
    private ticketRepo: TicketRepository,
    private auditRepo: AuditRepository,
    private bcvExchangeRate: number
  ) {
    // Register auto-expire callback from Redis
    this.redis.onReservationExpired((orderId) => {
      this.handleReservationExpired(orderId);
    });
  }

  private handleReservationExpired(orderId: string): void {
    const order = this.orderRepo.findById(orderId);
    if (order && (order.status === 'AUTHORIZED' || order.status === 'PENDING_PAYMENT')) {
      const nowIso = this.clock.toISOString();
      this.orderRepo.updateStatus(orderId, 'REVERSED', null, nowIso);

      const auditTraceId = `aud_rev_${crypto.randomBytes(4).toString('hex')}`;
      this.auditRepo.insert({
        audit_trace_id: auditTraceId,
        order_id: orderId,
        session_id: order.session_id,
        customer_hash: order.customer_hash,
        event_type: 'REVERSED',
        mti_code: '0400',
        de11_stan: order.de11_stan,
        de37_rrn: order.de37_rrn,
        de39_response_code: '54', // Expired card / expired hold
        metadata_snapshot: JSON.stringify({ reason: 'TTL_EXPIRED_300S' }),
        created_at_utc: nowIso,
      });
    }
  }

  async authorizeOrder(
    dto: OrderAuthorizationRequestDto
  ): Promise<
    | { success: true; response: OrderAuthorizationResponseDto }
    | { success: false; status: 403; response: FraudRejectionResponseDto }
    | { success: false; status: 400 | 404 | 409; message: string; errorCode: string }
  > {
    const nowIso = this.clock.toISOString();

    // 1. Validate Event & Merchant
    const event = this.eventRepo.findById(dto.event_id);
    if (!event || event.status === 'CLOSED') {
      return {
        success: false,
        status: 404,
        message: 'Evento no encontrado o no disponible.',
        errorCode: 'EVENT_NOT_FOUND',
      };
    }

    const merchant = this.merchantRepo.findById(event.merchant_id);
    if (!merchant) {
      return {
        success: false,
        status: 404,
        message: 'Comercio organizador no registrado.',
        errorCode: 'MERCHANT_NOT_FOUND',
      };
    }

    // 2. Validate Items & Amount Calculation (Zero-Trust Anti Price-Tampering)
    const totalQty = dto.items.reduce((sum, item) => sum + item.quantity, 0);
    if (totalQty <= 0 || totalQty > 10) {
      return {
        success: false,
        status: 400,
        message: 'La cantidad solicitada supera el ratio permitido (máximo 10 boletos).',
        errorCode: 'INVALID_QUANTITY',
      };
    }

    // Validar integridad de precios contra la tabla EVENTS en SQLite
    for (const item of dto.items) {
      if (Math.abs(item.unit_price_bs - event.ticket_price_bs) > 0.05) {
        return {
          success: false,
          status: 400,
          message: `El precio unitario enviado (${item.unit_price_bs} Bs) no coincide con el precio oficial registrado en base de datos (${event.ticket_price_bs} Bs).`,
          errorCode: 'PRICE_TAMPERING_DETECTED',
        };
      }
    }

    // Cálculo oficial basado exclusivamente en el precio verificado de SQLite
    const grossAmountBs = Number((totalQty * event.ticket_price_bs).toFixed(2));

    // Fee calculation: [gross * 0.045] + [0.20 * bcv_rate]
    const commissionPct = merchant.commission_pct || 0.045;
    const fixedFeeUsd = merchant.fixed_fee_usd || 0.2;
    const feeAmountBs = Number(
      (grossAmountBs * commissionPct + fixedFeeUsd * this.bcvExchangeRate).toFixed(2)
    );
    const netAmountBs = Number((grossAmountBs - feeAmountBs).toFixed(2));

    // 3. Vault & PII protection (AES-256-GCM + Customer Hash)
    const customerHash = this.cryptoService.generateCustomerHash(dto.buyer_pii);
    const encryptedDni = this.cryptoService.encryptGcm(dto.buyer_pii.national_id);
    const encryptedPhone = this.cryptoService.encryptGcm(dto.buyer_pii.phone_number);
    const encryptedEmail = this.cryptoService.encryptGcm(dto.buyer_pii.email);
    const dniMasked = this.cryptoService.maskCedula(dto.buyer_pii.national_id);
    const phoneMasked = this.cryptoService.maskPhone(dto.buyer_pii.phone_number);

    this.vaultRepo.upsert({
      customer_hash: customerHash,
      encrypted_dni: encryptedDni,
      encrypted_phone: encryptedPhone,
      encrypted_email: encryptedEmail,
      phone_masked: phoneMasked,
      dni_masked: dniMasked,
      created_at: nowIso,
    });

    // 4. AI Telemetry Evaluation (< 80 ms)
    const sessionId = `ses_${crypto.randomUUID()}`;
    const aiEval = await this.aiEngine.evaluate(dto.telemetry, {
      ticketQuantity: totalQty,
    });

    this.telemetryRepo.insert({
      session_id: sessionId,
      customer_hash: customerHash,
      event_id: event.event_id,
      dwell_time: dto.telemetry.dwell_time,
      scroll_depth: dto.telemetry.scroll_depth,
      checkout_fill_time_ms: dto.telemetry.checkout_fill_time_ms,
      avg_flight_time_ms: dto.telemetry.keystroke_dynamics?.avg_flight_time_ms ?? 0,
      cursor_linearity_index:
        dto.telemetry.keystroke_dynamics?.cursor_linearity_index ?? 0,
      copy_paste_flag: dto.telemetry.copy_paste_flag ? 1 : 0,
      tab_switch_count: dto.telemetry.tab_switch_count,
      device_fingerprint: dto.telemetry.device_fingerprint,
      risk_score: aiEval.risk_score,
      verdict: aiEval.verdict,
      profile_tag: aiEval.profile_tag,
      inference_latency_ms: aiEval.inference_latency_ms,
      evaluated_at: nowIso,
    });

    // Handle Bot Rejection (403)
    if (aiEval.verdict === 'REJECT_BOT') {
      const rejectTraceId = `aud_rej_${crypto.randomBytes(4).toString('hex')}`;
      this.auditRepo.insert({
        audit_trace_id: rejectTraceId,
        order_id: null,
        session_id: sessionId,
        customer_hash: customerHash,
        event_type: 'REJECT_BOT',
        mti_code: '0100',
        de11_stan: '000000',
        de37_rrn: '000000000000',
        de39_response_code: '05', // Do not honor / security rejection
        metadata_snapshot: JSON.stringify({
          risk_score: aiEval.risk_score,
          telemetry: dto.telemetry,
        }),
        created_at_utc: nowIso,
      });

      return {
        success: false,
        status: 403,
        response: {
          status: 403,
          verdict: 'REJECT_BOT',
          risk_score: aiEval.risk_score,
          message:
            'Orden rechazada por políticas de seguridad: se detectó patrón de automatización o acaparamiento de entradas (scalping).',
          audit_trace_id: rejectTraceId,
        },
      };
    }

    // 5. Atomic Stock Reservation (TTL: 300s)
    const orderId = `ord_vz_${Math.floor(10000000 + Math.random() * 89999999)}`;
    const reserved = this.redis.reserveStock(event.event_id, orderId, totalQty, 300);
    if (!reserved) {
      return {
        success: false,
        status: 409,
        message: 'No hay stock disponible suficiente para completar la orden.',
        errorCode: 'STOCK_EXHAUSTED',
      };
    }

    // 6. ISO 8583 Authorization Request (MTI 0100 -> 0110)
    const isoTrace = await this.isoSwitch.requestAuthorization({
      merchantId: merchant.merchant_id,
      amountBs: grossAmountBs,
      orderId,
    });

    // 7. Dynamic QR Payload & Signature
    const ttlSeconds = 300;
    const expiresAtDate = new Date(this.clock.nowMs() + ttlSeconds * 1000);
    const expiresAtIso = expiresAtDate.toISOString();
    const expiresAtUnix = Math.floor(expiresAtDate.getTime() / 1000);

    const qrResult = this.cryptoService.generateDynamicQrPayload({
      bankCode: merchant.bank_code,
      rif: merchant.rif_masked,
      phoneMasked: merchant.phone_masked,
      exactAmountBs: grossAmountBs,
      rrn: isoTrace.de37_rrn,
      ttlSeconds,
      expiresAtUnix,
    });

    const qrDynamicPayload = {
      qr_string_token: qrResult.qrToken,
      destination_bank_code: merchant.bank_code,
      merchant_phone_masked: merchant.phone_masked,
      merchant_tax_id: merchant.rif_masked,
      exact_amount_bs: grossAmountBs,
      de37_rrn: isoTrace.de37_rrn,
      ttl_seconds: ttlSeconds,
      hmac_signature: qrResult.hmacSignature,
    };

    // 8. Insert Order Record
    this.orderRepo.insert({
      order_id: orderId,
      event_id: event.event_id,
      merchant_id: merchant.merchant_id,
      customer_hash: customerHash,
      session_id: sessionId,
      status: 'AUTHORIZED',
      ticket_tier_id: dto.items[0]?.ticket_tier_id || 'general',
      quantity: totalQty,
      bcv_exchange_rate: this.bcvExchangeRate,
      gross_amount_bs: grossAmountBs,
      fee_amount_bs: feeAmountBs,
      net_amount_bs: netAmountBs,
      de11_stan: isoTrace.de11_stan,
      de37_rrn: isoTrace.de37_rrn,
      de38_auth_code: isoTrace.de38_auth_code,
      payment_reference: null,
      qr_dynamic_payload: JSON.stringify(qrDynamicPayload),
      expires_at: expiresAtIso,
      updated_at: nowIso,
      created_at: nowIso,
    });

    // 9. Audit Trail (SUDEBAN 12441/12221)
    const auditTraceId = `aud_auth_${crypto.randomBytes(4).toString('hex')}`;
    this.auditRepo.insert({
      audit_trace_id: auditTraceId,
      order_id: orderId,
      session_id: sessionId,
      customer_hash: customerHash,
      event_type: 'AUTHORIZED',
      mti_code: '0100',
      de11_stan: isoTrace.de11_stan,
      de37_rrn: isoTrace.de37_rrn,
      de39_response_code: isoTrace.de39_response_code,
      metadata_snapshot: JSON.stringify({
        order_id: orderId,
        amount_bs: grossAmountBs,
        quantity: totalQty,
      }),
      created_at_utc: nowIso,
    });

    return {
      success: true,
      response: {
        order_id: orderId,
        status: 'AUTHORIZED',
        amount_bs: grossAmountBs,
        customer_hash: customerHash,
        ai_evaluation: aiEval,
        iso8583_trace: isoTrace,
        qr_dynamic_payload: qrDynamicPayload,
        expires_at: expiresAtIso,
      },
    };
  }

  getOrderStatus(orderId: string): OrderStatusResponseDto | null {
    // Check if expired in Redis and synchronize
    this.redis.sweepExpiredReservations();

    const order = this.orderRepo.findById(orderId);
    if (!order) return null;

    let ticketQr: string | null = null;
    if (
      order.status === 'SETTLED' ||
      order.status === 'CAPTURED' ||
      order.status === 'RECONCILED'
    ) {
      const tickets = this.ticketRepo.findByOrderId(orderId);
      const activeTicket = tickets.find((t) => t.status === 'ACTIVE') || tickets[0];
      if (activeTicket) {
        ticketQr = activeTicket.ticket_qr;
      }
    }

    return {
      order_id: order.order_id,
      status: order.status,
      amount_bs: order.gross_amount_bs,
      payment_reference: order.payment_reference,
      ticket_qr: ticketQr,
      updated_at: order.updated_at,
    };
  }
}


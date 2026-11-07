import crypto from 'node:crypto';
import { IClock } from './clock.js';
import { OrderRepository } from '../db/repositories/order.repository.js';
import { SettlementRepository } from '../db/repositories/settlement.repository.js';
import { AuditRepository } from '../db/repositories/audit.repository.js';
import { TicketRepository } from '../db/repositories/ticket.repository.js';
import { EventRepository } from '../db/repositories/event.repository.js';
import { InMemoryRedisService } from './redis-simulator.service.js';
import { PrivacyCryptoService } from './privacy-crypto.service.js';
import {
  ExternalSettlementMockService,
  ExternalSettlementRecord,
} from './external-settlement-mock.service.js';
import { SettlementReport } from '../types/domain.js';

export interface ReconciliationSummaryResult {
  settlement_id: string;
  merchant_id: string;
  total_orders_matched: number;
  total_auto_repaired: number;
  total_revoked_discrepancy: number;
  total_gross_bs: number;
  total_commission_bs: number;
  total_net_bs: number;
  details?: {
    matched_order_ids: string[];
    auto_repaired_order_ids: string[];
    refund_pending_order_ids: string[];
    revoked_order_ids: string[];
  };
  executed_at: string;
}

export class ReconciliationService {
  constructor(
    private clock: IClock,
    private orderRepo: OrderRepository,
    private settlementRepo: SettlementRepository,
    private auditRepo: AuditRepository,
    private ticketRepo: TicketRepository,
    private eventRepo: EventRepository,
    private redis: InMemoryRedisService,
    private cryptoService: PrivacyCryptoService,
    private externalMockService: ExternalSettlementMockService
  ) {}

  executeReconciliation(
    merchantId: string,
    providedExternalReport?: ExternalSettlementRecord[]
  ): ReconciliationSummaryResult {
    const nowIso = this.clock.toISOString();
    const externalReport =
      providedExternalReport || this.externalMockService.getReport(merchantId);

    const localOrders = this.orderRepo.findByMerchant(merchantId);

    let totalOrdersMatched = 0;
    let totalAutoRepaired = 0;
    let totalRevokedDiscrepancy = 0;
    let totalGrossBs = 0;
    let totalCommissionBs = 0;
    let totalNetBs = 0;

    const matchedOrderIds: string[] = [];
    const autoRepairedOrderIds: string[] = [];
    const refundPendingOrderIds: string[] = [];
    const revokedOrderIds: string[] = [];

    // Track which external records were consumed
    const processedOrderIds = new Set<string>();

    // 1. Process all local orders
    for (const order of localOrders) {
      processedOrderIds.add(order.order_id);

      // Criterio de Match en Conciliación:
      // ext.order_id === order.order_id O ext.payment_reference === order.payment_reference O ext.de37_rrn === order.de37_rrn
      // Verificando que ext.amount_bs === order.gross_amount_bs
      const extRecord = externalReport.find((ext: any) => {
        const extRrn = ext.de37_rrn || ext.rrn;
        const matchesIdentity =
          (Boolean(ext.order_id) && ext.order_id === order.order_id) ||
          (Boolean(ext.payment_reference && order.payment_reference) &&
            ext.payment_reference === order.payment_reference) ||
          (Boolean(extRrn && order.de37_rrn) && extRrn === order.de37_rrn);

        if (!matchesIdentity) return false;

        const extAmount = Number(ext.amount_bs ?? ext.amount);
        return Math.abs(extAmount - order.gross_amount_bs) <= 0.05;
      });

      const hasExternalSettledPayment =
        extRecord !== undefined &&
        (!extRecord.status ||
          (extRecord.status as string) === 'SETTLED' ||
          (extRecord.status as string) === 'CAPTURED');

      const hasActiveTickets =
        this.ticketRepo.findByOrderId(order.order_id).some((t) => t.status === 'ACTIVE');

      // -----------------------------------------------------------------
      // CASO A: Conciliación exitosa (Orden local SETTLED/CAPTURED con cobro externo coincidente)
      // -----------------------------------------------------------------
      if ((order.status === 'SETTLED' || order.status === 'CAPTURED') && hasExternalSettledPayment) {
        this.orderRepo.updateStatus(
          order.order_id,
          'RECONCILED',
          order.payment_reference || extRecord?.payment_reference || null,
          nowIso
        );

        const auditTraceId = `aud_rec_${crypto.randomBytes(4).toString('hex')}`;
        this.auditRepo.insert({
          audit_trace_id: auditTraceId,
          order_id: order.order_id,
          session_id: order.session_id,
          customer_hash: order.customer_hash,
          event_type: 'RECONCILED',
          mti_code: '0500',
          de11_stan: order.de11_stan,
          de37_rrn: order.de37_rrn,
          de39_response_code: '00',
          metadata_snapshot: JSON.stringify({
            case: 'CASE_A_MATCHED',
            gross_amount_bs: order.gross_amount_bs,
            payment_reference: order.payment_reference || extRecord?.payment_reference || null,
          }),
          created_at_utc: nowIso,
        });

        totalOrdersMatched++;
        matchedOrderIds.push(order.order_id);
        totalGrossBs += order.gross_amount_bs;
        totalCommissionBs += order.fee_amount_bs;
        totalNetBs += order.net_amount_bs;
        continue;
      }

      // -----------------------------------------------------------------
      // CASO B: Auto-reparación por webhook perdido
      // (Orden local en AUTHORIZED / PENDING_PAYMENT / REVERSED, pero existe cobro confirmado en reporte externo)
      // -----------------------------------------------------------------
      if (
        (order.status === 'AUTHORIZED' ||
          order.status === 'PENDING_PAYMENT' ||
          order.status === 'REVERSED') &&
        hasExternalSettledPayment
      ) {
        // DIRECTIVA OPERATIVA 2: Validar stock antes de emitir
        const event = this.eventRepo.findById(order.event_id);
        const stock = this.redis.getStock(order.event_id);
        const availableStock = stock ? stock.availableStock : 0;
        const isEventSoldOut = event?.status === 'SOLD_OUT';

        if (isEventSoldOut || availableStock < order.quantity) {
          // Evento agotado: marcar para reembolso (REFUND_PENDING) sin sobre-vender
          this.orderRepo.updateStatus(
            order.order_id,
            'REFUND_PENDING',
            extRecord!.payment_reference,
            nowIso
          );

          const auditTraceId = `aud_anom_${crypto.randomBytes(4).toString('hex')}`;
          this.auditRepo.insert({
            audit_trace_id: auditTraceId,
            order_id: order.order_id,
            session_id: order.session_id,
            customer_hash: order.customer_hash,
            event_type: 'ANOMALY',
            mti_code: '0500',
            de11_stan: order.de11_stan,
            de37_rrn: order.de37_rrn,
            de39_response_code: '51',
            metadata_snapshot: JSON.stringify({
              case: 'CASE_B_OVERSELL_PREVENTED_REFUND_PENDING',
              order_id: order.order_id,
              requested_qty: order.quantity,
              available_stock: availableStock,
              event_status: event?.status,
            }),
            created_at_utc: nowIso,
          });

          refundPendingOrderIds.push(order.order_id);
          continue;
        }

        // Hay cupo disponible: emitir boleto y pasar a RECONCILED
        // Ajustar stock en memoria
        this.redis.reserveStock(order.event_id, order.order_id, order.quantity, 300);
        this.redis.confirmReservation(order.order_id);

        this.orderRepo.updateStatus(
          order.order_id,
          'RECONCILED',
          extRecord!.payment_reference,
          nowIso
        );

        // Emitir boletos en TICKETS
        for (let i = 0; i < order.quantity; i++) {
          const ticketId = `tkt_vz_${Math.floor(100000 + Math.random() * 899999)}`;
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

        const auditTraceId = `aud_rep_${crypto.randomBytes(4).toString('hex')}`;
        this.auditRepo.insert({
          audit_trace_id: auditTraceId,
          order_id: order.order_id,
          session_id: order.session_id,
          customer_hash: order.customer_hash,
          event_type: 'CAPTURED',
          mti_code: '0200',
          de11_stan: order.de11_stan,
          de37_rrn: order.de37_rrn,
          de39_response_code: '00',
          metadata_snapshot: JSON.stringify({
            case: 'CASE_B_AUTO_REPAIRED_LOST_WEBHOOK',
            order_id: order.order_id,
            payment_reference: extRecord!.payment_reference,
            amount_bs: order.gross_amount_bs,
          }),
          created_at_utc: nowIso,
        });

        totalAutoRepaired++;
        autoRepairedOrderIds.push(order.order_id);
        totalGrossBs += order.gross_amount_bs;
        totalCommissionBs += order.fee_amount_bs;
        totalNetBs += order.net_amount_bs;
        continue;
      }

      // -----------------------------------------------------------------
      // CASO C: Revocación inmediata por discrepancia
      // (Orden local en CAPTURED/SETTLED o con boletos activos, pero SIN cobro en reporte externo)
      // -----------------------------------------------------------------
      if (
        (order.status === 'CAPTURED' || order.status === 'SETTLED' || hasActiveTickets) &&
        !hasExternalSettledPayment
      ) {
        // Revocar todos los boletos asociados en TICKETS
        const tickets = this.ticketRepo.findByOrderId(order.order_id);
        for (const t of tickets) {
          if (t.status === 'ACTIVE') {
            this.ticketRepo.updateStatus(t.ticket_id, 'REVOKED', null);
          }
        }

        // Restituir inventario en memoria si estaba como vendido
        const stockState = this.redis.getStock(order.event_id);
        if (stockState) {
          stockState.soldStock = Math.max(0, stockState.soldStock - order.quantity);
          stockState.availableStock += order.quantity;
        }

        this.orderRepo.updateStatus(order.order_id, 'REVERSED', null, nowIso);

        const auditTraceId = `aud_revk_${crypto.randomBytes(4).toString('hex')}`;
        this.auditRepo.insert({
          audit_trace_id: auditTraceId,
          order_id: order.order_id,
          session_id: order.session_id,
          customer_hash: order.customer_hash,
          event_type: 'ANOMALY',
          mti_code: '0400',
          de11_stan: order.de11_stan,
          de37_rrn: order.de37_rrn,
          de39_response_code: '12', // Invalid transaction / unpaid
          metadata_snapshot: JSON.stringify({
            case: 'CASE_C_UNPAID_TICKET_REVOKED',
            revoked_tickets_count: tickets.length,
            order_id: order.order_id,
          }),
          created_at_utc: nowIso,
        });

        totalRevokedDiscrepancy++;
        revokedOrderIds.push(order.order_id);
      }
    }

    // 2. Persistir informe en SETTLEMENT_REPORTS
    const settlementId = crypto.randomUUID();
    const periodStart =
      localOrders.length > 0 ? localOrders[localOrders.length - 1].created_at : nowIso;
    const periodEnd = nowIso;

    const report: SettlementReport = {
      settlement_id: settlementId,
      merchant_id: merchantId,
      period_start: periodStart,
      period_end: periodEnd,
      total_orders_matched: totalOrdersMatched,
      total_auto_repaired: totalAutoRepaired,
      total_revoked_discrepancy: totalRevokedDiscrepancy,
      total_gross_bs: Number(totalGrossBs.toFixed(2)),
      total_commission_bs: Number(totalCommissionBs.toFixed(2)),
      total_net_bs: Number(totalNetBs.toFixed(2)),
      executed_at: nowIso,
    };

    this.settlementRepo.insert(report);

    return {
      settlement_id: settlementId,
      merchant_id: merchantId,
      total_orders_matched: totalOrdersMatched,
      total_auto_repaired: totalAutoRepaired,
      total_revoked_discrepancy: totalRevokedDiscrepancy,
      total_gross_bs: report.total_gross_bs,
      total_commission_bs: report.total_commission_bs,
      total_net_bs: report.total_net_bs,
      details: {
        matched_order_ids: matchedOrderIds,
        auto_repaired_order_ids: autoRepairedOrderIds,
        refund_pending_order_ids: refundPendingOrderIds,
        revoked_order_ids: revokedOrderIds,
      },
      executed_at: nowIso,
    };
  }
}

import crypto from 'node:crypto';
import { IClock } from './clock.js';
import { OrderRepository } from '../db/repositories/order.repository.js';
import { SettlementRepository } from '../db/repositories/settlement.repository.js';
import { AuditRepository } from '../db/repositories/audit.repository.js';
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
  executed_at: string;
}

export class ReconciliationService {
  constructor(
    private clock: IClock,
    private orderRepo: OrderRepository,
    private settlementRepo: SettlementRepository,
    private auditRepo: AuditRepository
  ) {}

  executeReconciliation(merchantId: string): ReconciliationSummaryResult {
    const nowIso = this.clock.toISOString();
    const orders = this.orderRepo.findByMerchant(merchantId);

    const eligibleOrders = orders.filter(
      (o) => o.status === 'SETTLED' || o.status === 'CAPTURED'
    );

    let totalGrossBs = 0;
    let totalCommissionBs = 0;
    let totalNetBs = 0;

    for (const order of eligibleOrders) {
      totalGrossBs += order.gross_amount_bs;
      totalCommissionBs += order.fee_amount_bs;
      totalNetBs += order.net_amount_bs;

      // Update to RECONCILED
      this.orderRepo.updateStatus(order.order_id, 'RECONCILED', null, nowIso);

      const auditTraceId = `aud_rec_${crypto.randomBytes(4).toString('hex')}`;
      this.auditRepo.insert({
        audit_trace_id: auditTraceId,
        order_id: order.order_id,
        session_id: order.session_id,
        customer_hash: order.customer_hash,
        event_type: 'RECONCILED',
        mti_code: '0500', // Settlement reconciliation
        de11_stan: order.de11_stan,
        de37_rrn: order.de37_rrn,
        de39_response_code: '00',
        metadata_snapshot: JSON.stringify({
          gross_amount_bs: order.gross_amount_bs,
          fee_amount_bs: order.fee_amount_bs,
          net_amount_bs: order.net_amount_bs,
        }),
        created_at_utc: nowIso,
      });
    }

    const settlementId = crypto.randomUUID();
    const periodStart = orders.length > 0 ? orders[orders.length - 1].created_at : nowIso;
    const periodEnd = nowIso;

    const report: SettlementReport = {
      settlement_id: settlementId,
      merchant_id: merchantId,
      period_start: periodStart,
      period_end: periodEnd,
      total_orders_matched: eligibleOrders.length,
      total_auto_repaired: 0,
      total_revoked_discrepancy: 0,
      total_gross_bs: Number(totalGrossBs.toFixed(2)),
      total_commission_bs: Number(totalCommissionBs.toFixed(2)),
      total_net_bs: Number(totalNetBs.toFixed(2)),
      executed_at: nowIso,
    };

    this.settlementRepo.insert(report);

    return {
      settlement_id: settlementId,
      merchant_id: merchantId,
      total_orders_matched: report.total_orders_matched,
      total_auto_repaired: report.total_auto_repaired,
      total_revoked_discrepancy: report.total_revoked_discrepancy,
      total_gross_bs: report.total_gross_bs,
      total_commission_bs: report.total_commission_bs,
      total_net_bs: report.total_net_bs,
      executed_at: nowIso,
    };
  }
}


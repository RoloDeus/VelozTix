import { DatabaseSync } from 'node:sqlite';
import { SettlementReport } from '../../types/domain.js';
import { mapRow, mapRows } from '../helpers.js';

export class SettlementRepository {
  constructor(private db: DatabaseSync) {}

  findById(settlementId: string): SettlementReport | null {
    const stmt = this.db.prepare(
      'SELECT * FROM SETTLEMENT_REPORTS WHERE settlement_id = ?'
    );
    return mapRow<SettlementReport>(stmt.get(settlementId));
  }

  findByMerchant(merchantId: string): SettlementReport[] {
    const stmt = this.db.prepare(
      'SELECT * FROM SETTLEMENT_REPORTS WHERE merchant_id = ? ORDER BY executed_at DESC'
    );
    return mapRows<SettlementReport>(stmt.all(merchantId));
  }

  insert(report: SettlementReport): void {
    const stmt = this.db.prepare(`
      INSERT INTO SETTLEMENT_REPORTS (
        settlement_id, merchant_id, period_start, period_end,
        total_orders_matched, total_auto_repaired, total_revoked_discrepancy,
        total_gross_bs, total_commission_bs, total_net_bs, executed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      report.settlement_id,
      report.merchant_id,
      report.period_start,
      report.period_end,
      report.total_orders_matched,
      report.total_auto_repaired,
      report.total_revoked_discrepancy,
      report.total_gross_bs,
      report.total_commission_bs,
      report.total_net_bs,
      report.executed_at
    );
  }
}

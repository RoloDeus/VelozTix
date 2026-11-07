export interface ExternalSettlementRecord {
  order_id: string;
  merchant_id?: string;
  payment_reference: string;
  de37_rrn?: string;
  rrn?: string;
  amount_bs: number;
  status: 'SETTLED' | 'REJECTED';
  bank_code?: string;
  paid_at?: string;
  settled_at?: string;
}

export class ExternalSettlementMockService {
  private settlements = new Map<string, ExternalSettlementRecord>();

  recordSettlement(record: ExternalSettlementRecord): void {
    const normalized: ExternalSettlementRecord = {
      ...record,
      de37_rrn: record.de37_rrn || record.rrn || '',
      rrn: record.rrn || record.de37_rrn || '',
      paid_at: record.paid_at || record.settled_at || new Date().toISOString(),
      settled_at: record.settled_at || record.paid_at || new Date().toISOString(),
    };
    const key =
      normalized.order_id ||
      normalized.payment_reference ||
      normalized.de37_rrn ||
      normalized.rrn ||
      `ext_${Math.random()}`;
    this.settlements.set(key, normalized);
  }

  recordPayment(record: ExternalSettlementRecord): void {
    this.recordSettlement(record);
  }

  addRecord(record: ExternalSettlementRecord): void {
    this.recordSettlement(record);
  }

  getReport(merchantId?: string): ExternalSettlementRecord[] {
    const all = Array.from(this.settlements.values());
    if (!merchantId) {
      return all;
    }
    return all.filter((r) => !r.merchant_id || r.merchant_id === merchantId);
  }

  setReport(records: ExternalSettlementRecord[]): void {
    this.settlements.clear();
    for (const rec of records) {
      this.recordSettlement(rec);
    }
  }

  clear(): void {
    this.settlements.clear();
  }
}

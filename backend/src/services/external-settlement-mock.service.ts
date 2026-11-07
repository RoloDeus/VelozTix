export interface ExternalSettlementRecord {
  order_id: string;
  payment_reference: string;
  amount_bs: number;
  status: 'SETTLED' | 'REJECTED';
  bank_code: string;
  rrn: string;
  settled_at: string;
}

export class ExternalSettlementMockService {
  private settlements = new Map<string, ExternalSettlementRecord>();

  recordPayment(record: ExternalSettlementRecord): void {
    this.settlements.set(record.order_id, { ...record });
  }

  getReport(): ExternalSettlementRecord[] {
    return Array.from(this.settlements.values());
  }

  setReport(records: ExternalSettlementRecord[]): void {
    this.settlements.clear();
    for (const rec of records) {
      this.settlements.set(rec.order_id, { ...rec });
    }
  }

  clear(): void {
    this.settlements.clear();
  }
}


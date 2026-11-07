import { DatabaseSync } from 'node:sqlite';
import { AuditLedgerRecord } from '../../types/domain.js';
import { mapRow, mapRows } from '../helpers.js';

export class AuditRepository {
  constructor(private db: DatabaseSync) {}

  findById(auditTraceId: string): AuditLedgerRecord | null {
    const stmt = this.db.prepare(
      'SELECT * FROM AUDIT_LEDGER WHERE audit_trace_id = ?'
    );
    return mapRow<AuditLedgerRecord>(stmt.get(auditTraceId));
  }

  findByOrderId(orderId: string): AuditLedgerRecord[] {
    const stmt = this.db.prepare(
      'SELECT * FROM AUDIT_LEDGER WHERE order_id = ? ORDER BY created_at_utc ASC'
    );
    return mapRows<AuditLedgerRecord>(stmt.all(orderId));
  }

  findAll(): AuditLedgerRecord[] {
    const stmt = this.db.prepare(
      'SELECT * FROM AUDIT_LEDGER ORDER BY created_at_utc DESC'
    );
    return mapRows<AuditLedgerRecord>(stmt.all());
  }

  insert(record: AuditLedgerRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO AUDIT_LEDGER (
        audit_trace_id, order_id, session_id, customer_hash, event_type,
        mti_code, de11_stan, de37_rrn, de39_response_code, metadata_snapshot,
        created_at_utc
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      record.audit_trace_id,
      record.order_id,
      record.session_id,
      record.customer_hash,
      record.event_type,
      record.mti_code,
      record.de11_stan,
      record.de37_rrn,
      record.de39_response_code,
      record.metadata_snapshot,
      record.created_at_utc
    );
  }
}

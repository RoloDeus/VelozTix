import { DatabaseSync } from 'node:sqlite';
import { EventRecord } from '../../types/domain.js';
import { mapRow, mapRows } from '../helpers.js';

export class EventRepository {
  constructor(private db: DatabaseSync) {}

  findById(eventId: string): EventRecord | null {
    const stmt = this.db.prepare('SELECT * FROM EVENTS WHERE event_id = ?');
    return mapRow<EventRecord>(stmt.get(eventId));
  }

  findAll(): EventRecord[] {
    const stmt = this.db.prepare('SELECT * FROM EVENTS');
    return mapRows<EventRecord>(stmt.all());
  }

  upsert(event: EventRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO EVENTS (
        event_id, merchant_id, event_name, ticket_price_bs,
        total_stock, status, event_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(event_id) DO UPDATE SET
        merchant_id = excluded.merchant_id,
        event_name = excluded.event_name,
        ticket_price_bs = excluded.ticket_price_bs,
        total_stock = excluded.total_stock,
        status = excluded.status,
        event_date = excluded.event_date
    `);

    stmt.run(
      event.event_id,
      event.merchant_id,
      event.event_name,
      event.ticket_price_bs,
      event.total_stock,
      event.status,
      event.event_date
    );
  }

  updateStatus(eventId: string, status: EventRecord['status']): void {
    const stmt = this.db.prepare('UPDATE EVENTS SET status = ? WHERE event_id = ?');
    stmt.run(status, eventId);
  }
}

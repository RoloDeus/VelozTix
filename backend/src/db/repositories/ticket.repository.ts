import { DatabaseSync } from 'node:sqlite';
import { TicketRecord, TicketStatus } from '../../types/domain.js';
import { mapRow, mapRows } from '../helpers.js';

export class TicketRepository {
  constructor(private db: DatabaseSync) {}

  findById(ticketId: string): TicketRecord | null {
    const stmt = this.db.prepare('SELECT * FROM TICKETS WHERE ticket_id = ?');
    return mapRow<TicketRecord>(stmt.get(ticketId));
  }

  findByOrderId(orderId: string): TicketRecord[] {
    const stmt = this.db.prepare('SELECT * FROM TICKETS WHERE order_id = ?');
    return mapRows<TicketRecord>(stmt.all(orderId));
  }

  findByTokenHash(tokenHash: string): TicketRecord | null {
    const stmt = this.db.prepare('SELECT * FROM TICKETS WHERE token_hash = ?');
    return mapRow<TicketRecord>(stmt.get(tokenHash));
  }

  insert(ticket: TicketRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO TICKETS (
        ticket_id, order_id, event_id, nonce, token_hash,
        ticket_qr, status, issued_at, used_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      ticket.ticket_id,
      ticket.order_id,
      ticket.event_id,
      ticket.nonce,
      ticket.token_hash,
      ticket.ticket_qr,
      ticket.status,
      ticket.issued_at,
      ticket.used_at
    );
  }

  updateStatus(
    ticketId: string,
    status: TicketStatus,
    usedAt: string | null = null
  ): void {
    const stmt = this.db.prepare(`
      UPDATE TICKETS
      SET status = ?, used_at = ?
      WHERE ticket_id = ?
    `);
    stmt.run(status, usedAt, ticketId);
  }
}

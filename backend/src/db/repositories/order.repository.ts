import { DatabaseSync } from 'node:sqlite';
import { OrderRecord, OrderStatus } from '../../types/domain.js';
import { mapRow, mapRows } from '../helpers.js';

export class OrderRepository {
  constructor(private db: DatabaseSync) {}

  findById(orderId: string): OrderRecord | null {
    const stmt = this.db.prepare('SELECT * FROM ORDERS WHERE order_id = ?');
    return mapRow<OrderRecord>(stmt.get(orderId));
  }

  findByRrn(rrn: string): OrderRecord | null {
    const stmt = this.db.prepare('SELECT * FROM ORDERS WHERE de37_rrn = ?');
    return mapRow<OrderRecord>(stmt.get(rrn));
  }

  findByPaymentReference(paymentRef: string): OrderRecord | null {
    const stmt = this.db.prepare('SELECT * FROM ORDERS WHERE payment_reference = ?');
    return mapRow<OrderRecord>(stmt.get(paymentRef));
  }

  findAll(): OrderRecord[] {
    const stmt = this.db.prepare('SELECT * FROM ORDERS ORDER BY created_at DESC');
    return mapRows<OrderRecord>(stmt.all());
  }

  findByMerchant(merchantId: string): OrderRecord[] {
    const stmt = this.db.prepare(
      'SELECT * FROM ORDERS WHERE merchant_id = ? ORDER BY created_at DESC'
    );
    return mapRows<OrderRecord>(stmt.all(merchantId));
  }

  insert(order: OrderRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO ORDERS (
        order_id, event_id, merchant_id, customer_hash, session_id,
        status, ticket_tier_id, quantity, bcv_exchange_rate, gross_amount_bs,
        fee_amount_bs, net_amount_bs, de11_stan, de37_rrn, de38_auth_code,
        payment_reference, qr_dynamic_payload, expires_at, updated_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      order.order_id,
      order.event_id,
      order.merchant_id,
      order.customer_hash,
      order.session_id,
      order.status,
      order.ticket_tier_id,
      order.quantity,
      order.bcv_exchange_rate,
      order.gross_amount_bs,
      order.fee_amount_bs,
      order.net_amount_bs,
      order.de11_stan,
      order.de37_rrn,
      order.de38_auth_code,
      order.payment_reference,
      order.qr_dynamic_payload,
      order.expires_at,
      order.updated_at,
      order.created_at
    );
  }

  updateStatus(
    orderId: string,
    status: OrderStatus,
    paymentReference: string | null = null,
    updatedAt: string = new Date().toISOString()
  ): void {
    if (paymentReference) {
      const stmt = this.db.prepare(`
        UPDATE ORDERS
        SET status = ?, payment_reference = ?, updated_at = ?
        WHERE order_id = ?
      `);
      stmt.run(status, paymentReference, updatedAt, orderId);
    } else {
      const stmt = this.db.prepare(`
        UPDATE ORDERS
        SET status = ?, updated_at = ?
        WHERE order_id = ?
      `);
      stmt.run(status, updatedAt, orderId);
    }
  }
}

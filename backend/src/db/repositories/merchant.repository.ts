import { DatabaseSync } from 'node:sqlite';
import { Merchant } from '../../types/domain.js';
import { mapRow, mapRows } from '../helpers.js';

export class MerchantRepository {
  constructor(private db: DatabaseSync) {}

  findById(merchantId: string): Merchant | null {
    const stmt = this.db.prepare('SELECT * FROM MERCHANTS WHERE merchant_id = ?');
    return mapRow<Merchant>(stmt.get(merchantId));
  }

  findAll(): Merchant[] {
    const stmt = this.db.prepare('SELECT * FROM MERCHANTS');
    return mapRows<Merchant>(stmt.all());
  }

  upsert(merchant: Merchant): void {
    const stmt = this.db.prepare(`
      INSERT INTO MERCHANTS (
        merchant_id, name, rif_masked, bank_code, phone_masked,
        account_masked, commission_pct, fixed_fee_usd, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(merchant_id) DO UPDATE SET
        name = excluded.name,
        rif_masked = excluded.rif_masked,
        bank_code = excluded.bank_code,
        phone_masked = excluded.phone_masked,
        account_masked = excluded.account_masked,
        commission_pct = excluded.commission_pct,
        fixed_fee_usd = excluded.fixed_fee_usd
    `);

    stmt.run(
      merchant.merchant_id,
      merchant.name,
      merchant.rif_masked,
      merchant.bank_code,
      merchant.phone_masked,
      merchant.account_masked,
      merchant.commission_pct,
      merchant.fixed_fee_usd,
      merchant.created_at
    );
  }
}

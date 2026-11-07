import { DatabaseSync } from 'node:sqlite';
import { BuyerPiiVault } from '../../types/domain.js';
import { mapRow } from '../helpers.js';

export class VaultRepository {
  constructor(private db: DatabaseSync) {}

  findByCustomerHash(customerHash: string): BuyerPiiVault | null {
    const stmt = this.db.prepare(
      'SELECT * FROM BUYERS_PII_VAULT WHERE customer_hash = ?'
    );
    return mapRow<BuyerPiiVault>(stmt.get(customerHash));
  }

  upsert(vault: BuyerPiiVault): void {
    const stmt = this.db.prepare(`
      INSERT INTO BUYERS_PII_VAULT (
        customer_hash, encrypted_dni, encrypted_phone, encrypted_email,
        phone_masked, dni_masked, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(customer_hash) DO UPDATE SET
        encrypted_dni = excluded.encrypted_dni,
        encrypted_phone = excluded.encrypted_phone,
        encrypted_email = excluded.encrypted_email,
        phone_masked = excluded.phone_masked,
        dni_masked = excluded.dni_masked
    `);

    stmt.run(
      vault.customer_hash,
      vault.encrypted_dni,
      vault.encrypted_phone,
      vault.encrypted_email,
      vault.phone_masked,
      vault.dni_masked,
      vault.created_at
    );
  }
}

import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config();

export interface AppConfig {
  port: number;
  nodeEnv: string;
  bcvExchangeRate: number;
  privacySalt: string;
  vaultMasterKey: Buffer;
  jwtHmacSecret: string;
  webhookSecret: string;
  dbPath: string;
  apiKey: string;
  bearerToken: string;
}

const rawMasterKey =
  process.env.VAULT_MASTER_KEY ||
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

export const config: AppConfig = {
  port: Number(process.env.PORT) || 8000,
  nodeEnv: process.env.NODE_ENV || 'development',
  bcvExchangeRate: Number(process.env.BCV_EXCHANGE_RATE) || 45.0,
  privacySalt: process.env.PRIVACY_SALT || 'vt_ucab_2026_salt',
  vaultMasterKey: Buffer.from(rawMasterKey, 'hex'),
  jwtHmacSecret:
    process.env.JWT_HMAC_SECRET || 'veloztix_super_secret_jwt_hmac_2026',
  webhookSecret:
    process.env.WEBHOOK_SECRET || 'secret_webhook_pago_movil_2026',
  dbPath: process.env.DB_PATH || path.join(process.cwd(), 'data', 'veloztix.sqlite'),
  apiKey: process.env.API_KEY || 'test_api_key_ucab_2026',
  bearerToken: process.env.BEARER_TOKEN || 'test_bearer_token_ucab_2026',
};


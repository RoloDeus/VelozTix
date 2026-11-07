export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS MERCHANTS (
  merchant_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  rif_masked TEXT NOT NULL,
  bank_code TEXT NOT NULL,
  phone_masked TEXT NOT NULL,
  account_masked TEXT NOT NULL,
  commission_pct REAL NOT NULL DEFAULT 0.045,
  fixed_fee_usd REAL NOT NULL DEFAULT 0.20,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS EVENTS (
  event_id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES MERCHANTS(merchant_id),
  event_name TEXT NOT NULL,
  ticket_price_bs REAL NOT NULL,
  total_stock INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'SOLD_OUT', 'CLOSED')),
  event_date TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS BUYERS_PII_VAULT (
  customer_hash TEXT PRIMARY KEY,
  encrypted_dni TEXT NOT NULL,
  encrypted_phone TEXT NOT NULL,
  encrypted_email TEXT NOT NULL,
  phone_masked TEXT NOT NULL,
  dni_masked TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS TELEMETRY_SESSIONS (
  session_id TEXT PRIMARY KEY,
  customer_hash TEXT NOT NULL REFERENCES BUYERS_PII_VAULT(customer_hash),
  event_id TEXT NOT NULL REFERENCES EVENTS(event_id),
  dwell_time INTEGER NOT NULL,
  scroll_depth REAL NOT NULL,
  checkout_fill_time_ms INTEGER NOT NULL,
  avg_flight_time_ms REAL NOT NULL,
  cursor_linearity_index REAL NOT NULL,
  copy_paste_flag INTEGER NOT NULL,
  tab_switch_count INTEGER NOT NULL,
  device_fingerprint TEXT NOT NULL,
  risk_score REAL NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('APPROVE', 'REJECT_BOT')),
  profile_tag TEXT NOT NULL CHECK (profile_tag IN ('FAN_DECIDIDO', 'COMPRADOR_INDECISO', 'RIESGO_MODERADO')),
  inference_latency_ms INTEGER NOT NULL,
  evaluated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ORDERS (
  order_id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES EVENTS(event_id),
  merchant_id TEXT NOT NULL REFERENCES MERCHANTS(merchant_id),
  customer_hash TEXT NOT NULL REFERENCES BUYERS_PII_VAULT(customer_hash),
  session_id TEXT NOT NULL REFERENCES TELEMETRY_SESSIONS(session_id),
  status TEXT NOT NULL CHECK (status IN ('AUTHORIZED', 'PENDING_PAYMENT', 'CAPTURED', 'SETTLED', 'REVERSED', 'RECONCILED', 'REFUND_PENDING')),
  ticket_tier_id TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  bcv_exchange_rate REAL NOT NULL,
  gross_amount_bs REAL NOT NULL,
  fee_amount_bs REAL NOT NULL,
  net_amount_bs REAL NOT NULL,
  de11_stan TEXT NOT NULL,
  de37_rrn TEXT NOT NULL,
  de38_auth_code TEXT NOT NULL,
  payment_reference TEXT UNIQUE,
  qr_dynamic_payload TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS TICKETS (
  ticket_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES ORDERS(order_id),
  event_id TEXT NOT NULL REFERENCES EVENTS(event_id),
  nonce TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  ticket_qr TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'USED', 'REVOKED')),
  issued_at TEXT NOT NULL,
  used_at TEXT
);

CREATE TABLE IF NOT EXISTS AUDIT_LEDGER (
  audit_trace_id TEXT PRIMARY KEY,
  order_id TEXT REFERENCES ORDERS(order_id),
  session_id TEXT NOT NULL REFERENCES TELEMETRY_SESSIONS(session_id),
  customer_hash TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('REJECT_BOT', 'AUTHORIZED', 'CAPTURED', 'REVERSED', 'RECONCILED', 'ANOMALY')),
  mti_code TEXT NOT NULL,
  de11_stan TEXT NOT NULL,
  de37_rrn TEXT NOT NULL,
  de39_response_code TEXT NOT NULL,
  metadata_snapshot TEXT NOT NULL,
  created_at_utc TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS SETTLEMENT_REPORTS (
  settlement_id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES MERCHANTS(merchant_id),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  total_orders_matched INTEGER NOT NULL,
  total_auto_repaired INTEGER NOT NULL,
  total_revoked_discrepancy INTEGER NOT NULL,
  total_gross_bs REAL NOT NULL,
  total_commission_bs REAL NOT NULL,
  total_net_bs REAL NOT NULL,
  executed_at TEXT NOT NULL
);

-- Immutability triggers for AUDIT_LEDGER
CREATE TRIGGER IF NOT EXISTS trg_audit_ledger_no_update
BEFORE UPDATE ON AUDIT_LEDGER
BEGIN
  SELECT RAISE(ABORT, 'AUDIT_LEDGER is immutable: updates prohibited by SUDEBAN 12441/12221');
END;

CREATE TRIGGER IF NOT EXISTS trg_audit_ledger_no_delete
BEFORE DELETE ON AUDIT_LEDGER
BEGIN
  SELECT RAISE(ABORT, 'AUDIT_LEDGER is immutable: deletes prohibited by SUDEBAN 12441/12221');
END;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_orders_customer ON ORDERS(customer_hash);
CREATE INDEX IF NOT EXISTS idx_orders_status ON ORDERS(status);
CREATE INDEX IF NOT EXISTS idx_orders_rrn ON ORDERS(de37_rrn);
CREATE INDEX IF NOT EXISTS idx_tickets_order ON TICKETS(order_id);
CREATE INDEX IF NOT EXISTS idx_audit_order ON AUDIT_LEDGER(order_id);
`;


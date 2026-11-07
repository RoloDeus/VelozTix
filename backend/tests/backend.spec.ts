import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { DatabaseSync } from 'node:sqlite';
import { createDatabaseConnection } from '../src/db/connection.js';
import { runSeed } from '../src/db/seed.js';
import { createContainer } from '../src/container.js';
import { createApp } from '../src/app.js';
import { SimulatedClock } from '../src/services/clock.js';
import { AppConfig } from '../src/config/env.js';

describe('VelozTix Backend Merchant & Mediator API', () => {
  let db: DatabaseSync;
  let clock: SimulatedClock;
  let testConfig: AppConfig;
  let container: ReturnType<typeof createContainer>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    // In-memory database for isolated testing
    db = createDatabaseConnection(':memory:');
    clock = new SimulatedClock(Date.parse('2026-11-06T12:00:00Z'));

    testConfig = {
      port: 8000,
      nodeEnv: 'test',
      bcvExchangeRate: 45.0,
      privacySalt: 'test_salt_ucab_2026',
      vaultMasterKey: Buffer.from(
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        'hex'
      ),
      jwtHmacSecret: 'test_jwt_hmac_secret_2026',
      webhookSecret: 'test_webhook_secret_pago_movil_2026',
      dbPath: ':memory:',
      apiKey: 'test_api_key_ucab_2026',
      bearerToken: 'test_bearer_token_ucab_2026',
    };

    container = createContainer(db, testConfig, clock, { startAutoSweep: false });
    runSeed(db, container.redis);
    app = createApp(container);
  });

  // ========================================================
  // 1. Criptografía y Protección PII (AES-256-GCM, Hash, JWT)
  // ========================================================
  describe('Privacy & Cryptographic Vault', () => {
    it('ciphers and deciphers PII using AES-256-GCM', () => {
      const plainDni = 'V-28123456';
      const cipherHex = container.cryptoService.encryptGcm(plainDni);
      assert.notStrictEqual(cipherHex, plainDni);
      assert.strictEqual(cipherHex.split(':').length, 3);

      const decrypted = container.cryptoService.decryptGcm(cipherHex);
      assert.strictEqual(decrypted, plainDni);
    });

    it('generates deterministic irreversible customer_hash with cryptographic salt', () => {
      const buyer = {
        national_id: 'V-28123456',
        phone_number: '+584141234567',
        email: 'estudiante@ucab.edu.ve',
      };
      const hash1 = container.cryptoService.generateCustomerHash(buyer);
      const hash2 = container.cryptoService.generateCustomerHash(buyer);
      assert.strictEqual(hash1, hash2);
      assert.ok(hash1.startsWith('chash_'));
      assert.ok(!hash1.includes('28123456'));
    });

    it('generates ticket JWT signed with HMAC-SHA256 containing ZERO PII', () => {
      const payload = {
        ticket_id: 'tkt_vz_123456',
        event_id: 'evt-cyberfest-26',
        nonce: 'A1B2C3D4',
      };
      const { token } = container.cryptoService.generateTicketJwt(payload);
      assert.strictEqual(token.split('.').length, 3);

      const verification = container.cryptoService.verifyTicketJwt(token);
      assert.strictEqual(verification.valid, true);
      assert.deepStrictEqual(verification.payload, payload);
      // Ensure zero PII in token
      assert.ok(!token.includes('dni'));
      assert.ok(!token.includes('email'));
      assert.ok(!token.includes('phone'));
    });
  });

  // ========================================================
  // 2. Orden de Autorización (/api/v1/orders/authorize)
  // ========================================================
  describe('POST /api/v1/orders/authorize', () => {
    const validPayload = {
      event_id: 'evt-cyberfest-26',
      items: [
        {
          ticket_tier_id: 'tier_general',
          quantity: 2,
          unit_price_bs: 360.0,
        },
      ],
      buyer_pii: {
        national_id: 'V-28123456',
        phone_number: '+584141234567',
        email: 'asistente@ucab.edu.ve',
      },
      telemetry: {
        dwell_time: 45000,
        scroll_depth: 85.0,
        checkout_fill_time_ms: 12500,
        keystroke_dynamics: {
          avg_flight_time_ms: 130.0,
          cursor_linearity_index: 0.28,
        },
        copy_paste_flag: false,
        tab_switch_count: 0,
        device_fingerprint: 'dfp_test_device_001',
      },
    };

    it('requires Idempotency-Key header', async () => {
      const res = await request(app)
        .post('/api/v1/orders/authorize')
        .set('X-VelozTix-API-Key', testConfig.apiKey)
        .send(validPayload);

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error_code, 'MISSING_IDEMPOTENCY_KEY');
    });

    it('authorizes order successfully, reserves stock in memory and emits dynamic QR', async () => {
      const idempotencyKey = '550e8400-e29b-41d4-a716-446655440001';

      const initialStock = container.redis.getStock('evt-cyberfest-26');
      assert.strictEqual(initialStock?.availableStock, 250);

      const res = await request(app)
        .post('/api/v1/orders/authorize')
        .set('X-VelozTix-API-Key', testConfig.apiKey)
        .set('Idempotency-Key', idempotencyKey)
        .send(validPayload);

      assert.strictEqual(res.status, 201);
      assert.ok(res.body.order_id);
      assert.strictEqual(res.body.status, 'AUTHORIZED');
      assert.strictEqual(res.body.amount_bs, 720.0);
      assert.ok(res.body.customer_hash);
      assert.strictEqual(res.body.ai_evaluation.verdict, 'APPROVE');
      assert.strictEqual(res.body.iso8583_trace.de39_response_code, '00');
      assert.strictEqual(res.body.qr_dynamic_payload.destination_bank_code, '0102');
      assert.ok(res.body.qr_dynamic_payload.hmac_signature);

      // Check stock deducted in memory
      const updatedStock = container.redis.getStock('evt-cyberfest-26');
      assert.strictEqual(updatedStock?.availableStock, 248);
      assert.strictEqual(updatedStock?.reservedStock, 2);

      // Verify PII is in vault and encrypted
      const vaultRecord = container.vaultRepo.findByCustomerHash(res.body.customer_hash);
      assert.ok(vaultRecord !== null);
      assert.strictEqual(vaultRecord?.dni_masked, 'V-28.***.456');

      // Check Audit Ledger
      const auditLogs = container.auditRepo.findAll();
      assert.ok(auditLogs.some((l) => l.event_type === 'AUTHORIZED'));
    });

    it('returns cached response on idempotent re-invocation', async () => {
      const idempotencyKey = '550e8400-e29b-41d4-a716-446655440002';

      const res1 = await request(app)
        .post('/api/v1/orders/authorize')
        .set('X-VelozTix-API-Key', testConfig.apiKey)
        .set('Idempotency-Key', idempotencyKey)
        .send(validPayload);
      assert.strictEqual(res1.status, 201);

      const res2 = await request(app)
        .post('/api/v1/orders/authorize')
        .set('X-VelozTix-API-Key', testConfig.apiKey)
        .set('Idempotency-Key', idempotencyKey)
        .send(validPayload);
      assert.strictEqual(res2.status, 201);
      assert.strictEqual(res2.body.order_id, res1.body.order_id);
    });

    it('rejects bot/scalping attempts with 403 REJECT_BOT', async () => {
      const botPayload = {
        ...validPayload,
        telemetry: {
          dwell_time: 120, // 120ms (instant script)
          scroll_depth: 0,
          checkout_fill_time_ms: 80, // filled in 80ms
          keystroke_dynamics: {
            avg_flight_time_ms: 5.0,
            cursor_linearity_index: 0.98, // perfectly linear synthetic mouse
          },
          copy_paste_flag: true,
          tab_switch_count: 0,
          device_fingerprint: 'bot_fingerprint_script',
        },
      };

      const res = await request(app)
        .post('/api/v1/orders/authorize')
        .set('X-VelozTix-API-Key', testConfig.apiKey)
        .set('Idempotency-Key', '550e8400-e29b-41d4-a716-446655440003')
        .send(botPayload);

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.verdict, 'REJECT_BOT');
      assert.ok(res.body.risk_score >= 0.85);

      // Verify inventory was NOT compromised
      const stock = container.redis.getStock('evt-cyberfest-26');
      assert.strictEqual(stock?.availableStock, 250);

      // Verify security trace in Audit Ledger
      const auditLogs = container.auditRepo.findAll();
      assert.ok(auditLogs.some((l) => l.event_type === 'REJECT_BOT'));
    });
  });

  // ========================================================
  // 3. Webhook de Pago Móvil (/api/v1/webhooks/pago-movil)
  // ========================================================
  describe('POST /api/v1/webhooks/pago-movil', () => {
    let orderId: string;
    let rrn: string;

    beforeEach(async () => {
      // Authorize an order first
      const authRes = await request(app)
        .post('/api/v1/orders/authorize')
        .set('X-VelozTix-API-Key', testConfig.apiKey)
        .set('Idempotency-Key', '550e8400-e29b-41d4-a716-446655440010')
        .send({
          event_id: 'evt-cyberfest-26',
          items: [{ ticket_tier_id: 'general', quantity: 2, unit_price_bs: 360.0 }],
          buyer_pii: {
            national_id: 'V-28123456',
            phone_number: '+584141234567',
            email: 'comprador@ucab.edu.ve',
          },
          telemetry: {
            dwell_time: 25000,
            scroll_depth: 70,
            checkout_fill_time_ms: 10000,
            keystroke_dynamics: { avg_flight_time_ms: 120, cursor_linearity_index: 0.3 },
            copy_paste_flag: false,
            tab_switch_count: 0,
            device_fingerprint: 'dfp_valid_buyer',
          },
        });

      orderId = authRes.body.order_id;
      rrn = authRes.body.iso8583_trace.de37_rrn;
    });

    it('rejects webhook with 401 when X-Signature HMAC-SHA256 is invalid', async () => {
      const webhookPayload = {
        event_type: 'payment.captured',
        order_id: orderId,
        payment_reference: '0094827162',
        amount_bs: 720.0,
        iso8583_settlement: {
          mti: '0200',
          de37_rrn: rrn,
          de39_response_code: '00',
        },
        timestamp: clock.toISOString(),
      };

      const res = await request(app)
        .post('/api/v1/webhooks/pago-movil')
        .set('X-Signature', 'bad_hmac_signature_hex')
        .send(webhookPayload);

      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.error_code, 'INVALID_SIGNATURE');
    });

    it('processes successful capture, settles order and issues ticket with zero PII', async () => {
      const webhookPayload = {
        event_type: 'payment.captured',
        order_id: orderId,
        payment_reference: '0094827162',
        amount_bs: 720.0,
        iso8583_settlement: {
          mti: '0200',
          de37_rrn: rrn,
          de39_response_code: '00',
        },
        timestamp: clock.toISOString(),
      };

      const rawJson = JSON.stringify(webhookPayload);
      const signature = container.cryptoService.generateWebhookSignature(rawJson);

      const res = await request(app)
        .post('/api/v1/webhooks/pago-movil')
        .set('X-Signature', signature)
        .set('Content-Type', 'application/json')
        .send(rawJson);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, 'captured');
      assert.strictEqual(res.body.order_id, orderId);
      assert.ok(res.body.ticket_id);

      // Check order status in DB
      const order = container.orderRepo.findById(orderId);
      assert.strictEqual(order?.status, 'SETTLED');
      assert.strictEqual(order?.payment_reference, '0094827162');

      // Check ticket emitted
      const tickets = container.ticketRepo.findByOrderId(orderId);
      assert.strictEqual(tickets.length, 2);
      assert.strictEqual(tickets[0].status, 'ACTIVE');

      // Check Order Status API returns ticket_qr
      const statusRes = await request(app)
        .get(`/api/v1/orders/${orderId}/status`)
        .set('X-VelozTix-API-Key', testConfig.apiKey);

      assert.strictEqual(statusRes.status, 200);
      assert.strictEqual(statusRes.body.status, 'SETTLED');
      assert.ok(statusRes.body.ticket_qr);
    });

    it('returns already_processed on duplicate webhook delivery', async () => {
      const webhookPayload = {
        event_type: 'payment.captured',
        order_id: orderId,
        payment_reference: '0094827163',
        amount_bs: 720.0,
        iso8583_settlement: {
          mti: '0200',
          de37_rrn: rrn,
          de39_response_code: '00',
        },
        timestamp: clock.toISOString(),
      };

      const rawJson = JSON.stringify(webhookPayload);
      const signature = container.cryptoService.generateWebhookSignature(rawJson);

      // First webhook
      const res1 = await request(app)
        .post('/api/v1/webhooks/pago-movil')
        .set('X-Signature', signature)
        .set('Content-Type', 'application/json')
        .send(rawJson);
      assert.strictEqual(res1.body.status, 'captured');

      // Duplicate webhook
      const res2 = await request(app)
        .post('/api/v1/webhooks/pago-movil')
        .set('X-Signature', signature)
        .set('Content-Type', 'application/json')
        .send(rawJson);
      assert.strictEqual(res2.body.status, 'already_processed');
    });

    it('handles payment.failed by setting order to REVERSED and restoring stock', async () => {
      const failedPayload = {
        event_type: 'payment.failed',
        order_id: orderId,
        payment_reference: '0094827999',
        amount_bs: 720.0,
        rejection_reason: 'INSUFFICIENT_FUNDS_BUYER_BANK',
        iso8583_settlement: {
          mti: '0400',
          de37_rrn: rrn,
          de39_response_code: '51',
        },
        timestamp: clock.toISOString(),
      };

      const rawJson = JSON.stringify(failedPayload);
      const signature = container.cryptoService.generateWebhookSignature(rawJson);

      const res = await request(app)
        .post('/api/v1/webhooks/pago-movil')
        .set('X-Signature', signature)
        .set('Content-Type', 'application/json')
        .send(rawJson);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, 'reversed');

      const order = container.orderRepo.findById(orderId);
      assert.strictEqual(order?.status, 'REVERSED');

      // Stock was restored
      const stock = container.redis.getStock('evt-cyberfest-26');
      assert.strictEqual(stock?.availableStock, 250);
      assert.strictEqual(stock?.reservedStock, 0);
    });
  });

  // ========================================================
  // 4. TTL Expiration (300 segundos) y Conciliación Comercial
  // ========================================================
  describe('TTL Expiration & Commercial Reconciliation', () => {
    it('expires reservation after 300 seconds and auto-reverses order', async () => {
      const authRes = await request(app)
        .post('/api/v1/orders/authorize')
        .set('X-VelozTix-API-Key', testConfig.apiKey)
        .set('Idempotency-Key', '550e8400-e29b-41d4-a716-446655440020')
        .send({
          event_id: 'evt-standup-chacao',
          items: [{ ticket_tier_id: 'general', quantity: 2, unit_price_bs: 270.0 }],
          buyer_pii: {
            national_id: 'V-25999888',
            phone_number: '+584149998888',
            email: 'comedia@ucab.edu.ve',
          },
          telemetry: {
            dwell_time: 15000,
            scroll_depth: 80,
            checkout_fill_time_ms: 8000,
            keystroke_dynamics: { avg_flight_time_ms: 110, cursor_linearity_index: 0.2 },
            copy_paste_flag: false,
            tab_switch_count: 0,
            device_fingerprint: 'dfp_standup_buyer',
          },
        });

      const orderId = authRes.body.order_id;
      assert.strictEqual(container.redis.getStock('evt-standup-chacao')?.reservedStock, 2);

      // Fast-forward clock by 301 seconds
      clock.advanceSeconds(301);

      // Checking status triggers sweep & auto-reverse
      const statusRes = await request(app)
        .get(`/api/v1/orders/${orderId}/status`)
        .set('X-VelozTix-API-Key', testConfig.apiKey);

      assert.strictEqual(statusRes.body.status, 'REVERSED');

      // Stock was restituted
      const stock = container.redis.getStock('evt-standup-chacao');
      assert.strictEqual(stock?.availableStock, 120);
      assert.strictEqual(stock?.reservedStock, 0);
    });

    it('executes commercial reconciliation and generates SETTLEMENT_REPORTS', async () => {
      // Create and settle an order
      const authRes = await request(app)
        .post('/api/v1/orders/authorize')
        .set('X-VelozTix-API-Key', testConfig.apiKey)
        .set('Idempotency-Key', '550e8400-e29b-41d4-a716-446655440030')
        .send({
          event_id: 'evt-sunset-vinyl',
          items: [{ ticket_tier_id: 'vip', quantity: 1, unit_price_bs: 540.0 }],
          buyer_pii: {
            national_id: 'V-20111222',
            phone_number: '+584120001122',
            email: 'vinyl@ucab.edu.ve',
          },
          telemetry: {
            dwell_time: 20000,
            scroll_depth: 90,
            checkout_fill_time_ms: 9000,
            keystroke_dynamics: { avg_flight_time_ms: 115, cursor_linearity_index: 0.25 },
            copy_paste_flag: false,
            tab_switch_count: 0,
            device_fingerprint: 'dfp_vinyl',
          },
        });

      const orderId = authRes.body.order_id;
      const rrn = authRes.body.iso8583_trace.de37_rrn;

      // Webhook capture
      const webhookPayload = {
        event_type: 'payment.captured',
        order_id: orderId,
        payment_reference: '0094827170',
        amount_bs: 540.0,
        iso8583_settlement: { mti: '0200', de37_rrn: rrn, de39_response_code: '00' },
        timestamp: clock.toISOString(),
      };
      const rawJson = JSON.stringify(webhookPayload);
      await request(app)
        .post('/api/v1/webhooks/pago-movil')
        .set('X-Signature', container.cryptoService.generateWebhookSignature(rawJson))
        .set('Content-Type', 'application/json')
        .send(rawJson);

      // Run reconciliation
      const recResult = container.reconciliationService.executeReconciliation('MRC_UCAB_00129');
      assert.ok(recResult.total_orders_matched >= 1);
      assert.ok(recResult.total_gross_bs >= 540.0);
      assert.ok(recResult.total_commission_bs > 0);
      assert.ok(recResult.total_net_bs > 0);

      // Verify order moved to RECONCILED
      const order = container.orderRepo.findById(orderId);
      assert.strictEqual(order?.status, 'RECONCILED');

      // Verify SETTLEMENT_REPORTS persisted
      const reports = container.settlementRepo.findByMerchant('MRC_UCAB_00129');
      assert.strictEqual(reports.length, 1);
      assert.strictEqual(reports[0].settlement_id, recResult.settlement_id);
    });
  });
});

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

describe('VelozTix Backend Merchant & Mediator API - OpenAPI 3.0 & Reconciliation Worker', () => {
  let db: DatabaseSync;
  let clock: SimulatedClock;
  let testConfig: AppConfig;
  let container: ReturnType<typeof createContainer>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = createDatabaseConnection(':memory:');
    clock = new SimulatedClock(Date.parse('2026-11-06T12:00:00Z'));

    testConfig = {
      port: 8000,
      nodeEnv: 'test',
      bcvExchangeRate: 55.0, // Directive 3: fallback 55.00 VES/USD
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
  // 1. Criptografía, Bóveda PII y Tokens JWT
  // ========================================================
  describe('Criptografía y Bóveda PII', () => {
    it('cifra con AES-256-GCM y calcula customer_hash irreversible con sal', () => {
      const buyer = {
        national_id: 'V-28123456',
        phone_number: '+584141234567',
        email: 'estudiante@ucab.edu.ve',
      };
      const customerHash = container.cryptoService.generateCustomerHash(buyer);
      assert.ok(customerHash.startsWith('chash_'));

      const cipherDni = container.cryptoService.encryptGcm(buyer.national_id);
      assert.notStrictEqual(cipherDni, buyer.national_id);
      assert.strictEqual(container.cryptoService.decryptGcm(cipherDni), buyer.national_id);
    });

    it('emite boleto JWT firmado con HMAC-SHA256 con cero datos PII', () => {
      const { token } = container.cryptoService.generateTicketJwt({
        ticket_id: 'tkt_vz_990011',
        event_id: 'evt-cyberfest-26',
        nonce: 'N99A88',
      });
      const verified = container.cryptoService.verifyTicketJwt(token);
      assert.strictEqual(verified.valid, true);
      assert.ok(!token.includes('V-28'));
      assert.ok(!token.includes('estudiante@'));
    });
  });

  // ========================================================
  // 2. Middleware de Idempotencia y Firma
  // ========================================================
  describe('Middlewares de Idempotencia y Firma', () => {
    it('rechaza webhooks con 401 INVALID_SIGNATURE antes de procesar si firma es ausente o inválida', async () => {
      const resMissing = await request(app)
        .post('/api/v1/webhooks/pago-movil')
        .send({ event_type: 'payment.captured', order_id: 'ord_fake_1' });

      assert.strictEqual(resMissing.status, 401);
      assert.strictEqual(resMissing.body.error_code, 'INVALID_SIGNATURE');

      const resBad = await request(app)
        .post('/api/v1/webhooks/pago-movil')
        .set('X-Signature', 'bad_signature_hex_1234')
        .send({ event_type: 'payment.captured', order_id: 'ord_fake_1' });

      assert.strictEqual(resBad.status, 401);
      assert.strictEqual(resBad.body.error_code, 'INVALID_SIGNATURE');
    });

    it('responde en < 15 ms en reintentos de webhook vía idempotencia (already_processed)', async () => {
      const payload = {
        event_type: 'payment.captured',
        order_id: 'ord_test_idemp_1',
        payment_reference: '0099448811',
        amount_bs: 360.0,
        iso8583_settlement: { mti: '0200', de37_rrn: '0099448811', de39_response_code: '00' },
        timestamp: clock.toISOString(),
      };
      const rawJson = JSON.stringify(payload);
      const signature = container.cryptoService.generateWebhookSignature(rawJson);
      const idempotencyKey = 'wh-idemp-uuid-4444';

      // Pre-seed idempotency cache in Redis
      container.redis.setIdempotency(idempotencyKey, {
        fingerprint: container.cryptoService.sha256(rawJson),
        statusCode: 200,
        responseBody: {
          status: 'captured',
          order_id: 'ord_test_idemp_1',
          ticket_id: 'tkt_cached_1',
          audit_trace_id: 'aud_cached_1',
        },
      });

      const startTime = performance.now();
      const res = await request(app)
        .post('/api/v1/webhooks/pago-movil')
        .set('X-Signature', signature)
        .set('Idempotency-Key', idempotencyKey)
        .set('Content-Type', 'application/json')
        .send(rawJson);
      const elapsed = performance.now() - startTime;

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, 'already_processed');
      assert.strictEqual(res.body.order_id, 'ord_test_idemp_1');
      assert.ok(elapsed < 150); // fast network test
    });
  });

  // ========================================================
  // 3. Endpoint POST /api/v1/orders/authorize y Regla Antifraude
  // ========================================================
  describe('POST /api/v1/orders/authorize', () => {
    const validHumanPayload = {
      event_id: 'evt-cyberfest-26',
      items: [{ ticket_tier_id: 'general', quantity: 2, unit_price_bs: 360.0 }],
      buyer_pii: {
        national_id: 'V-28123456',
        phone_number: '+584141234567',
        email: 'asistente@ucab.edu.ve',
      },
      telemetry: {
        dwell_time: 42000,
        scroll_depth: 80.0,
        checkout_fill_time_ms: 12000, // > 800ms
        keystroke_dynamics: { avg_flight_time_ms: 120, cursor_linearity_index: 0.3 }, // <= 0.8
        copy_paste_flag: false,
        tab_switch_count: 0,
        device_fingerprint: 'dfp_human_1',
      },
    };

    it('bloquea bot cuando checkout_fill_time_ms < 800 (REJECT_BOT 403) sin bloquear inventario', async () => {
      const botPayload = {
        ...validHumanPayload,
        telemetry: {
          ...validHumanPayload.telemetry,
          checkout_fill_time_ms: 450, // < 800ms
        },
      };

      const initialStock = container.redis.getStock('evt-cyberfest-26');
      assert.strictEqual(initialStock?.availableStock, 250);

      const res = await request(app)
        .post('/api/v1/orders/authorize')
        .set('X-VelozTix-API-Key', testConfig.apiKey)
        .set('Idempotency-Key', 'bot-key-001')
        .send(botPayload);

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.verdict, 'REJECT_BOT');
      assert.ok(res.body.audit_trace_id);

      // Stock NOT compromised
      const stockAfter = container.redis.getStock('evt-cyberfest-26');
      assert.strictEqual(stockAfter?.availableStock, 250);
      assert.strictEqual(stockAfter?.reservedStock, 0);

      // Recorded in AUDIT_LEDGER
      const audit = container.auditRepo.findAll();
      assert.ok(audit.some((a) => a.event_type === 'REJECT_BOT'));
    });

    it('bloquea bot cuando copy_paste_flag == true con cursor_linearity_index > 0.8 (REJECT_BOT 403)', async () => {
      const botPayload = {
        ...validHumanPayload,
        telemetry: {
          ...validHumanPayload.telemetry,
          checkout_fill_time_ms: 2500,
          copy_paste_flag: true,
          keystroke_dynamics: { avg_flight_time_ms: 50, cursor_linearity_index: 0.95 }, // > 0.8
        },
      };

      const res = await request(app)
        .post('/api/v1/orders/authorize')
        .set('X-VelozTix-API-Key', testConfig.apiKey)
        .set('Idempotency-Key', 'bot-key-002')
        .send(botPayload);

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.verdict, 'REJECT_BOT');
    });

    it('aprueba humano, calcula tarifa mixta (4.5% + $0.20 a tasa BCV 55.0) y responde 201 Created', async () => {
      const res = await request(app)
        .post('/api/v1/orders/authorize')
        .set('X-VelozTix-API-Key', testConfig.apiKey)
        .set('Idempotency-Key', 'human-key-001')
        .send(validHumanPayload);

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.status, 'AUTHORIZED');
      assert.strictEqual(res.body.amount_bs, 720.0);
      assert.strictEqual(res.body.iso8583_trace.de39_response_code, '00');
      assert.ok(res.body.qr_dynamic_payload.hmac_signature);

      // Check fee in DB: (720 * 0.045) + (0.20 * 55.0) = 32.40 + 11.00 = 43.40 Bs
      const order = container.orderRepo.findById(res.body.order_id);
      assert.ok(order);
      assert.strictEqual(order?.fee_amount_bs, 43.4);
      assert.strictEqual(order?.net_amount_bs, 676.6);

      // Reserved stock
      assert.strictEqual(container.redis.getStock('evt-cyberfest-26')?.reservedStock, 2);
    });
  });

  // ========================================================
  // 4. Endpoint GET /api/v1/orders/{order_id}/status
  // ========================================================
  describe('GET /api/v1/orders/{order_id}/status', () => {
    it('retorna ticket_qr como null mientras está en AUTHORIZED y con JWT firmado tras SETTLED o RECONCILED', async () => {
      // 1. Authorize order
      const authRes = await request(app)
        .post('/api/v1/orders/authorize')
        .set('X-VelozTix-API-Key', testConfig.apiKey)
        .set('Idempotency-Key', 'status-flow-001')
        .send({
          event_id: 'evt-cyberfest-26',
          items: [{ ticket_tier_id: 'general', quantity: 1, unit_price_bs: 360.0 }],
          buyer_pii: {
            national_id: 'V-20000001',
            phone_number: '+584140000001',
            email: 'user1@ucab.edu.ve',
          },
          telemetry: {
            dwell_time: 30000,
            scroll_depth: 75,
            checkout_fill_time_ms: 9500,
            keystroke_dynamics: { avg_flight_time_ms: 100, cursor_linearity_index: 0.2 },
            copy_paste_flag: false,
            tab_switch_count: 0,
            device_fingerprint: 'dfp_user1',
          },
        });

      const orderId = authRes.body.order_id;

      // Status in AUTHORIZED -> ticket_qr must be null
      const statusRes1 = await request(app)
        .get(`/api/v1/orders/${orderId}/status`)
        .set('X-VelozTix-API-Key', testConfig.apiKey);

      assert.strictEqual(statusRes1.status, 200);
      assert.strictEqual(statusRes1.body.status, 'AUTHORIZED');
      assert.strictEqual(statusRes1.body.ticket_qr, null);

      // Settle via webhook
      const webhookPayload = {
        event_type: 'payment.captured',
        order_id: orderId,
        payment_reference: '0077112233',
        amount_bs: 360.0,
        iso8583_settlement: { mti: '0200', de37_rrn: '0077112233', de39_response_code: '00' },
        timestamp: clock.toISOString(),
      };
      const rawJson = JSON.stringify(webhookPayload);
      await request(app)
        .post('/api/v1/webhooks/pago-movil')
        .set('X-Signature', container.cryptoService.generateWebhookSignature(rawJson))
        .set('Content-Type', 'application/json')
        .send(rawJson);

      // Status in SETTLED -> ticket_qr must be populated with valid JWT
      const statusRes2 = await request(app)
        .get(`/api/v1/orders/${orderId}/status`)
        .set('X-VelozTix-API-Key', testConfig.apiKey);

      assert.strictEqual(statusRes2.status, 200);
      assert.strictEqual(statusRes2.body.status, 'SETTLED');
      assert.ok(statusRes2.body.ticket_qr);
      const jwtCheck = container.cryptoService.verifyTicketJwt(statusRes2.body.ticket_qr);
      assert.strictEqual(jwtCheck.valid, true);

      // Status in RECONCILED -> ticket_qr must also be populated with valid JWT
      await request(app)
        .post('/api/v1/settlements/reconcile')
        .send({ merchant_id: 'MRC_UCAB_00129' });

      const statusRes3 = await request(app)
        .get(`/api/v1/orders/${orderId}/status`)
        .set('X-VelozTix-API-Key', testConfig.apiKey);

      assert.strictEqual(statusRes3.status, 200);
      assert.strictEqual(statusRes3.body.status, 'RECONCILED');
      assert.ok(statusRes3.body.ticket_qr);
      const jwtCheckRec = container.cryptoService.verifyTicketJwt(statusRes3.body.ticket_qr);
      assert.strictEqual(jwtCheckRec.valid, true);
    });
  });

  // ========================================================
  // 5. Endpoint POST /api/v1/webhooks/pago-movil
  // ========================================================
  describe('POST /api/v1/webhooks/pago-movil (Dual Payload & Flujos)', () => {
    it('soporta payload anidado del documento de mapeo (transaction, financial_breakdown, iso8583_metadata)', async () => {
      // Authorize an order
      const authRes = await request(app)
        .post('/api/v1/orders/authorize')
        .set('X-VelozTix-API-Key', testConfig.apiKey)
        .set('Idempotency-Key', 'nested-flow-001')
        .send({
          event_id: 'evt-sunset-vinyl',
          items: [{ ticket_tier_id: 'general', quantity: 1, unit_price_bs: 540.0 }],
          buyer_pii: {
            national_id: 'V-28111222',
            phone_number: '+584141112222',
            email: 'vinyl@ucab.edu.ve',
          },
          telemetry: {
            dwell_time: 25000,
            scroll_depth: 85,
            checkout_fill_time_ms: 11000,
            keystroke_dynamics: { avg_flight_time_ms: 125, cursor_linearity_index: 0.25 },
            copy_paste_flag: false,
            tab_switch_count: 0,
            device_fingerprint: 'dfp_vinyl_user',
          },
        });

      const orderId = authRes.body.order_id;

      // Nested format from PDF mapping
      const nestedPayload = {
        event_id: 'evt_wh_0918230912',
        event: 'payment.successful',
        mti: '0200',
        timestamp: clock.toISOString(),
        transaction: {
          order_id: orderId,
          payment_reference: '004928172',
          auth_code: 'AUTH_88219',
          internal_trace_id: 'tr_991823',
          tx_type: 'P2C_MOBILE_PAYMENT',
          currency: 'VES',
        },
        financial_breakdown: {
          gross_amount: 540.0,
          fee_amount: 35.3,
          net_amount: 504.7,
        },
        iso8583_metadata: {
          field_11_stan: '991823',
          field_37_rrn: '004928172',
          field_38_auth_code: 'AUTH_88219',
          field_39_response_code: '00',
          field_62_order_ref: orderId,
        },
      };

      const rawJson = JSON.stringify(nestedPayload);
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

      const order = container.orderRepo.findById(orderId);
      assert.strictEqual(order?.status, 'SETTLED');
    });

    it('responde 200 OK con acknowledge_with_internal_alert sin emitir boleto si el TTL expiró', async () => {
      const authRes = await request(app)
        .post('/api/v1/orders/authorize')
        .set('X-VelozTix-API-Key', testConfig.apiKey)
        .set('Idempotency-Key', 'ttl-anomaly-001')
        .send({
          event_id: 'evt-standup-chacao',
          items: [{ ticket_tier_id: 'general', quantity: 1, unit_price_bs: 270.0 }],
          buyer_pii: {
            national_id: 'V-19888777',
            phone_number: '+584149998888',
            email: 'comedia@ucab.edu.ve',
          },
          telemetry: {
            dwell_time: 20000,
            scroll_depth: 70,
            checkout_fill_time_ms: 10000,
            keystroke_dynamics: { avg_flight_time_ms: 120, cursor_linearity_index: 0.2 },
            copy_paste_flag: false,
            tab_switch_count: 0,
            device_fingerprint: 'dfp_comedia',
          },
        });

      const orderId = authRes.body.order_id;

      // Advance time past 300s TTL (301 seconds)
      clock.advanceSeconds(301);

      const webhookPayload = {
        event_type: 'payment.captured',
        order_id: orderId,
        payment_reference: '0033445566',
        amount_bs: 270.0,
        iso8583_settlement: { mti: '0200', de37_rrn: '0033445566', de39_response_code: '00' },
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
      assert.strictEqual(res.body.status, 'acknowledge_with_internal_alert');

      // No tickets issued
      assert.strictEqual(container.ticketRepo.findByOrderId(orderId).length, 0);

      // Anomaly logged in AUDIT_LEDGER
      const audit = container.auditRepo.findByOrderId(orderId);
      assert.ok(audit.some((a) => a.event_type === 'ANOMALY'));
    });
  });

  // ========================================================
  // 6. Worker de Conciliación (Casos A, B y C)
  // ========================================================
  describe('POST /api/v1/settlements/reconcile (Worker de Conciliación)', () => {
    it('ejecuta Caso A (Matched) actualizando órdenes liquidadas a RECONCILED', async () => {
      // 1. Create and settle order
      const authRes = await request(app)
        .post('/api/v1/orders/authorize')
        .set('X-VelozTix-API-Key', testConfig.apiKey)
        .set('Idempotency-Key', 'case-a-auth')
        .send({
          event_id: 'evt-neon-rave',
          items: [{ ticket_tier_id: 'vip', quantity: 1, unit_price_bs: 450.0 }],
          buyer_pii: {
            national_id: 'V-24000111',
            phone_number: '+584140001111',
            email: 'rave@ucab.edu.ve',
          },
          telemetry: {
            dwell_time: 30000,
            scroll_depth: 85,
            checkout_fill_time_ms: 11000,
            keystroke_dynamics: { avg_flight_time_ms: 120, cursor_linearity_index: 0.2 },
            copy_paste_flag: false,
            tab_switch_count: 0,
            device_fingerprint: 'dfp_rave',
          },
        });

      const orderId = authRes.body.order_id;
      const rrn = authRes.body.iso8583_trace.de37_rrn;

      // Settle via webhook
      const webhookPayload = {
        event_type: 'payment.captured',
        order_id: orderId,
        payment_reference: '0088991122',
        amount_bs: 450.0,
        iso8583_settlement: { mti: '0200', de37_rrn: rrn, de39_response_code: '00' },
        timestamp: clock.toISOString(),
      };
      const rawJson = JSON.stringify(webhookPayload);
      await request(app)
        .post('/api/v1/webhooks/pago-movil')
        .set('X-Signature', container.cryptoService.generateWebhookSignature(rawJson))
        .set('Content-Type', 'application/json')
        .send(rawJson);

      // Provide external mock report matching this order
      const externalReport = [
        {
          order_id: orderId,
          payment_reference: '0088991122',
          amount_bs: 450.0,
          status: 'SETTLED' as const,
          bank_code: '0102',
          rrn,
          settled_at: clock.toISOString(),
        },
      ];

      const res = await request(app)
        .post('/api/v1/settlements/reconcile')
        .send({ merchant_id: 'MRC_UCAB_00129', external_report: externalReport });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.total_orders_matched, 1);
      assert.strictEqual(res.body.total_gross_bs, 450.0);

      const order = container.orderRepo.findById(orderId);
      assert.strictEqual(order?.status, 'RECONCILED');
    });

    it('ejecuta Caso B (Auto-reparación): emite boleto si hay stock disponible', async () => {
      // Authorize order but simulate lost webhook (order remains in AUTHORIZED)
      const authRes = await request(app)
        .post('/api/v1/orders/authorize')
        .set('X-VelozTix-API-Key', testConfig.apiKey)
        .set('Idempotency-Key', 'case-b-lost-wh')
        .send({
          event_id: 'evt-cyberfest-26',
          items: [{ ticket_tier_id: 'general', quantity: 2, unit_price_bs: 360.0 }],
          buyer_pii: {
            national_id: 'V-28999111',
            phone_number: '+584149991111',
            email: 'lost_wh@ucab.edu.ve',
          },
          telemetry: {
            dwell_time: 25000,
            scroll_depth: 80,
            checkout_fill_time_ms: 10000,
            keystroke_dynamics: { avg_flight_time_ms: 120, cursor_linearity_index: 0.2 },
            copy_paste_flag: false,
            tab_switch_count: 0,
            device_fingerprint: 'dfp_lost_wh',
          },
        });

      const orderId = authRes.body.order_id;
      const rrn = authRes.body.iso8583_trace.de37_rrn;

      // Ensure no tickets exist yet
      assert.strictEqual(container.ticketRepo.findByOrderId(orderId).length, 0);

      // External settlement report shows bank collected the money
      const externalReport = [
        {
          order_id: orderId,
          payment_reference: '0099887766',
          amount_bs: 720.0,
          status: 'SETTLED' as const,
          bank_code: '0102',
          rrn,
          settled_at: clock.toISOString(),
        },
      ];

      const res = await request(app)
        .post('/api/v1/settlements/reconcile')
        .send({ merchant_id: 'MRC_UCAB_00129', external_report: externalReport });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.total_auto_repaired, 1);

      // Order moved to RECONCILED and tickets were auto-issued!
      const order = container.orderRepo.findById(orderId);
      assert.strictEqual(order?.status, 'RECONCILED');
      assert.strictEqual(order?.payment_reference, '0099887766');

      const tickets = container.ticketRepo.findByOrderId(orderId);
      assert.strictEqual(tickets.length, 2);
      assert.strictEqual(tickets[0].status, 'ACTIVE');
    });

    it('ejecuta Caso B (Directiva 2): si evento está SOLD_OUT, marca REFUND_PENDING y no sobre-vende boletos', async () => {
      // Authorize order
      const authRes = await request(app)
        .post('/api/v1/orders/authorize')
        .set('X-VelozTix-API-Key', testConfig.apiKey)
        .set('Idempotency-Key', 'case-b-soldout')
        .send({
          event_id: 'evt-standup-chacao',
          items: [{ ticket_tier_id: 'general', quantity: 2, unit_price_bs: 270.0 }],
          buyer_pii: {
            national_id: 'V-27888999',
            phone_number: '+584147778888',
            email: 'soldout_buyer@ucab.edu.ve',
          },
          telemetry: {
            dwell_time: 25000,
            scroll_depth: 80,
            checkout_fill_time_ms: 10000,
            keystroke_dynamics: { avg_flight_time_ms: 120, cursor_linearity_index: 0.2 },
            copy_paste_flag: false,
            tab_switch_count: 0,
            device_fingerprint: 'dfp_soldout',
          },
        });

      const orderId = authRes.body.order_id;
      const rrn = authRes.body.iso8583_trace.de37_rrn;

      // Mark event as SOLD_OUT
      container.eventRepo.updateStatus('evt-standup-chacao', 'SOLD_OUT');

      // External bank collected money
      const externalReport = [
        {
          order_id: orderId,
          payment_reference: '0044556677',
          amount_bs: 540.0,
          status: 'SETTLED' as const,
          bank_code: '0102',
          rrn,
          settled_at: clock.toISOString(),
        },
      ];

      const res = await request(app)
        .post('/api/v1/settlements/reconcile')
        .send({ merchant_id: 'MRC_UCAB_00129', external_report: externalReport });

      assert.strictEqual(res.status, 200);

      // Order marked REFUND_PENDING and ZERO tickets issued!
      const order = container.orderRepo.findById(orderId);
      assert.strictEqual(order?.status, 'REFUND_PENDING');
      assert.strictEqual(container.ticketRepo.findByOrderId(orderId).length, 0);

      // Anomaly registered in AUDIT_LEDGER
      const audit = container.auditRepo.findByOrderId(orderId);
      assert.ok(audit.some((a) => a.event_type === 'ANOMALY'));
    });

    it('ejecuta Caso C (Revocación inmediata): revoca a REVOKED boletos emitidos sin respaldo de cobro externo', async () => {
      // 1. Authorize and settle an order
      const authRes = await request(app)
        .post('/api/v1/orders/authorize')
        .set('X-VelozTix-API-Key', testConfig.apiKey)
        .set('Idempotency-Key', 'case-c-unpaid')
        .send({
          event_id: 'evt-neon-rave',
          items: [{ ticket_tier_id: 'general', quantity: 2, unit_price_bs: 450.0 }],
          buyer_pii: {
            national_id: 'V-21333444',
            phone_number: '+584143334444',
            email: 'fraud_buyer@ucab.edu.ve',
          },
          telemetry: {
            dwell_time: 25000,
            scroll_depth: 80,
            checkout_fill_time_ms: 10000,
            keystroke_dynamics: { avg_flight_time_ms: 120, cursor_linearity_index: 0.2 },
            copy_paste_flag: false,
            tab_switch_count: 0,
            device_fingerprint: 'dfp_fraud',
          },
        });

      const orderId = authRes.body.order_id;
      const rrn = authRes.body.iso8583_trace.de37_rrn;

      // Webhook settled the order
      const webhookPayload = {
        event_type: 'payment.captured',
        order_id: orderId,
        payment_reference: '0011223344',
        amount_bs: 900.0,
        iso8583_settlement: { mti: '0200', de37_rrn: rrn, de39_response_code: '00' },
        timestamp: clock.toISOString(),
      };
      const rawJson = JSON.stringify(webhookPayload);
      await request(app)
        .post('/api/v1/webhooks/pago-movil')
        .set('X-Signature', container.cryptoService.generateWebhookSignature(rawJson))
        .set('Content-Type', 'application/json')
        .send(rawJson);

      // Verify tickets are currently ACTIVE
      const activeTickets = container.ticketRepo.findByOrderId(orderId);
      assert.strictEqual(activeTickets.length, 2);
      assert.strictEqual(activeTickets[0].status, 'ACTIVE');

      // Now run reconciliation with an EMPTY external report (bank has NO record of this payment)
      const res = await request(app)
        .post('/api/v1/settlements/reconcile')
        .send({ merchant_id: 'MRC_UCAB_00129', external_report: [] });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.total_revoked_discrepancy, 1);

      // Tickets were immediately revoked!
      const revokedTickets = container.ticketRepo.findByOrderId(orderId);
      assert.strictEqual(revokedTickets[0].status, 'REVOKED');
      assert.strictEqual(revokedTickets[1].status, 'REVOKED');

      // Order moved to REVERSED
      const order = container.orderRepo.findById(orderId);
      assert.strictEqual(order?.status, 'REVERSED');
    });

    it('registra automáticamente en externalMockService al capturar y GET /settlements/report?merchant_id=... lo retorna para conciliar sin revocar', async () => {
      // 1. Authorize order
      const authRes = await request(app)
        .post('/api/v1/orders/authorize')
        .set('X-VelozTix-API-Key', testConfig.apiKey)
        .set('Idempotency-Key', 'case-a-auto-record')
        .send({
          event_id: 'evt-neon-rave',
          items: [{ ticket_tier_id: 'vip', quantity: 1, unit_price_bs: 450.0 }],
          buyer_pii: {
            national_id: 'V-25111222',
            phone_number: '+584145556677',
            email: 'autorecord@ucab.edu.ve',
          },
          telemetry: {
            dwell_time: 30000,
            scroll_depth: 85,
            checkout_fill_time_ms: 11000,
            keystroke_dynamics: { avg_flight_time_ms: 120, cursor_linearity_index: 0.2 },
            copy_paste_flag: false,
            tab_switch_count: 0,
            device_fingerprint: 'dfp_auto_rec',
          },
        });

      const orderId = authRes.body.order_id;
      const rrn = authRes.body.iso8583_trace.de37_rrn;

      // 2. Webhook capture
      const webhookPayload = {
        event_type: 'payment.captured',
        order_id: orderId,
        payment_reference: '0077889900',
        amount_bs: 450.0,
        iso8583_settlement: { mti: '0200', de37_rrn: rrn, de39_response_code: '00' },
        timestamp: clock.toISOString(),
      };
      const rawJson = JSON.stringify(webhookPayload);
      await request(app)
        .post('/api/v1/webhooks/pago-movil')
        .set('X-Signature', container.cryptoService.generateWebhookSignature(rawJson))
        .set('Content-Type', 'application/json')
        .send(rawJson);

      // 3. Consultar GET /settlements/report?merchant_id=MRC_UCAB_00129
      const reportResRoot = await request(app)
        .get('/settlements/report?merchant_id=MRC_UCAB_00129');
      assert.strictEqual(reportResRoot.status, 200);
      assert.ok(Array.isArray(reportResRoot.body));
      const entry = reportResRoot.body.find((r: any) => r.order_id === orderId);
      assert.ok(entry, 'El reporte externo debe contener la orden capturada');
      assert.strictEqual(entry.merchant_id, 'MRC_UCAB_00129');
      assert.strictEqual(entry.payment_reference, '0077889900');
      assert.strictEqual(entry.de37_rrn, rrn);
      assert.strictEqual(entry.amount_bs, 450.0);
      assert.strictEqual(entry.status, 'SETTLED');
      assert.ok(entry.paid_at);

      // Also verify via /api/v1/settlements/report?merchant_id=MRC_UCAB_00129
      const reportResApi = await request(app)
        .get('/api/v1/settlements/report?merchant_id=MRC_UCAB_00129');
      assert.strictEqual(reportResApi.status, 200);
      assert.ok(reportResApi.body.some((r: any) => r.order_id === orderId));

      // 4. Run POST /api/v1/settlements/reconcile WITHOUT external_report body
      const recRes = await request(app)
        .post('/api/v1/settlements/reconcile')
        .send({ merchant_id: 'MRC_UCAB_00129' });

      assert.strictEqual(recRes.status, 200);
      assert.strictEqual(recRes.body.total_orders_matched, 1);
      assert.strictEqual(recRes.body.total_revoked_discrepancy, 0);

      const order = container.orderRepo.findById(orderId);
      assert.strictEqual(order?.status, 'RECONCILED');

      const tickets = container.ticketRepo.findByOrderId(orderId);
      assert.strictEqual(tickets[0]?.status, 'ACTIVE');
    });

    it('soporta inyección directa external_settlement_entries en POST /api/v1/settlements/reconcile y cruza por order_id, payment_reference o de37_rrn', async () => {
      // Clear mock
      container.externalMockService.clear();

      // Order 1: match via order_id
      const o1 = await request(app)
        .post('/api/v1/orders/authorize')
        .set('X-VelozTix-API-Key', testConfig.apiKey)
        .set('Idempotency-Key', 'case-inj-1')
        .send({
          event_id: 'evt-neon-rave',
          items: [{ ticket_tier_id: 'vip', quantity: 1, unit_price_bs: 450.0 }],
          buyer_pii: { national_id: 'V-11111111', phone_number: '+584141111111', email: 'inj1@ucab.edu.ve' },
          telemetry: {
            dwell_time: 30000, scroll_depth: 85, checkout_fill_time_ms: 11000,
            keystroke_dynamics: { avg_flight_time_ms: 120, cursor_linearity_index: 0.2 },
            copy_paste_flag: false, tab_switch_count: 0, device_fingerprint: 'dfp_inj1',
          },
        });
      const orderId1 = o1.body.order_id;
      const rrn1 = o1.body.iso8583_trace.de37_rrn;

      // Order 2: match via payment_reference
      const o2 = await request(app)
        .post('/api/v1/orders/authorize')
        .set('X-VelozTix-API-Key', testConfig.apiKey)
        .set('Idempotency-Key', 'case-inj-2')
        .send({
          event_id: 'evt-cyberfest-26',
          items: [{ ticket_tier_id: 'general', quantity: 1, unit_price_bs: 360.0 }],
          buyer_pii: { national_id: 'V-22222222', phone_number: '+584142222222', email: 'inj2@ucab.edu.ve' },
          telemetry: {
            dwell_time: 30000, scroll_depth: 85, checkout_fill_time_ms: 11000,
            keystroke_dynamics: { avg_flight_time_ms: 120, cursor_linearity_index: 0.2 },
            copy_paste_flag: false, tab_switch_count: 0, device_fingerprint: 'dfp_inj2',
          },
        });
      const orderId2 = o2.body.order_id;
      const rrn2 = o2.body.iso8583_trace.de37_rrn;

      // Order 3: match via de37_rrn
      const o3 = await request(app)
        .post('/api/v1/orders/authorize')
        .set('X-VelozTix-API-Key', testConfig.apiKey)
        .set('Idempotency-Key', 'case-inj-3')
        .send({
          event_id: 'evt-standup-chacao',
          items: [{ ticket_tier_id: 'general', quantity: 1, unit_price_bs: 270.0 }],
          buyer_pii: { national_id: 'V-33333333', phone_number: '+584143333333', email: 'inj3@ucab.edu.ve' },
          telemetry: {
            dwell_time: 30000, scroll_depth: 85, checkout_fill_time_ms: 11000,
            keystroke_dynamics: { avg_flight_time_ms: 120, cursor_linearity_index: 0.2 },
            copy_paste_flag: false, tab_switch_count: 0, device_fingerprint: 'dfp_inj3',
          },
        });
      const orderId3 = o3.body.order_id;
      const rrn3 = o3.body.iso8583_trace.de37_rrn;

      // Settle all 3 via webhook
      const settleWh = async (orderId: string, ref: string, amount: number, rrn: string) => {
        const payload = {
          event_type: 'payment.captured',
          order_id: orderId,
          payment_reference: ref,
          amount_bs: amount,
          iso8583_settlement: { mti: '0200', de37_rrn: rrn, de39_response_code: '00' },
          timestamp: clock.toISOString(),
        };
        const rawJson = JSON.stringify(payload);
        await request(app)
          .post('/api/v1/webhooks/pago-movil')
          .set('X-Signature', container.cryptoService.generateWebhookSignature(rawJson))
          .set('Content-Type', 'application/json')
          .send(rawJson);
      };

      await settleWh(orderId1, 'REF_INJ_111', 450.0, rrn1);
      await settleWh(orderId2, 'REF_INJ_222', 360.0, rrn2);
      await settleWh(orderId3, 'REF_INJ_333', 270.0, rrn3);

      // Clear mock to ensure reconciliation uses ONLY the injected entries in the body
      container.externalMockService.clear();

      const externalEntries = [
        // Entry 1 matches via order_id
        {
          order_id: orderId1,
          amount_bs: 450.0,
          status: 'SETTLED',
        },
        // Entry 2 matches via payment_reference (no order_id)
        {
          payment_reference: 'REF_INJ_222',
          amount_bs: 360.0,
          status: 'SETTLED',
        },
        // Entry 3 matches via de37_rrn (no order_id, no payment_ref)
        {
          de37_rrn: rrn3,
          amount_bs: 270.0,
          status: 'SETTLED',
        },
      ];

      const res = await request(app)
        .post('/api/v1/settlements/reconcile')
        .send({
          merchant_id: 'MRC_UCAB_00129',
          external_settlement_entries: externalEntries,
        });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.total_orders_matched, 3);
      assert.strictEqual(res.body.total_revoked_discrepancy, 0);

      assert.strictEqual(container.orderRepo.findById(orderId1)?.status, 'RECONCILED');
      assert.strictEqual(container.orderRepo.findById(orderId2)?.status, 'RECONCILED');
      assert.strictEqual(container.orderRepo.findById(orderId3)?.status, 'RECONCILED');
    });
  });
});

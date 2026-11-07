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

describe('VelozTix - Matriz de Certificación Técnica (TC-01 a TC-10)', () => {
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
      bcvExchangeRate: 55.0,
      privacySalt: 'test_salt_ucab_cert_2026',
      vaultMasterKey: Buffer.from(
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        'hex'
      ),
      jwtHmacSecret: 'test_jwt_hmac_cert_secret_2026',
      webhookSecret: 'test_webhook_secret_cert_pago_movil_2026',
      dbPath: ':memory:',
      apiKey: 'test_api_key_ucab_2026',
      bearerToken: 'test_bearer_token_ucab_2026',
    };

    container = createContainer(db, testConfig, clock, { startAutoSweep: false });
    runSeed(db, container.redis);
    app = createApp(container);
  });

  // ==========================================================================
  // TC-01: Autorización exitosa con telemetría orgánica
  // ==========================================================================
  it('TC-01: Autorización exitosa con telemetría orgánica (HTTP 201, stock temporal bloqueado en caché, orden en AUTHORIZED)', async () => {
    const initialStock = container.redis.getStock('evt-cyberfest-26');
    assert.ok(initialStock);
    const initialAvailable = initialStock.availableStock;

    const payload = {
      event_id: 'evt-cyberfest-26',
      items: [{ ticket_tier_id: 'general', quantity: 2, unit_price_bs: 360.0 }],
      buyer_pii: {
        national_id: 'V-26123456',
        phone_number: '+584141234567',
        email: 'organico@ucab.edu.ve',
      },
      telemetry: {
        dwell_time: 32000,
        scroll_depth: 85,
        checkout_fill_time_ms: 9500,
        keystroke_dynamics: { avg_flight_time_ms: 115, cursor_linearity_index: 0.22 },
        copy_paste_flag: false,
        tab_switch_count: 0,
        device_fingerprint: 'dfp_organic_tc01',
      },
    };

    const res = await request(app)
      .post('/api/v1/orders/authorize')
      .set('X-VelozTix-API-Key', testConfig.apiKey)
      .set('Idempotency-Key', 'idemp_tc01_auth')
      .send(payload);

    // 1. Verificación HTTP y esquema
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.status, 'AUTHORIZED');
    assert.strictEqual(res.body.amount_bs, 720.0);
    assert.strictEqual(res.body.ai_evaluation.verdict, 'APPROVE');
    assert.strictEqual(res.body.iso8583_trace.mti_request, '0100');
    assert.strictEqual(res.body.iso8583_trace.mti_response, '0110');
    assert.ok(res.body.qr_dynamic_payload?.hmac_signature);

    const orderId = res.body.order_id;

    // 2. Stock temporal bloqueado en caché Redis simulator
    const stockAfter = container.redis.getStock('evt-cyberfest-26');
    assert.ok(stockAfter);
    assert.strictEqual(stockAfter.reservedStock, 2);
    assert.strictEqual(stockAfter.availableStock, initialAvailable - 2);

    // 3. Orden persistida en tabla ORDERS con estado AUTHORIZED
    const orderInDb = container.orderRepo.findById(orderId);
    assert.ok(orderInDb);
    assert.strictEqual(orderInDb.status, 'AUTHORIZED');
    assert.strictEqual(orderInDb.quantity, 2);

    // 4. Datos del comprador cifrados en BUYERS_PII_VAULT
    const vaultRecord = container.vaultRepo.findByCustomerHash(orderInDb.customer_hash);
    assert.ok(vaultRecord);
    assert.notStrictEqual(vaultRecord.encrypted_dni, payload.buyer_pii.national_id);
    assert.strictEqual(
      container.cryptoService.decryptGcm(vaultRecord.encrypted_dni),
      payload.buyer_pii.national_id
    );
  });

  // ==========================================================================
  // TC-02: Captura exitosa por webhook con firma X-Signature válida
  // ==========================================================================
  it('TC-02: Captura exitosa por webhook con firma X-Signature válida (HTTP 200 captured, orden pasa a SETTLED, emite boleto JWT sin PII, traza inmutable)', async () => {
    // 1. Autorizar orden primero
    const authRes = await request(app)
      .post('/api/v1/orders/authorize')
      .set('X-VelozTix-API-Key', testConfig.apiKey)
      .set('Idempotency-Key', 'idemp_tc02_auth')
      .send({
        event_id: 'evt-sunset-vinyl',
        items: [{ ticket_tier_id: 'general', quantity: 1, unit_price_bs: 540.0 }],
        buyer_pii: {
          national_id: 'V-27999888',
          phone_number: '+584149998888',
          email: 'captura@ucab.edu.ve',
        },
        telemetry: {
          dwell_time: 25000,
          scroll_depth: 80,
          checkout_fill_time_ms: 8200,
          keystroke_dynamics: { avg_flight_time_ms: 110, cursor_linearity_index: 0.25 },
          copy_paste_flag: false,
          tab_switch_count: 0,
          device_fingerprint: 'dfp_tc02_capture',
        },
      });

    const orderId = authRes.body.order_id;
    const rrn = authRes.body.iso8583_trace.de37_rrn;

    // 2. Enviar Webhook de captura con firma HMAC-SHA256 válida
    const webhookPayload = {
      event_type: 'payment.captured',
      order_id: orderId,
      payment_reference: '00987654321',
      amount_bs: 540.0,
      iso8583_settlement: {
        mti: '0200',
        de11_stan: '778899',
        de37_rrn: rrn,
        de38_auth_code: 'AUTH_OK',
        de39_response_code: '00',
      },
      timestamp: clock.toISOString(),
    };

    const rawJson = JSON.stringify(webhookPayload);
    const validSignature = container.cryptoService.generateWebhookSignature(rawJson);

    const webhookRes = await request(app)
      .post('/api/v1/webhooks/pago-movil')
      .set('X-Signature', validSignature)
      .set('Content-Type', 'application/json')
      .send(rawJson);

    // 3. Verificaciones de respuesta HTTP
    assert.strictEqual(webhookRes.status, 200);
    assert.strictEqual(webhookRes.body.status, 'captured');
    assert.strictEqual(webhookRes.body.order_id, orderId);
    assert.ok(webhookRes.body.ticket_id);
    assert.ok(webhookRes.body.audit_trace_id);

    // 4. Orden pasa a SETTLED
    const orderInDb = container.orderRepo.findById(orderId);
    assert.strictEqual(orderInDb?.status, 'SETTLED');
    assert.strictEqual(orderInDb?.payment_reference, '00987654321');

    // 5. Emisión de boleto en TICKETS con JWT firmado sin PII
    const tickets = container.ticketRepo.findByOrderId(orderId);
    assert.strictEqual(tickets.length, 1);
    const ticket = tickets[0];
    assert.strictEqual(ticket.status, 'ACTIVE');

    const verifiedJwt = container.cryptoService.verifyTicketJwt(ticket.ticket_qr);
    assert.strictEqual(verifiedJwt.valid, true);
    assert.strictEqual(verifiedJwt.payload?.ticket_id, ticket.ticket_id);
    assert.strictEqual(verifiedJwt.payload?.event_id, 'evt-sunset-vinyl');
    // Verificar ausencia de PII en el token JWT
    assert.ok(!ticket.ticket_qr.includes('V-27999888'));
    assert.ok(!ticket.ticket_qr.includes('captura@ucab.edu.ve'));

    // 6. Traza inmutable en AUDIT_LEDGER (SUDEBAN 12441/12221)
    const auditLogs = container.auditRepo.findByOrderId(orderId);
    const captureAudit = auditLogs.find((a) => a.event_type === 'CAPTURED');
    assert.ok(captureAudit);
    assert.strictEqual(captureAudit.de39_response_code, '00');
    assert.strictEqual(captureAudit.mti_code, '0200');
  });

  // ==========================================================================
  // TC-03: Rechazo en tiempo real por telemetría de bot/scalping
  // ==========================================================================
  it('TC-03: Rechazo en tiempo real por telemetría de bot/scalping (HTTP 403 REJECT_BOT en < 80 ms, stock intacto, traza registrada)', async () => {
    const initialStock = container.redis.getStock('evt-neon-rave');
    assert.ok(initialStock);
    const initialAvailable = initialStock.availableStock;

    const botPayload = {
      event_id: 'evt-neon-rave',
      items: [{ ticket_tier_id: 'vip', quantity: 4, unit_price_bs: 450.0 }],
      buyer_pii: {
        national_id: 'V-29000111',
        phone_number: '+584140001111',
        email: 'bot_scalper@target.xyz',
      },
      telemetry: {
        dwell_time: 400,
        scroll_depth: 10,
        checkout_fill_time_ms: 320, // < 800 ms (Bot flag)
        keystroke_dynamics: { avg_flight_time_ms: 12, cursor_linearity_index: 0.98 },
        copy_paste_flag: true, // Copy-paste + linearity > 0.8
        tab_switch_count: 5,
        device_fingerprint: 'dfp_scalper_bot_tc03',
      },
    };

    const startTime = performance.now();
    const res = await request(app)
      .post('/api/v1/orders/authorize')
      .set('X-VelozTix-API-Key', testConfig.apiKey)
      .set('Idempotency-Key', 'idemp_tc03_bot')
      .send(botPayload);
    const latencyMs = performance.now() - startTime;

    // 1. Respuesta HTTP 403 Forbidden y esquema de rechazo
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.verdict, 'REJECT_BOT');
    assert.ok(res.body.risk_score >= 0.8);
    assert.ok(res.body.audit_trace_id);
    assert.ok(latencyMs < 80, `La latencia debe ser < 80 ms (obtenida: ${latencyMs} ms)`);

    // 2. El inventario permanece 100% intacto (sin bloquear reservas para bots)
    const stockAfter = container.redis.getStock('evt-neon-rave');
    assert.ok(stockAfter);
    assert.strictEqual(stockAfter.availableStock, initialAvailable);
    assert.strictEqual(stockAfter.reservedStock, 0);

    // 3. Traza registrada en AUDIT_LEDGER con REJECT_BOT
    const auditLogs = container.auditRepo.findAll();
    const botAudit = auditLogs.find((a) => a.event_type === 'REJECT_BOT');
    assert.ok(botAudit);
    assert.strictEqual(botAudit.audit_trace_id, res.body.audit_trace_id);
  });

  // ==========================================================================
  // TC-04: Rechazo de webhook por firma HMAC corrupta o ausente
  // ==========================================================================
  it('TC-04: Rechazo de webhook por firma HMAC corrupta o ausente (HTTP 401 Unauthorized INVALID_SIGNATURE)', async () => {
    const payload = {
      event_type: 'payment.captured',
      order_id: 'ord_fake_tc04',
      payment_reference: '00112233',
      amount_bs: 360.0,
      timestamp: clock.toISOString(),
    };

    // Subcaso A: Header X-Signature ausente
    const resMissing = await request(app)
      .post('/api/v1/webhooks/pago-movil')
      .set('Content-Type', 'application/json')
      .send(payload);

    assert.strictEqual(resMissing.status, 401);
    assert.strictEqual(resMissing.body.error_code, 'INVALID_SIGNATURE');

    // Subcaso B: Header X-Signature con hash HMAC corrupto o inválido
    const resCorrupt = await request(app)
      .post('/api/v1/webhooks/pago-movil')
      .set('X-Signature', 'bad_corrupt_hmac_sha256_hash_value_1234567890')
      .set('Content-Type', 'application/json')
      .send(payload);

    assert.strictEqual(resCorrupt.status, 401);
    assert.strictEqual(resCorrupt.body.error_code, 'INVALID_SIGNATURE');
  });

  // ==========================================================================
  // TC-05: Idempotencia ante webhook duplicado con misma Idempotency-Key
  // ==========================================================================
  it('TC-05: Idempotencia ante webhook duplicado con misma Idempotency-Key (HTTP 200 already_processed sin duplicar boletos)', async () => {
    // 1. Autorizar orden
    const authRes = await request(app)
      .post('/api/v1/orders/authorize')
      .set('X-VelozTix-API-Key', testConfig.apiKey)
      .set('Idempotency-Key', 'idemp_tc07_auth')
      .send({
        event_id: 'evt-standup-chacao',
        items: [{ ticket_tier_id: 'general', quantity: 1, unit_price_bs: 270.0 }],
        buyer_pii: {
          national_id: 'V-25555666',
          phone_number: '+584145556666',
          email: 'idemp_test@ucab.edu.ve',
        },
        telemetry: {
          dwell_time: 28000,
          scroll_depth: 85,
          checkout_fill_time_ms: 9200,
          keystroke_dynamics: { avg_flight_time_ms: 110, cursor_linearity_index: 0.2 },
          copy_paste_flag: false,
          tab_switch_count: 0,
          device_fingerprint: 'dfp_tc05_idemp',
        },
      });

    const orderId = authRes.body.order_id;
    const rrn = authRes.body.iso8583_trace.de37_rrn;

    const webhookPayload = {
      event_type: 'payment.captured',
      order_id: orderId,
      payment_reference: '0088776655',
      amount_bs: 270.0,
      iso8583_settlement: { mti: '0200', de37_rrn: rrn, de39_response_code: '00' },
      timestamp: clock.toISOString(),
    };

    const rawJson = JSON.stringify(webhookPayload);
    const signature = container.cryptoService.generateWebhookSignature(rawJson);
    const idempotencyKey = 'idemp_key_webhook_tc05';

    // 2. Primer envío del webhook -> Captura exitosa
    const firstRes = await request(app)
      .post('/api/v1/webhooks/pago-movil')
      .set('X-Signature', signature)
      .set('Idempotency-Key', idempotencyKey)
      .set('Content-Type', 'application/json')
      .send(rawJson);

    assert.strictEqual(firstRes.status, 200);
    assert.strictEqual(firstRes.body.status, 'captured');

    // 3. Segundo envío idéntico con misma Idempotency-Key -> already_processed en < 15 ms
    const t0 = performance.now();
    const secondRes = await request(app)
      .post('/api/v1/webhooks/pago-movil')
      .set('X-Signature', signature)
      .set('Idempotency-Key', idempotencyKey)
      .set('Content-Type', 'application/json')
      .send(rawJson);
    const diffMs = performance.now() - t0;

    assert.strictEqual(secondRes.status, 200);
    assert.strictEqual(secondRes.body.status, 'already_processed');
    assert.ok(diffMs < 15, `El reintento idempotente debe responder en < 15 ms (obtenido: ${diffMs} ms)`);

    // 4. Verificación de no duplicación de boletos
    const tickets = container.ticketRepo.findByOrderId(orderId);
    assert.strictEqual(tickets.length, 1);
  });

  // ==========================================================================
  // TC-06: Reverso automático ante expiración de los 300s de TTL
  // ==========================================================================
  it('TC-06: Reverso automático ante expiración de los 300s de TTL (Orden pasa a REVERSED y libera el stock)', async () => {
    const initialStock = container.redis.getStock('evt-cyberfest-26');
    assert.ok(initialStock);
    const initialAvailable = initialStock.availableStock;

    // 1. Autorizar orden (reserva stock de 3 boletos)
    const authRes = await request(app)
      .post('/api/v1/orders/authorize')
      .set('X-VelozTix-API-Key', testConfig.apiKey)
      .set('Idempotency-Key', 'idemp_tc06_auth')
      .send({
        event_id: 'evt-cyberfest-26',
        items: [{ ticket_tier_id: 'general', quantity: 3, unit_price_bs: 360.0 }],
        buyer_pii: {
          national_id: 'V-23111222',
          phone_number: '+584141112222',
          email: 'ttl_expire@ucab.edu.ve',
        },
        telemetry: {
          dwell_time: 25000,
          scroll_depth: 80,
          checkout_fill_time_ms: 8800,
          keystroke_dynamics: { avg_flight_time_ms: 110, cursor_linearity_index: 0.2 },
          copy_paste_flag: false,
          tab_switch_count: 0,
          device_fingerprint: 'dfp_tc06_ttl',
        },
      });

    const orderId = authRes.body.order_id;
    assert.strictEqual(container.redis.getStock('evt-cyberfest-26')?.reservedStock, 3);

    // 2. Simular transcurso del tiempo: avanzar 301 segundos (expira el TTL de 300s)
    clock.advanceSeconds(301);

    // 3. Ejecutar barrido de reservas expiradas en Redis Simulator
    const expiredList = container.redis.sweepExpiredReservations();
    assert.ok(expiredList.includes(orderId));

    // 4. La orden pasa automáticamente a REVERSED
    const orderInDb = container.orderRepo.findById(orderId);
    assert.strictEqual(orderInDb?.status, 'REVERSED');

    // 5. El stock reservado queda liberado y el inventario disponible restituido
    const stockAfterSweep = container.redis.getStock('evt-cyberfest-26');
    assert.ok(stockAfterSweep);
    assert.strictEqual(stockAfterSweep.reservedStock, 0);
    assert.strictEqual(stockAfterSweep.availableStock, initialAvailable);

    // 6. Traza MTI 0400 (Reversal) registrada en auditoría
    const auditLogs = container.auditRepo.findByOrderId(orderId);
    const revAudit = auditLogs.find((a) => a.event_type === 'REVERSED');
    assert.ok(revAudit);
    assert.strictEqual(revAudit.mti_code, '0400');
  });

  // ==========================================================================
  // TC-07: Reverso por rechazo bancario externo (event_type == 'payment.failed')
  // ==========================================================================
  it('TC-07: Reverso por rechazo bancario externo event_type payment.failed (Retorna HTTP 200 reversed, libera stock)', async () => {
    const initialStock = container.redis.getStock('evt-sunset-vinyl');
    assert.ok(initialStock);
    const initialAvailable = initialStock.availableStock;

    // 1. Autorizar orden
    const authRes = await request(app)
      .post('/api/v1/orders/authorize')
      .set('X-VelozTix-API-Key', testConfig.apiKey)
      .set('Idempotency-Key', 'idemp_tc07_auth')
      .send({
        event_id: 'evt-sunset-vinyl',
        items: [{ ticket_tier_id: 'general', quantity: 2, unit_price_bs: 540.0 }],
        buyer_pii: {
          national_id: 'V-21444555',
          phone_number: '+584144445555',
          email: 'rechazo_banco@ucab.edu.ve',
        },
        telemetry: {
          dwell_time: 25000,
          scroll_depth: 80,
          checkout_fill_time_ms: 8800,
          keystroke_dynamics: { avg_flight_time_ms: 110, cursor_linearity_index: 0.2 },
          copy_paste_flag: false,
          tab_switch_count: 0,
          device_fingerprint: 'dfp_tc07_fail',
        },
      });

    const orderId = authRes.body.order_id;
    const rrn = authRes.body.iso8583_trace.de37_rrn;

    // 2. Webhook con event_type payment.failed
    const failPayload = {
      event_type: 'payment.failed',
      order_id: orderId,
      payment_reference: '00000000',
      amount_bs: 1080.0,
      rejection_reason: 'FONDOS_INSUFICIENTES_EN_CUENTA',
      iso8583_settlement: {
        mti: '0400',
        de11_stan: '998877',
        de37_rrn: rrn,
        de39_response_code: '51',
      },
      timestamp: clock.toISOString(),
    };

    const rawJson = JSON.stringify(failPayload);
    const signature = container.cryptoService.generateWebhookSignature(rawJson);

    const res = await request(app)
      .post('/api/v1/webhooks/pago-movil')
      .set('X-Signature', signature)
      .set('Content-Type', 'application/json')
      .send(rawJson);

    // 3. Verificación de respuesta
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'reversed');
    assert.strictEqual(res.body.order_id, orderId);

    // 4. Orden en BD en estado REVERSED
    const orderInDb = container.orderRepo.findById(orderId);
    assert.strictEqual(orderInDb?.status, 'REVERSED');

    // 5. Stock liberado
    const stockAfter = container.redis.getStock('evt-sunset-vinyl');
    assert.ok(stockAfter);
    assert.strictEqual(stockAfter.reservedStock, 0);
    assert.strictEqual(stockAfter.availableStock, initialAvailable);
  });

  // ==========================================================================
  // TC-08: Webhook tardío o monto discrepante
  // ==========================================================================
  it('TC-08: Webhook tardío o monto discrepante (Retorna HTTP 200 acknowledge_with_internal_alert y marca anomalía sin emitir boleto)', async () => {
    // 1. Autorizar orden de 450.00 Bs
    const authRes = await request(app)
      .post('/api/v1/orders/authorize')
      .set('X-VelozTix-API-Key', testConfig.apiKey)
      .set('Idempotency-Key', 'idemp_tc08_auth')
      .send({
        event_id: 'evt-neon-rave',
        items: [{ ticket_tier_id: 'vip', quantity: 1, unit_price_bs: 450.0 }],
        buyer_pii: {
          national_id: 'V-20111999',
          phone_number: '+584140009999',
          email: 'discrepante@ucab.edu.ve',
        },
        telemetry: {
          dwell_time: 25000,
          scroll_depth: 80,
          checkout_fill_time_ms: 8800,
          keystroke_dynamics: { avg_flight_time_ms: 110, cursor_linearity_index: 0.2 },
          copy_paste_flag: false,
          tab_switch_count: 0,
          device_fingerprint: 'dfp_tc08_anom',
        },
      });

    const orderId = authRes.body.order_id;
    const rrn = authRes.body.iso8583_trace.de37_rrn;

    // Subcaso A: Monto discrepante (llegan 200.00 Bs en lugar de 450.00 Bs)
    const mismatchPayload = {
      event_type: 'payment.captured',
      order_id: orderId,
      payment_reference: '00119922',
      amount_bs: 200.0, // Monto menor / discrepante
      iso8583_settlement: { mti: '0200', de37_rrn: rrn, de39_response_code: '00' },
      timestamp: clock.toISOString(),
    };

    const rawJsonMismatch = JSON.stringify(mismatchPayload);
    const sigMismatch = container.cryptoService.generateWebhookSignature(rawJsonMismatch);

    const resMismatch = await request(app)
      .post('/api/v1/webhooks/pago-movil')
      .set('X-Signature', sigMismatch)
      .set('Content-Type', 'application/json')
      .send(rawJsonMismatch);

    assert.strictEqual(resMismatch.status, 200);
    assert.strictEqual(resMismatch.body.status, 'acknowledge_with_internal_alert');

    // No se emiten boletos
    assert.strictEqual(container.ticketRepo.findByOrderId(orderId).length, 0);

    // Anomalía registrada en auditoría
    const auditLogs1 = container.auditRepo.findByOrderId(orderId);
    assert.ok(auditLogs1.some((a) => a.event_type === 'ANOMALY'));

    // Subcaso B: Webhook tardío post-expiración de TTL (avanzar reloj 301s)
    clock.advanceSeconds(301);

    const latePayload = {
      event_type: 'payment.captured',
      order_id: orderId,
      payment_reference: '00119933',
      amount_bs: 450.0, // Monto correcto pero tardío
      iso8583_settlement: { mti: '0200', de37_rrn: rrn, de39_response_code: '00' },
      timestamp: clock.toISOString(),
    };

    const rawJsonLate = JSON.stringify(latePayload);
    const sigLate = container.cryptoService.generateWebhookSignature(rawJsonLate);

    const resLate = await request(app)
      .post('/api/v1/webhooks/pago-movil')
      .set('X-Signature', sigLate)
      .set('Content-Type', 'application/json')
      .send(rawJsonLate);

    assert.strictEqual(resLate.status, 200);
    assert.strictEqual(resLate.body.status, 'acknowledge_with_internal_alert');

    // Cero boletos emitidos
    assert.strictEqual(container.ticketRepo.findByOrderId(orderId).length, 0);
  });

  // ==========================================================================
  // TC-09: Conciliación Caso B / Auto-reparación
  // ==========================================================================
  it('TC-09: Conciliación Caso B / Auto-reparación (Detecta cobro en pasarela con webhook caído y emite boleto si hay cupo)', async () => {
    // 1. Autorizar orden (simulando webhook caído: queda en AUTHORIZED)
    const authRes = await request(app)
      .post('/api/v1/orders/authorize')
      .set('X-VelozTix-API-Key', testConfig.apiKey)
      .set('Idempotency-Key', 'idemp_tc09_auth')
      .send({
        event_id: 'evt-cyberfest-26',
        items: [{ ticket_tier_id: 'general', quantity: 2, unit_price_bs: 360.0 }],
        buyer_pii: {
          national_id: 'V-24888777',
          phone_number: '+584148887777',
          email: 'lost_webhook@ucab.edu.ve',
        },
        telemetry: {
          dwell_time: 25000,
          scroll_depth: 80,
          checkout_fill_time_ms: 8800,
          keystroke_dynamics: { avg_flight_time_ms: 110, cursor_linearity_index: 0.2 },
          copy_paste_flag: false,
          tab_switch_count: 0,
          device_fingerprint: 'dfp_tc09_repair',
        },
      });

    const orderId = authRes.body.order_id;
    const rrn = authRes.body.iso8583_trace.de37_rrn;

    // Verificar que inicialmente NO hay boletos emitidos
    assert.strictEqual(container.ticketRepo.findByOrderId(orderId).length, 0);

    // 2. Ejecutar reconciliación inyectando el reporte bancario externo que confirma el cobro
    const externalReport = [
      {
        order_id: orderId,
        payment_reference: '0099443322',
        de37_rrn: rrn,
        amount_bs: 720.0,
        status: 'SETTLED' as const,
        paid_at: clock.toISOString(),
      },
    ];

    const recRes = await request(app)
      .post('/api/v1/settlements/reconcile')
      .send({
        merchant_id: 'MRC_UCAB_00129',
        external_settlement_entries: externalReport,
      });

    // 3. Verificaciones de conciliación Caso B
    assert.strictEqual(recRes.status, 200);
    assert.strictEqual(recRes.body.total_auto_repaired, 1);

    // 4. Orden auto-reparada a RECONCILED con su referencia persistida
    const orderInDb = container.orderRepo.findById(orderId);
    assert.strictEqual(orderInDb?.status, 'RECONCILED');
    assert.strictEqual(orderInDb?.payment_reference, '0099443322');

    // 5. Boletos emitidos activamente en TICKETS
    const tickets = container.ticketRepo.findByOrderId(orderId);
    assert.strictEqual(tickets.length, 2);
    assert.strictEqual(tickets[0].status, 'ACTIVE');
    assert.strictEqual(tickets[1].status, 'ACTIVE');
  });

  // ==========================================================================
  // TC-10: Conciliación Caso C / Discrepancia crítica
  // ==========================================================================
  it('TC-10: Conciliación Caso C / Discrepancia crítica (Revoca boleto a REVOKED si figura emitido sin registro de cobro bancario)', async () => {
    // 1. Autorizar orden y capturarla normalmente
    const authRes = await request(app)
      .post('/api/v1/orders/authorize')
      .set('X-VelozTix-API-Key', testConfig.apiKey)
      .set('Idempotency-Key', 'idemp_tc10_auth')
      .send({
        event_id: 'evt-sunset-vinyl',
        items: [{ ticket_tier_id: 'general', quantity: 1, unit_price_bs: 540.0 }],
        buyer_pii: {
          national_id: 'V-22333444',
          phone_number: '+584142223333',
          email: 'discrepancia_c@ucab.edu.ve',
        },
        telemetry: {
          dwell_time: 25000,
          scroll_depth: 80,
          checkout_fill_time_ms: 8800,
          keystroke_dynamics: { avg_flight_time_ms: 110, cursor_linearity_index: 0.2 },
          copy_paste_flag: false,
          tab_switch_count: 0,
          device_fingerprint: 'dfp_tc10_discrepancy',
        },
      });

    const orderId = authRes.body.order_id;
    const rrn = authRes.body.iso8583_trace.de37_rrn;

    // Webhook de captura inicial
    const capturePayload = {
      event_type: 'payment.captured',
      order_id: orderId,
      payment_reference: '0055443322',
      amount_bs: 540.0,
      iso8583_settlement: { mti: '0200', de37_rrn: rrn, de39_response_code: '00' },
      timestamp: clock.toISOString(),
    };
    const rawCapture = JSON.stringify(capturePayload);
    await request(app)
      .post('/api/v1/webhooks/pago-movil')
      .set('X-Signature', container.cryptoService.generateWebhookSignature(rawCapture))
      .set('Content-Type', 'application/json')
      .send(rawCapture);

    // Boletos activos en base de datos
    const activeTickets = container.ticketRepo.findByOrderId(orderId);
    assert.strictEqual(activeTickets.length, 1);
    assert.strictEqual(activeTickets[0].status, 'ACTIVE');

    // 2. Ejecutar reconciliación con reporte bancario externo VACÍO (no figura cobro)
    const recRes = await request(app)
      .post('/api/v1/settlements/reconcile')
      .send({
        merchant_id: 'MRC_UCAB_00129',
        external_report: [], // Reporte sin cobro
      });

    // 3. Verificaciones de revocación Caso C
    assert.strictEqual(recRes.status, 200);
    assert.strictEqual(recRes.body.total_revoked_discrepancy, 1);

    // 4. Boleto revocado a REVOKED
    const revokedTickets = container.ticketRepo.findByOrderId(orderId);
    assert.strictEqual(revokedTickets[0].status, 'REVOKED');

    // 5. Orden pasa a REVERSED
    const orderInDb = container.orderRepo.findById(orderId);
    assert.strictEqual(orderInDb?.status, 'REVERSED');

    // 6. Auditoría registra traza de revocación
    const auditLogs = container.auditRepo.findByOrderId(orderId);
    assert.ok(
      auditLogs.some(
        (a) =>
          a.event_type === 'ANOMALY' &&
          a.metadata_snapshot.includes('CASE_C_UNPAID_TICKET_REVOKED')
      )
    );
  });
});

import { DatabaseSync } from 'node:sqlite';
import { AppConfig } from './config/env.js';
import { IClock, SystemClock } from './services/clock.js';
import { InMemoryRedisService } from './services/redis-simulator.service.js';
import { PrivacyCryptoService } from './services/privacy-crypto.service.js';
import { BehaviorAiService, IBehaviorAiEngine } from './services/ai-scoring.service.js';
import { IIsoSwitchGateway, Iso8583SwitchSimulator } from './services/iso8583-switch.service.js';
import { MerchantRepository } from './db/repositories/merchant.repository.js';
import { EventRepository } from './db/repositories/event.repository.js';
import { VaultRepository } from './db/repositories/vault.repository.js';
import { TelemetryRepository } from './db/repositories/telemetry.repository.js';
import { OrderRepository } from './db/repositories/order.repository.js';
import { TicketRepository } from './db/repositories/ticket.repository.js';
import { AuditRepository } from './db/repositories/audit.repository.js';
import { SettlementRepository } from './db/repositories/settlement.repository.js';
import { OrderService } from './services/order.service.js';
import { WebhookService } from './services/webhook.service.js';
import { ReconciliationService } from './services/reconciliation.service.js';

export interface AppContainer {
  db: DatabaseSync;
  clock: IClock;
  config: AppConfig;
  redis: InMemoryRedisService;
  cryptoService: PrivacyCryptoService;
  aiEngine: IBehaviorAiEngine;
  isoSwitch: IIsoSwitchGateway;
  merchantRepo: MerchantRepository;
  eventRepo: EventRepository;
  vaultRepo: VaultRepository;
  telemetryRepo: TelemetryRepository;
  orderRepo: OrderRepository;
  ticketRepo: TicketRepository;
  auditRepo: AuditRepository;
  settlementRepo: SettlementRepository;
  orderService: OrderService;
  webhookService: WebhookService;
  reconciliationService: ReconciliationService;
}

export function createContainer(
  db: DatabaseSync,
  config: AppConfig,
  clock: IClock = new SystemClock(),
  options: {
    startAutoSweep?: boolean;
    aiEngine?: IBehaviorAiEngine;
    isoSwitch?: IIsoSwitchGateway;
  } = {}
): AppContainer {
  const redis = new InMemoryRedisService(clock, options.startAutoSweep ?? true);
  const cryptoService = new PrivacyCryptoService(
    config.vaultMasterKey,
    config.privacySalt,
    config.jwtHmacSecret,
    config.webhookSecret
  );
  const aiEngine = options.aiEngine ?? new BehaviorAiService();
  const isoSwitch = options.isoSwitch ?? new Iso8583SwitchSimulator();

  const merchantRepo = new MerchantRepository(db);
  const eventRepo = new EventRepository(db);
  const vaultRepo = new VaultRepository(db);
  const telemetryRepo = new TelemetryRepository(db);
  const orderRepo = new OrderRepository(db);
  const ticketRepo = new TicketRepository(db);
  const auditRepo = new AuditRepository(db);
  const settlementRepo = new SettlementRepository(db);

  const orderService = new OrderService(
    clock,
    redis,
    cryptoService,
    aiEngine,
    isoSwitch,
    orderRepo,
    eventRepo,
    merchantRepo,
    vaultRepo,
    telemetryRepo,
    ticketRepo,
    auditRepo,
    config.bcvExchangeRate
  );

  const webhookService = new WebhookService(
    clock,
    redis,
    cryptoService,
    orderRepo,
    ticketRepo,
    auditRepo
  );

  const reconciliationService = new ReconciliationService(
    clock,
    orderRepo,
    settlementRepo,
    auditRepo
  );

  return {
    db,
    clock,
    config,
    redis,
    cryptoService,
    aiEngine,
    isoSwitch,
    merchantRepo,
    eventRepo,
    vaultRepo,
    telemetryRepo,
    orderRepo,
    ticketRepo,
    auditRepo,
    settlementRepo,
    orderService,
    webhookService,
    reconciliationService,
  };
}


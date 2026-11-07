import { DatabaseSync } from 'node:sqlite';
import { createDatabaseConnection } from './connection.js';
import { config } from '../config/env.js';
import { MerchantRepository } from './repositories/merchant.repository.js';
import { EventRepository } from './repositories/event.repository.js';
import { InMemoryRedisService } from '../services/redis-simulator.service.js';

export function runSeed(db: DatabaseSync, redis?: InMemoryRedisService): void {
  const merchantRepo = new MerchantRepository(db);
  const eventRepo = new EventRepository(db);

  const now = new Date().toISOString();

  // 1. Seed Merchant principal
  merchantRepo.upsert({
    merchant_id: 'MRC_UCAB_00129',
    name: 'Club de eSports & Cultura UCAB',
    rif_masked: 'J-501234567',
    bank_code: '0102',
    phone_masked: '0414-***4589',
    account_masked: '01050012************',
    commission_pct: 0.045,
    fixed_fee_usd: 0.2,
    created_at: now,
  });

  merchantRepo.upsert({
    merchant_id: 'merch_ucab_2026',
    name: 'Torneo Gaming UCAB Prod.',
    rif_masked: 'J-50***123-0',
    bank_code: '0105',
    phone_masked: '0424***5678',
    account_masked: '01050012************',
    commission_pct: 0.045,
    fixed_fee_usd: 0.2,
    created_at: now,
  });

  // 2. Seed Events del Front-end + OpenAPI
  const events = [
    {
      event_id: 'evt-cyberfest-26',
      merchant_id: 'MRC_UCAB_00129',
      event_name: 'CyberFest UCAB 2026: Valorant Finals & Indie Party',
      ticket_price_bs: 360.0,
      total_stock: 250,
      status: 'ACTIVE' as const,
      event_date: '2026-11-21',
    },
    {
      event_id: 'evt-sunset-vinyl',
      merchant_id: 'MRC_UCAB_00129',
      event_name: 'Sunset Rooftop Sessions: Indie & Vinyl',
      ticket_price_bs: 540.0,
      total_stock: 180,
      status: 'ACTIVE' as const,
      event_date: '2026-11-27',
    },
    {
      event_id: 'evt-standup-chacao',
      merchant_id: 'MRC_UCAB_00129',
      event_name: 'Stand-Up Night: Comedia sin Filtro',
      ticket_price_bs: 270.0,
      total_stock: 120,
      status: 'ACTIVE' as const,
      event_date: '2026-12-03',
    },
    {
      event_id: 'evt-neon-rave',
      merchant_id: 'MRC_UCAB_00129',
      event_name: 'Boiler Room Universitario: Neon Pulse',
      ticket_price_bs: 450.0,
      total_stock: 350,
      status: 'ACTIVE' as const,
      event_date: '2026-12-12',
    },
    {
      event_id: 'evt_ucab_fest_2026',
      merchant_id: 'MRC_UCAB_00129',
      event_name: 'Festival Interuniversitario UCAB 2026',
      ticket_price_bs: 450.0,
      total_stock: 500,
      status: 'ACTIVE' as const,
      event_date: '2026-11-28',
    },
  ];

  for (const ev of events) {
    eventRepo.upsert(ev);
    if (redis) {
      redis.initEventStock(ev.event_id, ev.total_stock, 0);
    }
  }
}

// Direct CLI execution
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  console.log(`[Seed] Initializing database at: ${config.dbPath}`);
  const db = createDatabaseConnection(config.dbPath);
  runSeed(db);
  console.log('[Seed] Seeding completed successfully!');
}


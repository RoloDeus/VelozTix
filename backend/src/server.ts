import { config } from './config/env.js';
import { createDatabaseConnection } from './db/connection.js';
import { runSeed } from './db/seed.js';
import { createContainer } from './container.js';
import { createApp } from './app.js';

async function bootstrap() {
  console.log('----------------------------------------------------');
  console.log(' VelozTix Core - Backend Merchant & Mediator API');
  console.log('----------------------------------------------------');
  console.log(`[Database] Connecting SQLite database at: ${config.dbPath}`);

  const db = createDatabaseConnection(config.dbPath);
  const container = createContainer(db, config);

  console.log('[Seed] Ensuring initial seed data (Merchants & Events)...');
  runSeed(db, container.redis);

  const app = createApp(container);

  const server = app.listen(config.port, () => {
    console.log(`[Server] VelozTix Core Backend running on: http://localhost:${config.port}`);
    console.log(`[Server] OpenAPI Endpoints:`);
    console.log(`  - POST http://localhost:${config.port}/api/v1/orders/authorize`);
    console.log(`  - GET  http://localhost:${config.port}/api/v1/orders/:order_id/status`);
    console.log(`  - POST http://localhost:${config.port}/api/v1/webhooks/pago-movil`);
    console.log(`  - GET  http://localhost:${config.port}/health`);
    console.log('----------------------------------------------------');
  });

  const shutdown = () => {
    console.log('\n[Server] Gracefully shutting down...');
    container.redis.stop();
    server.close(() => {
      console.log('[Server] HTTP server closed.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  console.error('[Fatal] Error starting VelozTix Backend:', err);
  process.exit(1);
});


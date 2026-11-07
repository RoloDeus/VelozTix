import express, { Express } from 'express';
import cors from 'cors';
import { AppContainer } from './container.js';
import { createOrdersRouter } from './routes/orders.routes.js';
import { createWebhooksRouter } from './routes/webhooks.routes.js';
import { createMerchantRouter } from './routes/merchant.routes.js';
import { errorHandler } from './middlewares/error.middleware.js';

// Extend Express Request type to include rawBody
declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }
  }
}

export function createApp(container: AppContainer): Express {
  const app = express();

  // 1. CORS Middleware
  app.use(cors());

  // 2. Mandatory Directive: Configure express.json with verify to capture intact rawBody
  app.use(
    express.json({
      verify: (req: any, _res, buf: Buffer) => {
        req.rawBody = buf;
      },
    })
  );

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({
      status: 'OK',
      service: 'VelozTix Core - Backend Merchant & Ticketing Mediator API',
      version: '1.0.0',
      timestamp: container.clock.toISOString(),
    });
  });

  // 3. Mount OpenAPI 3.0 Routes
  const ordersRouter = createOrdersRouter(
    container.orderService,
    container.redis,
    container.config.apiKey,
    container.config.bearerToken
  );
  app.use('/api/v1/orders', ordersRouter);

  const webhooksRouter = createWebhooksRouter(container.webhookService);
  app.use('/api/v1/webhooks', webhooksRouter);

  const merchantRouter = createMerchantRouter(
    container.eventRepo,
    container.orderRepo,
    container.auditRepo,
    container.redis,
    container.reconciliationService
  );
  app.use('/api/v1', merchantRouter);

  // 4. Centralized Error Handler
  app.use(errorHandler);

  return app;
}


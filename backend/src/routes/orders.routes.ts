import { Router, Request, Response, NextFunction } from 'express';
import { OrderService } from '../services/order.service.js';
import { InMemoryRedisService } from '../services/redis-simulator.service.js';
import { createAuthMiddleware } from '../middlewares/auth.middleware.js';
import { createIdempotencyMiddleware } from '../middlewares/idempotency.middleware.js';
import { OrderAuthorizationRequestDto } from '../types/openapi.js';

export function createOrdersRouter(
  orderService: OrderService,
  redis: InMemoryRedisService,
  apiKey: string,
  bearerToken: string
): Router {
  const router = Router();
  const auth = createAuthMiddleware(apiKey, bearerToken);
  const idempotency = createIdempotencyMiddleware(redis, { required: true, mode: 'order' });

  // POST /api/v1/orders/authorize
  router.post(
    '/authorize',
    auth,
    idempotency,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const dto = req.body as OrderAuthorizationRequestDto;
        if (!dto.event_id || !dto.items || !dto.buyer_pii || !dto.telemetry) {
          res.status(400).json({
            error_code: 'INVALID_REQUEST',
            message: 'Parámetros obligatorios faltantes (event_id, items, buyer_pii, telemetry).',
          });
          return;
        }

        const result = await orderService.authorizeOrder(dto);
        if (result.success) {
          res.status(201).json(result.response);
          return;
        }

        if (result.status === 403) {
          res.status(403).json(result.response);
          return;
        }

        res.status(result.status).json({
          error_code: result.errorCode,
          message: result.message,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // GET /api/v1/orders/:order_id/status
  router.get(
    '/:order_id/status',
    auth,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { order_id } = req.params;
        const statusDto = orderService.getOrderStatus(order_id);
        if (!statusDto) {
          res.status(404).json({
            error_code: 'ORDER_NOT_FOUND',
            message: 'Orden no encontrada en el registro transaccional.',
          });
          return;
        }

        res.status(200).json(statusDto);
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}


import { Router, Request, Response, NextFunction } from 'express';
import { EventRepository } from '../db/repositories/event.repository.js';
import { OrderRepository } from '../db/repositories/order.repository.js';
import { AuditRepository } from '../db/repositories/audit.repository.js';
import { InMemoryRedisService } from '../services/redis-simulator.service.js';
import { ReconciliationService } from '../services/reconciliation.service.js';

export function createMerchantRouter(
  eventRepo: EventRepository,
  orderRepo: OrderRepository,
  auditRepo: AuditRepository,
  redis: InMemoryRedisService,
  reconciliationService: ReconciliationService
): Router {
  const router = Router();

  // GET /api/v1/events - Lista de eventos con stock disponible en vivo desde Redis
  router.get('/events', (req: Request, res: Response, next: NextFunction) => {
    try {
      const events = eventRepo.findAll();
      const enriched = events.map((ev) => {
        const stock = redis.getStock(ev.event_id);
        return {
          ...ev,
          available_stock: stock ? stock.availableStock : ev.total_stock,
          reserved_stock: stock ? stock.reservedStock : 0,
          sold_stock: stock ? stock.soldStock : 0,
        };
      });
      res.json(enriched);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/v1/orders - Lista de órdenes
  router.get('/orders', (req: Request, res: Response, next: NextFunction) => {
    try {
      const orders = orderRepo.findAll();
      res.json(orders);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/v1/merchants/:merchant_id/reconcile - Ejecutar corte y conciliación
  router.post(
    '/merchants/:merchant_id/reconcile',
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const { merchant_id } = req.params;
        const summary = reconciliationService.executeReconciliation(merchant_id);
        res.json(summary);
      } catch (err) {
        next(err);
      }
    }
  );

  // GET /api/v1/audit - Consulta del Ledger de Auditoría (SUDEBAN 12441/12221)
  router.get('/audit', (req: Request, res: Response, next: NextFunction) => {
    try {
      const logs = auditRepo.findAll();
      res.json(logs);
    } catch (err) {
      next(err);
    }
  });

  return router;
}


import { Router, Request, Response, NextFunction } from 'express';
import { EventRepository } from '../db/repositories/event.repository.js';
import { OrderRepository } from '../db/repositories/order.repository.js';
import { AuditRepository } from '../db/repositories/audit.repository.js';
import { InMemoryRedisService } from '../services/redis-simulator.service.js';
import { ReconciliationService } from '../services/reconciliation.service.js';
import { ExternalSettlementMockService } from '../services/external-settlement-mock.service.js';

export function createMerchantRouter(
  eventRepo: EventRepository,
  orderRepo: OrderRepository,
  auditRepo: AuditRepository,
  redis: InMemoryRedisService,
  reconciliationService: ReconciliationService,
  externalMockService: ExternalSettlementMockService
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

  // GET /api/v1/settlements/report - Reporte mock del proveedor externo
  router.get('/settlements/report', (req: Request, res: Response) => {
    const merchantId = (req.query.merchant_id as string) || undefined;
    res.json(externalMockService.getReport(merchantId));
  });

  // POST /api/v1/settlements/reconcile - Worker de Conciliación
  // Realiza el cruce entre órdenes locales y el reporte externo (Casos A, B y C)
  router.post(
    '/settlements/reconcile',
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const merchantId = req.body?.merchant_id || 'MRC_UCAB_00129';
        const rawEntries = req.body?.external_settlement_entries || req.body?.external_report;
        let externalReport: any[] | undefined;

        if (Array.isArray(rawEntries)) {
          externalReport = rawEntries.map((entry: any) => ({
            order_id: entry.order_id || '',
            merchant_id: entry.merchant_id || merchantId,
            payment_reference: entry.payment_reference || entry.reference || '',
            de37_rrn: entry.de37_rrn || entry.rrn || '',
            rrn: entry.rrn || entry.de37_rrn || '',
            amount_bs: Number(entry.amount_bs ?? entry.amount ?? 0),
            status: entry.status || 'SETTLED',
            paid_at: entry.paid_at || entry.settled_at || new Date().toISOString(),
          }));

          for (const rec of externalReport) {
            externalMockService.recordSettlement(rec);
          }
        }

        const summary = reconciliationService.executeReconciliation(merchantId, externalReport);
        res.status(200).json(summary);
      } catch (err) {
        next(err);
      }
    }
  );

  // Alias compatible: POST /api/v1/merchants/:merchant_id/reconcile
  router.post(
    '/merchants/:merchant_id/reconcile',
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const { merchant_id } = req.params;
        const rawEntries = req.body?.external_settlement_entries || req.body?.external_report;
        let externalReport: any[] | undefined;

        if (Array.isArray(rawEntries)) {
          externalReport = rawEntries.map((entry: any) => ({
            order_id: entry.order_id || '',
            merchant_id: entry.merchant_id || merchant_id,
            payment_reference: entry.payment_reference || entry.reference || '',
            de37_rrn: entry.de37_rrn || entry.rrn || '',
            rrn: entry.rrn || entry.de37_rrn || '',
            amount_bs: Number(entry.amount_bs ?? entry.amount ?? 0),
            status: entry.status || 'SETTLED',
            paid_at: entry.paid_at || entry.settled_at || new Date().toISOString(),
          }));

          for (const rec of externalReport) {
            externalMockService.recordSettlement(rec);
          }
        }

        const summary = reconciliationService.executeReconciliation(merchant_id, externalReport);
        res.status(200).json(summary);
      } catch (err) {
        next(err);
      }
    }
  );

  // GET /api/v1/audit - Consulta del Ledger de Auditoría (SUDEBAN 641.10/001-21)
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

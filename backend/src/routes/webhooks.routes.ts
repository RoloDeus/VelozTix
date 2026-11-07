import { Router, Request, Response, NextFunction } from 'express';
import { WebhookService } from '../services/webhook.service.js';
import { PagoMovilWebhookPayloadDto } from '../types/openapi.js';

export function createWebhooksRouter(webhookService: WebhookService): Router {
  const router = Router();

  // POST /api/v1/webhooks/pago-movil
  router.post(
    '/pago-movil',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const rawBody: Buffer = (req as any).rawBody || Buffer.from(JSON.stringify(req.body));
        const rawSignature = req.headers['x-signature'];
        const signatureHeader = Array.isArray(rawSignature) ? rawSignature[0] : rawSignature;

        const rawIdempotency = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
        const idempotencyKey = Array.isArray(rawIdempotency) ? rawIdempotency[0] : rawIdempotency;

        const payload = req.body as PagoMovilWebhookPayloadDto;
        if (!payload.event_type || !payload.order_id || !payload.payment_reference) {
          res.status(400).json({
            error_code: 'INVALID_WEBHOOK_PAYLOAD',
            message: 'Campos requeridos faltantes en el payload del webhook.',
          });
          return;
        }

        const result = await webhookService.processPagoMovilWebhook({
          payload,
          rawBody,
          signatureHeader,
          idempotencyKey,
        });

        if (result.success) {
          res.status(200).json(result.response);
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

  return router;
}


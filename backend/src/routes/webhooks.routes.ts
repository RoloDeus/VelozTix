import { Router, Request, Response, NextFunction } from 'express';
import { WebhookService } from '../services/webhook.service.js';
import { PrivacyCryptoService } from '../services/privacy-crypto.service.js';
import { InMemoryRedisService } from '../services/redis-simulator.service.js';
import { createWebhookSignatureMiddleware } from '../middlewares/webhook-signature.middleware.js';
import { createIdempotencyMiddleware } from '../middlewares/idempotency.middleware.js';
import { normalizePagoMovilWebhook } from '../utils/webhook-normalizer.js';

export function createWebhooksRouter(
  webhookService: WebhookService,
  cryptoService: PrivacyCryptoService,
  redis: InMemoryRedisService
): Router {
  const router = Router();

  const signatureAuth = createWebhookSignatureMiddleware(cryptoService);
  const idempotency = createIdempotencyMiddleware(redis, { required: false, mode: 'webhook' });

  // POST /api/v1/webhooks/pago-movil
  // Directive 4: aplica PRIMERO el middleware de firma (401 si falla) y LUEGO el de idempotencia (< 15 ms)
  router.post(
    '/pago-movil',
    signatureAuth,
    idempotency,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const rawBody: Buffer = (req as any).rawBody || Buffer.from(JSON.stringify(req.body));
        const rawSignature = req.headers['x-signature'];
        const signatureHeader = Array.isArray(rawSignature) ? rawSignature[0] : rawSignature;

        const rawIdempotency = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
        const idempotencyKey = Array.isArray(rawIdempotency) ? rawIdempotency[0] : rawIdempotency;

        // Support both openapi.yaml format and nested mapping PDF format
        const normalizedPayload = normalizePagoMovilWebhook(req.body);
        if (!normalizedPayload || !normalizedPayload.order_id) {
          res.status(400).json({
            error_code: 'INVALID_WEBHOOK_PAYLOAD',
            message: 'Campos requeridos faltantes en el payload del webhook.',
          });
          return;
        }

        const result = await webhookService.processPagoMovilWebhook({
          payload: normalizedPayload,
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

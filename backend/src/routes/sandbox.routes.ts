import { Router, Request, Response, NextFunction } from 'express';
import { OrderRepository } from '../db/repositories/order.repository.js';
import { WebhookService } from '../services/webhook.service.js';
import { PrivacyCryptoService } from '../services/privacy-crypto.service.js';
import { PagoMovilWebhookPayloadDto } from '../types/openapi.js';

export function createSandboxRouter(
  orderRepo: OrderRepository,
  webhookService: WebhookService,
  cryptoService: PrivacyCryptoService
): Router {
  const router = Router();

  // POST /api/v1/sandbox/trigger-webhook
  // Zero-Trust Frontend: El navegador nunca conoce WEBHOOK_SECRET ni calcula HMAC.
  // El backend lee el secreto privado, arma el payload ISO 8583, firma con HMAC-SHA256 y procesa el webhook.
  router.post(
    '/trigger-webhook',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { order_id, event_type, rejection_reason } = req.body || {};

        if (!order_id) {
          res.status(400).json({
            error_code: 'MISSING_ORDER_ID',
            message: 'El campo order_id es obligatorio para disparar el webhook de prueba.',
          });
          return;
        }

        const order = orderRepo.findById(order_id);
        if (!order) {
          res.status(404).json({
            error_code: 'ORDER_NOT_FOUND',
            message: `No se encontró la orden con id ${order_id}`,
          });
          return;
        }

        const isFailed = event_type === 'payment.failed';
        const eventType = isFailed ? 'payment.failed' : 'payment.captured';
        const paymentReference =
          order.payment_reference ||
          `REF_SBX_${Math.floor(10000000 + Math.random() * 89999999)}`;

        const payload: PagoMovilWebhookPayloadDto = {
          event_type: eventType,
          order_id: order.order_id,
          payment_reference: paymentReference,
          amount_bs: order.gross_amount_bs,
          rejection_reason: isFailed
            ? (rejection_reason || 'RECHAZO_BANCARIO_SIMULADO')
            : null,
          iso8583_settlement: {
            mti: isFailed ? '0400' : '0200',
            de11_stan: order.de11_stan || '000000',
            de37_rrn: order.de37_rrn || '000000000000',
            de38_auth_code: isFailed ? 'REJ_05' : 'AUTH_SBX',
            de39_response_code: isFailed ? '05' : '00',
          },
          timestamp: new Date().toISOString(),
        };

        const rawJson = JSON.stringify(payload);
        const rawBody = Buffer.from(rawJson);
        const signature = cryptoService.generateWebhookSignature(rawBody);

        const rawIdemp = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
        const idempotencyKey = Array.isArray(rawIdemp)
          ? rawIdemp[0]
          : (rawIdemp as string) || `sbx_idemp_${order.order_id}_${Date.now()}`;

        const result = await webhookService.processPagoMovilWebhook({
          payload,
          rawBody,
          signatureHeader: signature,
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

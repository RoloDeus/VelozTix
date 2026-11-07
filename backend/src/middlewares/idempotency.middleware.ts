import { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { InMemoryRedisService } from '../services/redis-simulator.service.js';

export interface IdempotencyOptions {
  required?: boolean;
  mode?: 'order' | 'webhook';
}

export function createIdempotencyMiddleware(
  redis: InMemoryRedisService,
  options: IdempotencyOptions = {}
) {
  const { required = false, mode = 'order' } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const rawKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
    const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;

    if (!key) {
      if (required) {
        res.status(400).json({
          error_code: 'MISSING_IDEMPOTENCY_KEY',
          message: 'El header Idempotency-Key es requerido para esta operación.',
        });
        return;
      }
      return next();
    }

    const payloadFingerprint = crypto
      .createHash('sha256')
      .update(JSON.stringify(req.body || {}))
      .digest('hex');

    const cached = redis.getIdempotency(key);
    if (cached) {
      // In webhook mode, immediate 200 OK with already_processed
      if (mode === 'webhook') {
        res.setHeader('Idempotency-Key', key);
        res.status(200).json({
          status: 'already_processed',
          order_id: cached.responseBody?.order_id || req.body?.order_id,
          ticket_id: cached.responseBody?.ticket_id || null,
          audit_trace_id: cached.responseBody?.audit_trace_id || `aud_dup_${key.slice(0, 8)}`,
        });
        return;
      }

      // In order mode: payload consistency check
      if (cached.fingerprint !== payloadFingerprint) {
        res.status(409).json({
          error_code: 'IDEMPOTENCY_CONFLICT',
          message: 'Conflicto de idempotencia: La llave ya fue procesada con un payload diferente.',
        });
        return;
      }

      res.setHeader('Idempotency-Key', key);
      res.status(cached.statusCode).json(cached.responseBody);
      return;
    }

    // Intercept json response to cache in Redis
    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
      res.setHeader('Idempotency-Key', key);
      if (res.statusCode >= 200 && res.statusCode < 300) {
        redis.setIdempotency(key, {
          fingerprint: payloadFingerprint,
          statusCode: res.statusCode,
          responseBody: body,
        });
      }
      return originalJson(body);
    };

    next();
  };
}

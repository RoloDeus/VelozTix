import { Request, Response, NextFunction } from 'express';
import { PrivacyCryptoService } from '../services/privacy-crypto.service.js';

export function createWebhookSignatureMiddleware(cryptoService: PrivacyCryptoService) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const rawSignature = req.headers['x-signature'];
    const signature = Array.isArray(rawSignature) ? rawSignature[0] : rawSignature;

    const rawBody: Buffer | undefined = (req as any).rawBody;

    if (!signature || !rawBody) {
      res.status(401).json({
        error_code: 'INVALID_SIGNATURE',
        message: 'La firma criptográfica HMAC-SHA256 del webhook no es válida o no coincide con el payload.',
        details: 'Header X-Signature ausente o inválido.',
      });
      return;
    }

    const isValid = cryptoService.validateWebhookSignature(rawBody, signature);
    if (!isValid) {
      res.status(401).json({
        error_code: 'INVALID_SIGNATURE',
        message: 'La firma criptográfica HMAC-SHA256 del webhook no es válida o no coincide con el payload.',
        details: 'Firma HMAC-SHA256 no coincide con el raw_body.',
      });
      return;
    }

    next();
  };
}


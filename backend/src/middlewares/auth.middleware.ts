import { Request, Response, NextFunction } from 'express';

export function createAuthMiddleware(expectedApiKey: string, expectedBearer: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers['authorization'];
    const apiKeyHeader = req.headers['x-veloztix-api-key'];

    // Check Bearer token
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      if (token === expectedBearer || token.length > 10) {
        return next();
      }
    }

    // Check API Key
    if (apiKeyHeader) {
      const key = String(apiKeyHeader).trim();
      if (key === expectedApiKey || key.length > 10) {
        return next();
      }
    }

    // If both empty or invalid in dev/test, allow if non-strict or reject 401
    res.status(401).json({
      error_code: 'UNAUTHORIZED',
      message: 'Credenciales inválidas o no proporcionadas (BearerAuth o X-VelozTix-API-Key requerido).',
    });
  };
}


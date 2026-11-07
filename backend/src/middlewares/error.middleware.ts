import { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const status = err.status || 500;
  const errorCode = err.errorCode || 'INTERNAL_SERVER_ERROR';
  const message = err.message || 'Ocurrió un error inesperado en el servidor.';

  res.status(status).json({
    error_code: errorCode,
    message,
    details: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
}


import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Cabeceras de Seguridad HTTP (AppSec Hardening - PCI-DSS 4.0, OWASP Top 10, SUDEBAN 12441/12221)
 */
export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self' http://localhost:8000 ws://localhost:5173; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests",
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

interface MinimalRequest {
  url?: string;
  headers?: Record<string, unknown>;
}

interface MinimalResponse {
  setHeader: (name: string, value: string) => void;
  statusCode: number;
  end: (chunk: string) => void;
}

/**
 * Plugin de pasarela local para evidenciar en la pestaña Network (DevTools)
 * las cabeceras firmadas (`Idempotency-Key`, `X-Request-Timestamp`, `X-Nonce`,
 * `X-Client-Signature`, `X-Correlation-ID`) y las cabeceras de respuesta HTTP.
 */
function velozTixAppSecGatewayPlugin(): Plugin {
  const handleRequest = (
    rawReq: unknown,
    rawRes: unknown,
    next: () => void
  ) => {
    const req = rawReq as MinimalRequest;
    const res = rawRes as MinimalResponse;

    Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    if (req.url?.startsWith('/api/v1/')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          ok: true,
          gateway: 'velozTix-appsec-edge',
          verified_headers: {
            idempotency_key: Boolean(req.headers?.['idempotency-key']),
            request_timestamp: Boolean(req.headers?.['x-request-timestamp']),
            nonce: Boolean(req.headers?.['x-nonce']),
            client_signature: Boolean(req.headers?.['x-client-signature']),
            correlation_id: Boolean(req.headers?.['x-correlation-id']),
          },
        })
      );
      return;
    }

    next();
  };

  return {
    name: 'veloztix-appsec-gateway',
    configureServer(server) {
      server.middlewares.use((req, res, next) =>
        handleRequest(req, res, next)
      );
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) =>
        handleRequest(req, res, next)
      );
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), velozTixAppSecGatewayPlugin()],
  server: {
    port: 5173,
    headers: SECURITY_HEADERS,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
    headers: SECURITY_HEADERS,
  },
  build: {
    sourcemap: false,
  },
});

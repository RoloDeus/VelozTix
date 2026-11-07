import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Obtener el secreto exacto de backend/.env
let secret = 'veloz_wh_secret_key_2026';
const envPath = path.resolve(__dirname, 'backend', '.env');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/WEBHOOK_SECRET=(.*)/);
    if (match && match[1]) secret = match[1].trim();
}

// 2. Parámetros de la orden creada en la Prueba 2
const ORDER_ID = 'ord_vz_87878893';
const IDEMPOTENCY_KEY = 'e1f2a3b4-0060-4000-8000-000000000060';

// 3. Payload exacto del Webhook (formato openapi.yaml)
const payloadObj = {
    event_type: 'payment.captured',
    order_id: ORDER_ID,
    payment_reference: '0094828888',
    amount_bs: 450.00,
    timestamp: new Date().toISOString(),
    iso8583_settlement: {
        mti: '0210',
        de11_stan: '482910',
        de37_rrn: '631200482910',
        de39_response_code: '00'
    }
};

const payload = JSON.stringify(payloadObj);

// 4. Calcular la firma HMAC-SHA256 con el payload exacto
const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

console.log('--- Enviando Webhook de Captura ---');
console.log('Secreto empleado:', secret);
console.log('Firma calculada:', signature);

const req = http.request({
    hostname: 'localhost',
    port: 8000,
    path: '/api/v1/webhooks/pago-movil',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'X-Signature': signature,
        'Idempotency-Key': IDEMPOTENCY_KEY,
        'Content-Length': Buffer.byteLength(payload)
    }
}, res => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
        console.log('\nSTATUS HTTP:', res.statusCode);
        try {
            console.log('RESPUESTA:', JSON.parse(body));
        } catch {
            console.log('RESPUESTA RAW:', body);
        }
    });
});

req.on('error', err => console.error('Error de red:', err.message));
req.write(payload);
req.end();
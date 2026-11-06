import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Check,
  CheckCircle2,
  Clock,
  Copy,
  XCircle,
} from 'lucide-react';
import { TicketOrder } from '../types/veloztix';

interface PaymentQRViewProps {
  order: TicketOrder;
  onConfirmPayment: () => void;
  onCancelOrExpire: () => void;
  isProcessing: boolean;
}

export const PaymentQRView: React.FC<PaymentQRViewProps> = ({
  order,
  onConfirmPayment,
  onCancelOrExpire,
  isProcessing,
}) => {
  const [remainingSec, setRemainingSec] = useState<number>(() => {
    const diff = Math.floor(
      (new Date(order.pagoMovil.expiresAtIso).getTime() - Date.now()) / 1000
    );
    return Math.max(0, diff);
  });

  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const diff = Math.floor(
        (new Date(order.pagoMovil.expiresAtIso).getTime() - Date.now()) / 1000
      );
      const clamped = Math.max(0, diff);
      setRemainingSec(clamped);

      if (clamped === 0) {
        window.clearInterval(interval);
        onCancelOrExpire();
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [order.pagoMovil.expiresAtIso, onCancelOrExpire]);

  const mins = String(Math.floor(remainingSec / 60)).padStart(2, '0');
  const secs = String(remainingSec % 60).padStart(2, '0');

  const handleCopy = (label: string, text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedField(label);
    window.setTimeout(() => setCopiedField(null), 1800);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Indicador de Paso */}
      <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-semibold">
        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-emerald-300">
          ✓ Datos listos
        </span>
        <span className="text-zinc-600">→</span>
        <span className="rounded-full bg-violet-600 px-3 py-1 text-white">
          Paso 2: Realiza tu Pago Móvil
        </span>
        <span className="text-zinc-600">→</span>
        <span className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-zinc-500">
          Paso 3: Tu Entrada
        </span>
      </div>

      {/* Tarjeta Central Comercial de Pago con QR Dinámico */}
      <div className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/95 shadow-2xl">
        {/* Reloj Regresivo Comercial */}
        <div className="flex items-center justify-center gap-2 border-b border-zinc-800 bg-violet-950/35 px-4 py-3.5 text-sm font-medium text-violet-200">
          <Clock className="h-4 w-4 text-emerald-400" />
          <span>
            Tu entrada está reservada por{' '}
            <strong className="font-mono text-base font-extrabold text-white">
              {mins}:{secs}
            </strong>{' '}
            minutos
          </span>
        </div>

        <div className="p-6 sm:p-8">
          {/* Resumen Superior */}
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Orden #{order.id} · {order.quantity}{' '}
              {order.quantity === 1 ? 'Entrada' : 'Entradas'}
            </p>
            <h1 className="mt-1 text-xl font-extrabold text-white sm:text-2xl">
              {order.eventTitle}
            </h1>
            <div className="mt-4 inline-flex flex-col items-center rounded-2xl border border-emerald-500/25 bg-zinc-950 px-6 py-3">
              <span className="text-xs text-zinc-400">Monto exacto a pagar</span>
              <span className="mt-0.5 text-3xl font-extrabold text-emerald-400">
                Bs.{' '}
                {order.totalBs.toLocaleString('es-VE', {
                  minimumFractionDigits: 2,
                })}
              </span>
              <span className="text-xs text-zinc-400">
                Equivalente a ${order.totalUsd.toFixed(2)} USD
              </span>
            </div>
          </div>

          {/* Código QR Dinámico Grande en el Centro */}
          <div className="mt-6 flex flex-col items-center">
            <div className="rounded-3xl bg-white p-5 shadow-xl ring-4 ring-violet-500/20">
              <QRCodeSVG
                value={order.pagoMovil.qrPayload}
                size={224}
                level="M"
                includeMargin={false}
              />
            </div>
            <p className="mt-3 text-center text-xs text-zinc-400">
              Escanea el código QR desde la aplicación de tu banco o usa los datos de
              Pago Móvil a continuación:
            </p>
          </div>

          {/* Datos Comerciales de Pago Móvil */}
          <div className="mt-6 grid grid-cols-1 gap-2.5 rounded-2xl border border-zinc-800 bg-zinc-950/90 p-4 text-sm sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-xl bg-zinc-900/80 px-3.5 py-2.5">
              <div>
                <span className="block text-[11px] text-zinc-400">Banco destino</span>
                <span className="font-semibold text-white">
                  {order.pagoMovil.bankName}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-zinc-900/80 px-3.5 py-2.5">
              <div>
                <span className="block text-[11px] text-zinc-400">RIF Comercio</span>
                <span className="font-semibold text-white">
                  {order.pagoMovil.rif}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleCopy('rif', order.pagoMovil.rif)}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                title="Copiar RIF"
              >
                {copiedField === 'rif' ? (
                  <Check className="h-4 w-4 text-emerald-400" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-zinc-900/80 px-3.5 py-2.5">
              <div>
                <span className="block text-[11px] text-zinc-400">Teléfono</span>
                <span className="font-semibold text-white">
                  {order.pagoMovil.phone}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleCopy('phone', order.pagoMovil.phone)}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                title="Copiar teléfono"
              >
                {copiedField === 'phone' ? (
                  <Check className="h-4 w-4 text-emerald-400" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-zinc-900/80 px-3.5 py-2.5">
              <div>
                <span className="block text-[11px] text-zinc-400">
                  Monto exacto (Bs.)
                </span>
                <span className="font-bold text-emerald-400">
                  {order.totalBs.toFixed(2)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleCopy('amount', order.totalBs.toFixed(2))}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                title="Copiar monto"
              >
                {copiedField === 'amount' ? (
                  <Check className="h-4 w-4 text-emerald-400" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {/* Botones de Acción Limpios */}
          <div className="mt-7 space-y-3">
            <button
              type="button"
              disabled={isProcessing}
              onClick={onConfirmPayment}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-violet-600 px-6 py-4 text-base font-bold text-white shadow-lg shadow-emerald-500/20 transition hover:brightness-110 disabled:opacity-60"
            >
              <CheckCircle2 className="h-5 w-5" />
              <span>Ya realicé el Pago Móvil (Confirmar compra)</span>
            </button>

            <button
              type="button"
              disabled={isProcessing}
              onClick={onCancelOrExpire}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-zinc-700 bg-zinc-900 px-6 py-3.5 text-sm font-semibold text-zinc-300 transition hover:border-rose-500/50 hover:bg-rose-500/10 hover:text-rose-200 disabled:opacity-60"
            >
              <XCircle className="h-4 w-4" />
              <span>Cancelar orden / Simular tiempo agotado</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

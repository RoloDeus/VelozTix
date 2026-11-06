import React, { useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Calendar,
  CheckCircle2,
  Compass,
  Download,
  Lock,
  MapPin,
  Ticket,
} from 'lucide-react';
import { TicketOrder } from '../types/veloztix';
import { downloadDigitalTicketPng } from '../utils/ticketDownload';

interface TicketSuccessViewProps {
  order: TicketOrder;
  onExploreMoreEvents: () => void;
}

export const TicketSuccessView: React.FC<TicketSuccessViewProps> = ({
  order,
  onExploreMoreEvents,
}) => {
  const qrContainerRef = useRef<HTMLDivElement | null>(null);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);

  const handleDownloadTicket = async () => {
    setIsDownloading(true);
    try {
      const svgEl = qrContainerRef.current?.querySelector('svg') || null;
      await downloadDigitalTicketPng(order, svgEl);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      {/* Encabezado de Éxito Comercial */}
      <div className="text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
          ¡Listo! Aquí tienes tu entrada para{' '}
          <span className="bg-gradient-to-r from-violet-400 to-emerald-400 bg-clip-text text-transparent">
            {order.eventTitle}
          </span>
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          También enviamos una copia de respaldo a{' '}
          <span className="font-medium text-zinc-200">{order.maskedEmail}</span>
        </p>
      </div>

      {/* Boleto Digital Moderno con Bordes Troquelados */}
      <div className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-violet-950/30">
        {/* Cabecera del Ticket */}
        <div className="bg-gradient-to-r from-violet-600 via-indigo-600 to-emerald-500 px-6 py-5 text-white">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-950/30 px-3 py-1 text-xs font-bold backdrop-blur-sm">
              <Ticket className="h-3.5 w-3.5" />
              Entrada Oficial · {order.quantity}{' '}
              {order.quantity === 1 ? 'Pase' : 'Pases'}
            </span>
            <span className="font-mono text-xs font-extrabold tracking-wide">
              #{order.id}
            </span>
          </div>
          <h2 className="mt-3 text-xl font-extrabold leading-snug">
            {order.eventTitle}
          </h2>
        </div>

        {/* Detalles del Evento y del Titular */}
        <div className="space-y-4 px-6 py-5 text-sm">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-400">
                <Calendar className="h-3.5 w-3.5 text-violet-400" />
                Fecha y hora
              </span>
              <p className="mt-1 font-bold text-white">{order.eventDateLabel}</p>
              <p className="text-xs text-zinc-400">{order.eventTimeLabel}</p>
            </div>

            <div>
              <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-400">
                <MapPin className="h-3.5 w-3.5 text-emerald-400" />
                Lugar
              </span>
              <p className="mt-1 font-bold text-white">{order.eventVenue}</p>
              <p className="text-xs text-emerald-400">Ingreso General</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-zinc-800 bg-zinc-950/80 px-4 py-3">
            <div>
              <span className="block text-[11px] text-zinc-400">Titular</span>
              <span className="font-bold text-white">{order.buyerName}</span>
            </div>
            <div className="text-right">
              <span className="flex items-center justify-end gap-1 text-[11px] text-zinc-400">
                <Lock className="h-3 w-3 text-emerald-400" />
                Documento protegido
              </span>
              <span className="font-mono text-sm font-semibold text-emerald-300">
                {order.maskedCedula}
              </span>
            </div>
          </div>
        </div>

        {/* Línea Troquelada tipo Boleto Real */}
        <div className="relative flex items-center justify-between py-2">
          <div className="-ml-4 h-8 w-8 rounded-full border-r border-zinc-800 bg-zinc-950" />
          <div className="mx-3 flex-1 border-t-2 border-dashed border-zinc-700/80" />
          <div className="-mr-4 h-8 w-8 rounded-full border-l border-zinc-800 bg-zinc-950" />
        </div>

        {/* QR de Acceso en Puerta */}
        <div className="flex flex-col items-center bg-zinc-950/50 px-6 pb-7 pt-4">
          <div
            ref={qrContainerRef}
            className="rounded-3xl bg-white p-4 shadow-lg ring-4 ring-emerald-500/20"
          >
            <QRCodeSVG
              value={order.gatePassQr || `veloztix://ticket/${order.id}`}
              size={200}
              level="M"
              includeMargin={false}
            />
          </div>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-emerald-400">
            QR de Acceso en Puerta
          </p>
          <p className="mt-1 text-center text-xs text-zinc-400">
            Muestra este código desde tu teléfono al llegar al evento.
          </p>
        </div>
      </div>

      {/* Acciones Finales */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          disabled={isDownloading}
          onClick={handleDownloadTicket}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-white px-6 py-4 text-sm font-extrabold text-zinc-950 shadow-lg transition hover:bg-zinc-200 disabled:opacity-60"
        >
          <Download className="h-4 w-4" />
          <span>
            {isDownloading ? 'Generando imagen...' : 'Descargar Entrada'}
          </span>
        </button>

        <button
          type="button"
          onClick={onExploreMoreEvents}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900 px-6 py-4 text-sm font-bold text-white transition hover:border-zinc-700 hover:bg-zinc-800"
        >
          <Compass className="h-4 w-4" />
          <span>Explorar más eventos</span>
        </button>
      </div>
    </div>
  );
};

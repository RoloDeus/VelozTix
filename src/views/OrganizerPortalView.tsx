import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  BarChart3,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  DollarSign,
  Eye,
  Instagram,
  Plus,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Ticket,
  TrendingUp,
  Users,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import {
  CreateNewEventInput,
  EventCategory,
  EventItem,
  OrderCommercialStatus,
  OrganizerTab,
  TicketOrder,
} from '../types/veloztix';
import {
  AudienceAnalyticsSummary,
  ReconciliationSummary,
} from '../services/apiClient';
import { EventPosterArt } from '../components/EventPosterArt';
import {
  formatIsoDateToSpanishLabel,
  formatTimeRangeToLabel,
  getTodayIsoDate,
  isValidDecimalPrice,
  isValidEventText,
  isValidIntegerCapacity,
  isValidIsoDate,
  isValidTime24h,
  SAFE_EXTERNAL_LINK_PROPS,
  sanitizeDecimalPriceInput,
  sanitizeEventTextInput,
  sanitizeIntegerInput,
  sanitizeOrganizerEventInput,
} from '../utils/security';

interface OrganizerPortalViewProps {
  events: EventItem[];
  orders: TicketOrder[];
  reconciliation: ReconciliationSummary;
  analytics: AudienceAnalyticsSummary;
  onCreateEvent: (input: CreateNewEventInput) => void;
  onConfirmOrderManually: (orderId: string) => void;
  onCancelOrderManually: (orderId: string) => void;
  onExecuteReconciliation: () => Promise<void>;
  onPreviewEventAsBuyer: (event: EventItem) => void;
}

interface NewEventDraftState {
  title: string;
  category: EventCategory;
  eventDateIso: string;
  startTime: string;
  endTime: string;
  venue: string;
  priceInput: string;
  capacityInput: string;
  description: string;
}

export const OrganizerPortalView: React.FC<OrganizerPortalViewProps> = ({
  events,
  orders,
  reconciliation,
  analytics,
  onCreateEvent,
  onConfirmOrderManually,
  onCancelOrderManually,
  onExecuteReconciliation,
  onPreviewEventAsBuyer,
}) => {
  const [activeTab, setActiveTab] = useState<OrganizerTab>('events');
  const [orderFilter, setOrderFilter] = useState<'all' | OrderCommercialStatus>(
    'all'
  );

  const todayIso = getTodayIsoDate();

  // Modal: Crear Nuevo Evento (con entradas tipadas y restringidas por formato)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [createEventError, setCreateEventError] = useState<string | null>(null);
  const [newEventDraft, setNewEventDraft] = useState<NewEventDraftState>({
    title: '',
    category: 'Música & Fiestas',
    eventDateIso: todayIso,
    startTime: '20:00',
    endTime: '23:30',
    venue: '',
    priceInput: '10.00',
    capacityInput: '150',
    description: '',
  });

  // Modal: Link / QR para Historias de Instagram
  const [shareModalEvent, setShareModalEvent] = useState<EventItem | null>(
    null
  );
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  // Modal: Verificación Manual de Entrada en Puerta
  const [verifiedOrderModal, setVerifiedOrderModal] =
    useState<TicketOrder | null>(null);

  // Estado del botón de Cuadre de Pagos
  const [isReconciling, setIsReconciling] = useState<boolean>(false);
  const [reconcileSuccessBanner, setReconcileSuccessBanner] =
    useState<boolean>(false);

  const handleCopyShareLink = (slug: string) => {
    const shareUrl = `https://veloztix.app/e/${slug}`;
    navigator.clipboard?.writeText(shareUrl).catch(() => {});
    setCopiedSlug(slug);
    window.setTimeout(() => setCopiedSlug(null), 2000);
  };

  const isTitleValid = isValidEventText(newEventDraft.title, 4);
  const isVenueValid = isValidEventText(newEventDraft.venue, 4);
  const isDateValid = isValidIsoDate(newEventDraft.eventDateIso, todayIso);
  const isTimeValid =
    isValidTime24h(newEventDraft.startTime) &&
    isValidTime24h(newEventDraft.endTime);
  const isPriceValid = isValidDecimalPrice(newEventDraft.priceInput, 1, 10000);
  const isCapacityValid = isValidIntegerCapacity(
    newEventDraft.capacityInput,
    10,
    5000
  );
  const isDescriptionValid = isValidEventText(newEventDraft.description, 10);

  const isCreateEventFormValid =
    isTitleValid &&
    isVenueValid &&
    isDateValid &&
    isTimeValid &&
    isPriceValid &&
    isCapacityValid &&
    isDescriptionValid;

  const handleCreateEventSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isTitleValid) {
      setCreateEventError(
        'El nombre del evento debe tener al menos 4 caracteres e incluir letras válidas.'
      );
      return;
    }
    if (!isVenueValid) {
      setCreateEventError(
        'El lugar del evento debe tener al menos 4 caracteres e incluir letras válidas.'
      );
      return;
    }
    if (!isDateValid) {
      setCreateEventError(
        'Selecciona una fecha válida en formato calendario (igual o posterior a hoy).'
      );
      return;
    }
    if (!isTimeValid) {
      setCreateEventError('Selecciona un horario de inicio y cierre válido.');
      return;
    }
    if (!isPriceValid) {
      setCreateEventError(
        'El precio debe ser un monto decimal válido entre $1.00 y $10,000.00 USD.'
      );
      return;
    }
    if (!isCapacityValid) {
      setCreateEventError(
        'El número de participantes (cupos) debe ser un número entero entre 10 y 5000.'
      );
      return;
    }
    if (!isDescriptionValid) {
      setCreateEventError(
        'La descripción debe tener al menos 10 caracteres explicativos.'
      );
      return;
    }

    const sanitized = sanitizeOrganizerEventInput({
      title: newEventDraft.title,
      category: newEventDraft.category,
      dateLabel: formatIsoDateToSpanishLabel(newEventDraft.eventDateIso),
      timeLabel: formatTimeRangeToLabel(
        newEventDraft.startTime,
        newEventDraft.endTime
      ),
      venue: newEventDraft.venue,
      priceUsd: Number(Number(newEventDraft.priceInput).toFixed(2)),
      totalCapacity: parseInt(newEventDraft.capacityInput, 10),
      description: newEventDraft.description,
    });

    onCreateEvent(sanitized);
    setCreateEventError(null);
    setNewEventDraft({
      title: '',
      category: 'Música & Fiestas',
      eventDateIso: todayIso,
      startTime: '20:00',
      endTime: '23:30',
      venue: '',
      priceInput: '10.00',
      capacityInput: '150',
      description: '',
    });
    setIsCreateModalOpen(false);
  };

  const handleRunCuadre = async () => {
    setIsReconciling(true);
    try {
      await onExecuteReconciliation();
      setReconcileSuccessBanner(true);
    } finally {
      setIsReconciling(false);
    }
  };

  const filteredOrders =
    orderFilter === 'all'
      ? orders
      : orders.filter((o) => o.status === orderFilter);

  const statusBadge = (status: OrderCommercialStatus) => {
    if (status === 'paid') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Pagada
        </span>
      );
    }
    if (status === 'pending') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-300">
          <Clock className="h-3.5 w-3.5" />
          Pendiente de pago
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs font-semibold text-zinc-400">
        <XCircle className="h-3.5 w-3.5" />
        Anulada / Reversada
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Cabecera del Portal Organizador */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-zinc-800 bg-zinc-900/90 p-6 sm:p-8">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-violet-400">
              Panel de Gestión Comercial
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
              <Sparkles className="h-3 w-3" />
              Suscripción SaaS Pro Activa · Comisión VelozTix (4.5% +
              $0.20/ticket)
            </span>
          </div>
          <h1 className="mt-1.5 text-2xl font-extrabold text-white sm:text-3xl">
            Portal del Organizador
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Administra tus eventos, revisa tus ventas en vivo y consulta la
            conciliación comercial bajo el esquema 4.5% + $0.20 por entrada.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setCreateEventError(null);
            setIsCreateModalOpen(true);
          }}
          className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-emerald-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-violet-600/25 transition hover:brightness-110"
        >
          <Plus className="h-4 w-4" />
          <span>Crear Nuevo Evento</span>
        </button>
      </div>

      {/* Navegación de las 4 Pestañas Comerciales */}
      <div className="flex gap-2 overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900/80 p-1.5">
        <button
          type="button"
          onClick={() => setActiveTab('events')}
          className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
            activeTab === 'events'
              ? 'bg-white text-zinc-950 shadow-sm'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Ticket className="h-4 w-4" />
          <span>Mis Eventos ({events.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('orders')}
          className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
            activeTab === 'orders'
              ? 'bg-white text-zinc-950 shadow-sm'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Users className="h-4 w-4" />
          <span>Gestión de Compras y Órdenes ({orders.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('reconciliation')}
          className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
            activeTab === 'reconciliation'
              ? 'bg-white text-zinc-950 shadow-sm'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Wallet className="h-4 w-4" />
          <span>Cierre y Conciliación de Pagos</span>
          {reconciliation.pendingCount > 0 && (
            <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-extrabold text-zinc-950">
              {reconciliation.pendingCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('analytics')}
          className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
            activeTab === 'analytics'
              ? 'bg-gradient-to-r from-violet-600 to-emerald-500 text-white shadow-sm'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Sparkles className="h-4 w-4" />
          <span>Analítica de Audiencia (VelozTix Pro)</span>
        </button>
      </div>

      {/* ===================================================================== */}
      {/* PESTAÑA 1: MIS EVENTOS                                                */}
      {/* ===================================================================== */}
      {activeTab === 'events' && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {events.map((ev) => {
            const soldPct = Math.round((ev.soldCount / ev.totalCapacity) * 100);
            const shareLink = `veloztix.app/e/${ev.slug}`;

            return (
              <div
                key={ev.id}
                className="flex flex-col justify-between rounded-3xl border border-zinc-800 bg-zinc-900/85 p-6 shadow-lg"
              >
                <div>
                  <div className="flex items-start gap-4">
                    <EventPosterArt
                      theme={ev.posterTheme}
                      emoji={ev.posterEmoji}
                      category={ev.category}
                      shortDate={ev.shortDateBadge}
                      size="mini"
                    />
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-semibold text-violet-400">
                        {ev.category}
                      </span>
                      <h3 className="truncate text-lg font-bold text-white">
                        {ev.title}
                      </h3>
                      <p className="mt-0.5 text-xs text-zinc-400">
                        {ev.dateLabel} · {ev.venue}
                      </p>
                    </div>
                  </div>

                  {/* Barra Vendidas vs Stock Disponible */}
                  <div className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-zinc-300">
                        {ev.soldCount} vendidas de {ev.totalCapacity}
                      </span>
                      <span className="font-bold text-emerald-400">
                        {ev.availableCount} disponibles
                      </span>
                    </div>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className="h-full bg-gradient-to-r from-violet-500 to-emerald-400 transition-all duration-500"
                        style={{ width: `${soldPct}%` }}
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
                      <span>
                        Entrada:{' '}
                        <strong className="text-white">
                          ${ev.priceUsd.toFixed(2)}
                        </strong>{' '}
                        <span className="text-violet-300">
                          (+ 4.5% + $0.20 por entrada)
                        </span>
                      </span>
                      {ev.reservedCount > 0 && (
                        <span className="text-amber-300">
                          {ev.reservedCount} en proceso de pago
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Link listo para Historias de Instagram */}
                  <div className="mt-4 flex items-center justify-between gap-2 rounded-2xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-xs">
                    <div className="flex min-w-0 items-center gap-2">
                      <Instagram className="h-4 w-4 shrink-0 text-pink-400" />
                      <a
                        href={`https://${shareLink}`}
                        {...SAFE_EXTERNAL_LINK_PROPS}
                        onClick={(e) => {
                          e.preventDefault();
                          onPreviewEventAsBuyer(ev);
                        }}
                        className="truncate font-mono text-zinc-300 hover:text-white"
                      >
                        {shareLink}
                      </a>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopyShareLink(ev.slug)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-zinc-800 px-2.5 py-1 font-semibold text-white hover:bg-zinc-700"
                    >
                      {copiedSlug === ev.slug ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                          <span>Copiado</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          <span>Copiar link</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Botones inferiores */}
                <div className="mt-5 flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShareModalEvent(ev)}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-violet-500/40 bg-violet-500/10 px-4 py-2.5 text-xs font-bold text-violet-200 transition hover:bg-violet-500/20"
                  >
                    <QrCode className="h-4 w-4" />
                    <span>QR para Instagram Story</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onPreviewEventAsBuyer(ev)}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2.5 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800 hover:text-white"
                  >
                    <Eye className="h-4 w-4" />
                    <span>Ver página</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ===================================================================== */}
      {/* PESTAÑA 2: GESTIÓN DE COMPRAS Y ÓRDENES                               */}
      {/* ===================================================================== */}
      {activeTab === 'orders' && (
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-6 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-5">
            <div>
              <h2 className="text-lg font-bold text-white">
                Compras y Órdenes Recientes
              </h2>
              <p className="text-xs text-zinc-400">
                Aquí aparecen al instante las órdenes generadas desde la vista
                del comprador.
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: 'all', label: 'Todas' },
                  { id: 'paid', label: 'Pagadas' },
                  { id: 'pending', label: 'Pendientes' },
                  { id: 'cancelled', label: 'Anuladas' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setOrderFilter(f.id)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                    orderFilter === f.id
                      ? 'bg-violet-600 text-white'
                      : 'border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-zinc-800">
            <table className="w-full min-w-[820px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-950 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  <th className="px-4 py-3.5">ID Orden</th>
                  <th className="px-4 py-3.5">Evento</th>
                  <th className="px-4 py-3.5">Comprador (Datos protegidos)</th>
                  <th className="px-4 py-3.5">Monto</th>
                  <th className="px-4 py-3.5">Estado</th>
                  <th className="px-4 py-3.5 text-right">Acciones rápidas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {filteredOrders.map((ord) => (
                  <tr
                    key={ord.id}
                    className="transition hover:bg-zinc-800/35"
                  >
                    <td className="px-4 py-4 font-mono text-xs font-bold text-white">
                      #{ord.id}
                    </td>

                    <td className="max-w-[230px] px-4 py-4">
                      <p className="truncate font-semibold text-white">
                        {ord.eventTitle}
                      </p>
                      <span className="text-xs text-zinc-400">
                        {ord.quantity}{' '}
                        {ord.quantity === 1 ? 'entrada' : 'entradas'}
                      </span>
                    </td>

                    <td className="px-4 py-4">
                      <p className="font-semibold text-zinc-200">
                        {ord.buyerName}
                      </p>
                      <p className="font-mono text-xs text-zinc-400">
                        {ord.maskedCedula} · {ord.maskedPhone}
                      </p>
                    </td>

                    <td className="px-4 py-4">
                      <span className="block font-bold text-white">
                        ${ord.totalUsd.toFixed(2)}
                      </span>
                      <span className="text-xs text-zinc-400">
                        Bs.{' '}
                        {ord.totalBs.toLocaleString('es-VE', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </td>

                    <td className="px-4 py-4">{statusBadge(ord.status)}</td>

                    <td className="px-4 py-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        {ord.status === 'paid' && (
                          <button
                            type="button"
                            onClick={() => setVerifiedOrderModal(ord)}
                            className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20"
                          >
                            Verificar entrada
                          </button>
                        )}

                        {ord.status === 'pending' && (
                          <button
                            type="button"
                            onClick={() => onConfirmOrderManually(ord.id)}
                            className="rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-bold text-zinc-950 hover:bg-emerald-400"
                          >
                            Confirmar pago
                          </button>
                        )}

                        {ord.status !== 'cancelled' && (
                          <button
                            type="button"
                            onClick={() => onCancelOrderManually(ord.id)}
                            className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-rose-500/40 hover:text-rose-300"
                          >
                            Anular
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* PESTAÑA 3: CIERRE Y CONCILIACIÓN DE PAGOS                             */}
      {/* ===================================================================== */}
      {activeTab === 'reconciliation' && (
        <div className="space-y-6">
          {/* Tarjetas de Resumen Financiero del Organizador */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-6">
              <div className="flex items-center justify-between text-xs font-semibold text-zinc-400">
                <span>Total Recaudado (Pago Móvil)</span>
                <DollarSign className="h-4 w-4 text-violet-400" />
              </div>
              <p className="mt-3 text-3xl font-extrabold text-white">
                ${reconciliation.grossUsd.toFixed(2)}
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                Bs.{' '}
                {reconciliation.grossBs.toLocaleString('es-VE', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{' '}
                · Monto bruto entradas: $
                {reconciliation.subtotalTicketsUsd.toFixed(2)} (
                {reconciliation.reconciledTicketsCount} tickets)
              </p>
            </div>

            <div className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-6">
              <div className="flex items-center justify-between text-xs font-semibold text-zinc-400">
                <span>Comisión VelozTix (4.5% + $0.20/ticket)</span>
                <Ticket className="h-4 w-4 text-violet-400" />
              </div>
              <p className="mt-3 text-3xl font-extrabold text-violet-300">
                -${reconciliation.veloztixTotalCommissionUsd.toFixed(2)}
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                Esquema 4.5% + $0.20/ticket ($
                {reconciliation.veloztixPercentageFeeUsd.toFixed(2)} + $
                {reconciliation.veloztixFlatFeeUsd.toFixed(2)})
              </p>
            </div>

            <div className="rounded-3xl border border-emerald-500/35 bg-gradient-to-br from-emerald-950/30 to-zinc-900 p-6">
              <div className="flex items-center justify-between text-xs font-semibold text-emerald-300">
                <span>Monto Neto a Liquidar al Organizador</span>
                <Wallet className="h-4 w-4 text-emerald-400" />
              </div>
              <p className="mt-3 text-3xl font-extrabold text-emerald-400">
                ${reconciliation.netOrganizerUsd.toFixed(2)}
              </p>
              <p className="mt-1 text-xs text-zinc-300">
                Total Recaudado (${reconciliation.grossUsd.toFixed(2)}) −
                Comisión Total VelozTix ($
                {reconciliation.veloztixTotalCommissionUsd.toFixed(2)})
              </p>
            </div>
          </div>

          {/* Panel de Cuadre de Pagos */}
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-6 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-5">
              <div>
                <h2 className="text-lg font-bold text-white">
                  Cuadre de Pagos Móviles vs. Entradas Emitidas
                </h2>
                <p className="mt-0.5 text-xs text-zinc-400">
                  Compara cada Pago Móvil recibido contra las entradas entregadas
                  aplicando la Comisión VelozTix (4.5% + $0.20/ticket).
                </p>
              </div>

              <button
                type="button"
                disabled={isReconciling}
                onClick={handleRunCuadre}
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-extrabold text-zinc-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400 disabled:opacity-60"
              >
                <RefreshCw
                  className={`h-4 w-4 ${isReconciling ? 'animate-spin' : ''}`}
                />
                <span>Ejecutar Cuadre de Pagos</span>
              </button>
            </div>

            {/* Estado Visual del Cuadre */}
            {reconciliation.allMatched || reconcileSuccessBanner ? (
              <div className="mt-5 flex items-center gap-3 rounded-2xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-3.5 text-sm text-emerald-200">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                <span>
                  <strong>¡Cierre cuadrado al 100%!</strong> Todas las órdenes
                  cobradas por Pago Móvil coinciden con las entradas emitidas
                  aplicando la Comisión VelozTix (4.5% + $0.20/ticket).
                </span>
              </div>
            ) : (
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/35 bg-amber-500/10 px-4 py-3.5 text-sm text-amber-200">
                <span>
                  Hay{' '}
                  <strong>
                    {reconciliation.pendingCount} pago recibido
                  </strong>{' '}
                  pendiente por emitir su entrada. Haz clic en{' '}
                  <strong>Ejecutar Cuadre de Pagos</strong> para resolverlo
                  automáticamente.
                </span>
              </div>
            )}

            {/* Tabla limpia de órdenes conciliadas */}
            <div className="mt-5 overflow-x-auto rounded-2xl border border-zinc-800">
              <table className="w-full min-w-[880px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-950 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    <th className="px-4 py-3.5">Orden</th>
                    <th className="px-4 py-3.5">Evento &amp; Comprador</th>
                    <th className="px-4 py-3.5">Total Recaudado</th>
                    <th className="px-4 py-3.5">
                      Comisión VelozTix (4.5% + $0.20/ticket)
                    </th>
                    <th className="px-4 py-3.5">Monto Neto a Liquidar</th>
                    <th className="px-4 py-3.5 text-right">
                      Estado del Cuadre
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80">
                  {reconciliation.rows.map((row) => (
                    <tr key={row.id} className="hover:bg-zinc-800/30">
                      <td className="px-4 py-3.5">
                        <span className="block font-mono text-xs font-bold text-white">
                          #{row.orderId}
                        </span>
                        <span className="font-mono text-[11px] text-zinc-500">
                          {row.paymentRef}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-white">
                          {row.eventTitle}
                        </p>
                        <p className="text-xs text-zinc-400">
                          {row.buyerDisplay} · {row.quantity}{' '}
                          {row.quantity === 1 ? 'entrada' : 'entradas'} ($
                          {row.subtotalTicketsUsd.toFixed(2)} bruto)
                        </p>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="block font-bold text-white">
                          ${row.amountUsd.toFixed(2)}
                        </span>
                        <span className="text-xs text-zinc-400">
                          Bs. {row.amountBs.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="block font-bold text-violet-300">
                          -${row.veloztixCommissionUsd.toFixed(2)}
                        </span>
                        <span className="text-[11px] text-zinc-400">
                          ${row.percentageFeeUsd.toFixed(2)} + $
                          {row.flatFeeUsd.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 font-extrabold text-emerald-400">
                        ${row.netOrganizerUsd.toFixed(2)}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {row.state === 'matched' ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Cuadrada
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={handleRunCuadre}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-3 py-1.5 text-xs font-bold text-zinc-950 hover:bg-amber-300"
                          >
                            Resolver y emitir entrada
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* PESTAÑA 4: ANALÍTICA DE AUDIENCIA (VELOZTIX PRO)                      */}
      {/* ===================================================================== */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          {/* Banner de Suscripción SaaS Pro */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-violet-500/35 bg-gradient-to-r from-violet-950/45 via-zinc-900 to-emerald-950/30 p-5 sm:px-6">
            <div className="flex items-center gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-500/20 text-emerald-400">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">
                  Suscripción Organizadora VelozTix Pro (SaaS Activo)
                </h2>
                <p className="mt-0.5 text-xs text-zinc-300">
                  Accede a inteligencia de audiencia en vivo y protección
                  anti-reventa bajo nuestro esquema de comisión mixta:{' '}
                  <strong className="text-emerald-400">
                    4.5% + $0.20 USD por entrada
                  </strong>
                  .
                </p>
              </div>
            </div>
            <span className="rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-3.5 py-1.5 text-xs font-bold text-emerald-300">
              Plan Pro Habilitado
            </span>
          </div>

          {/* 4 Tarjetas Comerciales Simples y Claras */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-5">
              <div className="flex items-center justify-between text-xs font-semibold text-zinc-400">
                <span>Visitas al evento</span>
                <Eye className="h-4 w-4 text-violet-400" />
              </div>
              <p className="mt-3 text-3xl font-extrabold text-white">
                {analytics.totalViews.toLocaleString('es-VE')}
              </p>
              <p className="mt-1 text-xs text-emerald-400">
                82% desde historias de Instagram
              </p>
            </div>

            <div className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-5">
              <div className="flex items-center justify-between text-xs font-semibold text-zinc-400">
                <span>Tasa de conversión de compra</span>
                <TrendingUp className="h-4 w-4 text-emerald-400" />
              </div>
              <p className="mt-3 text-3xl font-extrabold text-emerald-400">
                {analytics.conversionRatePct}%
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                {analytics.totalTicketsSold} entradas vendidas en total
              </p>
            </div>

            <div className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-5">
              <div className="flex items-center justify-between text-xs font-semibold text-zinc-400">
                <span>Perfiles de compradores</span>
                <BarChart3 className="h-4 w-4 text-violet-400" />
              </div>
              <p className="mt-3 text-2xl font-extrabold text-white">
                {analytics.directFansPct}% Fans directos
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                {analytics.indecisiveBuyersPct}% Compradores indecisos
              </p>
            </div>

            <div className="rounded-3xl border border-violet-500/35 bg-gradient-to-br from-violet-950/35 to-zinc-900 p-5">
              <div className="flex items-center justify-between text-xs font-semibold text-violet-300">
                <span>Reventa / Bots bloqueados</span>
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
              </div>
              <p className="mt-3 text-3xl font-extrabold text-white">
                {analytics.blockedBotsCount}
              </p>
              <p className="mt-1 text-xs text-emerald-300">
                {analytics.protectedTicketsCount} entradas protegidas para fans
              </p>
            </div>
          </div>

          {/* Detalle Visual de Comportamiento de Audiencia */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-6">
              <h3 className="text-lg font-bold text-white">
                ¿Cómo compran tus asistentes?
              </h3>
              <p className="mt-1 text-xs text-zinc-400">
                Inteligencia comercial de VelozTix Pro para ayudarte a vender
                todo tu aforo más rápido.
              </p>

              <div className="mt-6 space-y-5">
                <div>
                  <div className="flex justify-between text-sm">
                    <span className="font-semibold text-white">
                      Fans directos (compran en menos de 1 minuto)
                    </span>
                    <span className="font-bold text-emerald-400">
                      {analytics.directFansPct}%
                    </span>
                  </div>
                  <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-emerald-400"
                      style={{ width: `${analytics.directFansPct}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-zinc-400">
                    Abren tu link desde Instagram y completan el Pago Móvil de
                    inmediato.
                  </p>
                </div>

                <div>
                  <div className="flex justify-between text-sm">
                    <span className="font-semibold text-white">
                      Compradores indecisos (comparan precio o consultan con
                      amigos)
                    </span>
                    <span className="font-bold text-violet-400">
                      {analytics.indecisiveBuyersPct}%
                    </span>
                  </div>
                  <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-violet-500"
                      style={{ width: `${analytics.indecisiveBuyersPct}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-zinc-400">
                    Revisan varias veces la página antes de decidir la cantidad
                    de entradas.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col justify-between rounded-3xl border border-zinc-800 bg-zinc-900/90 p-6">
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-violet-500/15 px-3 py-1 text-xs font-semibold text-violet-300">
                  <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                  Sugerencias Comerciales VelozTix Pro
                </div>
                <h3 className="mt-3 text-lg font-bold text-white">
                  Oportunidades para impulsar tus ventas
                </h3>

                <ul className="mt-4 space-y-3 text-sm text-zinc-300">
                  <li className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3.5">
                    <strong className="text-white">
                      Horario estelar de compra:
                    </strong>{' '}
                    La mayoría de tus entradas se venden entre las{' '}
                    <span className="font-semibold text-emerald-400">
                      7:30 PM y 10:00 PM
                    </span>
                    . Publica tus recordatorios de historia en esa franja.
                  </li>
                  <li className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3.5">
                    <strong className="text-white">Impulso a grupos:</strong> El{' '}
                    {analytics.indecisiveBuyersPct}% de tu audiencia pausa al
                    elegir más de 2 entradas. Activar una promoción grupal 4x3
                    puede acelerar el sold-out.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: CREAR NUEVO EVENTO (CON RESTRICCIÓN Y VALIDACIÓN POR CAMPO)    */}
      {/* ===================================================================== */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl sm:p-8">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-extrabold text-white">
                Publicar Nuevo Evento
              </h2>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="rounded-xl p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {createEventError && (
              <div className="mt-4 rounded-2xl border border-rose-500/40 bg-rose-950/50 p-3.5 text-xs text-rose-200">
                {createEventError}
              </div>
            )}

            <form
              onSubmit={handleCreateEventSubmit}
              noValidate
              className="mt-5 space-y-4"
            >
              {/* Nombre del evento */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="block text-xs font-semibold text-zinc-300">
                    Nombre del evento
                  </label>
                  <span className="text-[11px] text-zinc-500">
                    Mín. 4 caracteres (letras)
                  </span>
                </div>
                <input
                  type="text"
                  required
                  maxLength={90}
                  placeholder="Ej. Indie Acoustic Night UCAB"
                  value={newEventDraft.title}
                  onChange={(e) => {
                    setCreateEventError(null);
                    setNewEventDraft({
                      ...newEventDraft,
                      title: sanitizeEventTextInput(e.target.value, 90),
                    });
                  }}
                  className={`w-full rounded-xl border bg-zinc-950 px-4 py-2.5 text-sm text-white focus:outline-none ${
                    newEventDraft.title.length > 0 && !isTitleValid
                      ? 'border-amber-500/60 focus:border-amber-400'
                      : 'border-zinc-700 focus:border-violet-500'
                  }`}
                />
              </div>

              {/* Categoría y Lugar */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-300">
                    Categoría
                  </label>
                  <select
                    value={newEventDraft.category}
                    onChange={(e) =>
                      setNewEventDraft({
                        ...newEventDraft,
                        category: e.target.value as EventCategory,
                      })
                    }
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white focus:border-violet-500 focus:outline-none"
                  >
                    <option value="Música & Fiestas">
                      Música &amp; Fiestas
                    </option>
                    <option value="Gaming & Tech">Gaming &amp; Tech</option>
                    <option value="Comedia & Cultura">
                      Comedia &amp; Cultura
                    </option>
                  </select>
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="block text-xs font-semibold text-zinc-300">
                      Lugar
                    </label>
                    <span className="text-[11px] text-zinc-500">
                      Ubicación / Recinto
                    </span>
                  </div>
                  <input
                    type="text"
                    required
                    maxLength={90}
                    placeholder="Ej. Terraza Las Mercedes"
                    value={newEventDraft.venue}
                    onChange={(e) => {
                      setCreateEventError(null);
                      setNewEventDraft({
                        ...newEventDraft,
                        venue: sanitizeEventTextInput(e.target.value, 90),
                      });
                    }}
                    className={`w-full rounded-xl border bg-zinc-950 px-4 py-2.5 text-sm text-white focus:outline-none ${
                      newEventDraft.venue.length > 0 && !isVenueValid
                        ? 'border-amber-500/60 focus:border-amber-400'
                        : 'border-zinc-700 focus:border-violet-500'
                    }`}
                  />
                </div>
              </div>

              {/* Fecha (Formato Fecha Calendario) y Horario (Formato Hora) */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="block text-xs font-semibold text-zinc-300">
                      Fecha del evento
                    </label>
                    <span className="text-[11px] text-zinc-500">
                      Formato fecha
                    </span>
                  </div>
                  <input
                    type="date"
                    required
                    min={todayIso}
                    value={newEventDraft.eventDateIso}
                    onChange={(e) => {
                      setCreateEventError(null);
                      setNewEventDraft({
                        ...newEventDraft,
                        eventDateIso: e.target.value,
                      });
                    }}
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-2.5 text-sm text-white [color-scheme:dark] focus:border-violet-500 focus:outline-none"
                  />
                  {isDateValid && (
                    <p className="mt-1 text-[11px] text-emerald-400">
                      {formatIsoDateToSpanishLabel(newEventDraft.eventDateIso)}
                    </p>
                  )}
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="block text-xs font-semibold text-zinc-300">
                      Horario (Inicio – Fin)
                    </label>
                    <span className="text-[11px] text-zinc-500">
                      Formato hora
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="time"
                      aria-label="Hora de inicio"
                      required
                      value={newEventDraft.startTime}
                      onChange={(e) => {
                        setCreateEventError(null);
                        setNewEventDraft({
                          ...newEventDraft,
                          startTime: e.target.value,
                        });
                      }}
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-2.5 py-2.5 text-xs text-white [color-scheme:dark] focus:border-violet-500 focus:outline-none"
                    />
                    <input
                      type="time"
                      aria-label="Hora de cierre"
                      required
                      value={newEventDraft.endTime}
                      onChange={(e) => {
                        setCreateEventError(null);
                        setNewEventDraft({
                          ...newEventDraft,
                          endTime: e.target.value,
                        });
                      }}
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-2.5 py-2.5 text-xs text-white [color-scheme:dark] focus:border-violet-500 focus:outline-none"
                    />
                  </div>
                  {isTimeValid && (
                    <p className="mt-1 text-[11px] text-zinc-400">
                      {formatTimeRangeToLabel(
                        newEventDraft.startTime,
                        newEventDraft.endTime
                      )}
                    </p>
                  )}
                </div>
              </div>

              {/* Precio Entrada (Decimal) y Número de Participantes / Cupos (Entero) */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="block text-xs font-semibold text-zinc-300">
                      Precio Entrada (USD)
                    </label>
                    <span className="text-[11px] text-zinc-500">
                      Decimal (ej. 12.50)
                    </span>
                  </div>
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    placeholder="10.00"
                    value={newEventDraft.priceInput}
                    onChange={(e) => {
                      setCreateEventError(null);
                      setNewEventDraft({
                        ...newEventDraft,
                        priceInput: sanitizeDecimalPriceInput(e.target.value),
                      });
                    }}
                    className={`w-full rounded-xl border bg-zinc-950 px-4 py-2.5 text-sm text-white focus:outline-none ${
                      newEventDraft.priceInput.length > 0 && !isPriceValid
                        ? 'border-amber-500/60 focus:border-amber-400'
                        : 'border-zinc-700 focus:border-violet-500'
                    }`}
                  />
                  {!isPriceValid && (
                    <p className="mt-1 text-[11px] text-amber-400">
                      Ingresa un decimal válido ($1.00 – $10,000.00).
                    </p>
                  )}
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="block text-xs font-semibold text-zinc-300">
                      Número de participantes (Cupos)
                    </label>
                    <span className="text-[11px] text-zinc-500">
                      Entero (10 – 5000)
                    </span>
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    required
                    placeholder="150"
                    value={newEventDraft.capacityInput}
                    onChange={(e) => {
                      setCreateEventError(null);
                      setNewEventDraft({
                        ...newEventDraft,
                        capacityInput: sanitizeIntegerInput(e.target.value, 4),
                      });
                    }}
                    className={`w-full rounded-xl border bg-zinc-950 px-4 py-2.5 text-sm text-white focus:outline-none ${
                      newEventDraft.capacityInput.length > 0 && !isCapacityValid
                        ? 'border-amber-500/60 focus:border-amber-400'
                        : 'border-zinc-700 focus:border-violet-500'
                    }`}
                  />
                  {!isCapacityValid && (
                    <p className="mt-1 text-[11px] text-amber-400">
                      Solo números enteros entre 10 y 5000 (sin decimales).
                    </p>
                  )}
                </div>
              </div>

              {/* Descripción del evento */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="block text-xs font-semibold text-zinc-300">
                    Descripción del evento
                  </label>
                  <span className="text-[11px] text-zinc-500">
                    Mín. 10 caracteres
                  </span>
                </div>
                <textarea
                  rows={3}
                  required
                  maxLength={350}
                  placeholder="Cuéntale a tus asistentes qué incluye la entrada..."
                  value={newEventDraft.description}
                  onChange={(e) => {
                    setCreateEventError(null);
                    setNewEventDraft({
                      ...newEventDraft,
                      description: sanitizeEventTextInput(e.target.value, 350),
                    });
                  }}
                  className={`w-full rounded-xl border bg-zinc-950 px-4 py-2.5 text-sm text-white focus:outline-none ${
                    newEventDraft.description.length > 0 && !isDescriptionValid
                      ? 'border-amber-500/60 focus:border-amber-400'
                      : 'border-zinc-700 focus:border-violet-500'
                  }`}
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="rounded-xl border border-zinc-700 px-4 py-2.5 text-sm font-semibold text-zinc-300 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!isCreateEventFormValid}
                  className="rounded-xl bg-gradient-to-r from-violet-600 to-emerald-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Publicar en Cartelera
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: QR PARA HISTORIAS DE INSTAGRAM                                 */}
      {/* ===================================================================== */}
      {shareModalEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-zinc-800 bg-zinc-900 p-6 text-center shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-pink-400">
                <Instagram className="h-4 w-4" />
                Kit para Instagram Stories
              </span>
              <button
                type="button"
                onClick={() => setShareModalEvent(null)}
                className="rounded-xl p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <h3 className="mt-3 text-lg font-extrabold text-white">
              {shareModalEvent.title}
            </h3>
            <p className="mt-1 text-xs text-zinc-400">
              Comparte este código QR en tus historias o afiches para recibir
              compras directas con Pago Móvil.
            </p>

            <div className="mx-auto mt-5 inline-block rounded-3xl bg-white p-4 shadow-xl">
              <QRCodeSVG
                value={`https://veloztix.app/e/${shareModalEvent.slug}`}
                size={184}
                level="M"
              />
            </div>

            <button
              type="button"
              onClick={() => handleCopyShareLink(shareModalEvent.slug)}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-bold text-white hover:bg-violet-500"
            >
              <Copy className="h-4 w-4" />
              <span>
                {copiedSlug === shareModalEvent.slug
                  ? '¡Enlace copiado!'
                  : 'Copiar enlace de venta'}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: VERIFICAR ENTRADA EN PUERTA                                    */}
      {/* ===================================================================== */}
      {verifiedOrderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-emerald-500/40 bg-zinc-900 p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h3 className="mt-3 text-lg font-extrabold text-white">
              Entrada Válida en Puerta
            </h3>
            <p className="mt-1 text-xs text-zinc-400">
              Orden #{verifiedOrderModal.id} · {verifiedOrderModal.eventTitle}
            </p>

            <div className="mt-4 space-y-1.5 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-left text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-400">Asistente:</span>
                <span className="font-bold text-white">
                  {verifiedOrderModal.buyerName}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Documento protegido:</span>
                <span className="font-mono text-emerald-300">
                  {verifiedOrderModal.maskedCedula}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Cantidad autorizada:</span>
                <span className="font-bold text-white">
                  {verifiedOrderModal.quantity}{' '}
                  {verifiedOrderModal.quantity === 1 ? 'persona' : 'personas'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setVerifiedOrderModal(null)}
              className="mt-5 w-full rounded-2xl bg-emerald-500 py-3 text-sm font-extrabold text-zinc-950 hover:bg-emerald-400"
            >
              Cerrar verificación
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  MapPin,
  Minus,
  Plus,
  Search,
  Sparkles,
  Ticket,
  Users,
} from 'lucide-react';
import {
  calculateVelozTixPricing,
  EventCategory,
  EventItem,
} from '../types/veloztix';
import { EventPosterArt } from '../components/EventPosterArt';

interface CatalogViewProps {
  events: EventItem[];
  selectedEvent: EventItem | null;
  ticketQty: number;
  onSelectEvent: (event: EventItem) => void;
  onBackToBillboard: () => void;
  onChangeQty: (qty: number) => void;
  onBuyTickets: () => void;
  noticeMessage: string | null;
  onDismissNotice: () => void;
}

const CATEGORIES: ('Todos' | EventCategory)[] = [
  'Todos',
  'Música & Fiestas',
  'Gaming & Tech',
  'Comedia & Cultura',
];

export const CatalogView: React.FC<CatalogViewProps> = ({
  events,
  selectedEvent,
  ticketQty,
  onSelectEvent,
  onBackToBillboard,
  onChangeQty,
  onBuyTickets,
  noticeMessage,
  onDismissNotice,
}) => {
  const [activeCategory, setActiveCategory] = useState<'Todos' | EventCategory>(
    'Todos'
  );
  const [searchQuery, setSearchQuery] = useState<string>('');

  // ==========================================================================
  // MODO DETALLE DEL EVENTO
  // ==========================================================================
  if (selectedEvent) {
    const pricing = calculateVelozTixPricing(
      selectedEvent.priceUsd,
      ticketQty
    );

    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={onBackToBillboard}
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-zinc-700 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Volver a eventos</span>
        </button>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Columna Izquierda: Póster e Información del Evento */}
          <div className="space-y-6 lg:col-span-7">
            <div className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/70 shadow-2xl">
              <EventPosterArt
                theme={selectedEvent.posterTheme}
                emoji={selectedEvent.posterEmoji}
                category={selectedEvent.category}
                shortDate={selectedEvent.shortDateBadge}
                size="hero"
              />

              <div className="p-6 sm:p-8">
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                  Presentado por {selectedEvent.organizerName} ({selectedEvent.instagramHandle})
                </p>
                <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                  {selectedEvent.title}
                </h1>
                <p className="mt-2 text-base text-zinc-300">
                  {selectedEvent.tagline}
                </p>

                <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-zinc-800/90 bg-zinc-950/70 p-3.5">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-400">
                      <Calendar className="h-4 w-4 text-violet-400" />
                      Fecha
                    </div>
                    <p className="mt-1 text-sm font-semibold text-white">
                      {selectedEvent.dateLabel}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-zinc-800/90 bg-zinc-950/70 p-3.5">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-400">
                      <Clock className="h-4 w-4 text-emerald-400" />
                      Horario
                    </div>
                    <p className="mt-1 text-sm font-semibold text-white">
                      {selectedEvent.timeLabel}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-zinc-800/90 bg-zinc-950/70 p-3.5">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-400">
                      <MapPin className="h-4 w-4 text-violet-400" />
                      Ubicación
                    </div>
                    <p className="mt-1 text-sm font-semibold text-white">
                      {selectedEvent.venue}
                    </p>
                  </div>
                </div>

                <div className="mt-6 border-t border-zinc-800 pt-6">
                  <h2 className="text-base font-bold text-white">
                    Acerca del evento
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-300">
                    {selectedEvent.description}
                  </p>

                  <ul className="mt-4 space-y-2">
                    {selectedEvent.highlights.map((item, idx) => (
                      <li
                        key={idx}
                        className="flex items-center gap-2.5 text-sm text-zinc-300"
                      >
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Columna Derecha: Selector Comercial de Entradas */}
          <div className="lg:col-span-5">
            <div className="sticky top-24 rounded-3xl border border-zinc-800 bg-zinc-900/95 p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-3 border-b border-zinc-800 pb-5">
                <div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
                    <Users className="h-3.5 w-3.5" />
                    {selectedEvent.availableCount} cupos disponibles
                  </span>
                  <h2 className="mt-2 text-xl font-bold text-white">
                    Entrada General
                  </h2>
                </div>
                <div className="text-right">
                  <span className="block text-2xl font-extrabold text-white">
                    ${selectedEvent.priceUsd.toFixed(2)}
                  </span>
                  <span className="text-xs font-medium text-zinc-400">
                    Bs. {selectedEvent.priceBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Selector de Cantidad */}
              <div className="mt-5 flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                <div>
                  <p className="text-sm font-semibold text-white">Cantidad</p>
                  <p className="text-xs text-zinc-400">
                    Máximo {selectedEvent.maxPerOrder} entradas por compra
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={ticketQty <= 1}
                    onClick={() => onChangeQty(Math.max(1, ticketQty - 1))}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900 text-white transition hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Restar entrada"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-8 text-center text-lg font-extrabold text-white">
                    {ticketQty}
                  </span>
                  <button
                    type="button"
                    disabled={
                      ticketQty >= selectedEvent.maxPerOrder ||
                      ticketQty >= selectedEvent.availableCount
                    }
                    onClick={() =>
                      onChangeQty(
                        Math.min(
                          selectedEvent.maxPerOrder,
                          selectedEvent.availableCount,
                          ticketQty + 1
                        )
                      )
                    }
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-500/50 bg-violet-600/20 text-white transition hover:bg-violet-600/40 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Sumar entrada"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Resumen Limpio de Total */}
              <div className="mt-5 space-y-2 rounded-2xl bg-zinc-950/70 p-4">
                <div className="flex justify-between text-sm text-zinc-400">
                  <span>
                    {ticketQty}{' '}
                    {ticketQty === 1 ? 'Entrada General' : 'Entradas Generales'}
                  </span>
                  <span className="font-medium text-zinc-200">
                    ${pricing.subtotalUsd.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between gap-3 text-sm text-zinc-400">
                  <span>Tarifa de servicio VelozTix: 4.5% + $0.20 por entrada</span>
                  <span className="shrink-0 font-medium text-zinc-200">
                    ${pricing.totalCommissionUsd.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between border-t border-zinc-800 pt-3">
                  <span className="text-base font-bold text-white">Total a pagar</span>
                  <div className="text-right">
                    <span className="block text-xl font-extrabold text-emerald-400">
                      Bs.{' '}
                      {pricing.totalBs.toLocaleString('es-VE', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                    <span className="text-xs text-zinc-400">
                      Ref. ${pricing.totalUsd.toFixed(2)} USD
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                disabled={selectedEvent.availableCount < 1}
                onClick={onBuyTickets}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-emerald-500 px-6 py-4 text-base font-bold text-white shadow-lg shadow-violet-600/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Ticket className="h-5 w-5" />
                <span>Comprar Entradas</span>
              </button>

              <p className="mt-3 text-center text-xs text-zinc-500">
                Tarifa de servicio VelozTix: 4.5% + $0.20 por entrada · Pago Móvil instantáneo
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // MODO CARTELERA DE EVENTOS
  // ==========================================================================
  const filteredEvents = events.filter((ev) => {
    const matchesCat =
      activeCategory === 'Todos' || ev.category === activeCategory;
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      ev.title.toLowerCase().includes(q) ||
      ev.venue.toLowerCase().includes(q) ||
      ev.organizerName.toLowerCase().includes(q);
    return matchesCat && matchesSearch;
  });

  return (
    <div className="space-y-8">
      {/* Aviso amigable si viene de cancelar/expirar una orden */}
      {noticeMessage && (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-3.5 text-sm text-amber-200">
          <span>{noticeMessage}</span>
          <button
            type="button"
            onClick={onDismissNotice}
            className="rounded-lg px-2.5 py-1 text-xs font-semibold text-amber-300 hover:bg-amber-500/20"
          >
            Entendido
          </button>
        </div>
      )}

      {/* Hero Comercial */}
      <div className="relative overflow-hidden rounded-3xl border border-zinc-800/90 bg-gradient-to-br from-zinc-900 via-violet-950/35 to-zinc-950 p-6 sm:p-10">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-300">
            <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
            Cartelera Destacada · Caracas
          </span>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Tus planes favoritos,{' '}
            <span className="bg-gradient-to-r from-violet-400 to-emerald-400 bg-clip-text text-transparent">
              sin filas ni capturas
            </span>
          </h1>
          <p className="mt-2.5 text-sm leading-relaxed text-zinc-300 sm:text-base">
            Reserva tu cupo desde Instagram o la web, paga con Pago Móvil mediante QR
            dinámico y presenta tu entrada digital directo en puerta.
          </p>
        </div>

        {/* Barra de Filtros y Búsqueda */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                  activeCategory === cat
                    ? 'bg-white text-zinc-950 shadow-sm'
                    : 'border border-zinc-800 bg-zinc-900/80 text-zinc-300 hover:border-zinc-700 hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar evento o lugar..."
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950/90 py-2 pl-10 pr-4 text-sm text-white placeholder-zinc-500 focus:border-violet-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Grid de Tarjetas de Eventos */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {filteredEvents.map((event) => (
          <article
            key={event.id}
            onClick={() => onSelectEvent(event)}
            className="group flex cursor-pointer flex-col overflow-hidden rounded-3xl border border-zinc-800/90 bg-zinc-900/75 transition duration-300 hover:-translate-y-1 hover:border-violet-500/50 hover:shadow-2xl hover:shadow-violet-950/30"
          >
            <EventPosterArt
              theme={event.posterTheme}
              emoji={event.posterEmoji}
              category={event.category}
              shortDate={event.shortDateBadge}
            />

            <div className="flex flex-1 flex-col justify-between p-6">
              <div>
                <div className="flex items-center gap-2 text-xs font-medium text-zinc-400">
                  <span>{event.dateLabel}</span>
                  <span>•</span>
                  <span>{event.timeLabel}</span>
                </div>

                <h2 className="mt-1.5 text-xl font-bold text-white transition group-hover:text-emerald-300">
                  {event.title}
                </h2>

                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-zinc-400">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-violet-400" />
                  <span>{event.venue}</span>
                </p>

                <p className="mt-3 line-clamp-2 text-sm text-zinc-300">
                  {event.tagline}
                </p>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-zinc-800/80 pt-4">
                <div>
                  <span className="text-xs text-zinc-400">Entrada desde</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-extrabold text-white">
                      ${event.priceUsd.toFixed(2)}
                    </span>
                    <span className="text-xs font-medium text-zinc-400">
                      / Bs. {event.priceBs.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                    {event.availableCount} disponibles
                  </span>
                  <span className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-bold text-white transition group-hover:bg-violet-500">
                    Ver evento
                  </span>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};

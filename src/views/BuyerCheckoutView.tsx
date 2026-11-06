import React, { useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Lock,
  MapPin,
  QrCode,
  Smartphone,
} from 'lucide-react';
import {
  BuyerCheckoutForm,
  calculateVelozTixPricing,
  EventItem,
} from '../types/veloztix';
import { EventPosterArt } from '../components/EventPosterArt';
import { maskCedula } from '../utils/privacyCrypto';

interface BuyerCheckoutViewProps {
  event: EventItem;
  quantity: number;
  form: BuyerCheckoutForm;
  onChangeForm: (next: BuyerCheckoutForm) => void;
  onFieldFocus: () => void;
  onFieldKeyDown: (key: string) => void;
  onFieldPaste: () => void;
  onBack: () => void;
  onGenerateOrder: () => void;
  isSubmitting: boolean;
  errorMessage: string | null;
}

export const BuyerCheckoutView: React.FC<BuyerCheckoutViewProps> = ({
  event,
  quantity,
  form,
  onChangeForm,
  onFieldFocus,
  onFieldKeyDown,
  onFieldPaste,
  onBack,
  onGenerateOrder,
  isSubmitting,
  errorMessage,
}) => {
  const [validationError, setValidationError] = useState<string | null>(null);

  const pricing = calculateVelozTixPricing(event.priceUsd, quantity);

  const maskedPreview = form.cedulaDigits
    ? maskCedula(form.docPrefix, form.cedulaDigits)
    : 'V-**.*45.892';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.fullName.trim().length < 3) {
      setValidationError('Por favor ingresa tu nombre y apellido.');
      return;
    }
    if (form.cedulaDigits.replace(/\D/g, '').length < 6) {
      setValidationError('Ingresa un número de cédula válido.');
      return;
    }
    if (form.phoneDigits.replace(/\D/g, '').length !== 7) {
      setValidationError('Ingresa los 7 dígitos de tu teléfono móvil.');
      return;
    }
    if (!form.email.includes('@') || !form.email.includes('.')) {
      setValidationError('Ingresa un correo electrónico válido para recibir tu entrada.');
      return;
    }

    setValidationError(null);
    onGenerateOrder();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Navegación y Progreso Comercial */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-zinc-700 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Volver al evento</span>
        </button>

        <div className="flex items-center gap-2 text-xs font-semibold">
          <span className="rounded-full bg-violet-600 px-3 py-1 text-white">
            Paso 1: Datos del Asistente
          </span>
          <span className="text-zinc-600">→</span>
          <span className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-zinc-500">
            Paso 2: Pago Móvil
          </span>
          <span className="text-zinc-600">→</span>
          <span className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-zinc-500">
            Paso 3: Tu Entrada
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Formulario Principal (7 columnas) */}
        <form onSubmit={handleSubmit} className="space-y-6 lg:col-span-7">
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-6 sm:p-8 shadow-xl">
            <h1 className="text-2xl font-extrabold text-white">
              Datos del Asistente
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Completa tus datos para reservar tus entradas y recibir tu código de acceso.
            </p>

            {(validationError || errorMessage) && (
              <div className="mt-4 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {validationError || errorMessage}
              </div>
            )}

            <div className="mt-6 space-y-4">
              {/* Nombre y Apellido */}
              <div>
                <label
                  htmlFor="buyer-name"
                  className="mb-1.5 block text-sm font-semibold text-zinc-200"
                >
                  Nombre y apellido
                </label>
                <input
                  id="buyer-name"
                  type="text"
                  placeholder="Ej. Valentina Morales"
                  value={form.fullName}
                  onFocus={onFieldFocus}
                  onKeyDown={(e) => onFieldKeyDown(e.key)}
                  onPaste={onFieldPaste}
                  onChange={(e) =>
                    onChangeForm({ ...form, fullName: e.target.value })
                  }
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-white placeholder-zinc-500 transition focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>

              {/* Cédula y Teléfono en fila */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="buyer-cedula"
                    className="mb-1.5 block text-sm font-semibold text-zinc-200"
                  >
                    Cédula de identidad
                  </label>
                  <div className="flex gap-2">
                    <select
                      aria-label="Tipo de documento"
                      value={form.docPrefix}
                      onChange={(e) =>
                        onChangeForm({
                          ...form,
                          docPrefix: e.target.value as 'V' | 'E',
                        })
                      }
                      className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-sm font-bold text-white focus:border-violet-500 focus:outline-none"
                    >
                      <option value="V">V</option>
                      <option value="E">E</option>
                    </select>
                    <input
                      id="buyer-cedula"
                      type="text"
                      inputMode="numeric"
                      placeholder="28445892"
                      value={form.cedulaDigits}
                      onFocus={onFieldFocus}
                      onKeyDown={(e) => onFieldKeyDown(e.key)}
                      onPaste={onFieldPaste}
                      onChange={(e) =>
                        onChangeForm({
                          ...form,
                          cedulaDigits: e.target.value.replace(/\D/g, '').slice(0, 9),
                        })
                      }
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-white placeholder-zinc-500 transition focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="buyer-phone"
                    className="mb-1.5 block text-sm font-semibold text-zinc-200"
                  >
                    Teléfono celular
                  </label>
                  <div className="flex gap-2">
                    <select
                      aria-label="Código operadora"
                      value={form.phonePrefix}
                      onChange={(e) =>
                        onChangeForm({
                          ...form,
                          phonePrefix: e.target.value as BuyerCheckoutForm['phonePrefix'],
                        })
                      }
                      className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-sm font-bold text-white focus:border-violet-500 focus:outline-none"
                    >
                      <option value="0414">0414</option>
                      <option value="0424">0424</option>
                      <option value="0412">0412</option>
                      <option value="0416">0416</option>
                      <option value="0426">0426</option>
                    </select>
                    <input
                      id="buyer-phone"
                      type="text"
                      inputMode="numeric"
                      placeholder="5524821"
                      value={form.phoneDigits}
                      onFocus={onFieldFocus}
                      onKeyDown={(e) => onFieldKeyDown(e.key)}
                      onPaste={onFieldPaste}
                      onChange={(e) =>
                        onChangeForm({
                          ...form,
                          phoneDigits: e.target.value.replace(/\D/g, '').slice(0, 7),
                        })
                      }
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-white placeholder-zinc-500 transition focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                    />
                  </div>
                </div>
              </div>

              {/* Correo Electrónico */}
              <div>
                <label
                  htmlFor="buyer-email"
                  className="mb-1.5 block text-sm font-semibold text-zinc-200"
                >
                  Correo electrónico
                </label>
                <input
                  id="buyer-email"
                  type="email"
                  placeholder="valentina@correo.com"
                  value={form.email}
                  onFocus={onFieldFocus}
                  onKeyDown={(e) => onFieldKeyDown(e.key)}
                  onPaste={onFieldPaste}
                  onChange={(e) =>
                    onChangeForm({ ...form, email: e.target.value })
                  }
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-white placeholder-zinc-500 transition focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>
            </div>

            {/* Mensaje sutil y comercial de confianza con candado */}
            <div className="mt-5 flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-xs text-zinc-300">
              <Lock className="h-4 w-4 shrink-0 text-emerald-400" />
              <span>
                Tus datos personales están protegidos y se enmascaran automáticamente
                (Ej: <strong className="font-semibold text-emerald-300">{maskedPreview}</strong>).
              </span>
            </div>
          </div>

          {/* Selección Comercial de Método de Pago */}
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-6 sm:p-8 shadow-xl">
            <h2 className="text-lg font-bold text-white">Método de pago</h2>

            <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl border-2 border-emerald-500/60 bg-zinc-950 p-4">
              <div className="flex items-center gap-3.5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400">
                  <Smartphone className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">
                    Pago Móvil Instantáneo (QR Dinámico)
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    Escanea desde tu app bancaria o transfiere el monto exacto en Bolívares.
                  </p>
                </div>
              </div>
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-emerald-500 px-6 py-4 text-base font-bold text-white shadow-lg shadow-violet-600/25 transition hover:brightness-110 disabled:opacity-60"
            >
              <QrCode className="h-5 w-5" />
              <span>
                {isSubmitting ? 'Reservando cupo...' : 'Generar Orden de Pago'}
              </span>
            </button>
          </div>
        </form>

        {/* Resumen Lateral de la Compra (5 columnas) */}
        <div className="lg:col-span-5">
          <div className="sticky top-24 rounded-3xl border border-zinc-800 bg-zinc-900/90 p-6 shadow-xl">
            <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
              Resumen de compra
            </h3>

            <div className="mt-4 flex items-center gap-3.5">
              <EventPosterArt
                theme={event.posterTheme}
                emoji={event.posterEmoji}
                category={event.category}
                shortDate={event.shortDateBadge}
                size="mini"
              />
              <div>
                <h4 className="text-base font-bold text-white leading-snug">
                  {event.title}
                </h4>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-zinc-400">
                  <Calendar className="h-3.5 w-3.5 text-violet-400" />
                  <span>{event.dateLabel}</span>
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-400">
                  <MapPin className="h-3.5 w-3.5 text-emerald-400" />
                  <span>{event.venue}</span>
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-3 border-t border-zinc-800 pt-4 text-sm">
              <div className="flex justify-between text-zinc-300">
                <span>
                  {quantity} × Entrada General (${event.priceUsd.toFixed(2)})
                </span>
                <span className="font-semibold text-white">
                  ${pricing.subtotalUsd.toFixed(2)}
                </span>
              </div>

              <div className="flex justify-between gap-3 text-zinc-300">
                <span>Tarifa de servicio VelozTix: 4.5% + $0.20 por entrada</span>
                <span className="shrink-0 font-semibold text-white">
                  ${pricing.totalCommissionUsd.toFixed(2)}
                </span>
              </div>

              <div className="flex justify-between text-zinc-400">
                <span>Entrega digital QR</span>
                <span className="text-emerald-400 font-medium">Inmediata</span>
              </div>

              <div className="flex items-baseline justify-between border-t border-zinc-800 pt-3">
                <span className="text-base font-bold text-white">Total a pagar</span>
                <div className="text-right">
                  <span className="block text-2xl font-extrabold text-emerald-400">
                    Bs.{' '}
                    {pricing.totalBs.toLocaleString('es-VE', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                  <span className="text-xs text-zinc-400">
                    Equivalente a ${pricing.totalUsd.toFixed(2)} USD
                  </span>
                </div>
              </div>

              <p className="pt-1 text-xs leading-relaxed text-zinc-400">
                Tarifa de servicio VelozTix:{' '}
                <strong className="text-zinc-200">
                  4.5% + $0.20 por entrada
                </strong>{' '}
                (${pricing.percentageFeeUsd.toFixed(2)} + $
                {pricing.flatFeeUsd.toFixed(2)}).
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

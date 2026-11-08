import React, { useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Lock,
  MapPin,
  QrCode,
  Sparkles,
} from 'lucide-react';
import {
  BuyerCheckoutForm,
  calculateVelozTixPricing,
  EventItem,
} from '../types/veloztix';
import { EventPosterArt } from '../components/EventPosterArt';
import {
  isValidCedula,
  isValidEmail,
  isValidPersonName,
  isValidPhoneDigits,
  sanitizeDigitsOnly,
  sanitizeEmailInput,
  sanitizePersonNameInput,
} from '../utils/security';

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
  const [localValidationError, setLocalValidationError] = useState<
    string | null
  >(null);

  const pricing = calculateVelozTixPricing(event.priceUsd, quantity);
  const subtotalUsd = pricing.subtotalUsd;
  const serviceFeeUsd = pricing.totalCommissionUsd;
  const totalUsd = pricing.totalUsd;
  const totalBs = pricing.totalBs;

  const isNameValid = isValidPersonName(form.fullName);
  const isCedulaValid = isValidCedula(form.cedulaDigits);
  const isPhoneValid = isValidPhoneDigits(form.phoneDigits);
  const isEmailValid = isValidEmail(form.email);

  const isFormValid =
    isNameValid && isCedulaValid && isPhoneValid && isEmailValid;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isNameValid) {
      setLocalValidationError(
        'Ingresa tu nombre y apellido usando solo letras (ej. María Fernanda Gómez).'
      );
      return;
    }
    if (!isCedulaValid) {
      setLocalValidationError(
        'La cédula debe contener únicamente números enteros (entre 6 y 9 dígitos).'
      );
      return;
    }
    if (!isPhoneValid) {
      setLocalValidationError(
        'El teléfono debe contener exactamente 7 dígitos numéricos.'
      );
      return;
    }
    if (!isEmailValid) {
      setLocalValidationError(
        'Ingresa un correo electrónico válido (ejemplo: nombre@correo.com).'
      );
      return;
    }

    setLocalValidationError(null);
    onGenerateOrder();
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Navegación superior */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/80 px-3.5 py-2 text-xs font-semibold text-zinc-300 transition hover:border-zinc-700 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Volver al evento</span>
        </button>

        <div className="flex items-center gap-2 text-xs font-semibold">
          <span className="rounded-full bg-violet-600 px-3 py-1 text-white">
            Paso 1 de 3: Datos del Asistente
          </span>
          <span className="hidden text-zinc-500 sm:inline">→</span>
          <span className="hidden rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-zinc-400 sm:inline">
            Paso 2: Pago Móvil QR
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Columna Izquierda: Formulario Comercial Limpio con Validación Estricta */}
        <div className="lg:col-span-7">
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-6 shadow-xl sm:p-8">
            <div className="mb-6">
              <h1 className="text-xl font-extrabold text-white sm:text-2xl">
                ¿A nombre de quién emitimos las entradas?
              </h1>
              <p className="mt-1 text-sm text-zinc-400">
                Enviaremos tus pases QR digitales de acceso inmediatamente tras
                confirmar tu Pago Móvil.
              </p>
            </div>

            {(errorMessage || localValidationError) && (
              <div className="mb-5 rounded-2xl border border-rose-500/40 bg-rose-950/50 p-4 text-sm text-rose-200">
                {localValidationError || errorMessage}
              </div>
            )}

            <form
              onSubmit={handleSubmit}
              onFocusCapture={onFieldFocus}
              onKeyDownCapture={(e) => onFieldKeyDown(e.key)}
              onPasteCapture={onFieldPaste}
              autoComplete="off"
              noValidate
              className="space-y-4"
            >
              {/* 1. Nombre y Apellido (Solo letras y espacios) */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label
                    htmlFor="buyer-name"
                    className="block text-xs font-semibold text-zinc-300"
                  >
                    Nombre y apellido
                  </label>
                  <span className="text-[11px] text-zinc-500">
                    Solo letras (nombre y apellido)
                  </span>
                </div>
                <input
                  id="buyer-name"
                  type="text"
                  inputMode="text"
                  required
                  maxLength={80}
                  autoComplete="off"
                  placeholder="Ej. María Fernanda Gómez"
                  value={form.fullName}
                  onChange={(e) => {
                    setLocalValidationError(null);
                    onChangeForm({
                      ...form,
                      fullName: sanitizePersonNameInput(e.target.value, 80),
                    });
                  }}
                  className={`w-full rounded-xl border bg-zinc-950 px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none ${
                    form.fullName.length > 0 && !isNameValid
                      ? 'border-amber-500/60 focus:border-amber-400'
                      : 'border-zinc-800 focus:border-violet-500'
                  }`}
                />
                {form.fullName.length > 0 && !isNameValid && (
                  <p className="mt-1 text-[11px] text-amber-400">
                    Ingresa nombre y apellido usando únicamente letras (sin
                    números ni caracteres especiales).
                  </p>
                )}
              </div>

              {/* 2. Cédula y 3. Teléfono (Solo números enteros) */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label
                      htmlFor="buyer-cedula"
                      className="block text-xs font-semibold text-zinc-300"
                    >
                      Cédula de identidad
                    </label>
                    <span className="text-[11px] text-zinc-500">
                      6 a 9 dígitos
                    </span>
                  </div>
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
                      className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3 text-sm font-semibold text-white focus:border-violet-500 focus:outline-none"
                    >
                      <option value="V">V</option>
                      <option value="E">E</option>
                    </select>
                    <input
                      id="buyer-cedula"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]{6,9}"
                      required
                      maxLength={9}
                      autoComplete="off"
                      placeholder="28445892"
                      value={form.cedulaDigits}
                      onChange={(e) => {
                        setLocalValidationError(null);
                        onChangeForm({
                          ...form,
                          cedulaDigits: sanitizeDigitsOnly(e.target.value, 9),
                        });
                      }}
                      className={`w-full rounded-xl border bg-zinc-950 px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none ${
                        form.cedulaDigits.length > 0 && !isCedulaValid
                          ? 'border-amber-500/60 focus:border-amber-400'
                          : 'border-zinc-800 focus:border-violet-500'
                      }`}
                    />
                  </div>
                  {form.cedulaDigits.length > 0 && !isCedulaValid && (
                    <p className="mt-1 text-[11px] text-amber-400">
                      Solo números enteros (entre 6 y 9 dígitos).
                    </p>
                  )}
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label
                      htmlFor="buyer-phone"
                      className="block text-xs font-semibold text-zinc-300"
                    >
                      Teléfono celular
                    </label>
                    <span className="text-[11px] text-zinc-500">
                      7 dígitos
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <select
                      aria-label="Operadora telefónica"
                      value={form.phonePrefix}
                      onChange={(e) =>
                        onChangeForm({
                          ...form,
                          phonePrefix: e.target
                            .value as BuyerCheckoutForm['phonePrefix'],
                        })
                      }
                      className="rounded-xl border border-zinc-800 bg-zinc-950 px-2.5 py-3 text-sm font-semibold text-white focus:border-violet-500 focus:outline-none"
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
                      pattern="[0-9]{7}"
                      required
                      maxLength={7}
                      autoComplete="off"
                      placeholder="5524821"
                      value={form.phoneDigits}
                      onChange={(e) => {
                        setLocalValidationError(null);
                        onChangeForm({
                          ...form,
                          phoneDigits: sanitizeDigitsOnly(e.target.value, 7),
                        });
                      }}
                      className={`w-full rounded-xl border bg-zinc-950 px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none ${
                        form.phoneDigits.length > 0 && !isPhoneValid
                          ? 'border-amber-500/60 focus:border-amber-400'
                          : 'border-zinc-800 focus:border-violet-500'
                      }`}
                    />
                  </div>
                  {form.phoneDigits.length > 0 && !isPhoneValid && (
                    <p className="mt-1 text-[11px] text-amber-400">
                      Ingresa exactamente los 7 dígitos numéricos de tu celular.
                    </p>
                  )}
                </div>
              </div>

              {/* 4. Correo Electrónico (Formato específico usuario@dominio.tld) */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label
                    htmlFor="buyer-email"
                    className="block text-xs font-semibold text-zinc-300"
                  >
                    Correo electrónico (donde recibirás tus entradas)
                  </label>
                  <span className="text-[11px] text-zinc-500">
                    usuario@dominio.com
                  </span>
                </div>
                <input
                  id="buyer-email"
                  type="email"
                  inputMode="email"
                  required
                  maxLength={100}
                  autoComplete="off"
                  placeholder="ejemplo@correo.com"
                  value={form.email}
                  onChange={(e) => {
                    setLocalValidationError(null);
                    onChangeForm({
                      ...form,
                      email: sanitizeEmailInput(e.target.value, 100),
                    });
                  }}
                  className={`w-full rounded-xl border bg-zinc-950 px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none ${
                    form.email.length > 0 && !isEmailValid
                      ? 'border-amber-500/60 focus:border-amber-400'
                      : 'border-zinc-800 focus:border-violet-500'
                  }`}
                />
                {form.email.length > 0 && !isEmailValid && (
                  <p className="mt-1 text-[11px] text-amber-400">
                    Formato requerido: usuario@dominio.com (sin espacios ni
                    caracteres inválidos).
                  </p>
                )}
              </div>

              {/* Aviso comercial de pago seguro con QR */}
              <div className="rounded-2xl border border-zinc-800/90 bg-zinc-950/70 p-4">
                <div className="flex items-start gap-3">
                  <QrCode className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                  <div className="text-xs leading-relaxed text-zinc-300">
                    <span className="font-semibold text-white">
                      Pago Móvil con QR Dinámico:
                    </span>{' '}
                    En el siguiente paso verás el código QR y los datos bancarios
                    para transferir desde tu banco de preferencia. Nunca te
                    pediremos claves bancarias ni números de tarjeta.
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={!isFormValid || isSubmitting}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-emerald-500 px-6 py-4 text-base font-bold text-white shadow-lg shadow-violet-600/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Sparkles className="h-5 w-5 animate-spin" />
                    <span>Reservando tus entradas...</span>
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4" />
                    <span>Continuar al Pago Móvil (Generar QR)</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Columna Derecha: Resumen de Compra */}
        <div className="lg:col-span-5">
          <div className="sticky top-24 rounded-3xl border border-zinc-800 bg-zinc-900/90 p-6 shadow-xl">
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
              Resumen de tu compra
            </h2>

            <div className="mt-4 flex gap-3.5 border-b border-zinc-800 pb-4">
              <EventPosterArt
                theme={event.posterTheme}
                emoji={event.posterEmoji}
                category={event.category}
                shortDate={event.shortDateBadge}
                size="mini"
              />
              <div>
                <h3 className="text-base font-bold text-white">
                  {event.title}
                </h3>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-zinc-400">
                  <Calendar className="h-3.5 w-3.5 text-violet-400" />
                  <span>{event.dateLabel}</span>
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-400">
                  <MapPin className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="line-clamp-1">{event.venue}</span>
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-2.5 text-sm">
              <div className="flex justify-between text-zinc-300">
                <span>
                  {quantity}x Entrada General (${event.priceUsd.toFixed(2)} c/u)
                </span>
                <span className="font-semibold text-white">
                  ${subtotalUsd.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>
                  Tarifa de servicio VelozTix: 4.5% + $0.20 por entrada
                </span>
                <span>${serviceFeeUsd.toFixed(2)}</span>
              </div>
              <div className="border-t border-zinc-800 pt-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-bold text-white">
                    Total a pagar
                  </span>
                  <div className="text-right">
                    <span className="text-xl font-extrabold text-white">
                      ${totalUsd.toFixed(2)} USD
                    </span>
                    <span className="block text-sm font-bold text-emerald-400">
                      Bs.{' '}
                      {totalBs.toLocaleString('es-VE', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-2 rounded-2xl bg-zinc-950/80 p-3.5 text-xs text-zinc-400">
              <div className="flex items-center gap-2 text-zinc-300">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span>Cupos bloqueados por 5 minutos al generar el QR</span>
              </div>
              <div className="flex items-center gap-2 text-zinc-300">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span>Entrega inmediata de código QR de acceso</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

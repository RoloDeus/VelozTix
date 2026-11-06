import { useCallback, useState } from 'react';
import {
  AppRole,
  BuyerCheckoutForm,
  BuyerStep,
  CreateNewEventInput,
  EventItem,
  TicketOrder,
} from './types/veloztix';
import {
  cancelOrReverseTicketOrder,
  confirmTicketOrderPayment,
  createOrganizerEvent,
  createTicketReservation,
  getAllOrders,
  getAudienceAnalytics,
  getEventById,
  getEventsCatalog,
  getReconciliationSummary,
  incrementEventViewCount,
  runCommercialReconciliation,
} from './services/apiClient';
import { useBehavioralTelemetry } from './hooks/useBehavioralTelemetry';
import { Navbar } from './components/Navbar';
import { CatalogView } from './views/CatalogView';
import { BuyerCheckoutView } from './views/BuyerCheckoutView';
import { PaymentQRView } from './views/PaymentQRView';
import { TicketSuccessView } from './views/TicketSuccessView';
import { OrganizerPortalView } from './views/OrganizerPortalView';

export function App() {
  const [activeRole, setActiveRole] = useState<AppRole>('buyer');
  const [buyerStep, setBuyerStep] = useState<BuyerStep>('catalog');

  const [events, setEvents] = useState<EventItem[]>(() => getEventsCatalog());
  const [orders, setOrders] = useState<TicketOrder[]>(() => getAllOrders());
  const [reconciliation, setReconciliation] = useState(() =>
    getReconciliationSummary()
  );
  const [analytics, setAnalytics] = useState(() => getAudienceAnalytics());

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [ticketQty, setTicketQty] = useState<number>(1);

  const [checkoutForm, setCheckoutForm] = useState<BuyerCheckoutForm>({
    fullName: '',
    docPrefix: 'V',
    cedulaDigits: '',
    phonePrefix: '0414',
    phoneDigits: '',
    email: '',
  });

  const [activeOrder, setActiveOrder] = useState<TicketOrder | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [catalogNotice, setCatalogNotice] = useState<string | null>(null);

  // Telemetría ejecutándose silenciosamente en código (sin UI técnica)
  const {
    recordFieldFocus,
    recordFieldKeyDown,
    recordFieldPaste,
    captureSnapshot,
    resetSessionTelemetry,
  } = useBehavioralTelemetry();

  const refreshStoreViews = useCallback(() => {
    setEvents(getEventsCatalog());
    setOrders(getAllOrders());
    setReconciliation(getReconciliationSummary());
    setAnalytics(getAudienceAnalytics());
  }, []);

  const selectedEvent = selectedEventId
    ? events.find((e) => e.id === selectedEventId) ||
      getEventById(selectedEventId) ||
      null
    : null;

  const handleGoHome = () => {
    setActiveRole('buyer');
    setBuyerStep('catalog');
    setSelectedEventId(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectEvent = (event: EventItem) => {
    incrementEventViewCount(event.id);
    setCatalogNotice(null);
    setSelectedEventId(event.id);
    setTicketQty(1);
    setBuyerStep('event_detail');
    refreshStoreViews();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleStartCheckout = () => {
    setCheckoutError(null);
    setBuyerStep('checkout');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Secuencia 1: Autorización / Reserva y Generación de QR Dinámico
  const handleGeneratePaymentOrder = async () => {
    if (!selectedEvent) return;
    setIsProcessing(true);
    setCheckoutError(null);

    try {
      const telemetrySnapshot = captureSnapshot();
      const reservedOrder = await createTicketReservation(
        selectedEvent.id,
        ticketQty,
        checkoutForm,
        telemetrySnapshot
      );

      setActiveOrder(reservedOrder);
      refreshStoreViews();
      setBuyerStep('payment_qr');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setCheckoutError(
        err instanceof Error
          ? err.message
          : 'No pudimos procesar tu reserva en este momento.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  // Secuencia 2: Captura Exitosa y Emisión de Boleto Digital
  const handleConfirmPayment = async () => {
    if (!activeOrder) return;
    setIsProcessing(true);
    try {
      const confirmed = await confirmTicketOrderPayment(activeOrder.id);
      setActiveOrder(confirmed);
      refreshStoreViews();
      setBuyerStep('ticket_issued');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Secuencia 3: Reverso / Anulación y Liberación de Cupo
  const handleCancelOrExpireOrder = useCallback(() => {
    if (!activeOrder) return;
    cancelOrReverseTicketOrder(activeOrder.id);
    setActiveOrder(null);
    setSelectedEventId(null);
    resetSessionTelemetry();
    refreshStoreViews();
    setCatalogNotice(
      'Tu reserva ha sido cancelada y el cupo fue liberado.'
    );
    setBuyerStep('catalog');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeOrder, refreshStoreViews, resetSessionTelemetry]);

  const handleFinishTicketFlow = () => {
    setActiveOrder(null);
    setSelectedEventId(null);
    setCheckoutForm({
      fullName: '',
      docPrefix: 'V',
      cedulaDigits: '',
      phonePrefix: '0414',
      phoneDigits: '',
      email: '',
    });
    resetSessionTelemetry();
    setBuyerStep('catalog');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Acciones desde el Portal Organizador
  const handleCreateNewEvent = (input: CreateNewEventInput) => {
    createOrganizerEvent(input);
    refreshStoreViews();
  };

  const handleManualConfirmFromOrganizer = async (orderId: string) => {
    await confirmTicketOrderPayment(orderId);
    if (activeOrder?.id === orderId) {
      const updated = getAllOrders().find((o) => o.id === orderId) || null;
      setActiveOrder(updated);
    }
    refreshStoreViews();
  };

  const handleManualCancelFromOrganizer = (orderId: string) => {
    cancelOrReverseTicketOrder(orderId);
    if (activeOrder?.id === orderId) {
      setActiveOrder(null);
      setBuyerStep('catalog');
    }
    refreshStoreViews();
  };

  const handleRunReconciliation = async () => {
    const nextRec = await runCommercialReconciliation();
    setReconciliation(nextRec);
    setEvents(getEventsCatalog());
    setOrders(getAllOrders());
    setAnalytics(getAudienceAnalytics());
  };

  const handlePreviewEventFromOrganizer = (ev: EventItem) => {
    setActiveRole('buyer');
    handleSelectEvent(ev);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar
        activeRole={activeRole}
        onChangeRole={(role) => {
          setActiveRole(role);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onGoHome={handleGoHome}
      />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        {activeRole === 'buyer' ? (
          <>
            {(buyerStep === 'catalog' || buyerStep === 'event_detail') && (
              <CatalogView
                events={events}
                selectedEvent={
                  buyerStep === 'event_detail' ? selectedEvent : null
                }
                ticketQty={ticketQty}
                onSelectEvent={handleSelectEvent}
                onBackToBillboard={() => {
                  setSelectedEventId(null);
                  setBuyerStep('catalog');
                }}
                onChangeQty={setTicketQty}
                onBuyTickets={handleStartCheckout}
                noticeMessage={catalogNotice}
                onDismissNotice={() => setCatalogNotice(null)}
              />
            )}

            {buyerStep === 'checkout' && selectedEvent && (
              <BuyerCheckoutView
                event={selectedEvent}
                quantity={ticketQty}
                form={checkoutForm}
                onChangeForm={setCheckoutForm}
                onFieldFocus={recordFieldFocus}
                onFieldKeyDown={recordFieldKeyDown}
                onFieldPaste={recordFieldPaste}
                onBack={() => setBuyerStep('event_detail')}
                onGenerateOrder={handleGeneratePaymentOrder}
                isSubmitting={isProcessing}
                errorMessage={checkoutError}
              />
            )}

            {buyerStep === 'payment_qr' && activeOrder && (
              <PaymentQRView
                order={activeOrder}
                onConfirmPayment={handleConfirmPayment}
                onCancelOrExpire={handleCancelOrExpireOrder}
                isProcessing={isProcessing}
              />
            )}

            {buyerStep === 'ticket_issued' && activeOrder && (
              <TicketSuccessView
                order={activeOrder}
                onExploreMoreEvents={handleFinishTicketFlow}
              />
            )}
          </>
        ) : (
          <OrganizerPortalView
            events={events}
            orders={orders}
            reconciliation={reconciliation}
            analytics={analytics}
            onCreateEvent={handleCreateNewEvent}
            onConfirmOrderManually={handleManualConfirmFromOrganizer}
            onCancelOrderManually={handleManualCancelFromOrganizer}
            onExecuteReconciliation={handleRunReconciliation}
            onPreviewEventAsBuyer={handlePreviewEventFromOrganizer}
          />
        )}
      </main>

      <footer className="border-t border-zinc-900 bg-zinc-950/80 py-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 text-xs text-zinc-500 sm:px-6">
          <span>
            © 2026 <strong className="text-zinc-300">VelozTix</strong> · Boletería
            ágil para eventos independientes
          </span>
          <span>Pagos instantáneos vía Pago Móvil · Entradas digitales con QR</span>
        </div>
      </footer>
    </div>
  );
}

export default App;

import {
  BCV_RATE_BS,
  BehavioralTelemetryVector,
  BuyerCheckoutForm,
  CreateNewEventInput,
  EventItem,
  FLAT_FEE_PER_TICKET_USD,
  PosterTheme,
  ReconciliationRow,
  TicketOrder,
} from '../types/veloztix';
import {
  generateCustomerHash,
  generateSignedGateToken,
  maskCedula,
  maskEmail,
  maskPhone,
} from '../utils/privacyCrypto';
import { evaluateSilentTelemetry } from '../utils/aiScoringEngine';

// ============================================================================
// CARTELERA INICIAL DE MICRO-EVENTOS (4 Eventos Comerciales)
// ============================================================================

let eventsStore: EventItem[] = [
  {
    id: 'evt-cyberfest-26',
    slug: 'cyberfest-ucab-2026',
    title: 'CyberFest UCAB 2026: Valorant Finals & Indie Party',
    tagline: 'Gran final universitaria 5v5 en vivo, bandas indie y afterparty electrónico.',
    description:
      'Vive la tarde más esperada del semestre con pantalla gigante para la Gran Final interuniversitaria de Valorant, área de consolas libres, foodtrucks y cierre musical con tres bandas indie caraqueñas en vivo.',
    highlights: [
      'Acceso completo a la Arena eSports y tarima musical',
      'Zona arcade libre + bebida de cortesía para los primeros 100',
      'Ingreso rápido sin filas escaneando tu QR en puerta',
    ],
    category: 'Gaming & Tech',
    posterTheme: 'violet',
    posterEmoji: '🎮',
    organizerName: 'Club de eSports & Cultura UCAB',
    instagramHandle: '@cyberfest.ucab',
    dateLabel: 'Sábado 21 de Noviembre',
    shortDateBadge: '21 NOV',
    timeLabel: '3:00 PM – 10:30 PM',
    venue: 'Centro Cultural Campus Montalbán',
    city: 'Caracas',
    priceUsd: 8.0,
    priceBs: 360.0,
    totalCapacity: 250,
    soldCount: 168,
    reservedCount: 0,
    availableCount: 82,
    maxPerOrder: 6,
    viewsCount: 640,
  },
  {
    id: 'evt-sunset-vinyl',
    slug: 'sunset-rooftop-caracas-indie',
    title: 'Sunset Rooftop Sessions: Indie & Vinyl',
    tagline: 'Atardecer frente al Ávila con DJs en vinilo, synth-pop y coctelería de autor.',
    description:
      'Una edición íntima al aire libre diseñada para amantes del sonido analógico y la escena alternativa local. Aforo estrictamente limitado para garantizar comodidad en terraza.',
    highlights: [
      '4 sets en vivo en formato vinilo y live-synth',
      'Vista 360° al Ávila desde las 5:00 PM',
      'Aforo íntimo de 180 asistentes',
    ],
    category: 'Música & Fiestas',
    posterTheme: 'emerald',
    posterEmoji: '🌅',
    organizerName: 'Colectivo Mirador Sonoro',
    instagramHandle: '@miradorsonoro.ccs',
    dateLabel: 'Viernes 27 de Noviembre',
    shortDateBadge: '27 NOV',
    timeLabel: '5:00 PM – 1:00 AM',
    venue: 'Terraza Nivel 8, Los Palos Grandes',
    city: 'Caracas',
    priceUsd: 12.0,
    priceBs: 540.0,
    totalCapacity: 180,
    soldCount: 134,
    reservedCount: 0,
    availableCount: 46,
    maxPerOrder: 4,
    viewsCount: 495,
  },
  {
    id: 'evt-standup-chacao',
    slug: 'standup-night-universitario',
    title: 'Stand-Up Night: Comedia sin Filtro',
    tagline: 'Cinco comediantes emergentes probando material nuevo en formato club.',
    description:
      'Noche de risas garantizadas con talento universitario e invitados sorpresa del circuito de comedia local. Mesas compartidas, ambiente relajado y servicio directo en sala.',
    highlights: [
      'Show de 90 minutos con 5 comediantes en escena',
      'Ubicación numerada por orden de llegada',
      'Promociones 2x1 en barra antes de las 8:00 PM',
    ],
    category: 'Comedia & Cultura',
    posterTheme: 'amber',
    posterEmoji: '🎙️',
    organizerName: 'La Caja Comedia Prod.',
    instagramHandle: '@lacajacomedia',
    dateLabel: 'Jueves 3 de Diciembre',
    shortDateBadge: '03 DIC',
    timeLabel: '7:30 PM – 10:00 PM',
    venue: 'Sala Experimental Chacao',
    city: 'Caracas',
    priceUsd: 6.0,
    priceBs: 270.0,
    totalCapacity: 120,
    soldCount: 89,
    reservedCount: 0,
    availableCount: 31,
    maxPerOrder: 6,
    viewsCount: 280,
  },
  {
    id: 'evt-neon-rave',
    slug: 'neon-warehouse-boiler-ccs',
    title: 'Boiler Room Universitario: Neon Pulse',
    tagline: 'Escenario 360° en formato club nocturno con house, techno melódico y visuales.',
    description:
      'Producción audiovisual inmersiva a nivel de piso donde el público rodea la cabina del DJ. Entrada exclusiva con código QR digital verificable en puerta.',
    highlights: [
      'Cabina 360° con sistema de sonido cuadrafónico',
      'Visuales reactivas láser durante toda la noche',
      'Seguridad privada y estacionamiento vigilado',
    ],
    category: 'Música & Fiestas',
    posterTheme: 'rose',
    posterEmoji: '⚡',
    organizerName: 'Pulse Clubbing CCS',
    instagramHandle: '@pulseclub.ve',
    dateLabel: 'Sábado 12 de Diciembre',
    shortDateBadge: '12 DIC',
    timeLabel: '9:00 PM – 4:00 AM',
    venue: 'Galpón Creativo Las Mercedes',
    city: 'Caracas',
    priceUsd: 10.0,
    priceBs: 450.0,
    totalCapacity: 350,
    soldCount: 210,
    reservedCount: 0,
    availableCount: 140,
    maxPerOrder: 5,
    viewsCount: 530,
  },
];

// ============================================================================
// ÓRDENES COMERCIALES INICIALES (Para poblar el Portal Organizador desde inicio)
// ============================================================================

let ordersStore: TicketOrder[] = [
  {
    id: 'VT-84912',
    eventId: 'evt-cyberfest-26',
    eventTitle: 'CyberFest UCAB 2026: Valorant Finals & Indie Party',
    eventDateLabel: 'Sábado 21 de Noviembre',
    eventTimeLabel: '3:00 PM – 10:30 PM',
    eventVenue: 'Centro Cultural Campus Montalbán',
    posterTheme: 'violet',
    quantity: 2,
    unitPriceUsd: 8.0,
    subtotalTicketsUsd: 16.0,
    flatFeeUsd: 0.4,
    totalUsd: 16.4,
    totalBs: 738.0,
    netOrganizerUsd: 16.0,
    status: 'paid',
    createdAtIso: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
    buyerName: 'Mariana Gómez',
    maskedCedula: 'V-**.*18.402',
    maskedPhone: '0414-***-9102',
    maskedEmail: 'ma***@ucab.edu.ve',
    customerHashInternal: '9a8f12c40019b72e41a8d',
    pagoMovil: {
      bankName: 'Banco Mercantil (0105)',
      bankCode: '0105',
      rif: 'J-50482910-3',
      phone: '0414-288-9010',
      conceptRef: 'VT-84912',
      qrPayload: 'veloztix://pay/VT-84912?bs=738.00',
      expiresAtIso: new Date(Date.now() + 300000).toISOString(),
      ttlSeconds: 300,
    },
    gatePassQr: 'https://veloztix.app/verify/VT-84912?evt=evt-cyberfest-26&q=2',
    reconciled: true,
    buyerProfileInternal: 'fan_directo',
  },
  {
    id: 'VT-84895',
    eventId: 'evt-sunset-vinyl',
    eventTitle: 'Sunset Rooftop Sessions: Indie & Vinyl',
    eventDateLabel: 'Viernes 27 de Noviembre',
    eventTimeLabel: '5:00 PM – 1:00 AM',
    eventVenue: 'Terraza Nivel 8, Los Palos Grandes',
    posterTheme: 'emerald',
    quantity: 3,
    unitPriceUsd: 12.0,
    subtotalTicketsUsd: 36.0,
    flatFeeUsd: 0.6,
    totalUsd: 36.6,
    totalBs: 1647.0,
    netOrganizerUsd: 36.0,
    status: 'paid',
    createdAtIso: new Date(Date.now() - 1000 * 60 * 47).toISOString(),
    buyerName: 'Andrés Salcedo',
    maskedCedula: 'V-**.*62.119',
    maskedPhone: '0424-***-3381',
    maskedEmail: 'an***@gmail.com',
    customerHashInternal: '7f11c82041ae98b0012c',
    pagoMovil: {
      bankName: 'Banco Mercantil (0105)',
      bankCode: '0105',
      rif: 'J-50482910-3',
      phone: '0414-288-9010',
      conceptRef: 'VT-84895',
      qrPayload: 'veloztix://pay/VT-84895?bs=1647.00',
      expiresAtIso: new Date(Date.now() + 300000).toISOString(),
      ttlSeconds: 300,
    },
    gatePassQr: 'https://veloztix.app/verify/VT-84895?evt=evt-sunset-vinyl&q=3',
    reconciled: true,
    buyerProfileInternal: 'indeciso',
  },
  {
    id: 'VT-84860',
    eventId: 'evt-standup-chacao',
    eventTitle: 'Stand-Up Night: Comedia sin Filtro',
    eventDateLabel: 'Jueves 3 de Diciembre',
    eventTimeLabel: '7:30 PM – 10:00 PM',
    eventVenue: 'Sala Experimental Chacao',
    posterTheme: 'amber',
    quantity: 2,
    unitPriceUsd: 6.0,
    subtotalTicketsUsd: 12.0,
    flatFeeUsd: 0.4,
    totalUsd: 12.4,
    totalBs: 558.0,
    netOrganizerUsd: 12.0,
    status: 'cancelled',
    createdAtIso: new Date(Date.now() - 1000 * 60 * 95).toISOString(),
    buyerName: 'Daniela Rivas',
    maskedCedula: 'V-**.*04.775',
    maskedPhone: '0412-***-6044',
    maskedEmail: 'da***@outlook.com',
    customerHashInternal: '2b90e71155da019f4421',
    pagoMovil: {
      bankName: 'Banco Mercantil (0105)',
      bankCode: '0105',
      rif: 'J-50482910-3',
      phone: '0414-288-9010',
      conceptRef: 'VT-84860',
      qrPayload: 'veloztix://pay/VT-84860?bs=558.00',
      expiresAtIso: new Date(Date.now() - 300000).toISOString(),
      ttlSeconds: 300,
    },
    gatePassQr: '',
    reconciled: false,
    buyerProfileInternal: 'indeciso',
  },
];

// Orden pendiente de cuadre (pago recibido afuera cuya notificación tardó) para demostrar resolución en Conciliación
let pendingUnmatchedPaymentResolved = false;
let blockedBotsCount = 24;

// ============================================================================
// SERVICIOS DE EVENTOS Y CARTELERA
// ============================================================================

export function getEventsCatalog(): EventItem[] {
  return [...eventsStore];
}

export function getEventById(eventId: string): EventItem | undefined {
  const found = eventsStore.find((e) => e.id === eventId);
  return found ? { ...found } : undefined;
}

export function incrementEventViewCount(eventId: string): void {
  eventsStore = eventsStore.map((ev) =>
    ev.id === eventId ? { ...ev, viewsCount: ev.viewsCount + 1 } : ev
  );
}

export function createOrganizerEvent(input: CreateNewEventInput): EventItem {
  const themes: PosterTheme[] = ['violet', 'emerald', 'amber', 'rose'];
  const emojis: Record<EventItem['category'], string> = {
    'Música & Fiestas': '🎵',
    'Gaming & Tech': '🕹️',
    'Comedia & Cultura': '🎭',
  };

  const priceUsd = Math.max(1, Number(input.priceUsd));
  const priceBs = Number((priceUsd * BCV_RATE_BS).toFixed(2));
  const capacity = Math.max(10, Math.round(input.totalCapacity));
  const slug = input.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  const newEvent: EventItem = {
    id: `evt-${Date.now().toString(36)}`,
    slug: slug || `evento-${Date.now()}`,
    title: input.title.trim(),
    tagline: input.description.trim().slice(0, 95),
    description: input.description.trim(),
    highlights: [
      'Entrada digital inmediata pagando con Pago Móvil',
      'Acceso rápido mostrando tu código QR desde el celular',
      'Cupos controlados en tiempo real',
    ],
    category: input.category,
    posterTheme: themes[eventsStore.length % themes.length],
    posterEmoji: emojis[input.category] || '✨',
    organizerName: 'Organizador Verificado VelozTix',
    instagramHandle: `@${(slug || 'evento').slice(0, 14)}`,
    dateLabel: input.dateLabel.trim() || 'Próximamente',
    shortDateBadge: 'NUEVO',
    timeLabel: input.timeLabel.trim() || '8:00 PM',
    venue: input.venue.trim() || 'Caracas',
    city: 'Caracas',
    priceUsd,
    priceBs,
    totalCapacity: capacity,
    soldCount: 0,
    reservedCount: 0,
    availableCount: capacity,
    maxPerOrder: 6,
    viewsCount: 1,
  };

  eventsStore = [newEvent, ...eventsStore];
  return newEvent;
}

// ============================================================================
// FLUJO TRANSACCIONAL DEL COMPRADOR (Autorización, Captura y Reverso)
// ============================================================================

/**
 * Paso 1 -> Paso 2: Reserva temporal de cupos + Generación de Orden QR Dinámico
 * Ejecuta telemetría y seudonimización silenciosamente en segundo plano.
 */
export async function createTicketReservation(
  eventId: string,
  quantity: number,
  buyer: BuyerCheckoutForm,
  telemetry: BehavioralTelemetryVector
): Promise<TicketOrder> {
  const event = eventsStore.find((e) => e.id === eventId);
  if (!event) {
    throw new Error('El evento seleccionado no está disponible.');
  }
  if (event.availableCount < quantity) {
    throw new Error('No quedan suficientes cupos disponibles para esta cantidad.');
  }

  // Seudonimización y evaluación silenciosa en segundo plano (cumplimiento técnico en consola)
  const customerHash = await generateCustomerHash(buyer);
  const silentEval = evaluateSilentTelemetry(telemetry);

  // Registro discreto en consola del navegador para evidencia del repositorio sin ensuciar la UI
  console.info('[VelozTix Background Telemetry]', {
    customer_hash: customerHash,
    telemetry,
    evaluation: silentEval,
  });

  if (!silentEval.approved) {
    blockedBotsCount += 1;
    throw new Error(
      'Detectamos un llenado automático inusual. Por favor verifica tus datos e inténtalo de nuevo.'
    );
  }

  // Bloquear cupos temporalmente por 05:00 minutos
  eventsStore = eventsStore.map((ev) =>
    ev.id === eventId
      ? {
          ...ev,
          availableCount: ev.availableCount - quantity,
          reservedCount: ev.reservedCount + quantity,
        }
      : ev
  );

  const orderNumber = Math.floor(85000 + Math.random() * 14999);
  const orderId = `VT-${orderNumber}`;
  const subtotalTicketsUsd = Number((quantity * event.priceUsd).toFixed(2));
  const flatFeeUsd = Number(
    (quantity * FLAT_FEE_PER_TICKET_USD).toFixed(2)
  );
  const totalUsd = Number((subtotalTicketsUsd + flatFeeUsd).toFixed(2));
  const totalBs = Number((totalUsd * BCV_RATE_BS).toFixed(2));
  const netOrganizerUsd = subtotalTicketsUsd;

  const ttlSeconds = 300;
  const expiresAtIso = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  const newOrder: TicketOrder = {
    id: orderId,
    eventId: event.id,
    eventTitle: event.title,
    eventDateLabel: event.dateLabel,
    eventTimeLabel: event.timeLabel,
    eventVenue: event.venue,
    posterTheme: event.posterTheme,
    quantity,
    unitPriceUsd: event.priceUsd,
    subtotalTicketsUsd,
    flatFeeUsd,
    totalUsd,
    totalBs,
    netOrganizerUsd,
    status: 'pending',
    createdAtIso: new Date().toISOString(),
    buyerName: buyer.fullName.trim(),
    maskedCedula: maskCedula(buyer.docPrefix, buyer.cedulaDigits),
    maskedPhone: maskPhone(buyer.phonePrefix, buyer.phoneDigits),
    maskedEmail: maskEmail(buyer.email),
    customerHashInternal: customerHash,
    pagoMovil: {
      bankName: 'Banco Mercantil (0105)',
      bankCode: '0105',
      rif: 'J-50482910-3',
      phone: '0414-288-9010',
      conceptRef: orderId,
      qrPayload: `PAGO_MOVIL|BANCO:0105|RIF:J504829103|TEL:04142889010|MONTO_BS:${totalBs.toFixed(2)}|REF:${orderId}`,
      expiresAtIso,
      ttlSeconds,
    },
    gatePassQr: '',
    reconciled: false,
    buyerProfileInternal:
      silentEval.buyerProfile === 'indeciso' ? 'indeciso' : 'fan_directo',
  };

  ordersStore = [newOrder, ...ordersStore];
  return newOrder;
}

/**
 * Paso 2 -> Paso 3: Confirmación de Pago Móvil y Emisión de Boleto Digital
 */
export async function confirmTicketOrderPayment(
  orderId: string
): Promise<TicketOrder> {
  const existing = ordersStore.find((o) => o.id === orderId);
  if (!existing) {
    throw new Error('No se encontró la orden.');
  }
  if (existing.status === 'paid') {
    return existing;
  }

  const gateQr = await generateSignedGateToken(
    existing.id,
    existing.eventId,
    existing.quantity
  );

  // Pasar cupo de reservado ( o disponible si venía anulada ) a vendido
  eventsStore = eventsStore.map((ev) => {
    if (ev.id !== existing.eventId) return ev;
    if (existing.status === 'pending') {
      return {
        ...ev,
        reservedCount: Math.max(0, ev.reservedCount - existing.quantity),
        soldCount: ev.soldCount + existing.quantity,
      };
    }
    return {
      ...ev,
      availableCount: Math.max(0, ev.availableCount - existing.quantity),
      soldCount: ev.soldCount + existing.quantity,
    };
  });

  const updated: TicketOrder = {
    ...existing,
    status: 'paid',
    gatePassQr: gateQr,
  };

  ordersStore = ordersStore.map((o) => (o.id === orderId ? updated : o));
  return updated;
}

/**
 * Secuencia de Reverso / Anulación: Libera el cupo reservado y anula la orden
 */
export function cancelOrReverseTicketOrder(orderId: string): TicketOrder {
  const existing = ordersStore.find((o) => o.id === orderId);
  if (!existing) {
    throw new Error('No se encontró la orden.');
  }
  if (existing.status === 'cancelled') {
    return existing;
  }

  // Liberar cupos al inventario disponible
  eventsStore = eventsStore.map((ev) => {
    if (ev.id !== existing.eventId) return ev;
    if (existing.status === 'pending') {
      return {
        ...ev,
        reservedCount: Math.max(0, ev.reservedCount - existing.quantity),
        availableCount: ev.availableCount + existing.quantity,
      };
    }
    if (existing.status === 'paid') {
      return {
        ...ev,
        soldCount: Math.max(0, ev.soldCount - existing.quantity),
        availableCount: ev.availableCount + existing.quantity,
      };
    }
    return ev;
  });

  const updated: TicketOrder = {
    ...existing,
    status: 'cancelled',
    gatePassQr: '',
    reconciled: false,
  };

  ordersStore = ordersStore.map((o) => (o.id === orderId ? updated : o));
  return updated;
}

// ============================================================================
// PORTAL ORGANIZADOR: ÓRDENES, CONCILIACIÓN Y ANALÍTICA COMERCIAL
// ============================================================================

export function getAllOrders(): TicketOrder[] {
  return [...ordersStore];
}

export interface ReconciliationSummary {
  grossUsd: number;
  grossBs: number;
  reconciledTicketsCount: number;
  veloztixFlatFeeUsd: number;
  netOrganizerUsd: number;
  allMatched: boolean;
  pendingCount: number;
  rows: ReconciliationRow[];
}

export function getReconciliationSummary(): ReconciliationSummary {
  const paidOrders = ordersStore.filter((o) => o.status === 'paid');

  const rows: ReconciliationRow[] = paidOrders.map((ord) => ({
    id: `rec-${ord.id}`,
    orderId: ord.id,
    eventId: ord.eventId,
    eventTitle: ord.eventTitle,
    buyerDisplay: `${ord.buyerName} (${ord.maskedCedula})`,
    quantity: ord.quantity,
    amountUsd: ord.totalUsd,
    amountBs: ord.totalBs,
    flatFeeUsd: ord.flatFeeUsd,
    netOrganizerUsd: ord.netOrganizerUsd,
    paymentRef: `PM-${ord.id.replace('VT-', '90')}`,
    state: 'matched',
    note: 'Pago Móvil verificado y entrada activa',
  }));

  if (!pendingUnmatchedPaymentResolved) {
    rows.unshift({
      id: 'rec-pending-pm',
      orderId: 'VT-84877',
      eventId: 'evt-cyberfest-26',
      eventTitle: 'CyberFest UCAB 2026: Valorant Finals & Indie Party',
      buyerDisplay: 'Carlos Mendoza (V-**.*39.104)',
      quantity: 2,
      amountUsd: 16.4,
      amountBs: 738.0,
      flatFeeUsd: 0.4,
      netOrganizerUsd: 16.0,
      paymentRef: 'PM-9084877',
      state: 'payment_without_ticket',
      note: 'Pago Móvil recibido en cuenta · Pendiente emitir entrada al comprador',
    });
  }

  const matchedRows = rows.filter((r) => r.state === 'matched');
  const reconciledTicketsCount = matchedRows.reduce(
    (sum, r) => sum + r.quantity,
    0
  );
  const grossUsd = Number(
    matchedRows.reduce((sum, r) => sum + r.amountUsd, 0).toFixed(2)
  );
  const grossBs = Number(
    matchedRows.reduce((sum, r) => sum + r.amountBs, 0).toFixed(2)
  );
  const veloztixFlatFeeUsd = Number(
    (reconciledTicketsCount * FLAT_FEE_PER_TICKET_USD).toFixed(2)
  );
  const netOrganizerUsd = Number((grossUsd - veloztixFlatFeeUsd).toFixed(2));

  const pendingCount = rows.filter((r) => r.state !== 'matched').length;

  return {
    grossUsd,
    grossBs,
    reconciledTicketsCount,
    veloztixFlatFeeUsd,
    netOrganizerUsd,
    allMatched: pendingCount === 0,
    pendingCount,
    rows,
  };
}

/**
 * Ejecuta el Cuadre de Pagos resolviendo órdenes con cobro confirmado y marcando todo cuadrado
 */
export async function runCommercialReconciliation(): Promise<ReconciliationSummary> {
  if (!pendingUnmatchedPaymentResolved) {
    pendingUnmatchedPaymentResolved = true;
    const gateQr = await generateSignedGateToken(
      'VT-84877',
      'evt-cyberfest-26',
      2
    );
    const healedOrder: TicketOrder = {
      id: 'VT-84877',
      eventId: 'evt-cyberfest-26',
      eventTitle: 'CyberFest UCAB 2026: Valorant Finals & Indie Party',
      eventDateLabel: 'Sábado 21 de Noviembre',
      eventTimeLabel: '3:00 PM – 10:30 PM',
      eventVenue: 'Centro Cultural Campus Montalbán',
      posterTheme: 'violet',
      quantity: 2,
      unitPriceUsd: 8.0,
      subtotalTicketsUsd: 16.0,
      flatFeeUsd: 0.4,
      totalUsd: 16.4,
      totalBs: 738.0,
      netOrganizerUsd: 16.0,
      status: 'paid',
      createdAtIso: new Date().toISOString(),
      buyerName: 'Carlos Mendoza',
      maskedCedula: 'V-**.*39.104',
      maskedPhone: '0414-***-7712',
      maskedEmail: 'ca***@gmail.com',
      customerHashInternal: '8c12ab9904ee712a',
      pagoMovil: {
        bankName: 'Banco Mercantil (0105)',
        bankCode: '0105',
        rif: 'J-50482910-3',
        phone: '0414-288-9010',
        conceptRef: 'VT-84877',
        qrPayload: 'veloztix://pay/VT-84877?bs=738.00',
        expiresAtIso: new Date().toISOString(),
        ttlSeconds: 300,
      },
      gatePassQr: gateQr,
      reconciled: true,
      buyerProfileInternal: 'fan_directo',
    };

    ordersStore = [
      healedOrder,
      ...ordersStore.map((o) =>
        o.status === 'paid' ? { ...o, reconciled: true } : o
      ),
    ];

    eventsStore = eventsStore.map((ev) =>
      ev.id === 'evt-cyberfest-26'
        ? {
            ...ev,
            availableCount: Math.max(0, ev.availableCount - 2),
            soldCount: ev.soldCount + 2,
          }
        : ev
    );
  } else {
    ordersStore = ordersStore.map((o) =>
      o.status === 'paid' ? { ...o, reconciled: true } : o
    );
  }

  return getReconciliationSummary();
}

export interface AudienceAnalyticsSummary {
  totalViews: number;
  conversionRatePct: number;
  directFansPct: number;
  indecisiveBuyersPct: number;
  blockedBotsCount: number;
  protectedTicketsCount: number;
  totalTicketsSold: number;
}

export function getAudienceAnalytics(): AudienceAnalyticsSummary {
  const totalViews = eventsStore.reduce((sum, e) => sum + e.viewsCount, 0);
  const totalTicketsSold = eventsStore.reduce((sum, e) => sum + e.soldCount, 0);
  const paidOrders = ordersStore.filter((o) => o.status === 'paid');

  const directFansOrders =
    68 +
    paidOrders.filter((o) => o.buyerProfileInternal === 'fan_directo').length;
  const indecisiveOrders =
    32 + paidOrders.filter((o) => o.buyerProfileInternal === 'indeciso').length;
  const totalProfiled = Math.max(1, directFansOrders + indecisiveOrders);

  const directFansPct = Math.round((directFansOrders / totalProfiled) * 100);
  const indecisiveBuyersPct = 100 - directFansPct;
  const conversionRatePct = Number(
    Math.min(48.5, ((totalTicketsSold / Math.max(1, totalViews)) * 100)).toFixed(1)
  );

  return {
    totalViews,
    conversionRatePct,
    directFansPct,
    indecisiveBuyersPct,
    blockedBotsCount,
    protectedTicketsCount: blockedBotsCount * 4,
    totalTicketsSold,
  };
}

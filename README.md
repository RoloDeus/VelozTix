# VelozTix — Boletería Comercial con Pago Móvil Instantáneo y QR Digital

**Cátedra:** Desarrollo de Software Fintech (UCAB)  
**Entrega 2:** Prototipo Front-End Navegable y Módulo de Telemetría Client-Side  
**Equipo A:** Rolando Rodrigo Varela · Jesús Acosta · Leonel Rojas  

---

## Descripción General

**VelozTix** es una plataforma comercial de boletería moderna en modo oscuro (inspirada en experiencias como Dice.fm, Passline y Eventbrite) diseñada para micro-eventos, fiestas locales y eventos universitarios difundidos por redes sociales.

La aplicación opera **100% en memoria en el Front-End** para demostración fluida de todas las secuencias transaccionales sin depender de conexión activa a servidor, manteniendo listos los servicios y el colector silencioso de telemetría en segundo plano para la integración con el Backend.

### Modelo de Ingresos Comercial
- **Tarifa Plana por Entrada (Flat Fee):** Comisión fija de **`$0.20 USD` por cada entrada vendida** (sin cargos ni retenciones porcentuales sobre el precio del boleto), garantizando al organizador el 100% del valor nominal de sus entradas.
- **Suscripción Organizadora SaaS (`VelozTix Pro`):** Plan recurrente para productores y organizadores que habilita analítica avanzada de audiencia, métricas de conversión y resguardo antibots en preventas.

---

## Estructura de Vistas y Flujos

### 1. Explorar Eventos (Vista Comprador)
- **Cartelera y Detalle del Evento (`src/views/CatalogView.tsx`):** Catálogo filtrable de eventos con póster, fecha, lugar, precio en USD/Bs, cupos disponibles en tiempo real y resumen transparente con tarifa fija de servicio (`$0.20 USD` × entrada).
- **Paso 1 — Datos del Asistente (`src/views/BuyerCheckoutView.tsx`):** Formulario comercial limpio (Nombre, Cédula, Teléfono, Correo) con protección y enmascaramiento automático de datos personales (`V-**.*45.892`), desglose de tarifa plana por ticket y selección de **Pago Móvil Instantáneo (QR Dinámico)**.
- **Paso 2 — Pantalla de Pago con QR Dinámico (`src/views/PaymentQRView.tsx`):** Reserva temporal con reloj regresivo de `05:00` minutos, datos del Pago Móvil, código QR dinámico central y acciones limpias para **confirmar el pago** (Secuencia de Captura) o **cancelar/agotar tiempo** (Secuencia de Reverso con liberación inmediata de cupo).
- **Paso 3 — Boleto Digital Emitido (`src/views/TicketSuccessView.tsx`):** Ticket digital moderno con bordes troquelados, datos protegidos del titular, **QR de Acceso en Puerta** y descarga real de la entrada en formato `.png`.

### 2. Portal Organizador (`src/views/OrganizerPortalView.tsx`)
Incluye 4 pestañas comerciales sincronizadas en vivo con las compras realizadas:
1. **Mis Eventos:** Tarjetas de ocupación (vendidas vs. disponibles), enlace y modal de QR para Historias de Instagram, y modal **Crear Nuevo Evento**.
2. **Gestión de Compras y Órdenes:** Tabla en vivo con estado comercial (*Pagada*, *Pendiente de pago*, *Anulada / Reversada*), verificación manual de entrada en puerta y gestión rápida de estado.
3. **Cierre y Conciliación de Pagos:** Resumen financiero comercial (Total recaudado en Pago Móvil, Tarifa plana VelozTix de `$0.20 USD` por entrada conciliada y Monto neto liquidado equivalente al 100% del valor nominal de las entradas) + botón **Ejecutar Cuadre de Pagos**.
4. **Analítica de Audiencia (Suscripción SaaS `VelozTix Pro`):** Panel comercial para organizadores suscritos con visitas al evento, tasa de conversión, perfiles de compradores (*Fans directos* vs. *Indecisos*) e intentos de reventa/bots bloqueados automáticamente.

### 3. Telemetría Silenciosa en Segundo Plano
- El hook `src/hooks/useBehavioralTelemetry.ts` instrumenta el DOM silenciosamente (`dwell_time_ms`, `scroll_depth_pct`, `keystroke_dynamics`, `tab_switch_count` y eventos de puntero) sin mostrar paneles técnicos al usuario, registrando el resumen de forma discreta en la consola del navegador al generar una orden.

---

## Instalación y Ejecución

```bash
# Instalar dependencias
npm install

# Ejecutar entorno de desarrollo (http://localhost:5173)
npm run dev

# Compilar para producción
npm run build
```

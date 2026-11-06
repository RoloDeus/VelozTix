import { TicketOrder } from '../types/veloztix';

/**
 * Genera y descarga una imagen PNG de alta resolución del Boleto Digital VelozTix
 */
export async function downloadDigitalTicketPng(
  order: TicketOrder,
  svgElement: SVGSVGElement | null
): Promise<void> {
  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 1280;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Fondo exterior oscuro
  ctx.fillStyle = '#09090b';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Cuerpo del boleto
  const cardX = 60;
  const cardY = 60;
  const cardW = 780;
  const cardH = 1160;

  // Gradiente superior comercial
  const headerGrad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + 260);
  headerGrad.addColorStop(0, '#6d28d9');
  headerGrad.addColorStop(0.6, '#4f46e5');
  headerGrad.addColorStop(1, '#059669');

  ctx.fillStyle = '#18181b';
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, 36);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, 250, [36, 36, 0, 0]);
  ctx.clip();
  ctx.fillStyle = headerGrad;
  ctx.fillRect(cardX, cardY, cardW, 250);
  ctx.restore();

  // Marca VelozTix
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px Inter, system-ui, sans-serif';
  ctx.fillText('VelozTix · Entrada Oficial', cardX + 48, cardY + 64);

  // Título del evento (ajuste simple en 2 líneas si es largo)
  ctx.font = 'bold 36px Inter, system-ui, sans-serif';
  const words = order.eventTitle.split(' ');
  let line1 = '';
  let line2 = '';
  for (const w of words) {
    if ((line1 + ' ' + w).length <= 34) {
      line1 = (line1 + ' ' + w).trim();
    } else {
      line2 = (line2 + ' ' + w).trim();
    }
  }
  ctx.fillText(line1, cardX + 48, cardY + 132);
  if (line2) {
    ctx.fillText(line2.slice(0, 38), cardX + 48, cardY + 180);
  }

  // Datos del evento y asistente
  ctx.fillStyle = '#a1a1aa';
  ctx.font = '600 20px Inter, system-ui, sans-serif';
  ctx.fillText('FECHA Y HORA', cardX + 48, cardY + 320);
  ctx.fillText('LUGAR', cardX + 440, cardY + 320);

  ctx.fillStyle = '#f4f4f5';
  ctx.font = 'bold 24px Inter, system-ui, sans-serif';
  ctx.fillText(order.eventDateLabel, cardX + 48, cardY + 356);
  ctx.font = '500 20px Inter, system-ui, sans-serif';
  ctx.fillStyle = '#d4d4d8';
  ctx.fillText(order.eventTimeLabel, cardX + 48, cardY + 388);

  ctx.fillStyle = '#f4f4f5';
  ctx.font = 'bold 22px Inter, system-ui, sans-serif';
  ctx.fillText(order.eventVenue.slice(0, 28), cardX + 440, cardY + 356);

  // Titular con datos protegidos
  ctx.fillStyle = '#a1a1aa';
  ctx.font = '600 20px Inter, system-ui, sans-serif';
  ctx.fillText('ASISTENTE', cardX + 48, cardY + 465);
  ctx.fillText('ORDEN / ENTRADAS', cardX + 440, cardY + 465);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px Inter, system-ui, sans-serif';
  ctx.fillText(order.buyerName, cardX + 48, cardY + 502);
  ctx.fillStyle = '#34d399';
  ctx.font = '600 21px monospace';
  ctx.fillText(`Doc: ${order.maskedCedula}`, cardX + 48, cardY + 536);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px monospace';
  ctx.fillText(`#${order.id}`, cardX + 440, cardY + 502);
  ctx.fillStyle = '#d4d4d8';
  ctx.font = '600 21px Inter, system-ui, sans-serif';
  ctx.fillText(
    `${order.quantity} ${order.quantity === 1 ? 'Entrada General' : 'Entradas Generales'}`,
    cardX + 440,
    cardY + 536
  );

  // Línea troquelada divisoria
  const notchY = cardY + 610;
  ctx.fillStyle = '#09090b';
  ctx.beginPath();
  ctx.arc(cardX, notchY, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cardX + cardW, notchY, 26, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#3f3f46';
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 12]);
  ctx.beginPath();
  ctx.moveTo(cardX + 36, notchY);
  ctx.lineTo(cardX + cardW - 36, notchY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Caja blanca para el QR de acceso en puerta
  const qrBoxSize = 330;
  const qrBoxX = (canvas.width - qrBoxSize) / 2;
  const qrBoxY = notchY + 65;

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 28);
  ctx.fill();

  if (svgElement) {
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgElement);
    const svgBlob = new Blob([svgString], {
      type: 'image/svg+xml;charset=utf-8',
    });
    const url = URL.createObjectURL(svgBlob);

    await new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, qrBoxX + 25, qrBoxY + 25, qrBoxSize - 50, qrBoxSize - 50);
        URL.revokeObjectURL(url);
        resolve();
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve();
      };
      img.src = url;
    });
  }

  ctx.fillStyle = '#e4e4e7';
  ctx.textAlign = 'center';
  ctx.font = 'bold 22px Inter, system-ui, sans-serif';
  ctx.fillText(
    'Presenta este código QR en la entrada del evento',
    canvas.width / 2,
    qrBoxY + qrBoxSize + 58
  );
  ctx.fillStyle = '#71717a';
  ctx.font = '500 18px Inter, system-ui, sans-serif';
  ctx.fillText(
    'Tus datos personales están protegidos · VelozTix',
    canvas.width / 2,
    qrBoxY + qrBoxSize + 92
  );

  const link = document.createElement('a');
  link.download = `Entrada-VelozTix-${order.id}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

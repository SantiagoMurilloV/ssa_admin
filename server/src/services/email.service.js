import { env } from '../config/env.js';

export const emailEnabled = Boolean(env.resend.apiKey);

const RESEND_URL = 'https://api.resend.com/emails';

const formatCOP = (value) => `$ ${Number(value ?? 0).toLocaleString('es-CO').replace(/,/g, '.')}`;

// Los datos vienen del comprador, así que van escapados en el HTML
const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const firstName = (fullName) => String(fullName ?? '').trim().split(/\s+/)[0] || '';

/**
 * Envuelve el contenido en la identidad de la tienda. Todo va con estilos
 * inline y en tablas porque Gmail y Outlook descartan <style> y flex/grid.
 */
const shell = ({ preheader, heading, intro, reference, badge, body, items, total, footerNote }) => `
<!doctype html>
<html lang="es"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#FAF7F4;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF7F4;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:20px;border:1px solid #EFE9E3;overflow:hidden;">
        <tr><td style="padding:30px 32px 0;text-align:center;">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:23px;letter-spacing:5px;color:#14131E;">SSA</div>
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:9px;letter-spacing:4px;color:#B08D57;margin-top:3px;">IMPORT</div>
        </td></tr>
        <tr><td style="padding:26px 32px 0;text-align:center;">
          <span style="display:inline-block;padding:6px 14px;border-radius:999px;background:${badge.bg};color:${badge.color};font-family:Arial,Helvetica,sans-serif;font-size:11.5px;letter-spacing:.4px;">${escapeHtml(badge.text)}</span>
        </td></tr>
        <tr><td style="padding:16px 32px 0;">
          <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:26px;line-height:1.25;color:#14131E;text-align:center;">${escapeHtml(heading)}</h1>
        </td></tr>
        <tr><td style="padding:14px 32px 0;">
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14.5px;line-height:1.65;color:#4A4A57;">${intro}</p>
        </td></tr>
        <tr><td style="padding:22px 32px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF7F4;border-radius:14px;">
            <tr><td style="padding:16px 18px;">
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:1.2px;color:#8A8A96;text-transform:uppercase;">Referencia</div>
              <div style="font-family:Georgia,'Times New Roman',serif;font-size:20px;color:#14131E;margin-top:4px;letter-spacing:1px;">${escapeHtml(reference)}</div>
            </td></tr>
          </table>
        </td></tr>
        ${
          items.length === 0
            ? ''
            : `<tr><td style="padding:20px 32px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:Arial,Helvetica,sans-serif;font-size:13.5px;color:#4A4A57;">
            ${items
              .map(
                (item) => `<tr>
                  <td style="padding:7px 0;border-bottom:1px solid #F1ECE7;">${escapeHtml(item.quantity)}× ${escapeHtml(item.name)}</td>
                  <td style="padding:7px 0;border-bottom:1px solid #F1ECE7;text-align:right;white-space:nowrap;">${escapeHtml(formatCOP(item.lineTotal))}</td>
                </tr>`
              )
              .join('')}
            <tr>
              <td style="padding:12px 0 0;font-size:15px;color:#14131E;">Total</td>
              <td style="padding:12px 0 0;font-size:15px;color:#14131E;text-align:right;font-weight:bold;">${escapeHtml(formatCOP(total))}</td>
            </tr>
          </table>
        </td></tr>`
        }
        <tr><td style="padding:22px 32px 0;">
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13.5px;line-height:1.65;color:#4A4A57;">${body}</p>
        </td></tr>
        <tr><td style="padding:26px 32px 30px;">
          <div style="border-top:1px solid #F1ECE7;padding-top:16px;font-family:Arial,Helvetica,sans-serif;font-size:11.5px;line-height:1.6;color:#9A9AA6;">
            ${escapeHtml(footerNote)}
          </div>
        </td></tr>
      </table>
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#A9A9B4;margin-top:16px;">SSA Import · Bogotá, Colombia</div>
    </td></tr>
  </table>
</body></html>`;

const orderItems = (order) =>
  (order.items ?? []).map((item) => ({
    name: item.product_name,
    quantity: item.quantity,
    lineTotal: Number(item.unit_price) * Number(item.quantity)
  }));

/** Envía por Resend. Nunca lanza: un fallo de correo no puede tumbar un pedido. */
async function send({ to, subject, html, text }) {
  if (!emailEnabled) return { skipped: 'sin RESEND_API_KEY' };
  if (!to) return { skipped: 'pedido sin correo' };
  try {
    const response = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.resend.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: env.resend.from,
        to: [to],
        subject,
        html,
        text,
        ...(env.resend.replyTo ? { reply_to: env.resend.replyTo } : {})
      }),
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('[email] rechazado por Resend', response.status, detail.slice(0, 300));
      return { ok: false };
    }
    return { ok: true };
  } catch (error) {
    console.error('[email] fallo al enviar', error?.message ?? error);
    return { ok: false };
  }
}

// ── Plantillas ──────────────────────────────────────────────────────────────

export function receiptReceivedEmail(order) {
  const name = firstName(order.customer_name);
  const items = orderItems(order);
  return {
    subject: `Recibimos tu comprobante · ${order.reference}`,
    html: shell({
      preheader: `Tu pago de ${order.reference} está pendiente por confirmar.`,
      badge: { text: 'Pago por confirmar', bg: '#F2D9CE', color: '#7A4A32' },
      heading: '¡Gracias por tu pedido!',
      intro: `${name ? `Hola ${escapeHtml(name)}, r` : 'R'}ecibimos tu comprobante de pago. <strong style="color:#14131E;">Tu pago está pendiente por confirmar</strong>: lo revisamos y te avisamos apenas quede verificado.`,
      reference: order.reference,
      items,
      total: order.total,
      body: 'La verificación normalmente toma unas pocas horas en horario hábil. No necesitas hacer nada más: te escribimos a este mismo correo en cuanto confirmemos el pago.',
      footerNote:
        'Si no reconoces este pedido o necesitas cambiar algo, respóndenos este correo o escríbenos por WhatsApp con tu referencia.'
    }),
    text: [
      `¡Gracias por tu pedido!`,
      '',
      `${name ? `Hola ${name}, r` : 'R'}ecibimos tu comprobante de pago. Tu pago está pendiente por confirmar.`,
      '',
      `Referencia: ${order.reference}`,
      ...items.map((i) => `  ${i.quantity}x ${i.name} — ${formatCOP(i.lineTotal)}`),
      `Total: ${formatCOP(order.total)}`,
      '',
      'Lo revisamos y te avisamos a este mismo correo apenas quede verificado.',
      '',
      'SSA Import · Bogotá, Colombia'
    ].join('\n')
  };
}

export function paymentConfirmedEmail(order) {
  const name = firstName(order.customer_name);
  const items = orderItems(order);
  return {
    subject: `Pago confirmado · ${order.reference}`,
    html: shell({
      preheader: `Confirmamos tu pago. El pedido ${order.reference} ya está en proceso.`,
      badge: { text: 'Pago confirmado', bg: '#D7E4DA', color: '#33553F' },
      heading: '¡Pago confirmado!',
      intro: `${name ? `Hola ${escapeHtml(name)}, c` : 'C'}onfirmamos tu pago. <strong style="color:#14131E;">Tu pedido ${escapeHtml(order.reference)} ya está en proceso.</strong>`,
      reference: order.reference,
      items,
      total: order.total,
      body: `Lo estamos preparando para despacharlo a <strong style="color:#14131E;">${escapeHtml(order.address)}, ${escapeHtml(order.city)}</strong>. Te escribimos otra vez con la guía cuando salga el envío. Lo que está en stock sale de inmediato; la preventa llega en máximo 15 días hábiles.`,
      footerNote: 'Cualquier duda, responde este correo o escríbenos por WhatsApp con tu referencia.'
    }),
    text: [
      '¡Pago confirmado!',
      '',
      `${name ? `Hola ${name}, c` : 'C'}onfirmamos tu pago. Tu pedido ${order.reference} ya está en proceso.`,
      '',
      `Referencia: ${order.reference}`,
      ...items.map((i) => `  ${i.quantity}x ${i.name} — ${formatCOP(i.lineTotal)}`),
      `Total: ${formatCOP(order.total)}`,
      '',
      `Envío a: ${order.address}, ${order.city}`,
      'Te escribimos con la guía cuando salga el envío.',
      '',
      'SSA Import · Bogotá, Colombia'
    ].join('\n')
  };
}

// ── Disparadores (fire-and-forget, como las notificaciones push) ────────────

export const sendReceiptReceived = (order) =>
  send({ to: order.email, ...receiptReceivedEmail(order) }).catch(() => {});

export const sendPaymentConfirmed = (order) =>
  send({ to: order.email, ...paymentConfirmedEmail(order) }).catch(() => {});

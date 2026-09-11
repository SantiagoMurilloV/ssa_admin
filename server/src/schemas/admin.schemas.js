import { z } from 'zod';

// El acceso es por usuario, no por correo: puede ser 'admin' o un email.
export const loginSchema = z
  .object({
    user: z.string().trim().min(1).max(160),
    password: z.string().min(1).max(200)
  })
  .strict();

export const productSchema = z
  .object({
    id: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug inválido: usa minúsculas, números y guiones')
      .max(60)
      .optional(),
    name: z.string().trim().min(2).max(120),
    detail: z.string().trim().max(160).default(''),
    description: z.string().trim().max(2000).default(''),
    category: z.string().trim().min(2).max(60).default('General'),
    price: z.number().int().min(0),
    inStock: z.boolean().default(true),
    // null = sin límite de unidades (preventa, reposición constante)
    stock: z.number().int().min(0).max(100000).nullable().default(null),
    featured: z.boolean().default(false),
    active: z.boolean().default(true)
  })
  .strict();

// Opciones de un producto: "Aroma" con sus valores, "Talla" con los suyos.
export const productOptionsSchema = z
  .object({
    options: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(40),
            values: z.array(z.string().trim().min(1).max(60)).min(1).max(50)
          })
          .strict()
      )
      .max(3) // más de 3 ejes vuelve la grilla de variantes inmanejable
  })
  .strict();

export const productVariantSchema = z
  .object({
    // {"Aroma":"Bombshell","Talla":"M"}
    options: z.record(z.string().trim().max(40), z.string().trim().max(60)),
    label: z.string().trim().max(120).default(''),
    sku: z.string().trim().max(60).nullable().default(null),
    // null = hereda el precio del producto (varios perfumes al mismo precio)
    price: z.number().int().min(0).nullable().default(null),
    // null = sin límite de unidades
    stock: z.number().int().min(0).max(100000).nullable().default(null),
    photoId: z.number().int().positive().nullable().default(null),
    active: z.boolean().default(true)
  })
  .strict();

export const orderStatusSchema = z
  .object({
    status: z.enum(['pending', 'paid', 'shipped', 'cancelled']),
    shipping: z
      .object({
        type: z.enum(['local', 'carrier']),
        carrier: z.string().trim().max(80).optional(),
        trackingNumber: z.string().trim().max(80).optional(),
        trackingUrl: z.string().trim().url().max(300).optional()
      })
      .strict()
      .optional()
  })
  .strict();

export const shippingConfigSchema = z
  .object({
    defaultFee: z.number().int().min(0),
    cities: z
      .array(
        z.object({ name: z.string().trim().min(2).max(80), fee: z.number().int().min(0) }).strict()
      )
      .max(200)
  })
  .strict();

export const paymentChannelsSchema = z
  .object({
    channels: z
      .array(
        z
          .object({
            id: z.string().trim().max(60).optional(),
            type: z.string().trim().min(2).max(40),
            label: z.string().trim().max(80).optional(),
            account: z.string().trim().max(80),
            holder: z.string().trim().max(80).optional(),
            instructions: z.string().trim().max(300).optional(),
            active: z.boolean().default(true)
          })
          .strict()
      )
      .max(12)
  })
  .strict();

export const promotionSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    discountPct: z.number().int().min(1).max(90),
    startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    active: z.boolean().default(true)
  })
  .strict();

export const encargoStatusSchema = z
  .object({ status: z.enum(['nuevo', 'contactado', 'cerrado']) })
  .strict();

export const pushSubscriptionSchema = z
  .object({
    endpoint: z.string().url().max(600),
    keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(200) }).strict()
  })
  .strict();

// ── Clientes y encargos del panel ─────────────────────────────────────────────
import { TRACKING_STAGE_KEYS } from '../config/tracking-stages.js';

const dateString = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida: usa AAAA-MM-DD');

// Los montos llegan como texto cuando el formulario es multipart (trae la foto
// y el desprendible) y como número cuando es JSON: coerce acepta ambos.
const money = z.coerce.number().int('Debe ser un entero en pesos').min(0).max(1_000_000_000);

export const clientSchema = z
  .object({
    name: z.string().trim().min(2, 'Escribe el nombre del cliente').max(120),
    phone: z.string().trim().min(7, 'Teléfono muy corto').max(40),
    email: z.string().trim().email('Correo inválido').max(160).optional(),
    city: z.string().trim().max(80).optional(),
    department: z.string().trim().max(80).optional(),
    address: z.string().trim().max(200).optional(),
    notes: z.string().trim().max(1000).optional()
  })
  .strict();

// Crear un encargo: el cliente puede ser uno existente (clientId) o uno nuevo
// escrito ahí mismo (clientName + clientPhone); si el teléfono ya es de
// alguien, se reutiliza esa persona. El abono inicial es opcional.
export const createPedidoSchema = z
  .object({
    clientId: z.coerce.number().int().positive().optional(),
    clientName: z.string().trim().min(2).max(120).optional(),
    clientPhone: z.string().trim().min(7, 'Teléfono muy corto').max(40).optional(),
    clientEmail: z.string().trim().email('Correo inválido').max(160).optional(),
    clientCity: z.string().trim().max(80).optional(),
    brand: z.string().trim().max(80).default(''),
    productRef: z.string().trim().min(2, 'Escribe la referencia del producto').max(300),
    orderedAt: dateString.optional(),
    saleValue: money,
    notes: z.string().trim().max(1000).optional(),
    paidAmount: money.optional(),
    paidAt: dateString.optional(),
    paymentNote: z.string().trim().max(300).optional()
  })
  .strict()
  .refine((data) => data.clientId || (data.clientName && data.clientPhone), {
    message: 'Falta el cliente: elige uno existente o escribe nombre y teléfono',
    path: ['clientName']
  })
  .refine((data) => data.paidAmount === undefined || data.paidAmount <= data.saleValue, {
    message: 'El abono no puede ser mayor que el valor de la venta',
    path: ['paidAmount']
  });

export const updatePedidoSchema = z
  .object({
    clientId: z.coerce.number().int().positive().optional(),
    brand: z.string().trim().max(80).default(''),
    productRef: z.string().trim().min(2).max(300),
    orderedAt: dateString.optional(),
    saleValue: money,
    notes: z.string().trim().max(1000).optional()
  })
  .strict();

export const pedidoPaymentSchema = z
  .object({
    amount: z.coerce.number().int('Debe ser un entero en pesos').positive('El abono debe ser mayor a cero').max(1_000_000_000),
    paidAt: dateString.optional(),
    note: z.string().trim().max(300).optional()
  })
  .strict();

export const pedidoStatusSchema = z.object({ status: z.enum(['open', 'cancelled']) }).strict();

// Etapa de la guía (encargos y pedidos de la tienda). Los datos de la
// transportadora acompañan normalmente a 'dispatched', pero se aceptan siempre.
export const trackingStageSchema = z
  .object({
    stage: z.enum(TRACKING_STAGE_KEYS),
    note: z.string().trim().max(300).optional(),
    carrier: z.string().trim().max(80).optional(),
    trackingNumber: z.string().trim().max(80).optional(),
    trackingUrl: z.string().trim().url('Link inválido').max(300).optional()
  })
  .strict();

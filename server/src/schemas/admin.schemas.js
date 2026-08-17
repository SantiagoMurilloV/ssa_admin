import { z } from 'zod';

export const loginSchema = z
  .object({
    email: z.string().trim().email().max(160),
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

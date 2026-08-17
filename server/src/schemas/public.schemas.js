import { z } from 'zod';

// Mantener sincronizado con ssa_store/server/src/schemas/order.schema.js
export const createOrderSchema = z
  .object({
    customer: z
      .object({
        fullName: z.string().trim().min(2).max(120),
        phone: z.string().trim().regex(/^\+?[\d\s().-]{7,20}$/, 'Invalid phone number'),
        email: z.string().trim().email().max(160)
      })
      .strict(),
    shipping: z
      .object({
        department: z.string().trim().min(2).max(80),
        city: z.string().trim().min(2).max(80),
        address: z.string().trim().min(5).max(200),
        notes: z.string().trim().max(500).optional()
      })
      .strict(),
    payment: z.literal('transfer'),
    paymentChannelId: z.string().trim().max(60).optional(),
    items: z
      .array(
        z
          .object({
            productId: z.string().trim().min(1).max(60),
            quantity: z.number().int().min(1).max(10)
          })
          .strict()
      )
      .min(1)
      .max(8),
    // honeypot anti-bots: debe llegar vacío
    website: z.literal('')
  })
  .strict();

export const createEncargoSchema = z
  .object({
    producto: z.string().trim().min(2).max(300),
    marca: z.string().trim().max(80).optional(),
    color: z.string().trim().max(80).optional(),
    talla: z.string().trim().max(80).optional(),
    nombre: z.string().trim().min(2).max(120),
    contacto: z.string().trim().min(7).max(40),
    website: z.literal('')
  })
  .strict();

export const subscribeSchema = z
  .object({
    email: z.string().trim().email().max(160),
    website: z.literal('')
  })
  .strict();

export const eventSchema = z
  .object({
    // 'purchase' se registra server-side al crear el pedido; no es spoofeable
    type: z.enum(['page_view', 'product_view', 'add_to_cart'])
  })
  .strict();

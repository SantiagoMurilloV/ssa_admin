# SSA Import · Admin

Panel de administración y **única fuente de verdad** de la tienda: catálogo,
contenido del sitio, pedidos, canales de pago, envíos, promociones y encargos.

La tienda nunca toca la base de datos: consume este API a través de sus funciones
serverless.

> Repo de la tienda:
> [`SantiagoMurilloV/ssa_import`](https://github.com/SantiagoMurilloV/ssa_import)
> (en local, la carpeta `ssa_store`).

## Stack

- **Server**: Node 20+, Express 5, PostgreSQL (`pg`), JWT en cookie httpOnly, Zod 4, Cloudinary, Web Push
- **Client**: React 19 + Vite 7 + React Router 7, CSS propio (sin librería de componentes)
- **Deploy**: API en Railway (`railway.json`), panel en Vercel (`client/vercel.json`)

## Puesta en marcha

```bash
npm install
cp server/.env.example server/.env     # completa DATABASE_URL, JWT_SECRET, etc.
createdb ssa_admin                     # o apunta DATABASE_URL a tu Postgres
npm run dev                            # API :4500 · panel :5174
```

Al arrancar, el servidor corre migraciones y seed automáticamente. El seed crea el
usuario admin (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`) y, **solo fuera de
producción**, 9 productos y pedidos de demostración.

### Imágenes

Con credenciales de Cloudinary, todo (fotos de producto, comprobantes, encargos,
imágenes de contenido) se sube a la carpeta `ssaimport/…`. **Sin credenciales y
fuera de producción**, los archivos se guardan en `server/uploads/` y se sirven en
`/uploads/...` para poder desarrollar sin cuenta. En producción sin Cloudinary,
cualquier subida responde 503 (el disco de Railway es efímero).

## Endpoints

Todos bajo `/api`.

### Públicos (los consume la tienda vía sus funciones serverless)

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/health` | Healthcheck de Railway |
| POST | `/events` | Registra `page_view` \| `product_view` \| `add_to_cart` (`purchase` es server-side) |
| GET | `/public/catalog` | Productos activos, categorías, envíos, promoción vigente y canales de pago |
| GET | `/public/site-content` | Documento completo de contenido del sitio |
| POST | `/public/orders` | Crea el pedido **recalculando precios, promoción y envío** |
| POST | `/public/orders/:reference/receipt` | Sube la foto del comprobante (multipart, campo `image`) |
| POST | `/public/encargos` | Encargo a pedido, con foto opcional |
| POST | `/public/subscribe` | Alta en el newsletter |

### Autenticación

`POST /auth/login` · `POST /auth/logout` · `GET /auth/me`
Cookie `ssa_admin_token`, JWT de 12 h, `sameSite: none` + `secure` en producción.

### Protegidos

| Método | Ruta |
|---|---|
| GET | `/stats/dashboard`, `/subscribers` |
| GET / PATCH | `/orders`, `/orders/:id/status` |
| GET POST PUT DELETE | `/products`, `/products/:id` |
| POST / DELETE | `/products/:id/photos`, `/products/:id/photos/:photoId` |
| GET / PUT | `/content` |
| POST / DELETE | `/content/images/:section` |
| GET / PUT | `/config/shipping`, `/config/payment-channels` |
| GET / PATCH | `/encargos`, `/encargos/:id/status` |
| GET POST PUT DELETE | `/promotions`, `/promotions/:id` |
| GET | `/push/config` · POST/DELETE `/push/subscriptions` |

## Base de datos

`admin_users`, `products`, `product_photos`, `orders`, `order_items`, `events`,
`promotions`, `encargos`, `subscribers`, `push_subscriptions`, `settings`.

Las migraciones viven en `server/src/db/migrations/*.sql` y se aplican en orden
alfabético dentro de una transacción, registrándose en `schema_migrations`.

En `settings` (clave → JSON) viven tres documentos:
`site_content`, `shipping_config` y `payment_channels`.

### Seguridad del flujo de pago

- Los precios, el descuento y el envío **se recalculan siempre en el servidor**; el
  navegador solo manda `productId` y `quantity`.
- Subir el comprobante exige el **token opaco** que se entrega una sola vez al crear
  el pedido. La referencia `SSA-######` es pública y no autoriza nada.
- El header `X-Store-Client-IP` (la IP del comprador para el rate limit) solo se
  respeta si la petición trae `STORE_PROXY_SECRET`. Sin eso, cualquiera lo
  falsificaría con un valor distinto por request y los límites nunca aplicarían.
- Todos los formularios públicos llevan honeypot obligatorio.
- Volver un pedido a `pending` deshace también la verificación del pago, para que el
  cliente pueda subir un comprobante corregido.

### Ciclo de vida de un pedido

```
status:         pending ──► paid ──► shipped
                   ▲          │         │
                   └──────────┴─────────┘   "Volver a pendiente" en el panel

                pending / paid / shipped ──► cancelled
                                             devuelve el inventario retenido

payment_status: awaiting_receipt ──► in_review ──► verified
                (sin comprobante)   (subió foto)   (admin confirmó)
```

`cancelled` no toca `payment_status` ni `paid_at`: el pedido está muerto, no verificado.

### Inventario

`products.stock` cuenta unidades. **`NULL` = sin límite** (preventa, o lo que se
repone siempre); es el valor de todo lo que existía antes de la migración `003`.

Las unidades se **retienen al crear el pedido**, no al confirmar el pago. Aquí no
hay pasarela, así que si esperáramos a la verificación manual la misma última
unidad se le prometería a varios compradores a la vez. El costo de esa decisión es
que un pedido que nunca se paga retiene stock hasta que lo canceles.

- El descuento va en el mismo `UPDATE` que la condición
  (`WHERE stock IS NULL OR stock >= $qty`), dentro de la transacción que crea el
  pedido: dos pedidos simultáneos por la última unidad se serializan en el row
  lock, uno gana y el otro recibe **409** con cuántas quedan.
- Con `stock = 0` el producto desaparece de `/public/catalog`, pero sigue en el
  panel. No se borra ni se desactiva solo.
- **Cancelar** devuelve las unidades. Solo el cruce de la frontera `cancelled`
  mueve inventario, y `SELECT ... FOR UPDATE` garantiza que cancelar dos veces no
  lo devuelva dos veces. Sacar un pedido de `cancelled` vuelve a retenerlo, y
  falla con 409 si en el entretanto se vendieron a otro.
- El `CHECK (stock IS NULL OR stock >= 0)` es la última línea: ni un `UPDATE` a
  mano puede dejar stock negativo.

La lógica vive en SQL, así que se prueba contra una base de verdad
(`server/test/stock.test.js`, ver [Tests](#tests)).

## Páginas del panel

| Ruta | Contenido |
|---|---|
| `/` | KPIs de 7 días, embudo, gráfica de 14 días, ingresos del mes |
| `/pedidos` | Filtros por estado, buscador, ver comprobante, confirmar pago, marcar enviado con guía |
| `/productos` | CRUD completo + galería de fotos/videos por producto |
| `/contenido` | Textos de todas las secciones del sitio + orden y visibilidad + imágenes |
| `/encargos` | Cotizaciones a pedido con foto, atajo a WhatsApp, y lista de suscriptores |
| `/configuracion` | Canales de pago (transferencia), tarifas de envío, promociones |

## Deploy

**API en Railway**: apunta el servicio a este repo. `railway.json` ya define el
start command y el healthcheck `/api/health`. Configura las variables del
`.env.example` (con `NODE_ENV=production` y `CLIENT_ORIGIN` = dominio del panel).

**Panel en Vercel**: proyecto con root `client/`. Edita el rewrite de
`client/vercel.json` para que `/api/:path*` apunte a tu dominio de Railway — así la
cookie de sesión es first-party y Safari no la bloquea.

## Archivos espejo

Deben mantenerse sincronizados a mano con el repo de la tienda
(`ssa_import`, carpeta local `ssa_store`). `npm test` falla si se desincronizan:

| Este repo | tienda |
|---|---|
| `server/src/config/default-site-content.js` | `server/src/config/default-site-content.js` |
| `server/src/schemas/public.schemas.js` (createOrderSchema) | `server/src/schemas/order.schema.js` |
| `server/src/config/shipping-config.js` (resolveShippingFee) | `client/src/utils/shipping.js` |

## Tests

```bash
npm test            # 40 tests, sin base de datos
```

Cubren la regla de envíos, los canales de pago, el merge de contenido, el schema
del pedido y que los archivos espejo no se desincronicen.

Los 9 tests de inventario necesitan Postgres y **borran productos y pedidos**, así
que se omiten salvo que los apuntes a propósito a una base desechable:

```bash
createdb ssa_stock_test
STOCK_TEST_DATABASE_URL=postgres://localhost:5432/ssa_stock_test npm test   # 49
```

Recrean el esquema desde las migraciones, así que también comprueban que
`001 → 002 → 003` aplican en orden sobre una base vacía.

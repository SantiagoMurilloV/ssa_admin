# SSA Import · Admin

Panel de administración y **única fuente de verdad** de la tienda: catálogo,
contenido del sitio, pedidos, encargos con guía de seguimiento, clientes, canales
de pago, envíos y promociones.

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
| GET | `/public/tracking/:reference` | Guía pública de un código `SSA-######` (encargo o pedido de la tienda): etapa, historial, producto y ciudad. Nada de teléfono, dirección ni montos |
| POST / DELETE | `/public/tracking/:reference/subscribe` | Alta / baja de los avisos push de **esa** referencia (`{endpoint, keys}`) |

### Autenticación

`POST /auth/login` · `POST /auth/logout` · `GET /auth/me`
Cookie `ssa_admin_token`, JWT de 12 h, `sameSite: none` + `secure` en producción.

### Protegidos

| Método | Ruta |
|---|---|
| GET | `/stats/dashboard`, `/subscribers` |
| GET / PATCH / DELETE | `/orders`, `/orders/:id/status`, `/orders/:id/tracking`, `/orders/:id` |
| GET POST PUT DELETE | `/pedidos`, `/pedidos/:id` (crear es multipart: campos + `photo` + `receipt`) |
| POST / DELETE | `/pedidos/:id/photo`, `/pedidos/:id/payments` (multipart `image`), `/pedidos/:id/payments/:paymentId` |
| PATCH | `/pedidos/:id/tracking` (etapa de la guía) · `/pedidos/:id/status` (`open` / `cancelled`) |
| GET POST PUT DELETE | `/clients`, `/clients/:id` (GET trae el historial: encargos + compras en tienda por teléfono) |
| GET POST PUT DELETE | `/products`, `/products/:id` |
| POST / DELETE | `/products/:id/photos`, `/products/:id/photos/:photoId` |
| GET / PUT | `/content` |
| POST / DELETE | `/content/images/:section` |
| GET / PUT | `/config/shipping`, `/config/payment-channels` |
| GET / PATCH | `/encargos`, `/encargos/:id/status` |
| GET POST PUT DELETE | `/promotions`, `/promotions/:id` |
| GET | `/push/config` · POST/DELETE `/push/subscriptions` |

## Base de datos

`admin_users`, `products`, `product_photos`, `product_options`, `product_variants`,
`orders`, `order_items`, `events`, `promotions`, `encargos`, `subscribers`,
`push_subscriptions`, `settings`, `clients`, `pedidos`, `pedido_payments`,
`tracking_subscriptions`.

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

**Eliminar** (`DELETE /orders/:id`) es otra cosa: borra la fila y sus líneas y no se
puede deshacer. Si el pedido estaba en `pending` o `paid` devuelve el inventario que
retenía; si estaba en `shipped` o `cancelled` no lo toca (ya salió de la bodega, o ya
se devolvió al cancelar). El comprobante se borra del storage.

### Encargos con guía (`pedidos`) y clientes

Además de los pedidos que nacen en el checkout (`orders`), el admin crea a mano
los **encargos** que acuerda por WhatsApp: marca, referencia, foto, cliente,
fecha, valor de venta y lo que el cliente ya abonó con su desprendible. Cada uno
recibe una referencia `SSA-######` del **mismo espacio que los pedidos de la
tienda** (`OrderModel.create` y `PedidoModel.create` comprueban la otra tabla
antes de insertar), así que la guía pública busca el código en ambas.

- Los abonos viven en `pedido_payments` (uno por pago, con desprendible). Lo
  pagado es la suma; `balance = sale_value - paid`.
- Cada encargo cae en exactamente una pestaña, derivada en SQL (`bucket`):
  `cancelled` → `delivered` (etapa final) → `paid` (sin saldo) → `pending`.
- `clients.phone_digits` (solo dígitos, sin el 57) es UNIQUE: crear un encargo
  con un teléfono ya registrado reutiliza a esa persona. El historial del cliente
  cruza también los pedidos de la tienda por ese mismo número.
- Un cliente con encargos no se puede borrar (FK `RESTRICT` → 409).
- En el dashboard (`StatsModel.finance`) los encargos suman: **ingresos del mes**
  = pedidos pagados/enviados de la tienda + abonos registrados en el mes
  (`pedido_payments.paid_at`); **ventas de encargos** = `sale_value` de los
  encargos con `ordered_at` en el mes; **por cobrar** = saldo de todos los
  encargos abiertos, sin importar el mes. Los cancelados no cuentan.

### Guía de seguimiento

`tracking_stage` recorre `usa → transit → colombia → warehouse → dispatched →
delivered` (definidas en `src/config/tracking-stages.js`, espejo en la tienda).
Cada cambio real de etapa agrega `{stage, at, note}` a `tracking_history`
(JSONB) y manda un push a las suscripciones de **esa referencia**
(`tracking_subscriptions`, distintas de las del admin). Marcar un pedido de la
tienda como `shipped` avanza su guía a `dispatched` si iba antes.

Las notificaciones al comprador usan las mismas llaves VAPID que las del panel:
sin `VAPID_*` la guía funciona igual pero la tienda no ofrece avisos.

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
- **Eliminar** un pedido `pending` o `paid` también devuelve las unidades (con el
  mismo row lock, así que cancelar y borrar a la vez no las duplica). Eliminar uno
  `shipped` o `cancelled` no mueve inventario.
- El `CHECK (stock IS NULL OR stock >= 0)` es la última línea: ni un `UPDATE` a
  mano puede dejar stock negativo.

La lógica vive en SQL, así que se prueba contra una base de verdad
(`server/test/stock.test.js`, ver [Tests](#tests)).

## Páginas del panel

| Ruta | Contenido |
|---|---|
| `/` | KPIs de 7 días, embudo y gráfica de 14 días de la tienda; dinero del mes sumando tienda + abonos de encargos, ventas de encargos, saldo por cobrar y encargos por estado |
| `/pedidos` | Dos vistas: **Encargos** (crear con cliente, foto, valor y abono inicial; registrar abonos; cambiar la etapa de la guía; compartir el enlace por WhatsApp) y **Tienda** (los del checkout: comprobante, confirmar pago, marcar enviado, y la misma guía) |
| `/clientes` | Agenda de clientes con buscador, totales (encargos, tienda, comprado, saldo) e historial de compras |
| `/productos` | CRUD completo + galería de fotos/videos por producto |
| `/contenido` | Textos de todas las secciones del sitio + orden y visibilidad + imágenes |
| `/encargos` | Cotizaciones que llegan del formulario público, atajo a WhatsApp, botón **Crear pedido** que abre el formulario de encargo prellenado, y lista de suscriptores |
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
| `server/src/config/tracking-stages.js` | `server/src/config/tracking-stages.js` |

## Tests

```bash
npm test            # 52 tests, sin base de datos
```

Cubren la regla de envíos, los canales de pago, el merge de contenido, el schema
del pedido, las etapas de la guía, la normalización de teléfonos y códigos, y
que los archivos espejo no se desincronicen.

Los tests de inventario y de encargos necesitan Postgres y **recrean el esquema**,
así que se omiten salvo que los apuntes a propósito a una base desechable:

```bash
createdb ssa_stock_test
STOCK_TEST_DATABASE_URL=postgres://localhost:5432/ssa_stock_test npm test   # 76
```

Aplican todas las migraciones en orden sobre una base vacía. Los dos archivos
comparten la base, por eso `npm test` corre con `--test-concurrency=1`.

-- Clientes: la persona detrás de cada encargo. El teléfono en solo dígitos es
-- la llave natural (es como se les escribe por WhatsApp) y evita registrar dos
-- veces a la misma persona con el número escrito distinto.
CREATE TABLE clients (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  phone_digits TEXT NOT NULL UNIQUE,
  email TEXT,
  city TEXT,
  department TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Encargos que el admin crea a mano (a diferencia de `orders`, que nacen en el
-- checkout de la tienda). Comparten con orders el formato de referencia
-- SSA-###### y la guía de seguimiento pública: el cliente entra a la tienda con
-- su código y ve en qué etapa va, sea de la tienda o un encargo.
CREATE TABLE pedidos (
  id SERIAL PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  brand TEXT NOT NULL DEFAULT '',
  product_ref TEXT NOT NULL,
  photo_public_id TEXT,
  photo_url TEXT,
  ordered_at DATE NOT NULL DEFAULT CURRENT_DATE,
  sale_value INTEGER NOT NULL CHECK (sale_value >= 0),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'cancelled')),
  tracking_stage TEXT NOT NULL DEFAULT 'usa'
    CHECK (tracking_stage IN ('usa', 'transit', 'colombia', 'warehouse', 'dispatched', 'delivered')),
  -- [{"stage":"usa","at":"2026-09-11T14:00:00Z","note":null}, ...]
  tracking_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  tracking_carrier TEXT,
  tracking_number TEXT,
  tracking_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX pedidos_client_idx ON pedidos(client_id);
CREATE INDEX pedidos_status_idx ON pedidos(status);
CREATE INDEX pedidos_created_idx ON pedidos(created_at);

-- Abonos del encargo: el 50 % inicial y lo que falte, cada uno con su
-- desprendible. Lo pagado es la suma; lo que falta, sale_value menos eso.
CREATE TABLE pedido_payments (
  id SERIAL PRIMARY KEY,
  pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0),
  paid_at DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  receipt_public_id TEXT,
  receipt_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX pedido_payments_pedido_idx ON pedido_payments(pedido_id);

-- Los pedidos de la tienda se rastrean con la misma guía. Los que ya estaban
-- marcados como enviados arrancan en 'dispatched' para no retroceder su estado.
ALTER TABLE orders ADD COLUMN tracking_stage TEXT NOT NULL DEFAULT 'usa'
  CHECK (tracking_stage IN ('usa', 'transit', 'colombia', 'warehouse', 'dispatched', 'delivered'));
ALTER TABLE orders ADD COLUMN tracking_history JSONB NOT NULL DEFAULT '[]'::jsonb;
UPDATE orders SET tracking_stage = 'dispatched' WHERE status = 'shipped';

-- Suscripción push del comprador a UNA referencia. Distinta de
-- push_subscriptions (la del admin, que recibe todo): aquí cada navegador
-- solo recibe avisos del código que él mismo consultó y autorizó.
CREATE TABLE tracking_subscriptions (
  id SERIAL PRIMARY KEY,
  reference TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reference, endpoint)
);
CREATE INDEX tracking_subscriptions_reference_idx ON tracking_subscriptions(reference);

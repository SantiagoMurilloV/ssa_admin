CREATE TABLE admin_users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'General',
  price INTEGER NOT NULL CHECK (price >= 0),
  currency TEXT NOT NULL DEFAULT 'COP',
  in_stock BOOLEAN NOT NULL DEFAULT TRUE,
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE product_photos (
  id SERIAL PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  public_id TEXT NOT NULL,
  url TEXT NOT NULL,
  label TEXT,
  media_type TEXT NOT NULL DEFAULT 'image',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  department TEXT NOT NULL,
  city TEXT NOT NULL,
  address TEXT NOT NULL,
  notes TEXT,
  payment_method TEXT NOT NULL DEFAULT 'transfer' CHECK (payment_method IN ('transfer')),
  payment_channel TEXT,
  payment_status TEXT NOT NULL DEFAULT 'awaiting_receipt'
    CHECK (payment_status IN ('awaiting_receipt', 'in_review', 'verified')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  subtotal INTEGER NOT NULL,
  shipping_fee INTEGER NOT NULL,
  total INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'shipped')),
  receipt_public_id TEXT,
  receipt_url TEXT,
  shipping_type TEXT CHECK (shipping_type IN ('local', 'carrier')),
  tracking_carrier TEXT,
  tracking_number TEXT,
  tracking_url TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX orders_status_idx ON orders(status);
CREATE INDEX orders_created_at_idx ON orders(created_at);

CREATE TABLE order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  unit_price INTEGER NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0)
);
CREATE INDEX order_items_order_idx ON order_items(order_id);

CREATE TABLE events (
  id BIGSERIAL PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('page_view', 'product_view', 'add_to_cart', 'purchase')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX events_type_created_idx ON events(type, created_at);

CREATE TABLE promotions (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  discount_pct INTEGER NOT NULL CHECK (discount_pct BETWEEN 1 AND 90),
  starts_at DATE NOT NULL,
  ends_at DATE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at >= starts_at)
);

CREATE TABLE encargos (
  id SERIAL PRIMARY KEY,
  producto TEXT NOT NULL,
  marca TEXT,
  color TEXT,
  talla TEXT,
  nombre TEXT NOT NULL,
  contacto TEXT NOT NULL,
  photo_public_id TEXT,
  photo_url TEXT,
  status TEXT NOT NULL DEFAULT 'nuevo' CHECK (status IN ('nuevo', 'contactado', 'cerrado')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX encargos_status_idx ON encargos(status);

CREATE TABLE subscribers (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE push_subscriptions (
  id SERIAL PRIMARY KEY,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Variantes de producto (talla, color, aroma…), al estilo Amazon/MercadoLibre.
-- Un producto sin opciones sigue funcionando exactamente igual que antes: no
-- tiene variantes y su inventario sigue en products.stock.

-- Opciones y sus valores en orden. option_values y no "values" porque VALUES es
-- palabra reservada en SQL y obligaría a citarla en cada consulta.
CREATE TABLE product_options (
  id SERIAL PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  option_values TEXT[] NOT NULL DEFAULT '{}',
  position INTEGER NOT NULL DEFAULT 0,
  UNIQUE (product_id, name)
);
CREATE INDEX product_options_product_idx ON product_options(product_id);

-- Una fila por combinación vendible. El inventario vive acá: si quedan 2 de un
-- aroma y 0 de otro, la tienda no puede vender el que se agotó.
CREATE TABLE product_variants (
  id SERIAL PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  -- {"Aroma":"Bombshell","Talla":"M"}: la combinación que representa
  options JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- "Bombshell · M", congelado para pedidos y correos
  label TEXT NOT NULL DEFAULT '',
  sku TEXT,
  -- NULL = hereda el precio del producto (el caso de los perfumes)
  price INTEGER CHECK (price IS NULL OR price >= 0),
  -- NULL = sin límite, igual que products.stock
  stock INTEGER CHECK (stock IS NULL OR stock >= 0),
  photo_id INTEGER REFERENCES product_photos(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX product_variants_product_idx ON product_variants(product_id);
-- No puede haber dos variantes con la misma combinación
CREATE UNIQUE INDEX product_variants_combo_idx ON product_variants(product_id, options);

-- Qué variante se vendió. Sin FK a propósito: borrar una variante no puede
-- borrar ni corromper el histórico de un pedido ya hecho.
ALTER TABLE order_items ADD COLUMN variant_id INTEGER;
ALTER TABLE order_items ADD COLUMN variant_label TEXT;

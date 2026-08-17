-- Inventario por unidades.
-- NULL = sin límite: es el valor de los productos que ya existían y de todo lo
-- que se repone o se trae por preventa, para que nada quede agotado de golpe.
ALTER TABLE products ADD COLUMN stock INTEGER;
ALTER TABLE products ADD CONSTRAINT products_stock_check CHECK (stock IS NULL OR stock >= 0);

-- Las unidades se retienen al crear el pedido, así nadie revende la última.
-- 'cancelled' es el estado que las devuelve al inventario cuando un pedido
-- nunca se paga: sin él, un pedido falso se queda con el stock para siempre.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'paid', 'shipped', 'cancelled'));

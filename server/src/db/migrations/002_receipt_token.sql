-- La referencia SSA-###### es corta y se muestra al cliente: no sirve como
-- credencial. El token opaco autoriza subir el comprobante de ESE pedido.
ALTER TABLE orders ADD COLUMN receipt_token TEXT;

-- Los pedidos que ya existan quedan sin token; se les permite subir solo con
-- la referencia (comportamiento anterior) para no romperlos.
CREATE INDEX orders_receipt_token_idx ON orders(receipt_token);

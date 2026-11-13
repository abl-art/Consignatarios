-- EAN real opcional por producto (13/11/2026): si está cargado se informa ese
-- en los webhooks de compras; si no, se genera uno provisorio 299 (lib/ean-provisorio.ts)
-- para que GOcelular pueda dar de alta el producto en Andreani y crear la ASN.
ALTER TABLE compras_productos ADD COLUMN IF NOT EXISTS ean text;

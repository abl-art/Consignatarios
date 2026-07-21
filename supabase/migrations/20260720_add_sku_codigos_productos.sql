-- Asignar SKU internos al campo codigo de compras_productos
-- Nomenclatura: [MARCA]-[MODELO]-[MEMORIA] para celulares, ACC-* para accesorios, KS-* para kits

-- Celulares Motorola
UPDATE compras_productos SET codigo = 'MOTO-G06-64' WHERE nombre ILIKE '%G06%64%';
UPDATE compras_productos SET codigo = 'MOTO-G06-128' WHERE nombre ILIKE '%G06%128%';
UPDATE compras_productos SET codigo = 'MOTO-G17-128' WHERE nombre ILIKE '%G17%128%';
UPDATE compras_productos SET codigo = 'MOTO-G17-256' WHERE nombre ILIKE '%G17%256%';
UPDATE compras_productos SET codigo = 'MOTO-G56-256' WHERE nombre ILIKE '%G56%256%';
UPDATE compras_productos SET codigo = 'MOTO-G67-256' WHERE nombre ILIKE '%G67%256%';
UPDATE compras_productos SET codigo = 'MOTO-G77-256' WHERE nombre ILIKE '%G77%256%';

-- Celulares Samsung
UPDATE compras_productos SET codigo = 'SAM-A07-64' WHERE nombre ILIKE '%A07%64%';
UPDATE compras_productos SET codigo = 'SAM-A07-128' WHERE nombre ILIKE '%A07%128%';
UPDATE compras_productos SET codigo = 'SAM-A16-128' WHERE nombre ILIKE '%A16%128%';
UPDATE compras_productos SET codigo = 'SAM-A17-128' WHERE nombre ILIKE '%A17%128%';
UPDATE compras_productos SET codigo = 'SAM-A17-256' WHERE nombre ILIKE '%A17%256%';
UPDATE compras_productos SET codigo = 'SAM-A36-256' WHERE nombre ILIKE '%A36%256%';
UPDATE compras_productos SET codigo = 'SAM-A56-256' WHERE nombre ILIKE '%A56%256%';

-- Celulares Xiaomi
UPDATE compras_productos SET codigo = 'XIA-14C-128' WHERE nombre ILIKE '%14C%128%';
UPDATE compras_productos SET codigo = 'XIA-14C-256' WHERE nombre ILIKE '%14C%256%';
UPDATE compras_productos SET codigo = 'XIA-NOTE14-128' WHERE nombre ILIKE '%Note 14%128%' AND nombre NOT ILIKE '%Pro%';
UPDATE compras_productos SET codigo = 'XIA-NOTE14P-256' WHERE nombre ILIKE '%Note 14%Pro%256%';

-- Celulares Nubia
UPDATE compras_productos SET codigo = 'NUB-MUSIC2' WHERE nombre ILIKE '%Nubia%Music%2%';

-- Accesorios
UPDATE compras_productos SET codigo = 'ACC-BUDS6' WHERE nombre ILIKE '%Buds%6%Play%';
UPDATE compras_productos SET codigo = 'ACC-SPEAKER2' WHERE nombre ILIKE '%Speaker%2%' OR nombre ILIKE '%Parlante%Xiaomi%';
UPDATE compras_productos SET codigo = 'ACC-BAND9' WHERE nombre ILIKE '%Band%9%Active%' OR nombre ILIKE '%Pulsera%';
UPDATE compras_productos SET codigo = 'ACC-JBLGO' WHERE nombre ILIKE '%JBL%Go%';

-- Kits de Seguridad
UPDATE compras_productos SET codigo = 'KS-MOTO-G06' WHERE nombre ILIKE '%Kit%Seguridad%' AND nombre ILIKE '%G06%';
UPDATE compras_productos SET codigo = 'KS-MOTO-G17' WHERE nombre ILIKE '%Kit%Seguridad%' AND nombre ILIKE '%G17%';
UPDATE compras_productos SET codigo = 'KS-MOTO-G67' WHERE nombre ILIKE '%Kit%Seguridad%' AND nombre ILIKE '%G67%';
UPDATE compras_productos SET codigo = 'KS-MOTO-G77' WHERE nombre ILIKE '%Kit%Seguridad%' AND nombre ILIKE '%G77%';
UPDATE compras_productos SET codigo = 'KS-SAM-A07' WHERE nombre ILIKE '%Kit%Seguridad%' AND nombre ILIKE '%A07%';
UPDATE compras_productos SET codigo = 'KS-XIA-14C' WHERE nombre ILIKE '%Kit%Seguridad%' AND nombre ILIKE '%14C%';

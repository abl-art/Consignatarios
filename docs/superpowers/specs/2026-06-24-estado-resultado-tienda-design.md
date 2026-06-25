# Estado de Resultado — Tienda Online (Venta Propia)

## Objetivo

P&L automatizado por modelo de producto para la tienda online propia, como nueva tab "Resultado" en la página de Finanzas. Muestra contribución bruta, neta, rentabilidad y ganancia total por modelo, con todos los datos calculados automáticamente desde la DB.

## Fuentes de datos

### Ventas (GOcelular DB)
- **Cantidad y precio**: `store_order_items` (kind='main' para teléfonos, kind='addon' para accesorios) + `store_orders` (status='paid', attributed_partner_id IS NULL)
- **Precio neto**: `unit_price / 100 / 1.21` (quitar IVA)
- **Cuotas reales**: `gocuotas_installments` → `gocuotas_orders` → `store_orders` para fechas exactas de vencimiento

### Costos (Supabase)
- **Costo de todos los productos** (teléfonos y addons): `MIN(compras_precios.precio)` por producto, linkeado vía nombre
- **Mapeo**: `store_order_items.display_name` ↔ `compras_productos.nombre`

### Parámetros editables (Supabase — nueva tabla `config_resultado`)
- **Fijos ($/unidad, solo teléfonos)**: kit_seguridad, envio_fulfillment, sueldos, otros
- **Porcentajes (% sobre venta neta, teléfonos y addons)**: adquirencia, incobrables
- **Financieros**: tna (tasa nominal anual %), plazo_pago_proveedor (días)

## Modelo de cálculo por producto

### Teléfonos (kind='main')
```
Precio venta neto     = unit_price / 100 / 1.21
Costo proveedor       = MIN(compras_precios.precio) para el modelo
Múltiplo              = Precio venta neto / Costo proveedor
Kit de Seguridad      = config.kit_seguridad (fijo)
Envío + Fulfillment   = config.envio_fulfillment (fijo)
─────────────────────
Contribución Bruta    = Precio neto - Costo - Kit - Envío

Adquirencia           = Precio neto × config.adquirencia / 100
Incobrables           = Precio neto × config.incobrables / 100
Sueldos               = config.sueldos (fijo)
Otros                 = config.otros (fijo)
Intereses             = cálculo de interés promedio real (ver abajo)
─────────────────────
Contribución Neta     = Contrib. Bruta - Adquirencia - Incobrables - Sueldos - Otros - Intereses

Rentab. s/costo       = Contrib. Neta / Costo × 100
Rentab. s/venta       = Contrib. Neta / Precio neto × 100
Ganancia total        = Contrib. Neta × Unidades vendidas
```

### Addons (kind='addon')
Misma estructura pero sin costos hundidos (Kit, Envío, Sueldos, Otros, Intereses = 0). Solo llevan:
- Costo proveedor (de compras_precios)
- Adquirencia (%)
- Incobrables (%)

## Cálculo de intereses (promedio real)

Para cada order pagada del período que tenga cuotas en `gocuotas_installments`:

1. Armar el flujo de caja de la order:
   - Día de cada cuota: `installment_due_at` → cobro de `installment_amount`
   - Día de pago proveedor: fecha de la order + `config.plazo_pago_proveedor` días → egreso del costo
2. Calcular saldo acumulado día a día
3. Cuando el saldo es negativo, calcular interés: `|saldo_negativo| × TNA / 365 × días_en_ese_tramo`
4. Sumar todos los tramos negativos = interés total de esa order
5. Promediar el interés por modelo: `SUM(interés) / COUNT(orders)` por `display_name`

El interés se calcula con las fechas reales de vencimiento de GOcuotas, no con tramos estimados.

## Tabla Supabase: `config_resultado`

```sql
CREATE TABLE config_resultado (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clave TEXT UNIQUE NOT NULL,
  valor NUMERIC NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('fijo', 'porcentaje', 'financiero')),
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Valores iniciales
INSERT INTO config_resultado (clave, valor, tipo, label) VALUES
  ('kit_seguridad', 7000, 'fijo', 'Kit de Seguridad'),
  ('envio_fulfillment', 15000, 'fijo', 'Envío + Fulfillment'),
  ('sueldos', 1250, 'fijo', 'Sueldos'),
  ('otros', 1000, 'fijo', 'Otros'),
  ('adquirencia', 0.8, 'porcentaje', 'Adquirencia'),
  ('incobrables', 6.5, 'porcentaje', 'Incobrables'),
  ('tna', 27, 'financiero', 'TNA (%)'),
  ('plazo_pago_proveedor', 60, 'financiero', 'Plazo pago proveedor (días)');

-- RLS: solo admins
ALTER TABLE config_resultado ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all" ON config_resultado FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role' OR (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin');
```

## UI

### Tab "Resultado" en Finanzas

**Filtros arriba:**
- Presets: Ayer | Mes actual | Últimos 30 días | Mes anterior | Personalizado (desde/hasta)

**Panel de configuración (colapsable):**
- Grid de inputs editables agrupados: Fijos | Porcentajes | Financieros
- Al cambiar un valor → guardar en Supabase → recalcular tabla

**Tabla P&L:**
- Columnas: una por cada producto con ventas pagadas en el período + columna Total
- Teléfonos primero, addons después (separados visualmente)
- Filas: Uds vendidas, Precio neto, Costo, Múltiplo, Kit, Envío, Contrib. Bruta, Adquirencia, Incobrables, Sueldos, Otros, Intereses, Contrib. Neta, Rentab. s/costo, Rentab. s/venta, Ganancia
- Contrib. Bruta y Contrib. Neta resaltadas (bold, fondo)
- Ganancia total en la última fila con destaque
- Addons sin filas Kit/Envío/Sueldos/Otros/Intereses (mostrar "—")

**Estilo:** Mismo patrón visual que el resto de finanzas (bg-white rounded-xl border).

## Archivos

- `supabase/migrations/20260624_create_config_resultado.sql` — tabla + seed
- `lib/actions/resultado.ts` — server action: fetch ventas, costos, config, calcular P&L
- `app/(admin)/finanzas/ResultadoTab.tsx` — client component con tabla + config panel
- `app/(admin)/finanzas/page.tsx` — agregar tab "Resultado"

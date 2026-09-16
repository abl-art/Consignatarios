// Bloque "Ventas con accesorios" de la tarjeta Tiempo promedio de entrega del
// Dashboard 360: qué porcentaje de las órdenes pagas de la tienda propia
// (últimos 30 días) incluye al menos un accesorio pago (store_order_items
// kind='addon') y cuánto se facturó de accesorios. Los kits de regalo de los
// bundles NO son ítems addon, así que no inflan la métrica. Precios de la
// tienda en centavos → ÷100.

export interface AccesoriosVentasRaw {
  ordenes: number // órdenes pagas de la tienda en la ventana
  conAccesorios: number // de esas, cuántas tienen ≥1 ítem addon
  montoCentavos: number // suma unit_price × quantity de los addons, en centavos
}

export interface ResumenAccesorios {
  ordenes: number
  conAccesorios: number
  pct: number // % con un decimal
  monto: number // $ facturados de accesorios (bruto, como las demás tarjetas)
}

export function resumenAccesorios(raw: AccesoriosVentasRaw): ResumenAccesorios {
  return {
    ordenes: raw.ordenes,
    conAccesorios: raw.conAccesorios,
    pct: raw.ordenes > 0 ? Math.round((raw.conAccesorios / raw.ordenes) * 1000) / 10 : 0,
    monto: raw.montoCentavos / 100,
  }
}

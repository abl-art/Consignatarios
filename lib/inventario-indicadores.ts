// Indicadores de gestión de inventario para /inventario.
// Funciones puras: la página server las alimenta con datos de GOcelular/Supabase.

export interface VentaDia {
  fecha: string // YYYY-MM-DD
  cantidad: number
  monto: number
}

export interface VelocidadVenta {
  diaria7: number
  diaria30: number
}

function diasAtras(hoy: string, n: number): string {
  const d = new Date(hoy + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

/** Unidades/día promedio sobre días cerrados (ayer hacia atrás, sin hoy). */
export function velocidadVenta(ventas: VentaDia[], hoy: string): VelocidadVenta {
  const desde7 = diasAtras(hoy, 7)
  const desde30 = diasAtras(hoy, 30)
  let u7 = 0
  let u30 = 0
  for (const v of ventas) {
    if (v.fecha >= hoy) continue
    if (v.fecha >= desde7) u7 += v.cantidad
    if (v.fecha >= desde30) u30 += v.cantidad
  }
  return { diaria7: u7 / 7, diaria30: u30 / 30 }
}

/** Días que dura el stock al ritmo de venta actual. Null si no hay ventas. */
export function diasCobertura(stock: number, velocidadDiaria: number): number | null {
  if (velocidadDiaria <= 0) return null
  return stock / velocidadDiaria
}

/**
 * Veces que rotó el inventario en los últimos 30 días:
 * unidades vendidas ÷ stock promedio (cierre del mes anterior vs stock actual).
 * Sin cierre anterior se usa el stock actual como promedio.
 */
export function rotacionMensual(
  ventas30d: number,
  stockActual: number,
  stockCierreAnterior: number | null,
): number | null {
  const inicio = stockCierreAnterior ?? stockActual
  const promedio = (inicio + stockActual) / 2
  if (promedio <= 0) return null
  return ventas30d / promedio
}

/**
 * Meses de stock global: valorización total ÷ venta mensual valorizada (30 días).
 * Al dividir pesos sobre pesos cada producto pondera por su valor.
 */
export function mesesDeStock(
  productos: { valorVenta: number; montoVentas30d: number }[],
): number | null {
  const stockTotal = productos.reduce((s, p) => s + p.valorVenta, 0)
  const ventaMensual = productos.reduce((s, p) => s + p.montoVentas30d, 0)
  if (ventaMensual <= 0) return null
  return stockTotal / ventaMensual
}

/**
 * Clave de comparación de modelos. El catálogo y las ventas escriben el mismo equipo
 * distinto ("Celular Samsung A07 4/128 GB" vs "Samsung A07 128GB", "G77 8/256GB 5G"
 * vs "G77 5G 256GB"): quita sufijos de bundle ("+ Funda..."), el prefijo "Celular",
 * el prefijo de RAM ("4/128" → "128"), pega "128 gb" → "128gb" y ordena los tokens.
 */
export function normalizarModelo(nombre: string): string {
  let n = nombre.toLowerCase()
  n = n.replace(/\s*\+\s*.*/, '')
  n = n.replace(/\bcelular\b/g, '')
  n = n.replace(/\b\d+\//g, '')
  n = n.replace(/(\d+)\s+gb\b/g, '$1gb')
  return n.split(/\s+/).filter(Boolean).sort().join(' ')
}

export interface StockModelo {
  modelo: string
  qty: number
  valorUnit: number
}

export interface ModeloSinMovimiento {
  modelo: string
  qty: number
  capital: number
}

/** Modelos con stock y cero ventas en el período, con su capital inmovilizado. */
export function stockSinMovimiento(
  stock: StockModelo[],
  ventas: { modelo: string; ventas: number }[],
): ModeloSinMovimiento[] {
  const vendidos = new Set<string>()
  for (const v of ventas) {
    if (v.ventas > 0) vendidos.add(normalizarModelo(v.modelo))
  }
  return stock
    .filter(s => s.qty > 0 && !vendidos.has(normalizarModelo(s.modelo)))
    .map(s => ({ modelo: s.modelo, qty: s.qty, capital: s.qty * s.valorUnit }))
    .sort((a, b) => b.capital - a.capital)
}

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
 * vs "G77 5G 256GB", y Xiaomi invierte el par: "128/4 GB" = almacenamiento/RAM):
 * quita sufijos de bundle ("+ Funda..."), el prefijo "Celular", colapsa el par
 * RAM/almacenamiento quedándose con el número mayor (el almacenamiento, sin importar
 * el orden), pega "128 gb" → "128gb" y ordena los tokens.
 */
export function normalizarModelo(nombre: string): string {
  let n = nombre.toLowerCase()
  n = n.replace(/\s*\+\s*.*/, '')
  n = n.replace(/\bcelular\b/g, '')
  // la tienda a veces omite "Moto" en los Motorola ("Motorola Edge 60 Fusion"
  // vs "Motorola Moto Edge 60 Fusion"): el token suelto no distingue modelos
  n = n.replace(/\bmoto\b/g, '')
  n = n.replace(/(\d+)\s*(?:gb)?\s*\/\s*(\d+)\s*(?:gb)?/g, (_, a, b) => `${Math.max(Number(a), Number(b))}gb`)
  n = n.replace(/(\d+)\s+gb\b/g, '$1gb')
  return n.split(/\s+/).filter(Boolean).sort().join(' ')
}

export interface CoberturaModelo {
  modelo: string
  stock: number
  ventaDiaria30: number
  cobertura: number | null
  /** % del total de ventas 30d del producto que representa este modelo (null sin ventas totales) */
  pctVentas30: number | null
}

/**
 * Cobertura por modelo para planificar compras: cruza stock y ventas 30d por
 * clave normalizada. Incluye modelos que venden sin stock (cobertura 0, lo más
 * urgente). Ordena por cobertura ascendente; sin ventas al final.
 */
export function coberturaPorModelos(
  stock: { modelo: string; qty: number }[],
  ventas30: { modelo: string; ventas: number }[],
): CoberturaModelo[] {
  const ventasPorKey = new Map<string, { modelo: string; ventas: number }>()
  for (const v of ventas30) {
    const key = normalizarModelo(v.modelo)
    const prev = ventasPorKey.get(key)
    ventasPorKey.set(key, { modelo: v.modelo, ventas: (prev?.ventas ?? 0) + v.ventas })
  }

  const totalVentas30 = ventas30.reduce((s, v) => s + v.ventas, 0)
  const pct = (ventas: number): number | null =>
    totalVentas30 > 0 ? (ventas / totalVentas30) * 100 : null

  const resultado: CoberturaModelo[] = []
  const stockKeys = new Set<string>()
  for (const s of stock) {
    const key = normalizarModelo(s.modelo)
    stockKeys.add(key)
    const ventas = ventasPorKey.get(key)?.ventas ?? 0
    resultado.push({
      modelo: s.modelo,
      stock: s.qty,
      ventaDiaria30: ventas / 30,
      cobertura: diasCobertura(s.qty, ventas / 30),
      pctVentas30: pct(ventas),
    })
  }
  // Modelos que venden pero no tienen stock: cobertura 0
  for (const [key, v] of ventasPorKey) {
    if (!stockKeys.has(key) && v.ventas > 0) {
      resultado.push({ modelo: v.modelo, stock: 0, ventaDiaria30: v.ventas / 30, cobertura: 0, pctVentas30: pct(v.ventas) })
    }
  }

  return resultado.sort((a, b) => {
    if (a.cobertura === null && b.cobertura === null) return b.stock - a.stock
    if (a.cobertura === null) return 1
    if (b.cobertura === null) return -1
    return a.cobertura - b.cobertura
  })
}

/**
 * Qué parte de la venta (u/día 30d de todos los modelos) está respaldada por
 * stock sano y cuánta está por quebrar. Modelos sin ventas no aportan.
 * - saludable: cobertura > 20 días
 * - riesgo: cobertura ≤ 20 días (incluye los que venden con stock 0)
 * Complementarios: saludable + riesgo = 100% de la venta.
 */
export function ventasPorCobertura(
  modelos: { ventaDiaria30: number; cobertura: number | null }[],
): { pctSaludable: number | null; pctRiesgo: number | null } {
  const total = modelos.reduce((s, m) => s + m.ventaDiaria30, 0)
  if (total <= 0) return { pctSaludable: null, pctRiesgo: null }
  let saludable = 0
  let riesgo = 0
  for (const m of modelos) {
    if (m.cobertura === null) continue
    if (m.cobertura > 20) saludable += m.ventaDiaria30
    else riesgo += m.ventaDiaria30
  }
  return { pctSaludable: (saludable / total) * 100, pctRiesgo: (riesgo / total) * 100 }
}

export interface ReposicionModelo {
  modelo: string
  /** Unidades informadas a GOcelular que Andreani aún no recibió */
  enTransito: number
  /** Unidades compradas en el gestor todavía sin informar */
  pedido: number
}

function reposicionesPorKey(reposiciones: ReposicionModelo[]): Map<string, { enTransito: number; pedido: number }> {
  const repoPorKey = new Map<string, { enTransito: number; pedido: number }>()
  for (const r of reposiciones) {
    const key = normalizarModelo(r.modelo)
    const prev = repoPorKey.get(key) ?? { enTransito: 0, pedido: 0 }
    repoPorKey.set(key, { enTransito: prev.enTransito + r.enTransito, pedido: prev.pedido + r.pedido })
  }
  return repoPorKey
}

/**
 * Reemplaza la cobertura de cada modelo por la proyectada al ingresar lo que
 * viene en camino (stock + tránsito + pedido). Para ventasPorCobertura: una
 * venta con reposición ya comprada/viajando no debe contarse en riesgo.
 */
export function coberturaProyectada(
  modelos: { modelo: string; stock: number; ventaDiaria30: number; cobertura: number | null }[],
  reposiciones: ReposicionModelo[],
): { ventaDiaria30: number; cobertura: number | null }[] {
  const repoPorKey = reposicionesPorKey(reposiciones)
  return modelos.map(m => {
    const repo = repoPorKey.get(normalizarModelo(m.modelo)) ?? { enTransito: 0, pedido: 0 }
    return {
      ventaDiaria30: m.ventaDiaria30,
      cobertura: diasCobertura(m.stock + repo.enTransito + repo.pedido, m.ventaDiaria30),
    }
  })
}

export interface ModeloAComprar {
  modelo: string
  stock: number
  /** % de la venta total (todos los productos) que representa el modelo */
  pctVentasTotal: number
  /** Unidades vendidas en los últimos 30 días */
  ventas30d: number
  cobertura: number | null
  enTransito: number
  pedido: number
  /** Días de cobertura cuando ingrese lo en tránsito + pedido */
  proximaCobertura: number | null
}

/**
 * Lista de compra: todos los modelos con cobertura menor a 20 días (incluye
 * los que venden con stock 0), con su peso en la venta total y las unidades
 * vendidas en 30 días. Ordenada por peso descendente: primero lo que más
 * venta salva. Con `reposiciones` marca lo que ya viene en camino
 * (tránsito/pedido) y proyecta la próxima cobertura con ese ingreso, para
 * ver si lo pedido alcanza o igual hay que comprar.
 */
export function modelosAComprar(
  modelos: { modelo: string; stock: number; ventaDiaria30: number; cobertura: number | null }[],
  reposiciones: ReposicionModelo[] = [],
): ModeloAComprar[] {
  const total = modelos.reduce((s, m) => s + m.ventaDiaria30, 0)
  if (total <= 0) return []

  const repoPorKey = reposicionesPorKey(reposiciones)

  return modelos
    .map(m => {
      const repo = repoPorKey.get(normalizarModelo(m.modelo)) ?? { enTransito: 0, pedido: 0 }
      return {
        modelo: m.modelo,
        stock: m.stock,
        pctVentasTotal: (m.ventaDiaria30 / total) * 100,
        ventas30d: m.ventaDiaria30 * 30,
        cobertura: m.cobertura,
        enTransito: repo.enTransito,
        pedido: repo.pedido,
        proximaCobertura: diasCobertura(m.stock + repo.enTransito + repo.pedido, m.ventaDiaria30),
      }
    })
    .filter(m => m.cobertura !== null && m.cobertura < 20)
    .sort((a, b) => b.pctVentasTotal - a.pctVentasTotal)
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

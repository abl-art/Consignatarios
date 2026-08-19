import { createAdminClient } from '@/lib/supabase/admin'
import {
  fetchStockPropio,
  fetchStockPropioDetalle,
  fetchPreciosVentaCelulares,
  fetchSalidasKitsDiarias,
  fetchVentasPorModelo,
  fetchVentasUlt30d,
  type VentaPorModelo,
} from '@/lib/gocelular'
import {
  fetchAccesorioData,
  SMARTWATCHES_CONFIG,
  PARLANTES_CONFIG,
  AURICULARES_CONFIG,
  type CierreMensual,
} from '@/lib/actions/accesorios-ventas'
import { getUltimosCostos, getInventarioByCategoria } from '@/lib/actions/compras'
import { getModelosOcultos } from '@/lib/actions/kits-ocultos'
import { resumenVentasDia } from '@/lib/ventas-dia'
import { buscarPrecio } from '@/lib/utils'
import { stockSinMovimiento, type VentaDia, type ModeloSinMovimiento } from '@/lib/inventario-indicadores'

export type ProductoKey = 'celulares' | 'smartwatches' | 'parlantes' | 'auriculares' | 'kits'

/** Los kits no tienen precio de tienda (se regalan): valor de venta definido por Emiliano. */
const PRECIO_VENTA_KIT = 9000

export interface ProductoResumen {
  key: ProductoKey
  label: string
  stock: number
  /** Total $ al costo del proveedor más barato en Compras (última actualización). Null si no hay costo para matchear. */
  costoReposicion: number | null
  /** Total $ al precio de venta actual de la tienda. Kits: precio fijo definido. */
  valorVenta: number | null
  /** $ vendidos en los últimos 30 días cerrados (para Meses de Stock). */
  montoVentas30d: number
  ventasDiarias: VentaDia[]
  cierres: CierreMensual[]
  /** stock_final del último cierre mensual, para rotación. */
  stockCierreAnterior: number | null
}

export interface InventarioResumen {
  productos: ProductoResumen[]
  ventasPorModeloCelulares: VentaPorModelo[]
  sinMovimiento: ModeloSinMovimiento[]
  error: string | null
}

function diasAtras(hoy: string, n: number): string {
  const d = new Date(hoy + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

function monto30d(ventas: VentaDia[], hoy: string): number {
  const desde = diasAtras(hoy, 30)
  return ventas.reduce((s, v) => (v.fecha >= desde && v.fecha < hoy ? s + v.monto : s), 0)
}

export async function fetchInventarioResumen(): Promise<InventarioResumen> {
  const hoy = new Date().toISOString().slice(0, 10)
  const supabase = createAdminClient()

  try {
    const [
      stockCelulares,
      stockDetalle,
      preciosVenta,
      salidasKits,
      ventasPorModelo,
      ventasUlt30d,
      { data: consigs },
      ultimosCostos,
      modelosOcultos,
      smartwatches,
      parlantes,
      auriculares,
    ] = await Promise.all([
      fetchStockPropio(),
      fetchStockPropioDetalle(),
      fetchPreciosVentaCelulares(),
      fetchSalidasKitsDiarias(),
      fetchVentasPorModelo(),
      fetchVentasUlt30d(),
      supabase.from('consignatarios').select('nombre, store_prefix'),
      getUltimosCostos(),
      getModelosOcultos(),
      fetchAccesorioData(SMARTWATCHES_CONFIG),
      fetchAccesorioData(PARLANTES_CONFIG),
      fetchAccesorioData(AURICULARES_CONFIG),
    ])

    // Último costo por categoría: mapa nombre normalizado → precio (para buscarPrecio)
    const costosPorCategoria = new Map<string, Record<string, number>>()
    for (const c of ultimosCostos) {
      const mapa = costosPorCategoria.get(c.categoria) ?? {}
      mapa[c.nombre] = c.precio
      costosPorCategoria.set(c.categoria, mapa)
    }
    const costosCelulares = costosPorCategoria.get('Celulares') ?? {}

    // ── Celulares ──────────────────────────────────────────────────────────
    let valorVentaCel = 0
    let costoReposicionCel = 0
    for (const s of stockDetalle) {
      const pv = preciosVenta[s.model_name] ?? buscarPrecio(preciosVenta, s.model_name)
      if (pv) valorVentaCel += s.qty * pv
      const pc = buscarPrecio(costosCelulares, s.model_name)
      if (pc) costoReposicionCel += s.qty * pc
    }

    const prefixes = (consigs ?? [])
      .filter((c: { store_prefix: string | null }) => c.store_prefix)
      .map((c: { nombre: string; store_prefix: string | null }) => ({
        nombre: c.nombre,
        prefix: c.store_prefix!.toLowerCase(),
      }))
    const montoCel30d = resumenVentasDia([], ventasUlt30d, prefixes).prom30d.gocelular.monto * 30

    const ventasDiariasCel = new Map<string, number>()
    for (const v of ventasPorModelo) {
      ventasDiariasCel.set(v.fecha, (ventasDiariasCel.get(v.fecha) ?? 0) + v.ventas)
    }

    // Sin movimiento: stock por modelo valorizado al último costo (fallback precio de venta)
    const desde30 = diasAtras(hoy, 30)
    const ventas30PorModelo = new Map<string, number>()
    for (const v of ventasPorModelo) {
      if (v.fecha >= desde30 && v.fecha < hoy) {
        ventas30PorModelo.set(v.modelo, (ventas30PorModelo.get(v.modelo) ?? 0) + v.ventas)
      }
    }
    const sinMovimiento = stockSinMovimiento(
      stockDetalle.map(s => ({
        modelo: s.model_name,
        qty: s.qty,
        valorUnit: buscarPrecio(costosCelulares, s.model_name) || preciosVenta[s.model_name] || buscarPrecio(preciosVenta, s.model_name) || 0,
      })),
      Array.from(ventas30PorModelo.entries()).map(([modelo, ventas]) => ({ modelo, ventas })),
    )

    // ── Kits ───────────────────────────────────────────────────────────────
    const kitsItems = await getInventarioByCategoria('Kits de Seguridad', modelosOcultos)
    const stockKits = kitsItems.reduce((s, r) => s + r.disponible, 0)
    const costoKits = kitsItems.reduce((s, r) => s + r.valuacion, 0)

    let cierresKits: CierreMensual[] = []
    try {
      const admin = createAdminClient()
      const { data } = await admin
        .from('stock_cierre_mensual')
        .select('periodo, stock_final, precio_unitario, valuacion')
        .eq('categoria', 'kits-seguridad')
        .order('periodo', { ascending: false })
      cierresKits = (data ?? []).map(d => ({
        periodo: d.periodo as string,
        stock_final: Number(d.stock_final),
        precio_unitario: Number(d.precio_unitario),
        valuacion: Number(d.valuacion),
      }))
    } catch { /* cierres no disponibles */ }

    // ── Accesorios ─────────────────────────────────────────────────────────
    const accesorio = (
      key: ProductoKey,
      label: string,
      categoria: string,
      data: Awaited<ReturnType<typeof fetchAccesorioData>>,
    ): ProductoResumen => {
      const costos = costosPorCategoria.get(categoria) ?? {}
      const precios = Object.values(costos)
      // Si la categoría tiene más de un producto cargado en Compras, vale el más barato
      const costoUnit = precios.length > 0 ? Math.min(...precios) : 0
      return {
        key,
        label,
        stock: data.kpis.stockDisponible,
        costoReposicion: costoUnit > 0 ? data.kpis.stockDisponible * costoUnit : null,
        valorVenta: data.kpis.valuacion,
        montoVentas30d: monto30d(data.ventasDiarias, hoy),
        ventasDiarias: data.ventasDiarias,
        cierres: data.cierres,
        stockCierreAnterior: data.cierres[0]?.stock_final ?? null,
      }
    }

    const productos: ProductoResumen[] = [
      {
        key: 'celulares',
        label: 'Celulares',
        stock: stockCelulares,
        costoReposicion: costoReposicionCel > 0 ? costoReposicionCel : null,
        valorVenta: valorVentaCel > 0 ? valorVentaCel : null,
        montoVentas30d: montoCel30d,
        ventasDiarias: Array.from(ventasDiariasCel.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([fecha, cantidad]) => ({ fecha, cantidad, monto: 0 })),
        cierres: [],
        stockCierreAnterior: null,
      },
      accesorio('smartwatches', 'Smartwatches', 'Smartwatches', smartwatches),
      accesorio('parlantes', 'Parlantes', 'Parlantes', parlantes),
      accesorio('auriculares', 'Auriculares', 'Auriculares', auriculares),
      {
        key: 'kits',
        label: 'Kits de Seguridad',
        stock: stockKits,
        costoReposicion: costoKits > 0 ? costoKits : null,
        valorVenta: stockKits * PRECIO_VENTA_KIT,
        montoVentas30d: 0,
        ventasDiarias: salidasKits.map(s => ({ ...s, monto: 0 })),
        cierres: cierresKits,
        stockCierreAnterior: cierresKits[0]?.stock_final ?? null,
      },
    ]

    return { productos, ventasPorModeloCelulares: ventasPorModelo, sinMovimiento, error: null }
  } catch (e: unknown) {
    return {
      productos: [],
      ventasPorModeloCelulares: [],
      sinMovimiento: [],
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

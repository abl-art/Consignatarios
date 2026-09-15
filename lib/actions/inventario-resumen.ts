import { createAdminClient } from '@/lib/supabase/admin'
import {
  fetchStockPropioDetalle,
  fetchPreciosVentaCelulares,
  fetchPreciosTiendaCelulares,
  fetchSalidasKitsDiarias,
  fetchVentasPorModelo,
  fetchVentasUlt30d,
  fetchStockPorWarehouse,
  fetchPendientesPicking,
  type VentaPorModelo,
} from '@/lib/gocelular'
import { aplicarPedidos } from '@/lib/pedidos-pendientes'
import { descontarPendientes, disponibleRealFila } from '@/lib/disponibilidad'
import { categoriaAccesorio, type CategoriaAccesorio } from '@/lib/categoria-accesorio'
import {
  fetchAccesorioData,
  SMARTWATCHES_CONFIG,
  PARLANTES_CONFIG,
  AURICULARES_CONFIG,
  type CierreMensual,
} from '@/lib/actions/accesorios-ventas'
import { getUltimosCostos, getPedidos } from '@/lib/actions/compras'
import { getModelosOcultos } from '@/lib/actions/kits-ocultos'
import { resumenVentasDia } from '@/lib/ventas-dia'
import { buscarPrecio } from '@/lib/utils'
import {
  stockSinMovimiento,
  coberturaPorModelos,
  diasCobertura,
  velocidadVenta,
  normalizarModelo,
  type VentaDia,
  type ModeloSinMovimiento,
  type CoberturaModelo,
  type ReposicionModelo,
} from '@/lib/inventario-indicadores'

export type ProductoKey = 'celulares' | 'smartwatches' | 'parlantes' | 'auriculares' | 'kits'

/** Los kits no tienen precio de tienda (se regalan): valor de venta definido por Emiliano. */
const PRECIO_VENTA_KIT = 9000 // fijo, definido por Emiliano — NO se le quita IVA
const IVA = 1.21 // los precios de tienda incluyen IVA; el valor de venta se muestra neto

export interface ProductoResumen {
  key: ProductoKey
  label: string
  stock: number
  /** Total $ al costo del proveedor más barato en Compras (última actualización). Null si no hay costo para matchear. */
  costoReposicion: number | null
  /** Total $ al precio de venta actual de la tienda SIN IVA (÷1,21). Kits: precio fijo definido, sin ajuste. */
  valorVenta: number | null
  /** $ vendidos en los últimos 30 días cerrados (para Meses de Stock). */
  montoVentas30d: number
  ventasDiarias: VentaDia[]
  cierres: CierreMensual[]
  /** stock_final del último cierre mensual, para rotación. */
  stockCierreAnterior: number | null
  /** Desglose por modelo con cobertura, para planificar compras (fila desplegable). */
  modelos: CoberturaModelo[]
}

export interface InventarioResumen {
  productos: ProductoResumen[]
  ventasPorModeloCelulares: VentaPorModelo[]
  sinMovimiento: ModeloSinMovimiento[]
  /** Reposición en camino por modelo (en tránsito Andreani + pedidos del gestor) */
  reposiciones: ReposicionModelo[]
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
      stockDetalle,
      preciosVenta,
      preciosTienda,
      salidasKits,
      ventasPorModelo,
      ventasUlt30d,
      { data: consigs },
      ultimosCostos,
      modelosOcultos,
      smartwatches,
      parlantes,
      auriculares,
      stockWarehouse,
      pedidos,
      pendientes,
    ] = await Promise.all([
      fetchStockPropioDetalle(),
      fetchPreciosVentaCelulares(),
      fetchPreciosTiendaCelulares().catch(() => ({} as Record<string, number>)),
      fetchSalidasKitsDiarias(),
      fetchVentasPorModelo(),
      fetchVentasUlt30d(),
      supabase.from('consignatarios').select('nombre, store_prefix'),
      getUltimosCostos(),
      getModelosOcultos(),
      fetchAccesorioData(SMARTWATCHES_CONFIG),
      fetchAccesorioData(PARLANTES_CONFIG),
      fetchAccesorioData(AURICULARES_CONFIG),
      fetchStockPorWarehouse(),
      getPedidos().catch(() => []),
      fetchPendientesPicking().catch(() => ({ gocuotas: {}, andreani: {} })),
    ])

    // Reposición en camino por modelo (misma fuente que /inventario/stock)
    const reposiciones: ReposicionModelo[] = aplicarPedidos(stockWarehouse, pedidos)
      .filter(r => r.enTransito > 0 || r.pedido > 0)
      .map(r => ({
        modelo: r.marca && !r.nombre.toLowerCase().includes(r.marca.toLowerCase())
          ? `${r.marca} ${r.nombre}`
          : r.nombre,
        enTransito: r.enTransito,
        pedido: r.pedido,
      }))

    // Último costo por categoría: mapa nombre normalizado → precio (para buscarPrecio)
    const costosPorCategoria = new Map<string, Record<string, number>>()
    for (const c of ultimosCostos) {
      const mapa = costosPorCategoria.get(c.categoria) ?? {}
      mapa[c.nombre] = c.precio
      costosPorCategoria.set(c.categoria, mapa)
    }
    const costosCelulares = costosPorCategoria.get('Celulares') ?? {}

    // ── Celulares ──────────────────────────────────────────────────────────
    // Valor de venta: precio publicado en la tienda (store_products), matcheado
    // por nombre normalizado; respaldo device_models.default_price (puede estar
    // desactualizado) para modelos sin publicación activa
    const tiendaPorClave = new Map<string, number>()
    for (const [nombre, precio] of Object.entries(preciosTienda)) {
      tiendaPorClave.set(normalizarModelo(nombre), precio)
    }
    const precioVentaDe = (modelName: string): number =>
      (tiendaPorClave.get(normalizarModelo(modelName)) ?? preciosVenta[modelName] ?? buscarPrecio(preciosVenta, modelName)) / IVA

    // Disponibilidad real: stock en depósitos neto de pendientes de picking
    // GO/Andreani (una orden paga esperando salir no está disponible para
    // vender) — misma regla que la columna Disponible real de /inventario/stock.
    // Stock, valorización y desglose por modelo usan todos el mismo neto.
    const netoCel = descontarPendientes(stockDetalle, pendientes)
    const stockCelulares = netoCel.reduce((s, r) => s + r.qty, 0)

    let valorVentaCel = 0
    let costoReposicionCel = 0
    for (const s of netoCel) {
      const pv = precioVentaDe(s.model_name)
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
    const stockBrutoPorNombre = new Map<string, number>()
    for (const s of stockDetalle) {
      stockBrutoPorNombre.set(s.model_name, (stockBrutoPorNombre.get(s.model_name) ?? 0) + s.qty)
    }
    const sinMovimiento = stockSinMovimiento(
      Array.from(stockBrutoPorNombre.entries()).map(([modelo, qty]) => ({
        modelo,
        qty,
        valorUnit: buscarPrecio(costosCelulares, modelo) || precioVentaDe(modelo) || 0,
      })),
      Array.from(ventas30PorModelo.entries()).map(([modelo, ventas]) => ({ modelo, ventas })),
    )

    // ── Kits ───────────────────────────────────────────────────────────────
    // Misma fuente que /inventario/stock: filas KS-* de fetchStockPorWarehouse
    // (calcularStockKit sobre movimientos aceptados por Andreani), netas de
    // pendientes de picking. store_products.stock y el cruce compras − ventas
    // no son confiables para kits (salen de regalo en bundles de celulares).
    const ocultosKits = new Set(modelosOcultos.map(m => m.toLowerCase()))
    const kitsRows = stockWarehouse
      .filter(r => r.sku.toUpperCase().startsWith('KS-'))
      .filter(r => !ocultosKits.has(r.nombre.toLowerCase()))
      .map(r => ({ modelo: r.nombre, stock: disponibleRealFila(r, pendientes) }))
    const stockKits = kitsRows.reduce((s, r) => s + r.stock, 0)
    const costosKits = Object.values(costosPorCategoria.get('Kits de Seguridad') ?? {})
    const costoUnitKit = costosKits.length > 0 ? Math.min(...costosKits) : 0

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

    // Desglose por modelo de celulares (cobertura para compras), sobre el
    // mismo neto de pendientes que el stock y la valorización.
    const modelosCelulares = coberturaPorModelos(
      netoCel.map(s => ({ modelo: s.model_name, qty: s.qty })),
      Array.from(ventas30PorModelo.entries()).map(([modelo, ventas]) => ({ modelo, ventas })),
    )

    // ── Accesorios ─────────────────────────────────────────────────────────
    // Disponible real por subcategoría y por producto: filas de accesorios de
    // fetchStockPorWarehouse netas de pendientes de picking (mismas reglas de
    // clasificación por keywords que las tarjetas). store_products.stock crudo
    // incluye lo en tránsito y lo ya vendido esperando salir.
    const netoAccPorNombre = new Map<string, number>()
    const netoAccPorCategoria = new Map<CategoriaAccesorio, number>()
    for (const r of stockWarehouse) {
      if (r.tipo !== 'accesorio') continue
      const cat = categoriaAccesorio(r.sku, r.nombre)
      if (cat === 'kit') continue
      const neto = disponibleRealFila(r, pendientes)
      const nombreKey = r.nombre.toLowerCase()
      netoAccPorNombre.set(nombreKey, (netoAccPorNombre.get(nombreKey) ?? 0) + neto)
      netoAccPorCategoria.set(cat, (netoAccPorCategoria.get(cat) ?? 0) + neto)
    }

    const accesorio = (
      key: ProductoKey,
      label: string,
      categoria: string,
      subcategoria: CategoriaAccesorio,
      data: Awaited<ReturnType<typeof fetchAccesorioData>>,
    ): ProductoResumen => {
      const costos = costosPorCategoria.get(categoria) ?? {}
      const precios = Object.values(costos)
      // Si la categoría tiene más de un producto cargado en Compras, vale el más barato
      const costoUnit = precios.length > 0 ? Math.min(...precios) : 0
      const stockNeto = netoAccPorCategoria.get(subcategoria) ?? 0
      // Stock por producto neto de pendientes; si el nombre no está en el
      // warehouse (no debería pasar) queda el stock crudo de tienda
      const stockDe = (nombre: string, crudo: number): number =>
        netoAccPorNombre.get(nombre.toLowerCase()) ?? crudo

      // Desglose por producto de tienda. Con un solo producto la venta de la
      // categoría es suya; con varios se cruza por nombre exacto de variante.
      let modelos: CoberturaModelo[]
      if (data.porProducto.length === 1) {
        const p0 = data.porProducto[0]
        const vel = velocidadVenta(data.ventasDiarias, hoy).diaria30
        const stock0 = stockDe(p0.nombre, p0.stock)
        modelos = [{
          modelo: p0.nombre,
          stock: stock0,
          ventaDiaria30: vel,
          cobertura: diasCobertura(stock0, vel),
          pctVentas30: vel > 0 ? 100 : null,
        }]
      } else {
        const ventasPorNombre = new Map(data.ventas30PorVariante.map(v => [v.nombre.toLowerCase(), v.cantidad]))
        const totalVentas30 = data.ventas30PorVariante.reduce((s, v) => s + v.cantidad, 0)
        modelos = data.porProducto
          .map(p => {
            const cant = ventasPorNombre.get(p.nombre.toLowerCase())
            const vel = cant !== undefined ? cant / 30 : 0
            const stock = stockDe(p.nombre, p.stock)
            return {
              modelo: p.nombre,
              stock,
              ventaDiaria30: vel,
              cobertura: cant !== undefined ? diasCobertura(stock, vel) : null,
              pctVentas30: cant !== undefined && totalVentas30 > 0 ? (cant / totalVentas30) * 100 : null,
            }
          })
          .sort((a, b) => (a.cobertura ?? Infinity) - (b.cobertura ?? Infinity))
      }

      return {
        key,
        label,
        stock: stockNeto,
        costoReposicion: costoUnit > 0 ? stockNeto * costoUnit : null,
        valorVenta: stockNeto * data.kpis.precioUnitario / IVA,
        montoVentas30d: monto30d(data.ventasDiarias, hoy),
        ventasDiarias: data.ventasDiarias,
        cierres: data.cierres,
        stockCierreAnterior: data.cierres[0]?.stock_final ?? null,
        modelos,
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
        modelos: modelosCelulares,
      },
      accesorio('smartwatches', 'Smartwatches', 'Smartwatches', 'smartwatch', smartwatches),
      accesorio('parlantes', 'Parlantes', 'Parlantes', 'parlante', parlantes),
      accesorio('auriculares', 'Auriculares', 'Auriculares', 'auricular', auriculares),
      {
        key: 'kits',
        label: 'Kits de Seguridad',
        stock: stockKits,
        costoReposicion: costoUnitKit > 0 ? stockKits * costoUnitKit : null,
        valorVenta: stockKits * PRECIO_VENTA_KIT,
        montoVentas30d: 0,
        ventasDiarias: salidasKits.map(s => ({ ...s, monto: 0 })),
        cierres: cierresKits,
        stockCierreAnterior: cierresKits[0]?.stock_final ?? null,
        // Los kits salen en bundles de celulares: se muestra el stock por modelo, sin cobertura
        modelos: kitsRows
          .filter(k => k.stock > 0)
          .map(k => ({ modelo: k.modelo, stock: k.stock, ventaDiaria30: 0, cobertura: null, pctVentas30: null }))
          .sort((a, b) => b.stock - a.stock),
      },
    ]

    return { productos, ventasPorModeloCelulares: ventasPorModelo, sinMovimiento, reposiciones, error: null }
  } catch (e: unknown) {
    return {
      productos: [],
      ventasPorModeloCelulares: [],
      sinMovimiento: [],
      reposiciones: [],
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

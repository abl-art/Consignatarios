'use server'

// ─── Recolección de datos del informe diario ───────────────────────────────
// Cada bloque se arma con su propio try/catch: si un fetch falla (típico: la
// base directa de GOcuotas en ventana de backup a las 6 AM), ese bloque sale
// null y el mail muestra su nota de fallback — el informe SIEMPRE sale.

import {
  type DatosInforme,
  type ModeloVendidoAyer,
  type PDCelda,
  type CajaDia,
  seleccionarMesesPD,
  cohortesMaduras,
  veredictoForecast,
  serieCaja,
} from '@/lib/informe-diario'
import { getPool } from '@/lib/db-pool'
import { sqlCondicionClientes, CLIENT_IDS_PROPIOS, CLIENTES_TERCEROS } from '@/lib/client-ids'
import { normalizarModelo, coberturaProyectada } from '@/lib/inventario-indicadores'
import { fetchInventarioResumen } from '@/lib/actions/inventario-resumen'
import { forecastCompras, type ItemVentaForecast } from '@/lib/forecast-compras'
import { getProyeccionPropiaRun, getProyeccionInicial } from '@/lib/actions/proyecciones'
import { fraccionMesTranscurrida, type MetodoProyeccion } from '@/lib/proyeccion-ventas'
import { getCertificados, getSiniestros } from '@/lib/actions/seguros'
import { fetchFlujoDeFondosPorCanal, fetchPDIndicadores, fetchVintageAnalysis } from '@/lib/actions/finanzas'
import { getWarehouseReport } from '@/lib/actions/warehouse-andreani'
import { fetchAlertasEnvios, fetchDemorasEntrega } from '@/lib/gocelular'
import { getArrepentimientos } from '@/lib/actions/arrepentimientos'
import { getPendientesRegreso } from '@/lib/actions/envios-regreso'
import { fetchTodos } from '@/app/(admin)/notas/actions'
import { eventosDelDia } from '@/lib/calendar-google'

// ─── Fechas ART ───────────────────────────────────────────────────────────

function hoyArt(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}

function diaAnterior(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10)
}

/** Ejecuta un bloque; si falla, loguea y devuelve null (el mail sale igual). */
async function bloque<T>(nombre: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn()
  } catch (e) {
    console.error(`informe-diario: bloque ${nombre} falló:`, e instanceof Error ? e.message : e)
    return null
  }
}

// ─── Ventas de ayer ───────────────────────────────────────────────────────

const COND_FECHA_ART = (param: string) =>
  `(o.order_created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = ${param}::date`

async function fetchVentasDeDia(fecha: string): Promise<{
  propia: { ordenes: number; monto: number }
  terceros: { ordenes: number; monto: number }
  modelosCrudos: { modelo: string; unidades: number }[]
}> {
  const pool = getPool()
  if (!pool) throw new Error('réplica no configurada')
  const condPropia = sqlCondicionClientes(CLIENT_IDS_PROPIOS, 'o.client_id::text')
  const condTerceros = sqlCondicionClientes(CLIENTES_TERCEROS, 'o.client_id::text')

  const client = await pool.connect()
  try {
    // Cantidades y monto por canal. Monto con la regla de centavos del repo
    // (total_order_amount > 5M = centavos → ÷100).
    const canales = await client.query<{ canal: string; ordenes: string; monto: string }>(
      `SELECT CASE WHEN ${condPropia} THEN 'propia' ELSE 'terceros' END AS canal,
              COUNT(*) AS ordenes,
              COALESCE(SUM(CASE WHEN o.total_order_amount > 5000000 THEN o.total_order_amount / 100.0 ELSE o.total_order_amount END), 0) AS monto
       FROM gocuotas_orders o
       WHERE o.order_discarded_at IS NULL
         AND ${COND_FECHA_ART('$1')}
       GROUP BY 1`,
      [fecha]
    )

    // Modelos propia: nombre de producto de la tienda (cobertura inmediata,
    // el device llega con el picking ~1 día después — regla de share por venta)
    const propiaModelos = await client.query<{ modelo: string; unidades: string }>(
      `SELECT so.product_name AS modelo, COUNT(*) AS unidades
       FROM gocuotas_orders o
       JOIN store_orders so ON so.gocuotas_order_id::text = o.order_id::text
       WHERE o.order_discarded_at IS NULL
         AND ${condPropia}
         AND ${COND_FECHA_ART('$1')}
       GROUP BY 1`,
      [fecha]
    )

    // Modelos terceros: devices (el comercio enrola al vender); MIN por orden
    // evita fan-out de órdenes con más de un device
    const tercerosModelos = await client.query<{ modelo: string; unidades: string }>(
      `SELECT dm.modelo, COUNT(*) AS unidades
       FROM gocuotas_orders o
       JOIN (SELECT order_id, MIN(model) AS modelo FROM devices WHERE model IS NOT NULL GROUP BY order_id) dm
         ON dm.order_id = o.order_id::text
       WHERE o.order_discarded_at IS NULL
         AND ${condTerceros}
         AND ${COND_FECHA_ART('$1')}
       GROUP BY 1`,
      [fecha]
    )

    const porCanal = new Map(canales.rows.map(r => [r.canal, { ordenes: Number(r.ordenes), monto: Number(r.monto) }]))

    // Unificar modelos por nombre normalizado, sumando unidades
    const porModelo = new Map<string, { modelo: string; unidades: number }>()
    for (const r of [...propiaModelos.rows, ...tercerosModelos.rows]) {
      const key = normalizarModelo(r.modelo)
      const prev = porModelo.get(key)
      if (prev) prev.unidades += Number(r.unidades)
      else porModelo.set(key, { modelo: r.modelo, unidades: Number(r.unidades) })
    }

    return {
      propia: porCanal.get('propia') ?? { ordenes: 0, monto: 0 },
      terceros: porCanal.get('terceros') ?? { ordenes: 0, monto: 0 },
      modelosCrudos: [...porModelo.values()].sort((a, b) => b.unidades - a.unidades),
    }
  } finally {
    client.release()
  }
}

async function bloqueVentas(ayer: string): Promise<DatosInforme['ventas']> {
  const ventas = await fetchVentasDeDia(ayer)

  // Cruce con inventario (días de stock proyectados) y forecast (a comprar)
  const resumen = await fetchInventarioResumen()
  const celulares = resumen.productos.find(p => p.key === 'celulares')
  const modelosInv = celulares?.modelos ?? []
  const proyectadas = coberturaProyectada(modelosInv, resumen.reposiciones)
  const coberturaPorKey = new Map<string, number | null>()
  modelosInv.forEach((m, i) => coberturaPorKey.set(normalizarModelo(m.modelo), proyectadas[i]?.cobertura ?? null))

  // Forecast de compras: una corrida por método (rango piso/techo)
  const aComprarPorKey = new Map<string, { min: number; max: number }>()
  try {
    const run = await getProyeccionPropiaRun()
    if (run && celulares) {
      const items: ItemVentaForecast[] = modelosInv.map(m => ({
        modelo: m.modelo,
        ventaDiaria30: m.ventaDiaria30,
        stock: m.stock,
      }))
      for (const metodo of ['hibrido', 'gocuotas'] as MetodoProyeccion[]) {
        const proyeccion = (run.porMetodo[metodo] ?? []).map(p => ({ mes: p.mes, unidades: p.unidades }))
        if (proyeccion.length === 0) continue
        const fc = forecastCompras(items, [], resumen.reposiciones, proyeccion)
        for (const fila of fc.celulares) {
          const key = normalizarModelo(fila.modelo)
          const prev = aComprarPorKey.get(key)
          if (prev) {
            prev.min = Math.min(prev.min, fila.totalAComprar)
            prev.max = Math.max(prev.max, fila.totalAComprar)
          } else {
            aComprarPorKey.set(key, { min: fila.totalAComprar, max: fila.totalAComprar })
          }
        }
      }
    }
  } catch (e) {
    // Sin forecast el bloque de ventas sigue sirviendo (columna a comprar en —)
    console.error('informe-diario: forecast de compras falló:', e instanceof Error ? e.message : e)
  }

  const modelos: ModeloVendidoAyer[] = ventas.modelosCrudos.map(m => {
    const key = normalizarModelo(m.modelo)
    const cobertura = coberturaPorKey.get(key)
    const rango = aComprarPorKey.get(key)
    return {
      modelo: m.modelo,
      unidades: m.unidades,
      diasStock: cobertura === undefined || cobertura === null ? null : Math.round(cobertura),
      aComprarMin: rango?.min ?? null,
      aComprarMax: rango?.max ?? null,
    }
  })

  return { propia: ventas.propia, terceros: ventas.terceros, modelos }
}

// ─── Resto de los bloques ─────────────────────────────────────────────────

async function bloqueForecast(hoy: string): Promise<DatosInforme['forecast']> {
  const inicial = await getProyeccionInicial()
  if (!inicial) return null
  const fila = inicial.total.find(f => f.mes === inicial.mesActual)
  if (!fila) return null
  const mes = {
    mes: inicial.mesActual,
    realParcial: fila.realParcial,
    hibrido: fila.hibrido ? { ventas: fila.hibrido.ventas } : null,
    gocuotas: fila.gocuotas ? { ventas: fila.gocuotas.ventas } : null,
    fraccionTranscurrida: fraccionMesTranscurrida(hoy),
  }
  return { mes, veredicto: veredictoForecast(mes) }
}

async function bloqueSeguros(ayer: string): Promise<DatosInforme['seguros']> {
  const [certs, siniestros] = await Promise.all([getCertificados(), getSiniestros()])
  const emitidas = certs.filter(c => c.estado === 'emitido' && c.createdAt.slice(0, 10) === ayer).length
  const denunciados = siniestros.filter(s => s.createdAt.slice(0, 10) === ayer).length
  return { emitidas, siniestros: denunciados }
}

async function bloqueCaja(hoy: string): Promise<CajaDia[]> {
  const flujo = await fetchFlujoDeFondosPorCanal()
  return serieCaja(flujo.total, hoy, 7)
}

async function bloquePD(): Promise<DatosInforme['pd']> {
  const pd = await fetchPDIndicadores()
  const celdas: PDCelda[] = pd.byOrigination
    .filter(r => [2, 3, 4].includes(r.cuota))
    .map(r => ({ mes: r.mes, cuota: r.cuota, pdHard: r.pd_hard, pd30: r.pd_30, denHard: r.den_hard, den30: r.den_30 }))
  const { meses, nota } = seleccionarMesesPD(celdas, [2, 3, 4], 3)
  return { celdas: celdas.filter(c => meses.includes(c.mes)), meses, nota }
}

async function bloqueIncobrabilidad(): Promise<DatosInforme['incobrabilidad']> {
  const rows = await fetchVintageAnalysis()
  return cohortesMaduras(rows).map(r => ({
    mes: r.origination_month,
    pct: r.pct_incobrable_90_plus,
    monto: r.amt_incobrable_90_plus,
  }))
}

async function bloqueDeposito(ayer: string): Promise<DatosInforme['deposito']> {
  const [reporte, alertas, demoras, arrepentimientos, regresos] = await Promise.all([
    getWarehouseReport(ayer, ayer),
    fetchAlertasEnvios(),
    fetchDemorasEntrega(),
    getArrepentimientos(),
    getPendientesRegreso(),
  ])

  const expedidosAyer = reporte.expedidosPorDia.find(d => d.dia.slice(0, 10) === ayer)?.cantidad ?? 0
  const demorados = [...demoras]
    .sort((a, b) => b.diasDemora - a.diasDemora)
  return {
    expedidosAyer,
    enCola: reporte.counts.enCola,
    enviadosSinExpedir: reporte.counts.enviado,
    enPicking: reporte.counts.picking,
    requierenAtencion: reporte.counts.requiereAtencion + alertas.requierenAtencion.length,
    demorados: {
      cantidad: demoras.length,
      peores: demorados.slice(0, 5).map(d => ({ ref: `${d.orderNumber} · ${d.producto ?? ''}`.trim(), dias: d.diasDemora })),
    },
    arrepentimientosAbiertos: arrepentimientos.filter(a => a.estado === 'pendiente').length,
    arrepentimientosAyer: arrepentimientos.filter(a => a.emailFecha.slice(0, 10) === ayer).length,
    pendientesRegreso: regresos.filter(r => !r.regresoAuto).length,
  }
}

interface TodoItem { id: string; text: string; done: boolean; prioridad?: string }

async function bloqueAgenda(hoy: string): Promise<DatosInforme['agenda']> {
  const todosRaw = await fetchTodos()
  const todos: { texto: string; fecha: string; urgente: boolean }[] = []
  for (const [fecha, items] of Object.entries(todosRaw)) {
    if (!Array.isArray(items) || fecha > hoy) continue
    for (const it of items as TodoItem[]) {
      if (it && it.done === false && it.text) {
        todos.push({ texto: it.text, fecha, urgente: it.prioridad === 'urgente' })
      }
    }
  }
  todos.sort((a, b) => (Number(b.urgente) - Number(a.urgente)) || a.fecha.localeCompare(b.fecha))

  let eventos: { titulo: string; horaInicio: string; horaFin: string }[] | null
  try {
    const evs = await eventosDelDia(hoy)
    eventos = evs === null ? null : evs.map(e => ({
      titulo: e.titulo,
      horaInicio: e.horaInicio.includes('T') ? e.horaInicio.slice(11, 16) : e.horaInicio,
      horaFin: e.horaFin.includes('T') ? e.horaFin.slice(11, 16) : e.horaFin,
    }))
  } catch {
    eventos = null
  }
  return { todos, eventos }
}

// ─── Recolección completa ─────────────────────────────────────────────────

/**
 * `fecha` opcional (YYYY-MM-DD) desplaza SOLO los bloques "de ayer" (ventas,
 * seguros, depósito-expedidos/ingresos). Lo demás — stock, forecast, caja,
 * cola del depósito, agenda — siempre refleja el momento de la corrida.
 */
export async function recolectarDatosInforme(fecha?: string): Promise<DatosInforme> {
  const hoy = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : hoyArt()
  const ayer = diaAnterior(hoy)

  // Secuencia cuidadosa con el pool de la réplica (max 5, compartido con la
  // app): bloques pesados de a pares; caja (base directa) al final, sola.
  const ventas = await bloque('ventas', () => bloqueVentas(ayer))
  const [forecast, seguros] = await Promise.all([
    bloque('forecast', () => bloqueForecast(hoy)),
    bloque('seguros', () => bloqueSeguros(ayer)),
  ])
  const [pd, incobrabilidad] = await Promise.all([
    bloque('pd', () => bloquePD()),
    bloque('incobrabilidad', () => bloqueIncobrabilidad()),
  ])
  const [deposito, agenda] = await Promise.all([
    bloque('deposito', () => bloqueDeposito(ayer)),
    bloque('agenda', () => bloqueAgenda(hoy)),
  ])
  const caja = await bloque('caja', () => bloqueCaja(hoy))

  return {
    fecha: hoy,
    ayer,
    ventas,
    forecast,
    seguros,
    caja,
    pd,
    incobrabilidad,
    deposito,
    agenda,
  }
}

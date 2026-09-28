'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { fetchVentasMensuales13m, fetchSerieMensualGocuotas } from '@/lib/gocelular'
import { clasificarCanal, type ConsignatarioPrefix } from '@/lib/ventas-dia'
import {
  armarProyVsReal,
  indiceEstacional,
  mesesSiguientes,
  proyectarHibrido,
  proyectarPorGocuotas,
  serieDimension,
  sumarMeses,
  ventanaSerie,
  type DimensionProyeccion,
  type FilaProyReal,
  type SnapshotProyeccion,
  type VentaMensualDim,
} from '@/lib/proyeccion-ventas'

// Cada run congela el mes en que corre + 4 siguientes: el "vs Real" de un mes
// compara contra el run del día 1 de ese mismo mes (proyección sin ver el mes),
// y el dashboard muestra los 4 meses posteriores al que está corriendo.
const HORIZONTE = 5

const mesHoy = () => new Date().toISOString().slice(0, 7)

async function fetchPrefixes(): Promise<ConsignatarioPrefix[]> {
  const admin = createAdminClient()
  const { data } = await admin.from('consignatarios').select('nombre, store_prefix')
  return (data ?? [])
    .filter((c: { store_prefix: string | null }) => c.store_prefix)
    .map((c: { nombre: string; store_prefix: string | null }) => ({ nombre: c.nombre, prefix: c.store_prefix!.toLowerCase() }))
}

interface FilaSnapshot extends SnapshotProyeccion {
  nivel: DimensionProyeccion['nivel']
  client_id: string
  store_id: string
}

/**
 * Congela el run del mes actual: índice estacional de GOcuotas + proyección
 * por ambos métodos para todas las dimensiones (total/propia/terceros +
 * cada merchant y store de terceros). Idempotente por run_mes salvo force.
 */
export async function congelarProyecciones(force = false): Promise<{ ok: boolean; resultado: string; filas?: number }> {
  const runMes = mesHoy()
  const admin = createAdminClient()

  const { data: existente } = await admin.from('proyecciones_runs').select('run_mes').eq('run_mes', runMes).maybeSingle()
  if (existente && !force) return { ok: true, resultado: `el run ${runMes} ya existe` }

  const [serieGq, raw, prefixes] = await Promise.all([fetchSerieMensualGocuotas(), fetchVentasMensuales13m(), fetchPrefixes()])
  if (serieGq.length === 0) return { ok: false, resultado: 'sin serie mensual de GOcuotas (base directa no disponible)' }
  if (raw.length === 0) return { ok: false, resultado: 'sin ventas mensuales en la réplica' }

  const indice = indiceEstacional(serieGq)
  const ultimoCerrado = sumarMeses(runMes, -1)
  const horizonte = mesesSiguientes(ultimoCerrado, HORIZONTE)

  const dimensiones: { dim: DimensionProyeccion; client_id: string; store_id: string }[] = [
    { dim: { nivel: 'total' }, client_id: '', store_id: '' },
    { dim: { nivel: 'propia' }, client_id: '', store_id: '' },
    { dim: { nivel: 'terceros' }, client_id: '', store_id: '' },
  ]
  const filasTerceros = raw.filter((r) => clasificarCanal(r, prefixes) === 'terceros')
  for (const clientId of new Set(filasTerceros.map((r) => r.client_id))) {
    dimensiones.push({ dim: { nivel: 'merchant', clientId }, client_id: clientId, store_id: '' })
  }
  for (const storeId of new Set(filasTerceros.map((r) => r.store_id).filter((s): s is string => s !== null))) {
    dimensiones.push({ dim: { nivel: 'store', storeId }, client_id: '', store_id: storeId })
  }

  const filas: FilaSnapshot[] = []
  for (const { dim, client_id, store_id } of dimensiones) {
    const ventana = ventanaSerie(serieDimension(raw, dim, prefixes), ultimoCerrado)
    if (ventana.length === 0) continue
    const porMetodo = {
      hibrido: proyectarHibrido(ventana, indice, horizonte),
      gocuotas: proyectarPorGocuotas(ventana, serieGq, horizonte),
    } as const
    for (const metodo of ['hibrido', 'gocuotas'] as const) {
      for (const p of porMetodo[metodo]) {
        filas.push({ run_mes: runMes, metodo, nivel: dim.nivel, client_id, store_id, mes: p.mes, ventas: p.ventas, monto: p.monto })
      }
    }
  }

  const { error: errRun } = await admin
    .from('proyecciones_runs')
    .upsert({ run_mes: runMes, indice, serie_gocuotas: serieGq }, { onConflict: 'run_mes' })
  if (errRun) return { ok: false, resultado: `error guardando run: ${errRun.message}` }

  const { error: errDel } = await admin.from('proyecciones_ventas').delete().eq('run_mes', runMes)
  if (errDel) return { ok: false, resultado: `error limpiando run previo: ${errDel.message}` }

  for (let i = 0; i < filas.length; i += 500) {
    const { error } = await admin.from('proyecciones_ventas').insert(filas.slice(i, i + 500))
    if (error) return { ok: false, resultado: `error insertando filas: ${error.message}` }
  }

  return { ok: true, resultado: `run ${runMes} congelado`, filas: filas.length }
}

export interface ProyeccionMesDashboard {
  mes: string
  hibrido: { ventas: number; monto: number }
  gocuotas: { ventas: number; monto: number } | null
}

/**
 * Proyección para la tarjeta del Dashboard 360: los 4 meses posteriores al
 * actual según el último run congelado (nivel total). Null si no hay runs.
 */
export async function getProyeccionDashboard(): Promise<{ runMes: string; meses: ProyeccionMesDashboard[] } | null> {
  const admin = createAdminClient()
  const { data: run } = await admin
    .from('proyecciones_runs')
    .select('run_mes')
    .order('run_mes', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!run) return null

  const { data: filas } = await admin
    .from('proyecciones_ventas')
    .select('metodo, mes, ventas, monto')
    .eq('run_mes', run.run_mes)
    .eq('nivel', 'total')
    .gt('mes', mesHoy())
    .order('mes')
  if (!filas || filas.length === 0) return null

  const porMes = new Map<string, ProyeccionMesDashboard>()
  for (const f of filas) {
    const acc = porMes.get(f.mes) ?? { mes: f.mes, hibrido: { ventas: 0, monto: 0 }, gocuotas: null }
    const cifras = { ventas: Number(f.ventas), monto: Number(f.monto) }
    if (f.metodo === 'hibrido') acc.hibrido = cifras
    else acc.gocuotas = cifras
    porMes.set(f.mes, acc)
  }
  return { runMes: run.run_mes, meses: [...porMes.values()].sort((a, b) => a.mes.localeCompare(b.mes)).slice(0, 4) }
}

/**
 * Filas Proyectado vs Real de una dimensión: snapshots de todos los runs
 * (por método, con la regla run_mes <= mes) cruzados contra lo real de la
 * réplica. Usada por /canales/proyeccion (las tres bases vienen del server
 * component; merchant/store se piden on-demand desde el cliente).
 */
export async function getProyeccionDimension(dim: DimensionProyeccion): Promise<FilaProyReal[]> {
  const admin = createAdminClient()
  let query = admin
    .from('proyecciones_ventas')
    .select('run_mes, metodo, mes, ventas, monto')
    .eq('nivel', dim.nivel)
  if (dim.nivel === 'merchant') query = query.eq('client_id', dim.clientId)
  if (dim.nivel === 'store') query = query.eq('store_id', dim.storeId)
  const { data: snaps } = await query.limit(5000)

  const [raw, prefixes] = await Promise.all([fetchVentasMensuales13m(), fetchPrefixes()])
  return armarFilas(snaps ?? [], raw, prefixes, dim)
}

function armarFilas(
  snaps: { run_mes: string; metodo: string; mes: string; ventas: number; monto: number }[],
  raw: VentaMensualDim[],
  prefixes: ConsignatarioPrefix[],
  dim: DimensionProyeccion
): FilaProyReal[] {
  const snapshots: SnapshotProyeccion[] = snaps.map((s) => ({
    run_mes: s.run_mes,
    metodo: s.metodo as SnapshotProyeccion['metodo'],
    mes: s.mes,
    ventas: Number(s.ventas),
    monto: Number(s.monto),
  }))
  return armarProyVsReal(snapshots, serieDimension(raw, dim, prefixes), mesHoy())
}

/**
 * Datos iniciales de /canales/proyeccion: las tres dimensiones base con un
 * solo fetch de réplica y de snapshots.
 */
export async function getProyeccionInicial(): Promise<{
  mesActual: string
  total: FilaProyReal[]
  propia: FilaProyReal[]
  terceros: FilaProyReal[]
} | null> {
  const admin = createAdminClient()
  const { data: snaps } = await admin
    .from('proyecciones_ventas')
    .select('run_mes, metodo, nivel, mes, ventas, monto')
    .in('nivel', ['total', 'propia', 'terceros'])
    .limit(5000)
  if (!snaps || snaps.length === 0) return null

  const [raw, prefixes] = await Promise.all([fetchVentasMensuales13m(), fetchPrefixes()])
  const porNivel = (nivel: 'total' | 'propia' | 'terceros') =>
    armarFilas(snaps.filter((s) => s.nivel === nivel), raw, prefixes, { nivel })

  return { mesActual: mesHoy(), total: porNivel('total'), propia: porNivel('propia'), terceros: porNivel('terceros') }
}

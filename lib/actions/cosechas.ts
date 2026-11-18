'use server'

// Server actions de "Cosechas": resuelven la membresía de la cohorte contra
// la réplica de GOcelular (queries parametrizadas), la CONGELAN en Supabase
// (tabla `cosechas`, con sus order_ids) y recalculan métricas on-demand
// contra la réplica usando esos ids — así una orden anulada después de
// armada la cosecha deja de computar en las métricas (`ordenesActivas` lo
// detecta) sin que la membresía original cambie.

import { revalidatePath } from 'next/cache'
import { getPool, getSupabasePool } from '@/lib/db-pool'
import { requierePermiso } from '@/lib/permisos-server'
import { CLIENTES_TODOS, sqlCondicionClientes } from '@/lib/client-ids'
import { sqlFiltrosIndicadores } from '@/lib/bloqueo'
import { resolverFiltro, fetchPDIndicadores, fetchVintageAnalysis } from './finanzas'
import { fetchOrderIdsConContracargo } from '@/lib/gocelular'
import { normalizarModelo } from '@/lib/inventario-indicadores'
import {
  MAX_ORDENES_COSECHA,
  ESTADOS_TRUSTONIC,
  validarDefCosecha,
  aplicarLimite,
  agruparModelos,
  agregarVintage,
  curvaEvolucion,
  resumenMadurez,
  type FiltrosCosecha,
  type DefCosecha,
  type Cosecha,
  type CuotaCosecha,
  type PuntoCurva,
  type MadurezCosecha,
  type CosechaVintage,
  type GrupoModelo,
} from '@/lib/cosechas'

export interface MetricasCosecha {
  id: string
  nombre: string
  vintage: CosechaVintage
  pdResumen: { cuota: number; pd_hard: number; pd_30: number }[]
  maxCuota: number
  curva: PuntoCurva[]
  madurez: MadurezCosecha
  cantOrdenes: number // congeladas
  ordenesActivas: number // vivas hoy (badge anuladas = cantOrdenes - ordenesActivas)
}

/** Fecha ART actual, YYYY-MM-DD — "hoy" para curva/madurez. */
function hoyArt(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}

// ---------------------------------------------------------------------------
// Resolución de membresía (compartida por preview/crear)
// ---------------------------------------------------------------------------

type ResultadoMiembros =
  | { ok: true; orderIds: string[]; disponibles: number; montoTotal: number; primeraVenta: string | null; ultimaVenta: string | null }
  | { ok: false; error: string }

async function resolverMiembros(def: DefCosecha): Promise<ResultadoMiembros> {
  const errorValidacion = validarDefCosecha(def)
  if (errorValidacion) return { ok: false, error: errorValidacion }

  const pool = getPool()
  if (!pool) return { ok: false, error: 'No se pudo conectar a la base de GOcelular' }

  const { clientes, filtros } = await resolverFiltro(def.filtros)
  const condClientes = sqlCondicionClientes(clientes, 'o.client_id::text')
  if (!condClientes) return { ok: false, error: 'La cosecha no tiene órdenes para esos filtros' }
  const extra = sqlFiltrosIndicadores(filtros)

  const client = await pool.connect()
  try {
    const params: unknown[] = [def.fechaDesde, def.fechaHasta]
    const condiciones: string[] = []

    // Estado Trustonic actual: multi-select contra la whitelist — la orden
    // entra si ALGÚN device matchea.
    const estadosElegidos = (def.filtros.trustonic ?? []).filter(
      (e): e is (typeof ESTADOS_TRUSTONIC)[number] => (ESTADOS_TRUSTONIC as readonly string[]).includes(e)
    )
    if (estadosElegidos.length > 0) {
      params.push(estadosElegidos)
      condiciones.push(
        `AND EXISTS (SELECT 1 FROM devices d WHERE d.order_id = o.order_id::text AND d.trustonic_status::text = ANY($${params.length}))`
      )
    }

    // Modelos: labels normalizados elegidos → variantes crudas de devices.model
    const modelosElegidos = def.filtros.modelos ?? []
    if (modelosElegidos.length > 0) {
      const modelosRes = await client.query<{ model: string; n: number }>(
        `SELECT model, COUNT(*)::int AS n FROM devices WHERE model IS NOT NULL GROUP BY 1`
      )
      const grupos = agruparModelos(modelosRes.rows)
      const labelsElegidos = new Set(modelosElegidos)
      const variantes = grupos.filter(g => labelsElegidos.has(g.label)).flatMap(g => g.variantes)
      // Label elegido que ya no existe más → sin variantes: no matchea nada
      // (la cosecha puede dar 0, que se reporta como "sin órdenes" más abajo)
      params.push(variantes.length > 0 ? variantes : ['__sin_match__'])
      condiciones.push(
        `AND EXISTS (SELECT 1 FROM devices d WHERE d.order_id = o.order_id::text AND d.model = ANY($${params.length}))`
      )
    }

    const res = await client.query<{ order_id: string; venta: string }>(
      `SELECT o.order_id::text AS order_id,
              to_char(o.order_created_at AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD') AS venta
       FROM gocuotas_orders o
       ${extra.join}
       WHERE o.order_delivered_at IS NOT NULL AND o.order_discarded_at IS NULL
         AND ${condClientes} ${extra.where}
         AND (o.order_created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date BETWEEN $1 AND $2
         ${condiciones.join('\n         ')}
       ORDER BY o.order_created_at ASC`,
      params
    )

    const disponibles = res.rows.length
    const filasSeleccionadas = aplicarLimite(res.rows, def.limite)

    if (filasSeleccionadas.length === 0) {
      return { ok: false, error: 'La cosecha no tiene órdenes para esos filtros y rango de fechas' }
    }
    if (filasSeleccionadas.length > MAX_ORDENES_COSECHA) {
      return { ok: false, error: `La cosecha supera el límite de ${MAX_ORDENES_COSECHA} órdenes: elegí un límite o un rango de fechas menor` }
    }

    const seleccionadas = filasSeleccionadas.map(r => r.order_id)
    const montoRes = await client.query<{ monto: string }>(
      `SELECT COALESCE(SUM(installment_amount), 0) AS monto
       FROM gocuotas_installments
       WHERE order_id::text = ANY($1::text[])`,
      [seleccionadas]
    )
    const montoTotal = Number(montoRes.rows[0].monto)

    return {
      ok: true,
      orderIds: seleccionadas,
      disponibles,
      montoTotal,
      primeraVenta: filasSeleccionadas[0].venta,
      ultimaVenta: filasSeleccionadas[filasSeleccionadas.length - 1].venta,
    }
  } finally {
    client.release()
  }
}

// ---------------------------------------------------------------------------
// Opciones del form (modelos)
// ---------------------------------------------------------------------------

export async function getOpcionesCosechas(): Promise<{ modelos: GrupoModelo[] }> {
  const pool = getPool()
  if (!pool) return { modelos: [] }
  const client = await pool.connect()
  try {
    const res = await client.query<{ model: string; n: number }>(
      `SELECT model, COUNT(*)::int AS n FROM devices WHERE model IS NOT NULL GROUP BY 1`
    )
    return { modelos: agruparModelos(res.rows) }
  } finally {
    client.release()
  }
}

// ---------------------------------------------------------------------------
// previewCosecha / crearCosecha / listarCosechas / borrarCosecha
// ---------------------------------------------------------------------------

export async function previewCosecha(def: DefCosecha): Promise<
  | { ok: true; disponibles: number; seleccionadas: number; montoTotal: number; primeraVenta: string | null; ultimaVenta: string | null }
  | { ok: false; error: string }
> {
  const miembros = await resolverMiembros(def)
  if (!miembros.ok) return miembros
  return {
    ok: true,
    disponibles: miembros.disponibles,
    seleccionadas: miembros.orderIds.length,
    montoTotal: miembros.montoTotal,
    primeraVenta: miembros.primeraVenta,
    ultimaVenta: miembros.ultimaVenta,
  }
}

function mapRowACosecha(row: {
  id: string
  nombre: string
  fecha_desde: string | Date
  fecha_hasta: string | Date
  filtros: FiltrosCosecha
  limite: number | null
  cant_ordenes: number
  cant_disponibles: number
  monto_total: string | number
  created_at: string | Date
}): Cosecha {
  const aFecha = (v: string | Date) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10))
  return {
    id: row.id,
    nombre: row.nombre,
    fechaDesde: aFecha(row.fecha_desde),
    fechaHasta: aFecha(row.fecha_hasta),
    filtros: row.filtros,
    limite: row.limite,
    cantOrdenes: row.cant_ordenes,
    cantDisponibles: row.cant_disponibles,
    montoTotal: Number(row.monto_total),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  }
}

export async function crearCosecha(def: DefCosecha): Promise<{ ok: true; cosecha: Cosecha } | { ok: false; error: string }> {
  await requierePermiso('finanzas', 'cosechas', 'operar')

  const miembros = await resolverMiembros(def)
  if (!miembros.ok) return miembros

  const supabasePool = getSupabasePool()
  if (!supabasePool) return { ok: false, error: 'No se pudo conectar a Supabase' }

  const client = await supabasePool.connect()
  try {
    const res = await client.query(
      `INSERT INTO cosechas
         (nombre, fecha_desde, fecha_hasta, filtros, limite, order_ids, cant_ordenes, cant_disponibles, monto_total)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6::text[], $7, $8, $9)
       RETURNING id, nombre, fecha_desde, fecha_hasta, filtros, limite, cant_ordenes, cant_disponibles, monto_total, created_at`,
      [
        def.nombre,
        def.fechaDesde,
        def.fechaHasta,
        JSON.stringify(def.filtros),
        def.limite,
        miembros.orderIds,
        miembros.orderIds.length,
        miembros.disponibles,
        miembros.montoTotal,
      ]
    )
    revalidatePath('/finanzas')
    return { ok: true, cosecha: mapRowACosecha(res.rows[0]) }
  } finally {
    client.release()
  }
}

export async function borrarCosecha(id: string): Promise<{ ok: boolean }> {
  await requierePermiso('finanzas', 'cosechas', 'operar')
  const supabasePool = getSupabasePool()
  if (!supabasePool) return { ok: false }
  const client = await supabasePool.connect()
  try {
    await client.query(`DELETE FROM cosechas WHERE id = $1`, [id])
    revalidatePath('/finanzas')
    return { ok: true }
  } finally {
    client.release()
  }
}

export async function listarCosechas(): Promise<Cosecha[]> {
  const supabasePool = getSupabasePool()
  if (!supabasePool) return []
  const client = await supabasePool.connect()
  try {
    // order_ids NUNCA al cliente: pesa (hasta 10k ids) y no se usa en la lista
    const res = await client.query(
      `SELECT id, nombre, fecha_desde, fecha_hasta, filtros, limite, cant_ordenes, cant_disponibles, monto_total, created_at
       FROM cosechas
       ORDER BY created_at DESC`
    )
    return res.rows.map(mapRowACosecha)
  } finally {
    client.release()
  }
}

// ---------------------------------------------------------------------------
// fetchMetricasCosechas
// ---------------------------------------------------------------------------

export async function fetchMetricasCosechas(ids: string[]): Promise<MetricasCosecha[]> {
  if (ids.length === 0) return []

  const supabasePool = getSupabasePool()
  if (!supabasePool) return []

  type RowConIds = { id: string; nombre: string; order_ids: string[] }
  const client = await supabasePool.connect()
  let filas: RowConIds[]
  try {
    const res = await client.query<RowConIds>(
      `SELECT id, nombre, order_ids FROM cosechas WHERE id = ANY($1::uuid[])`,
      [ids]
    )
    filas = res.rows
  } finally {
    client.release()
  }

  const pool = getPool()
  const hoy = hoyArt()
  // Pertenencia a contracargo: una sola consulta para todas las cosechas.
  const cbSet = new Set(await fetchOrderIdsConContracargo().catch(() => [] as string[]))

  const resultado: MetricasCosecha[] = []
  // Secuencial (no Promise.all entre cosechas): no saturar el pool de la réplica
  for (const fila of filas) {
    const orderIds = fila.order_ids ?? []
    if (orderIds.length === 0 || !pool) {
      resultado.push({
        id: fila.id,
        nombre: fila.nombre,
        vintage: agregarVintage([]),
        pdResumen: [],
        maxCuota: 0,
        curva: [],
        madurez: resumenMadurez([], hoy),
        cantOrdenes: orderIds.length,
        ordenesActivas: 0,
      })
      continue
    }

    const [vintageRows, pd] = await Promise.all([
      fetchVintageAnalysis(CLIENTES_TODOS, undefined, orderIds),
      fetchPDIndicadores(CLIENTES_TODOS, undefined, orderIds),
    ])

    const client2 = await pool.connect()
    let cuotas: CuotaCosecha[] = []
    try {
      const res = await client2.query<{
        order_id: string
        venta: string
        due: string
        collected: string | null
        descartada: boolean
        amount: string
      }>(
        `SELECT o.order_id::text AS order_id,
                to_char(o.order_created_at AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD') AS venta,
                to_char(i.installment_due_at, 'YYYY-MM-DD') AS due,
                to_char(i.installment_collected_at, 'YYYY-MM-DD') AS collected,
                (i.installment_discarded_at IS NOT NULL) AS descartada,
                i.installment_amount AS amount
         FROM gocuotas_installments i
         JOIN gocuotas_orders o ON o.order_id::text = i.order_id::text
         WHERE o.order_id::text = ANY($1::text[])
           AND o.order_delivered_at IS NOT NULL AND o.order_discarded_at IS NULL`,
        [orderIds]
      )
      cuotas = res.rows.map(r => ({
        orderId: r.order_id,
        venta: r.venta,
        due: r.due,
        collected: r.collected,
        descartada: r.descartada,
        cb: cbSet.has(r.order_id),
        amount: Number(r.amount),
      }))
    } finally {
      client2.release()
    }

    const ordenesActivas = new Set(cuotas.map(c => c.orderId)).size

    resultado.push({
      id: fila.id,
      nombre: fila.nombre,
      vintage: agregarVintage(vintageRows),
      pdResumen: pd.resumen,
      maxCuota: pd.maxCuota,
      curva: curvaEvolucion(cuotas, hoy),
      madurez: resumenMadurez(cuotas, hoy),
      cantOrdenes: orderIds.length,
      ordenesActivas,
    })
  }

  return resultado
}

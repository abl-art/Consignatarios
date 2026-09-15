'use server'

import { createClient } from '@/lib/supabase/server'
import { getPool } from '@/lib/db-pool'
import { revalidatePath } from 'next/cache'
import type { FacturaEnvio } from '@/lib/types'

export interface EnvioCSVRow {
  nro_envio: string
  fecha_envio: string
  concepto: string
  importe: number
  localidad_destino: string
  cp_destino: string
  sucursal_destino: string
  nro_legal: string
  fecha_comprobante: string
}

export async function getFacturasEnvios(): Promise<FacturaEnvio[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('facturas_envios')
    .select('*')
    .order('fecha_comprobante', { ascending: false })
    .returns<FacturaEnvio[]>()
  return data ?? []
}

export async function conciliarFacturaEnvios(rows: EnvioCSVRow[]) {
  if (rows.length === 0) return { error: 'No hay filas para procesar' }

  const nroLegal = rows[0].nro_legal
  const fechaComprobante = rows[0].fecha_comprobante

  // Check if invoice already exists
  const supabase = createClient()
  const { data: existing } = await supabase
    .from('facturas_envios')
    .select('id')
    .eq('nro_legal', nroLegal)
    .single()

  if (existing) return { error: `La factura ${nroLegal} ya fue cargada` }

  // Get unique tracking numbers from CSV
  const trackingNumbers = [...new Set(rows.map(r => r.nro_envio))]

  // Query GOcelular to find which tracking numbers exist
  const pool = getPool()
  let existingTrackings = new Set<string>()

  if (pool) {
    const client = await pool.connect()
    try {
      const res = await client.query<{ tracking_number: string }>(
        `SELECT DISTINCT tracking_number
         FROM shipments
         WHERE tracking_number = ANY($1)`,
        [trackingNumbers]
      )
      existingTrackings = new Set(res.rows.map(r => r.tracking_number))
    } finally {
      client.release()
    }
  }

  // Determine date range from CSV rows
  const fechas = rows.map(r => r.fecha_envio).filter(Boolean).sort()
  const fechaDesde = fechas[0]
  const fechaHasta = fechas[fechas.length - 1]

  // Format dates from YYYYMMDD to YYYY-MM-DD
  const formatDate = (d: string) => {
    if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
    return d
  }

  // Check which tracking numbers were already conciliated in previous invoices
  const { data: yaPagados } = await supabase
    .from('facturas_envios_detalle')
    .select('nro_envio')
    .eq('estado', 'conciliado')
    .in('nro_envio', trackingNumbers)
  const yaPagadosSet = new Set((yaPagados ?? []).map(r => r.nro_envio))

  // Classify each row: conciliado, sobrante, or ya_pagado
  const detailRows = rows.map(r => {
    let estado: string
    if (yaPagadosSet.has(r.nro_envio)) {
      estado = 'ya_pagado'
    } else if (existingTrackings.has(r.nro_envio)) {
      estado = 'conciliado'
    } else {
      estado = 'sobrante'
    }
    return {
      nro_envio: r.nro_envio,
      fecha_envio: formatDate(r.fecha_envio),
      concepto: r.concepto,
      importe: r.importe,
      localidad_destino: r.localidad_destino || null,
      cp_destino: r.cp_destino || null,
      sucursal_destino: r.sucursal_destino || null,
      estado,
    }
  })

  // Aggregate by unique tracking number for summary counts
  const porEnvio = new Map<string, { estado: string; importe: number }>()
  for (const d of detailRows) {
    const existing = porEnvio.get(d.nro_envio)
    if (existing) {
      existing.importe += d.importe
    } else {
      porEnvio.set(d.nro_envio, { estado: d.estado, importe: d.importe })
    }
  }

  const conciliados = [...porEnvio.values()].filter(e => e.estado === 'conciliado').length
  const sobrantes = [...porEnvio.values()].filter(e => e.estado === 'sobrante').length
  const duplicados = [...porEnvio.values()].filter(e => e.estado === 'ya_pagado').length
  const montoSobrante = [...porEnvio.values()]
    .filter(e => e.estado === 'sobrante')
    .reduce((sum, e) => sum + e.importe, 0)
  const montoDuplicado = [...porEnvio.values()]
    .filter(e => e.estado === 'ya_pagado')
    .reduce((sum, e) => sum + e.importe, 0)
  const totalFacturado = detailRows.reduce((sum, d) => sum + d.importe, 0)

  // Insert factura header
  const { data: factura, error: facturaError } = await supabase
    .from('facturas_envios')
    .insert({
      nro_legal: nroLegal,
      fecha_comprobante: formatDate(fechaComprobante),
      fecha_desde: formatDate(fechaDesde),
      fecha_hasta: formatDate(fechaHasta),
      total_envios: porEnvio.size,
      total_facturado: totalFacturado,
      envios_conciliados: conciliados,
      envios_sobrantes: sobrantes,
      monto_sobrante: montoSobrante,
      envios_duplicados: duplicados,
      monto_duplicado: montoDuplicado,
    })
    .select('id')
    .single()

  if (facturaError || !factura) return { error: facturaError?.message ?? 'Error al guardar factura' }

  // Insert detail rows in batches of 500
  const batchSize = 500
  for (let i = 0; i < detailRows.length; i += batchSize) {
    const batch = detailRows.slice(i, i + batchSize).map(d => ({
      ...d,
      factura_id: factura.id,
    }))
    await supabase.from('facturas_envios_detalle').insert(batch)
  }

  // Insert egreso in flujo de fondos: total + 21% IVA, pago a 30 días de la
  // fecha de la factura (regla de Emiliano, igual que la factura de warehouse)
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const adminClient = createAdminClient()

  const fechaFacturaDate = new Date(formatDate(fechaComprobante) + 'T00:00:00')
  fechaFacturaDate.setDate(fechaFacturaDate.getDate() + 30)
  const flujoDia = fechaFacturaDate.toISOString().slice(0, 10)
  const montoSinDuplicados = totalFacturado - montoDuplicado
  const montoConIva = Math.round(montoSinDuplicados * 1.21 * 100) / 100

  await adminClient.from('flujo_egresos').insert({
    flujo_dia: flujoDia,
    concepto: 'Envios',
    medio_de_pago: 'Transferencia',
    cuotas: 1,
    monto: montoConIva,
  })

  revalidatePath('/compras/envios')
  revalidatePath('/finanzas')
  return { ok: true, facturaId: factura.id, conciliados, sobrantes, montoSobrante, duplicados, montoDuplicado }
}

// Supabase corta en 1.000 filas por request: el detalle de facturas ya pasa
// las 19.000 y sin paginar la métrica se calculaba sobre una muestra parcial
const PAGINA = 1000
async function fetchDetalleCompleto<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
): Promise<T[]> {
  const todas: T[] = []
  for (let from = 0; ; from += PAGINA) {
    const { data } = await build(from, from + PAGINA - 1)
    if (!data || data.length === 0) break
    todas.push(...data)
    if (data.length < PAGINA) break
  }
  return todas
}

// Agosto 2026: el archivo de Andreani vino con el valor declarado inflado por
// error. La tarifa de distribución escala por RANGOS de valor declarado, así
// que además del seguro (que se excluye siempre) la distribución de esos
// envíos saltó de escalón (~$6.850 → $25.586 en la misma ciudad). Para la
// métrica se normaliza: a los envíos con seguro > $2.800 se les imputa la
// tarifa de su localidad según los envíos correctos del mismo mes (idéntica a
// julio, verificado). La conciliación de la factura NO se toca — cuando
// llegue la NC de Andreani (~$42M) y se reprocese, borrar esta corrección.
const MES_VALOR_DECLARADO_ERRONEO = '2026-08'
const SEGURO_NORMAL = 2800

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null
  const s = [...valores].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

interface DetalleRow {
  nro_envio: string
  localidad_destino: string | null
  fecha_envio: string
  importe: number
  concepto: string
  sucursal_destino: string | null
}


export interface DistribucionMensual {
  mes: string
  envios: number
  distribucion: number // costo de distribución (normalizado en el mes del error)
  seguro: number // seguro facturado (normalizado a $2.800 en el mes del error)
}

/**
 * Desglose mensual de la factura de distribución para la solapa Costos:
 * costo de distribución vs seguro, con la cantidad de envíos del mes. En el
 * mes del valor declarado erróneo normaliza la distribución de los envíos
 * inflados a la tarifa de su localidad y el seguro a $2.800.
 */
export async function getDistribucionMensual(): Promise<DistribucionMensual[]> {
  const supabase = createClient()
  const data = await fetchDetalleCompleto<DetalleRow>((from, to) =>
    supabase
      .from('facturas_envios_detalle')
      .select('nro_envio, localidad_destino, fecha_envio, importe, concepto, estado, sucursal_destino')
      .in('estado', ['conciliado', 'ya_pagado'])
      .range(from, to),
  )
  if (data.length === 0) return []

  const esSeguro = (r: DetalleRow) => r.concepto.toLowerCase().includes('seguro')
  const mesDe = (r: DetalleRow) => r.fecha_envio.slice(0, 7)

  const infladosMesError = new Set(
    data
      .filter(r => esSeguro(r) && mesDe(r) === MES_VALOR_DECLARADO_ERRONEO && r.importe > SEGURO_NORMAL)
      .map(r => r.nro_envio),
  )
  const porLocalidad = new Map<string, number[]>()
  const porLocalidadJulio = new Map<string, number[]>()
  const sanasGlobal: number[] = []
  for (const r of data) {
    if (esSeguro(r)) continue
    const loc = r.localidad_destino || 'Sin datos'
    if (mesDe(r) === MES_VALOR_DECLARADO_ERRONEO && !infladosMesError.has(r.nro_envio)) {
      if (!porLocalidad.has(loc)) porLocalidad.set(loc, [])
      porLocalidad.get(loc)!.push(r.importe)
      sanasGlobal.push(r.importe)
    } else if (mesDe(r) === '2026-07') {
      if (!porLocalidadJulio.has(loc)) porLocalidadJulio.set(loc, [])
      porLocalidadJulio.get(loc)!.push(r.importe)
    }
  }
  const tarifaCorrecta = (loc: string): number | null =>
    mediana(porLocalidad.get(loc) ?? []) ?? mediana(porLocalidadJulio.get(loc) ?? []) ?? mediana(sanasGlobal)

  const porMes = new Map<string, { envios: Set<string>; distribucion: number; seguro: number }>()
  for (const r of data) {
    const mes = mesDe(r)
    if (!porMes.has(mes)) porMes.set(mes, { envios: new Set(), distribucion: 0, seguro: 0 })
    const m = porMes.get(mes)!
    m.envios.add(r.nro_envio)
    const inflado = mes === MES_VALOR_DECLARADO_ERRONEO && infladosMesError.has(r.nro_envio)
    if (esSeguro(r)) {
      m.seguro += inflado ? SEGURO_NORMAL : r.importe
    } else {
      m.distribucion += inflado ? (tarifaCorrecta(r.localidad_destino || 'Sin datos') ?? r.importe) : r.importe
    }
  }

  return [...porMes.entries()]
    .map(([mes, m]) => ({ mes, envios: m.envios.size, distribucion: m.distribucion, seguro: m.seguro }))
    .sort((a, b) => a.mes.localeCompare(b.mes))
}

export async function eliminarFacturaEnvio(id: string) {
  const supabase = createClient()
  await supabase.from('facturas_envios').delete().eq('id', id)
  revalidatePath('/compras/envios')
}

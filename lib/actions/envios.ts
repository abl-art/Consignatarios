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

  // Insert egreso in flujo de fondos: total + 21% IVA, 15 days after last day of period
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const adminClient = createAdminClient()

  const fechaHastaDate = new Date(formatDate(fechaHasta) + 'T00:00:00')
  fechaHastaDate.setDate(fechaHastaDate.getDate() + 15)
  const flujoDia = fechaHastaDate.toISOString().slice(0, 10)
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

export interface CostoCiudadMes {
  ciudad: string
  mes: string
  envios: number
  costo_distribucion: number
  costo_promedio: number
}

export interface CostoCiudadResumen {
  ciudad: string
  meses: { mes: string; envios: number; costo_total: number; costo_promedio: number }[]
  variacion_pct: number | null
}

export async function getProvinciasDisponibles(): Promise<string[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('facturas_envios_detalle')
    .select('sucursal_destino')
    .not('sucursal_destino', 'is', null)
    .in('estado', ['conciliado', 'ya_pagado'])

  if (!data) return []
  const unique = [...new Set(data.map(r => r.sucursal_destino).filter(Boolean))] as string[]
  return unique.sort()
}

export async function getCostoPorCiudad(provincia?: string): Promise<CostoCiudadResumen[]> {
  const supabase = createClient()
  let query = supabase
    .from('facturas_envios_detalle')
    .select('localidad_destino, fecha_envio, importe, concepto, estado, sucursal_destino')
    .in('estado', ['conciliado', 'ya_pagado'])

  if (provincia) {
    query = query.eq('sucursal_destino', provincia)
  }

  const { data } = await query

  if (!data || data.length === 0) return []

  // Group by city + month, only distribution costs (seguro always $2800)
  const SEGURO = 2800
  const grouped = new Map<string, Map<string, { envios: Set<string>; costo: number }>>()

  for (const row of data) {
    // Group by provincia (sucursal) when no filter, by ciudad when filtering
    const agrupador = provincia
      ? (row.localidad_destino || 'Sin datos')
      : (row.sucursal_destino || row.localidad_destino || 'Sin datos')
    const ciudad = agrupador
    const mes = row.fecha_envio.slice(0, 7) // YYYY-MM

    if (!grouped.has(ciudad)) grouped.set(ciudad, new Map())
    const cityMap = grouped.get(ciudad)!
    if (!cityMap.has(mes)) cityMap.set(mes, { envios: new Set(), costo: 0 })
    const entry = cityMap.get(mes)!

    // Exclude seguro rows (concepto contains "Seguro")
    if (!row.concepto.toLowerCase().includes('seguro')) {
      entry.costo += row.importe
      entry.envios.add(row.fecha_envio + row.importe) // approximate unique count
    }
  }

  // Build result with monthly variation
  const result: CostoCiudadResumen[] = []
  for (const [ciudad, mesesMap] of grouped) {
    const meses = [...mesesMap.entries()]
      .map(([mes, d]) => ({
        mes,
        envios: d.envios.size,
        costo_total: d.costo,
        costo_promedio: d.envios.size > 0 ? Math.round(d.costo / d.envios.size) : 0,
      }))
      .sort((a, b) => a.mes.localeCompare(b.mes))

    // Calculate % variation between last two months
    let variacion_pct: number | null = null
    if (meses.length >= 2) {
      const prev = meses[meses.length - 2].costo_promedio
      const curr = meses[meses.length - 1].costo_promedio
      if (prev > 0) variacion_pct = Math.round(((curr - prev) / prev) * 1000) / 10
    }

    if (meses.some(m => m.envios > 0)) {
      result.push({ ciudad, meses, variacion_pct })
    }
  }

  // Sort by total shipments descending
  result.sort((a, b) => {
    const totalA = a.meses.reduce((s, m) => s + m.envios, 0)
    const totalB = b.meses.reduce((s, m) => s + m.envios, 0)
    return totalB - totalA
  })

  return result
}

export async function eliminarFacturaEnvio(id: string) {
  const supabase = createClient()
  await supabase.from('facturas_envios').delete().eq('id', id)
  revalidatePath('/compras/envios')
}

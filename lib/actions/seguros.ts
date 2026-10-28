'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import {
  fetchVentasAsegurables,
  fetchImeiActualPorOrden,
  fetchOrdenesDescartadas,
  fetchContracargosConFecha,
  fetchCostoPorImei,
} from '@/lib/gocelular'
import { getProductosCelularesConPrecio } from '@/lib/actions/lista-precios'
import { normalizarModelo } from '@/lib/inventario-indicadores'
import { prepararCertificados, novedadesDeCertificados, type CertActual } from '@/lib/seguros'

// Seguros por Robo: config del switch global + parámetros de prima/ingreso,
// sincronización de emisión (nuevas ventas + reintento de pendientes +
// novedades de ciclo de vida) y lectura de certificados para la UI/export.

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface SegurosConfig {
  activo: boolean
  activadoAt: string | null
  parametros: { tipo: 'prima' | 'ingreso'; porcentaje: number; vigenteDesde: string }[]
}

export async function getSegurosConfig(): Promise<SegurosConfig> {
  const supabase = createAdminClient()
  const [{ data: config }, { data: parametros }] = await Promise.all([
    supabase.from('seguros_config').select('activo, activado_at').eq('id', 1).single(),
    supabase
      .from('seguros_parametros')
      .select('tipo, porcentaje, vigente_desde')
      .order('vigente_desde', { ascending: true }),
  ])

  return {
    activo: config?.activo ?? false,
    activadoAt: config?.activado_at ?? null,
    parametros: (parametros ?? []).map((p) => ({
      tipo: p.tipo as 'prima' | 'ingreso',
      porcentaje: Number(p.porcentaje),
      vigenteDesde: p.vigente_desde as string,
    })),
  }
}

/**
 * Activo ⇒ entran todas las ventas vinculadas desde ese momento. Cada
 * transición inactivo→activo pisa `activado_at` con `now()` (una nueva
 * ventana de cobertura); desactivar, o re-activar sin haber pasado por
 * inactivo, no toca la fecha.
 */
export async function setSeguroActivo(activo: boolean): Promise<void> {
  const supabase = createAdminClient()
  const { data: actual } = await supabase.from('seguros_config').select('activo').eq('id', 1).single()
  const transicionAActivo = activo && !(actual?.activo ?? false)

  const update: { activo: boolean; activado_at?: string } = { activo }
  if (transicionAActivo) update.activado_at = new Date().toISOString()

  const { error } = await supabase.from('seguros_config').update(update).eq('id', 1)
  if (error) throw new Error(error.message)

  revalidatePath('/seguros')
}

export async function setParametro(
  tipo: 'prima' | 'ingreso',
  porcentaje: number,
  vigenteDesde: string,
): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('seguros_parametros')
    .upsert({ tipo, porcentaje, vigente_desde: vigenteDesde }, { onConflict: 'tipo,vigente_desde' })
  if (error) throw new Error(error.message)

  revalidatePath('/seguros')
}

// ---------------------------------------------------------------------------
// Sincronización de emisión
// ---------------------------------------------------------------------------

/** Certificados por llamada a seguros_emitir — evita payloads jsonb enormes en una sola corrida. */
const LOTE_EMITIR = 500

function enLotes<T>(items: T[], tamano: number): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < items.length; i += tamano) lotes.push(items.slice(i, i + tamano))
  return lotes
}

export async function sincronizarSeguros(): Promise<{ emitidos: number; novedades: number }> {
  const supabase = createAdminClient()
  const { data: config } = await supabase.from('seguros_config').select('activo, activado_at').eq('id', 1).single()

  if (!config?.activo || !config.activado_at) return { emitidos: 0, novedades: 0 }

  let emitidos = 0

  // 1) Ventas nuevas desde la activación → certificados nuevos (emitidos o pendientes).
  const ventas = await fetchVentasAsegurables(config.activado_at)

  const { data: existentesRows } = await supabase.from('seguros_certificados').select('gocuotas_order_id')
  const ordenesExistentes = new Set((existentesRows ?? []).map((r) => r.gocuotas_order_id as string))

  const productos = await getProductosCelularesConPrecio()
  const costosPorClave = new Map<string, number>()
  for (const p of productos) costosPorClave.set(normalizarModelo(p.nombre), p.mejor_precio)

  const imeisNuevos = [
    ...new Set(
      ventas
        .filter((v) => !ordenesExistentes.has(v.gocuotasOrderId) && costosPorClave.get(normalizarModelo(v.articulo)) === undefined)
        .map((v) => v.imei),
    ),
  ]
  const costoPorImei = await fetchCostoPorImei(imeisNuevos)

  const nuevos = prepararCertificados(ventas, ordenesExistentes, costosPorClave, costoPorImei, config.activado_at)

  if (nuevos.length > 0) {
    const payload = nuevos.map((c) => ({
      gocuotas_order_id: c.gocuotasOrderId,
      store_order_id: c.storeOrderId,
      pedido_numero: c.pedidoNumero,
      dni: c.dni,
      cliente: c.cliente,
      domicilio: c.domicilio,
      cp: c.cp,
      localidad: c.localidad,
      articulo: c.articulo,
      imei: c.imei,
      costo_sin_iva: c.costoSinIva,
      suma_asegurada: c.sumaAsegurada,
      costo_fuente: c.costoFuente,
      inicio_vig: c.inicioVig,
      fin_vig: c.finVig,
    }))
    for (const lote of enLotes(payload, LOTE_EMITIR)) {
      const { data: insertados, error } = await supabase.rpc('seguros_emitir', { certs: lote })
      if (error) throw new Error(error.message)
      emitidos += insertados ?? 0
    }
  }

  // 2) Certificados pendientes: reintentar costo (lista o imei) y emitir.
  const { data: pendientesRows } = await supabase
    .from('seguros_certificados')
    .select('id, articulo, imei')
    .eq('estado', 'pendiente')

  const pendientes = pendientesRows ?? []
  if (pendientes.length > 0) {
    const imeisPendientes = [
      ...new Set(pendientes.filter((p) => costosPorClave.get(normalizarModelo(p.articulo as string)) === undefined).map((p) => p.imei as string)),
    ]
    const costoPorImeiPendientes = await fetchCostoPorImei(imeisPendientes)

    for (const p of pendientes) {
      const porClave = costosPorClave.get(normalizarModelo(p.articulo as string))
      const costo = porClave !== undefined ? porClave : costoPorImeiPendientes.get(p.imei as string)
      if (costo === undefined) continue

      const fuente: 'lista' | 'inventario' = porClave !== undefined ? 'lista' : 'inventario'
      // Misma regla que prepararCertificados (lib/seguros.ts): suma asegurada =
      // costo sin IVA + 10%, redondeado a 2 decimales. Esa constante no está
      // exportada (es interna de lib/seguros.ts, fuera del scope de Task 4),
      // así que se repite el cálculo acá para las recuperaciones de pendientes.
      const suma = Math.round((costo * 1.1 + Number.EPSILON) * 100) / 100
      const { data: emitido, error } = await supabase.rpc('seguros_emitir_pendiente', {
        cert_id: p.id,
        costo,
        suma,
        fuente,
      })
      if (error) throw new Error(error.message)
      if (emitido) emitidos += 1
    }
  }

  // 3) Novedades de ciclo de vida: cambio de IMEI, anulación por descarte o contracargo.
  const { data: certsActualesRows } = await supabase
    .from('seguros_certificados')
    .select('id, gocuotas_order_id, imei, fecha_anula, fecha_siniestro')

  const certsActuales: CertActual[] = (certsActualesRows ?? []).map((c) => ({
    id: c.id as string,
    gocuotasOrderId: c.gocuotas_order_id as string,
    imei: c.imei as string,
    fechaAnula: c.fecha_anula as string | null,
    fechaSiniestro: c.fecha_siniestro as string | null,
  }))

  const ordenIds = certsActuales.map((c) => c.gocuotasOrderId)
  const [imeiActualPorOrden, discardedPorOrden, contracargoPorOrden] = await Promise.all([
    fetchImeiActualPorOrden(ordenIds),
    fetchOrdenesDescartadas(ordenIds),
    fetchContracargosConFecha(),
  ])

  const novedades = novedadesDeCertificados(certsActuales, imeiActualPorOrden, discardedPorOrden, contracargoPorOrden)

  for (const n of novedades) {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (n.imei !== undefined) update.imei = n.imei
    if (n.fechaAnula !== undefined) update.fecha_anula = n.fechaAnula
    if (n.motivoAnula !== undefined) update.motivo_anula = n.motivoAnula

    const { error } = await supabase.from('seguros_certificados').update(update).eq('id', n.id)
    if (error) throw new Error(error.message)
  }

  if (emitidos > 0 || novedades.length > 0) {
    revalidatePath('/seguros')
  }

  return { emitidos, novedades: novedades.length }
}

// ---------------------------------------------------------------------------
// Lectura para UI / export
// ---------------------------------------------------------------------------

export type CertificadoRow = {
  id: string
  numero: number | null
  gocuotasOrderId: string
  storeOrderId: string | null
  pedidoNumero: string | null
  dni: string | null
  cliente: string | null
  domicilio: string | null
  cp: string | null
  localidad: string | null
  articulo: string
  imei: string
  costoSinIva: number | null
  sumaAsegurada: number | null
  costoFuente: 'lista' | 'inventario' | null
  inicioVig: string
  finVig: string
  fechaAnula: string | null
  motivoAnula: 'descartada' | 'contracargo' | null
  fechaSiniestro: string | null
  estado: 'emitido' | 'pendiente'
  createdAt: string
  updatedAt: string
}

export async function getCertificados(): Promise<CertificadoRow[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('seguros_certificados')
    .select(
      'id, numero, gocuotas_order_id, store_order_id, pedido_numero, dni, cliente, domicilio, cp, localidad, articulo, imei, costo_sin_iva, suma_asegurada, costo_fuente, inicio_vig, fin_vig, fecha_anula, motivo_anula, fecha_siniestro, estado, created_at, updated_at',
    )
    .order('numero', { ascending: true, nullsFirst: false })

  if (error || !data) return []

  return data.map((r) => ({
    id: r.id as string,
    numero: r.numero as number | null,
    gocuotasOrderId: r.gocuotas_order_id as string,
    storeOrderId: r.store_order_id as string | null,
    pedidoNumero: r.pedido_numero as string | null,
    dni: r.dni as string | null,
    cliente: r.cliente as string | null,
    domicilio: r.domicilio as string | null,
    cp: r.cp as string | null,
    localidad: r.localidad as string | null,
    articulo: r.articulo as string,
    imei: r.imei as string,
    costoSinIva: r.costo_sin_iva !== null ? Number(r.costo_sin_iva) : null,
    sumaAsegurada: r.suma_asegurada !== null ? Number(r.suma_asegurada) : null,
    costoFuente: r.costo_fuente as 'lista' | 'inventario' | null,
    inicioVig: r.inicio_vig as string,
    finVig: r.fin_vig as string,
    fechaAnula: r.fecha_anula as string | null,
    motivoAnula: r.motivo_anula as 'descartada' | 'contracargo' | null,
    fechaSiniestro: r.fecha_siniestro as string | null,
    estado: r.estado as 'emitido' | 'pendiente',
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }))
}

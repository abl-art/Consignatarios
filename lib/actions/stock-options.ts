'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import type { StockOptionRow, ValuacionEmpresa } from '@/lib/stock-options'

export interface StockOptionInput {
  nombre: string
  fechaOtorgamiento: string
  sueldoMensualUsd: number
  multiplo: number
  valuacionIngresoUsd: number
  cliffMeses: number
  periodoMeses: number
  devengamiento: string
}

function validar(input: StockOptionInput): string | null {
  if (!input.nombre.trim()) return 'Falta el nombre y apellido'
  if (!input.fechaOtorgamiento) return 'Falta la fecha de otorgamiento'
  if (!(input.sueldoMensualUsd > 0)) return 'El sueldo mensual (USD) debe ser mayor a 0'
  if (!(input.multiplo > 0)) return 'El multiplo debe ser mayor a 0'
  if (!(input.valuacionIngresoUsd > 0)) return 'La valuacion al ingreso debe ser mayor a 0'
  if (input.cliffMeses < 0 || input.periodoMeses <= 0) return 'Cliff/periodo invalidos'
  if (input.cliffMeses > input.periodoMeses) return 'El cliff no puede superar el periodo'
  if (!['mensual', 'trimestral', 'anual'].includes(input.devengamiento)) return 'Devengamiento invalido'
  return null
}

export async function getStockOptions(): Promise<StockOptionRow[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('fc_grupogo_stock_options')
    .select('*')
    .order('created_at', { ascending: true })
  return (data as StockOptionRow[]) || []
}

export async function agregarStockOption(input: StockOptionInput): Promise<{ ok?: true; error?: string }> {
  const err = validar(input)
  if (err) return { error: err }
  const supabase = createAdminClient()
  const { error } = await supabase.from('fc_grupogo_stock_options').insert({
    nombre: input.nombre.trim(),
    fecha_otorgamiento: input.fechaOtorgamiento,
    sueldo_mensual_usd: input.sueldoMensualUsd,
    multiplo: input.multiplo,
    valuacion_ingreso_usd: input.valuacionIngresoUsd,
    cliff_meses: input.cliffMeses,
    periodo_meses: input.periodoMeses,
    devengamiento: input.devengamiento,
  })
  if (error) return { error: error.message }
  return { ok: true }
}

export async function eliminarStockOption(id: number): Promise<{ ok?: true; error?: string }> {
  const supabase = createAdminClient()
  const { error } = await supabase.from('fc_grupogo_stock_options').delete().eq('id', id)
  if (error) return { error: error.message }
  return { ok: true }
}

export async function getValuacionesEmpresa(): Promise<ValuacionEmpresa[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('fc_grupogo_valuacion_empresa')
    .select('*')
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
  return (data as ValuacionEmpresa[]) || []
}

export async function agregarValuacionEmpresa(fecha: string, valuacionUsd: number, nota?: string): Promise<{ ok?: true; error?: string }> {
  if (!fecha) return { error: 'Falta la fecha' }
  if (!(valuacionUsd > 0)) return { error: 'La valuacion debe ser mayor a 0' }
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('fc_grupogo_valuacion_empresa')
    .insert({ fecha, valuacion_usd: valuacionUsd, nota: nota?.trim() || null })
  if (error) return { error: error.message }
  return { ok: true }
}

// --- Contrato firmado (1 por grant, PDF en base64; reemplaza al anterior) ---

const MAX_CONTRATO_BYTES = 10 * 1024 * 1024

export async function subirContrato(optionId: number, filename: string, mime: string, dataBase64: string): Promise<{ ok?: true; error?: string }> {
  // base64 -> bytes aprox (sin padding fino, alcanza para el limite)
  if (dataBase64.length * 0.75 > MAX_CONTRATO_BYTES) return { error: 'El archivo supera los 10 MB' }
  if (!dataBase64) return { error: 'Archivo vacio' }
  const supabase = createAdminClient()
  const { error } = await supabase.from('fc_grupogo_so_contratos').upsert(
    { option_id: optionId, filename: filename.slice(0, 200), mime: mime || 'application/pdf', data_base64: dataBase64, updated_at: new Date().toISOString() },
    { onConflict: 'option_id' },
  )
  if (error) return { error: error.message }
  return { ok: true }
}

/** Metadatos de contratos (sin el base64, que pesa) para pintar la lista. */
export async function getContratosMeta(): Promise<{ option_id: number; filename: string; updated_at: string }[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('fc_grupogo_so_contratos')
    .select('option_id, filename, updated_at')
  return data || []
}

export async function descargarContrato(optionId: number): Promise<{ filename: string; mime: string; dataBase64: string } | { error: string }> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('fc_grupogo_so_contratos')
    .select('filename, mime, data_base64')
    .eq('option_id', optionId)
    .maybeSingle()
  if (error) return { error: error.message }
  if (!data) return { error: 'No hay contrato cargado' }
  return { filename: data.filename, mime: data.mime, dataBase64: data.data_base64 }
}

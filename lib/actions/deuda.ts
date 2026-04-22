'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { DeudaPrestamo, DeudaMovimiento, DeudaConfig } from '@/lib/types'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CONFIG_KEYS = {
  tasa_bullet: 'deuda_tasa_bullet',
  tasa_descubierto: 'deuda_tasa_descubierto',
  limite: 'deuda_limite',
  saldo_minimo: 'deuda_saldo_minimo',
} as const

export async function getDeudaConfig(): Promise<DeudaConfig> {
  const sb = createAdminClient()
  const { data } = await sb
    .from('flujo_config')
    .select('key, value')
    .in('key', Object.values(CONFIG_KEYS))

  const map: Record<string, string> = {}
  data?.forEach((r: { key: string; value: string }) => { map[r.key] = r.value })

  return {
    tasa_bullet: Number(map[CONFIG_KEYS.tasa_bullet] ?? '0.45'),
    tasa_descubierto: Number(map[CONFIG_KEYS.tasa_descubierto] ?? '0.55'),
    limite: Number(map[CONFIG_KEYS.limite] ?? '1000000000'),
    saldo_minimo: Number(map[CONFIG_KEYS.saldo_minimo] ?? '1000000'),
  }
}

export async function setDeudaConfig(config: DeudaConfig) {
  const sb = createAdminClient()
  const now = new Date().toISOString()
  const entries = [
    { key: CONFIG_KEYS.tasa_bullet, value: String(config.tasa_bullet), updated_at: now },
    { key: CONFIG_KEYS.tasa_descubierto, value: String(config.tasa_descubierto), updated_at: now },
    { key: CONFIG_KEYS.limite, value: String(config.limite), updated_at: now },
    { key: CONFIG_KEYS.saldo_minimo, value: String(config.saldo_minimo), updated_at: now },
  ]
  for (const entry of entries) {
    const { error } = await sb.from('flujo_config').upsert(entry)
    if (error) return { error: error.message }
  }
  revalidatePath('/finanzas')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Prestamos CRUD
// ---------------------------------------------------------------------------

export async function fetchPrestamos(): Promise<DeudaPrestamo[]> {
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('deuda_prestamos')
    .select('*')
    .order('fecha_toma', { ascending: false })
  if (error || !data) return []
  return data.map((r: Record<string, unknown>) => ({
    ...r,
    monto_capital: Number(r.monto_capital),
    tasa_anual: Number(r.tasa_anual),
    saldo_capital: Number(r.saldo_capital),
  })) as DeudaPrestamo[]
}

export async function crearPrestamo(input: {
  tipo: 'bullet' | 'descubierto'
  monto_capital: number
  tasa_anual: number
  fecha_toma: string
  plazo_dias?: number
}) {
  const sb = createAdminClient()
  const fecha_vencimiento = input.plazo_dias
    ? (() => {
        const d = new Date(input.fecha_toma)
        d.setDate(d.getDate() + input.plazo_dias!)
        return d.toISOString().slice(0, 10)
      })()
    : null

  const { data: prestamo, error } = await sb
    .from('deuda_prestamos')
    .insert({
      tipo: input.tipo,
      monto_capital: input.monto_capital,
      tasa_anual: input.tasa_anual,
      fecha_toma: input.fecha_toma,
      plazo_dias: input.plazo_dias ?? null,
      fecha_vencimiento,
      saldo_capital: input.monto_capital,
      estado: 'activo',
    })
    .select('id')
    .single()

  if (error || !prestamo) return { error: error?.message ?? 'Error creando préstamo' }

  // Registrar movimiento de toma
  await sb.from('deuda_movimientos').insert({
    prestamo_id: prestamo.id,
    tipo: 'toma',
    monto: input.monto_capital,
    fecha: input.fecha_toma,
  })

  revalidatePath('/finanzas')
  return { ok: true, id: prestamo.id }
}

export async function cancelarPrestamo(prestamoId: string) {
  const sb = createAdminClient()
  const { error } = await sb
    .from('deuda_prestamos')
    .update({ estado: 'cancelado' })
    .eq('id', prestamoId)
  if (error) return { error: error.message }
  revalidatePath('/finanzas')
  return { ok: true }
}

export async function devolverCapital(prestamoId: string, monto: number, fecha: string) {
  const sb = createAdminClient()

  // Obtener préstamo actual
  const { data: prestamo } = await sb
    .from('deuda_prestamos')
    .select('saldo_capital')
    .eq('id', prestamoId)
    .single()
  if (!prestamo) return { error: 'Préstamo no encontrado' }

  const nuevoSaldo = Number(prestamo.saldo_capital) - monto
  const updates: Record<string, unknown> = { saldo_capital: Math.max(0, nuevoSaldo) }
  if (nuevoSaldo <= 0) updates.estado = 'cancelado'

  const { error: updErr } = await sb
    .from('deuda_prestamos')
    .update(updates)
    .eq('id', prestamoId)
  if (updErr) return { error: updErr.message }

  await sb.from('deuda_movimientos').insert({
    prestamo_id: prestamoId,
    tipo: 'devolucion',
    monto,
    fecha,
  })

  revalidatePath('/finanzas')
  return { ok: true }
}

export async function registrarInteres(prestamoId: string, monto: number, fecha: string) {
  const sb = createAdminClient()
  const { error } = await sb.from('deuda_movimientos').insert({
    prestamo_id: prestamoId,
    tipo: 'interes',
    monto,
    fecha,
  })
  if (error) return { error: error.message }
  revalidatePath('/finanzas')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Movimientos
// ---------------------------------------------------------------------------

export async function fetchMovimientos(prestamoId?: string): Promise<DeudaMovimiento[]> {
  const sb = createAdminClient()
  let query = sb.from('deuda_movimientos').select('*').order('fecha', { ascending: true })
  if (prestamoId) query = query.eq('prestamo_id', prestamoId)
  const { data, error } = await query
  if (error || !data) return []
  return data.map((r: Record<string, unknown>) => ({
    ...r,
    monto: Number(r.monto),
  })) as DeudaMovimiento[]
}

export async function fetchInteresesPagadosMes(): Promise<number> {
  const sb = createAdminClient()
  const inicioMes = new Date()
  inicioMes.setDate(1)
  const { data } = await sb
    .from('deuda_movimientos')
    .select('monto')
    .eq('tipo', 'interes')
    .gte('fecha', inicioMes.toISOString().slice(0, 10))
  if (!data) return 0
  return data.reduce((sum: number, r: { monto: number }) => sum + Number(r.monto), 0)
}

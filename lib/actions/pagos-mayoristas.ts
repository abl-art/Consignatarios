'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { PagoMayorista, ExposicionRiesgo } from '@/lib/types'

// ---------------------------------------------------------------------------
// Asentar pago
// ---------------------------------------------------------------------------

export async function asentarPago(input: {
  cliente_mayorista_id: string
  monto: number
  fecha_cobro: string
  cuit_emisor: string
  tipo: 'echeq' | 'transferencia' | 'efectivo' | 'orden_pago'
  comprobante_url?: string | null
  confianza_extraccion?: number | null
}) {
  const supabase = createAdminClient()

  const { error } = await supabase.from('pagos_mayoristas').insert({
    cliente_mayorista_id: input.cliente_mayorista_id,
    monto: input.monto,
    fecha_cobro: input.fecha_cobro,
    cuit_emisor: input.cuit_emisor,
    tipo: input.tipo,
    comprobante_url: input.comprobante_url ?? null,
    confianza_extraccion: input.confianza_extraccion ?? null,
  })

  if (error) return { error: error.message }
  revalidatePath('/mayoristas/clientes/pagos')
  revalidatePath('/mayoristas/clientes/cuenta-corriente')
  revalidatePath('/finanzas')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Asentar echeqs en lote (carga rápida desde texto pegado)
// ---------------------------------------------------------------------------

export async function asentarPagosBulk(input: {
  cliente_mayorista_id: string
  pagos: {
    monto: number
    fecha_cobro: string
    cuit_emisor: string
    nro_cheque: string | null
    emisor: string | null
  }[]
}) {
  if (input.pagos.length === 0) return { error: 'No hay cheques para asentar' }
  const supabase = createAdminClient()

  const { error } = await supabase.from('pagos_mayoristas').insert(
    input.pagos.map(p => ({
      cliente_mayorista_id: input.cliente_mayorista_id,
      monto: p.monto,
      fecha_cobro: p.fecha_cobro,
      cuit_emisor: p.cuit_emisor,
      tipo: 'echeq' as const,
      nro_cheque: p.nro_cheque,
      emisor: p.emisor,
    }))
  )

  if (error) return { error: error.message }
  revalidatePath('/mayoristas/clientes/pagos')
  revalidatePath('/mayoristas/clientes/cuenta-corriente')
  revalidatePath('/finanzas')
  return { ok: true, cantidad: input.pagos.length }
}

// ---------------------------------------------------------------------------
// Obtener pagos de un cliente
// ---------------------------------------------------------------------------

export async function getPagosByCliente(clienteId: string): Promise<PagoMayorista[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('pagos_mayoristas')
    .select('*')
    .eq('cliente_mayorista_id', clienteId)
    .order('fecha_cobro', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as PagoMayorista[]
}

// ---------------------------------------------------------------------------
// Obtener todos los pagos (para flujo de fondos)
// ---------------------------------------------------------------------------

export async function getAllPagos(): Promise<PagoMayorista[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('pagos_mayoristas')
    .select('*')
    .order('fecha_cobro', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as PagoMayorista[]
}

// ---------------------------------------------------------------------------
// Buscar cliente por CUIT
// ---------------------------------------------------------------------------

export async function getClienteByCuit(cuit: string): Promise<{ id: string; nombre_comercial: string } | null> {
  const supabase = createAdminClient()
  const cuitNorm = cuit.replace(/-/g, '')
  const { data } = await supabase
    .from('clientes_mayoristas')
    .select('id, nombre_comercial, cuit')

  if (!data) return null
  const match = data.find(c => c.cuit && c.cuit.replace(/-/g, '') === cuitNorm)
  return match ? { id: match.id, nombre_comercial: match.nombre_comercial } : null
}

// ---------------------------------------------------------------------------
// Exposición al riesgo
// ---------------------------------------------------------------------------

export async function getExposicionRiesgo(): Promise<ExposicionRiesgo[]> {
  const supabase = createAdminClient()

  const [{ data: clientes }, { data: proformas }, { data: pagos }] = await Promise.all([
    supabase.from('clientes_mayoristas').select('id, nombre_comercial, limite_cuenta_corriente'),
    supabase.from('proformas').select('cliente_mayorista_id, total_con_iva').eq('estado', 'confirmada').not('cliente_mayorista_id', 'is', null),
    supabase.from('pagos_mayoristas').select('cliente_mayorista_id, monto, fecha_cobro'),
  ])

  if (!clientes) return []

  const hoy = new Date().toISOString().slice(0, 10)

  return clientes.map(c => {
    const deuda = (proformas ?? [])
      .filter(p => p.cliente_mayorista_id === c.id)
      .reduce((s, p) => s + (p.total_con_iva || 0), 0)

    const pagosCliente = (pagos ?? []).filter(p => p.cliente_mayorista_id === c.id)

    const pagos_acreditados = pagosCliente
      .filter(p => p.fecha_cobro <= hoy)
      .reduce((s, p) => s + (p.monto || 0), 0)

    const pendiente_cobro = pagosCliente
      .filter(p => p.fecha_cobro > hoy)
      .reduce((s, p) => s + (p.monto || 0), 0)

    const saldo = deuda - pagos_acreditados - pendiente_cobro
    const limite = c.limite_cuenta_corriente
    const consumido = deuda - pagos_acreditados
    const pct = limite && limite > 0 ? (consumido / limite) * 100 : null

    let estado: ExposicionRiesgo['estado'] = 'verde'
    if (pct !== null) {
      if (pct >= 100) estado = 'bloqueado'
      else if (pct > 90) estado = 'rojo'
      else if (pct > 70) estado = 'amarillo'
    }

    return {
      cliente_id: c.id,
      nombre_comercial: c.nombre_comercial,
      limite_cc: limite,
      deuda,
      pagos_acreditados,
      pendiente_cobro,
      saldo,
      porcentaje_utilizacion: pct !== null ? Math.round(pct) : null,
      estado,
    }
  })
}

// ---------------------------------------------------------------------------
// Verificar límite de CC (usado antes de confirmar proforma)
// ---------------------------------------------------------------------------

export async function verificarLimiteCC(
  clienteId: string,
  montoNuevaProforma: number
): Promise<{ permitido: boolean; mensaje?: string }> {
  const supabase = createAdminClient()

  const { data: cliente } = await supabase
    .from('clientes_mayoristas')
    .select('nombre_comercial, limite_cuenta_corriente')
    .eq('id', clienteId)
    .single()

  if (!cliente || !cliente.limite_cuenta_corriente) return { permitido: true }

  const { data: proformas } = await supabase
    .from('proformas')
    .select('total_con_iva')
    .eq('cliente_mayorista_id', clienteId)
    .eq('estado', 'confirmada')

  const { data: pagos } = await supabase
    .from('pagos_mayoristas')
    .select('monto')
    .eq('cliente_mayorista_id', clienteId)

  const deuda = (proformas ?? []).reduce((s, p) => s + (p.total_con_iva || 0), 0)
  const totalPagos = (pagos ?? []).reduce((s, p) => s + (p.monto || 0), 0)
  const saldoActual = deuda - totalPagos
  const saldoConNueva = saldoActual + montoNuevaProforma
  const limite = cliente.limite_cuenta_corriente

  if (saldoConNueva > limite) {
    return {
      permitido: false,
      mensaje: `Cliente ${cliente.nombre_comercial} excede su límite de cuenta corriente ($${Math.round(saldoActual).toLocaleString()}+$${Math.round(montoNuevaProforma).toLocaleString()} / $${Math.round(limite).toLocaleString()})`,
    }
  }

  return { permitido: true }
}

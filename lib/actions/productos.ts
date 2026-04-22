'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export interface ProductoFinanciero {
  id: string
  nombre: string
  parametros: Record<string, unknown>
  indicadores: Record<string, unknown>
  created_at: string
  updated_at: string
}

export async function fetchProductos(): Promise<ProductoFinanciero[]> {
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('productos_financieros')
    .select('*')
    .order('created_at', { ascending: false })
  if (error || !data) return []
  return data as ProductoFinanciero[]
}

export async function guardarProducto(nombre: string, parametros: Record<string, unknown>, indicadores: Record<string, unknown>) {
  const sb = createAdminClient()
  const { error } = await sb.from('productos_financieros').insert({
    nombre,
    parametros,
    indicadores,
    updated_at: new Date().toISOString(),
  })
  if (error) return { error: error.message }
  revalidatePath('/finanzas')
  return { ok: true }
}

export async function eliminarProducto(id: string) {
  const sb = createAdminClient()
  const { error } = await sb.from('productos_financieros').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/finanzas')
  return { ok: true }
}

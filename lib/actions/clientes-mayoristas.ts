'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { ClienteMayorista } from '@/lib/types'

export async function getClientesMayoristas(): Promise<ClienteMayorista[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('clientes_mayoristas')
    .select('*')
    .order('nombre_comercial')

  if (error || !data) return []
  return data as ClienteMayorista[]
}

export async function crearClienteMayorista(formData: FormData): Promise<{ ok: true; id: string } | { error: string }> {
  const nombre_comercial = (formData.get('nombre_comercial') as string)?.trim()
  if (!nombre_comercial) return { error: 'Nombre comercial es requerido' }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('clientes_mayoristas')
    .insert({
      nombre_comercial,
      razon_social: (formData.get('razon_social') as string)?.trim() || null,
      condicion_iva: (formData.get('condicion_iva') as string) || 'monotributo',
      cuit: (formData.get('cuit') as string)?.trim() || null,
      telefono: (formData.get('telefono') as string)?.trim() || null,
      email: (formData.get('email') as string)?.trim() || null,
      direccion_entrega: (formData.get('direccion_entrega') as string)?.trim() || null,
      transporte: (formData.get('transporte') as string)?.trim() || null,
    })
    .select('id')
    .single()

  if (error || !data) return { error: error?.message ?? 'Error al crear cliente' }

  revalidatePath('/mayoristas/clientes')
  revalidatePath('/mayoristas/proformas')
  return { ok: true, id: data.id }
}

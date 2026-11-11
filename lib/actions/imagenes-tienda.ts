'use server'

import { createAdminClient } from '@/lib/supabase/admin'

export type ImagenTienda = { path: string; url: string; creado: string }

export type ModeloImagen = { id: string; nombre: string; categoria: string; negocio: 'gocelular' | 'gomarket' }

/**
 * Modelos para generar imágenes: TODOS los productos no ocultos de
 * compras_productos (GOcelular Y GOmarket), con su unidad de negocio.
 * A diferencia de getModelosAgregables (Lista de Precios), acá SÍ se incluyen
 * los gomarket — Yami también crea sus imágenes para la tienda.
 */
export async function getModelosParaImagenes(): Promise<ModeloImagen[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('compras_productos')
    .select('id, nombre, categoria, oculto, plataforma')
    .order('categoria')
    .order('nombre')
  return (data ?? [])
    .filter(p => !p.oculto)
    .map(p => ({
      id: p.id as string,
      nombre: p.nombre as string,
      categoria: (p.categoria as string) || 'Otros',
      negocio: (p.plataforma === 'gomarket' ? 'gomarket' : 'gocelular') as 'gocelular' | 'gomarket',
    }))
}

/** Imágenes procesadas de un modelo, más viejas primero (orden de subida). */
export async function getImagenesModelo(productoId: string): Promise<ImagenTienda[]> {
  if (!/^[\w-]+$/.test(productoId)) return []
  const supabase = createAdminClient()
  const { data } = await supabase.storage
    .from('imagenes-tienda')
    .list(productoId, { limit: 20, sortBy: { column: 'name', order: 'asc' } })
  return (data ?? [])
    .filter(f => f.name.endsWith('.png'))
    .map(f => {
      const path = `${productoId}/${f.name}`
      const { data: pub } = supabase.storage.from('imagenes-tienda').getPublicUrl(path)
      return { path, url: pub.publicUrl, creado: f.created_at ?? '' }
    })
}

/** Ids de producto que ya tienen imágenes generadas (para marcar el desplegable). */
export async function getModelosConImagenes(): Promise<string[]> {
  const supabase = createAdminClient()
  const { data } = await supabase.storage.from('imagenes-tienda').list('', { limit: 500 })
  // En el root del bucket las carpetas vienen sin id (los archivos sueltos traen id)
  return (data ?? []).filter(f => !f.id).map(f => f.name)
}

export async function borrarImagenTienda(path: string): Promise<{ ok?: boolean; error?: string }> {
  if (!/^[\w-]+\/[\w.-]+$/.test(path)) return { error: 'Ruta inválida' }
  const supabase = createAdminClient()
  const { error } = await supabase.storage.from('imagenes-tienda').remove([path])
  if (error) return { error: error.message }
  return { ok: true }
}

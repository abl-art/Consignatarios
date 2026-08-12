'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { fetchKitsSeguridad } from '@/lib/gocelular-kits'

// Sincroniza los Kits de Seguridad de GOcelular (store_products, SKU KS-*)
// con compras_productos: crea los nuevos, actualiza nombres y oculta los
// que ya no existen en GOcelular. Si la DB externa no responde, no toca nada.
export async function syncKitsGocelular() {
  let kits
  try {
    kits = await fetchKitsSeguridad()
  } catch {
    return
  }
  if (kits.length === 0) return

  const supabase = createAdminClient()
  const { data: existentes } = await supabase
    .from('compras_productos')
    .select('id, codigo, nombre, oculto')
    .eq('categoria', 'Kits de Seguridad')

  const porCodigo = new Map((existentes ?? []).map((p) => [p.codigo, p]))
  const skus = new Set(kits.map((k) => k.sku))

  const nuevos = kits
    .filter((k) => !porCodigo.has(k.sku))
    .map((k) => ({ codigo: k.sku, nombre: k.nombre, categoria: 'Kits de Seguridad' }))
  if (nuevos.length > 0) {
    await supabase.from('compras_productos').insert(nuevos)
  }

  for (const k of kits) {
    const existente = porCodigo.get(k.sku)
    if (existente && existente.nombre !== k.nombre) {
      await supabase.from('compras_productos').update({ nombre: k.nombre }).eq('id', existente.id)
    }
  }

  // Modelos viejos copiados a mano o kits dados de baja en GOcelular
  const huerfanos = (existentes ?? []).filter((p) => !skus.has(p.codigo) && !p.oculto)
  if (huerfanos.length > 0) {
    await supabase
      .from('compras_productos')
      .update({ oculto: true })
      .in('id', huerfanos.map((p) => p.id))
  }
}

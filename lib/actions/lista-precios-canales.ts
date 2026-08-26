'use server'

// Datos para /canales/lista-precios: costos por proveedor del gestor de
// Compras + múltiplos editables (flujo_config) + precio tienda y ventas 30d
// de GOcelular. El armado puro vive en lib/lista-precios.ts.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchPreciosTiendaCelulares, fetchVentasPorModelo } from '@/lib/gocelular'
import {
  aplicarTodoBono,
  armarListaPrecios,
  type BonoModelo,
  type CostoProveedor,
  type FilaListaPrecios,
  type ProductoLista,
  type TodoNotas,
} from '@/lib/lista-precios'

const MULTIPLO_KEY = 'listaprecios_multiplo_'
const BONO_KEY = 'listaprecios_bono_'

export async function getListaPrecios(): Promise<FilaListaPrecios[]> {
  const supabase = createAdminClient()

  const [{ data: prods }, { data: precios }, { data: provs }, { data: cfg }, preciosTienda, ventasDiarias] =
    await Promise.all([
      supabase.from('compras_productos').select('id, nombre, codigo, categoria, oculto').eq('categoria', 'Celulares'),
      supabase.from('compras_precios').select('producto_id, proveedor_id, precio, created_at').order('created_at', { ascending: false }),
      supabase.from('compras_proveedores').select('id, nombre'),
      supabase.from('flujo_config').select('key, value').like('key', 'listaprecios_%'),
      fetchPreciosTiendaCelulares().catch(() => ({} as Record<string, number>)),
      fetchVentasPorModelo().catch(() => []),
    ])

  const productos: ProductoLista[] = (prods ?? [])
    .filter(p => !p.oculto)
    .map(p => ({ id: p.id as string, nombre: p.nombre as string, codigo: (p.codigo as string) || null }))

  const nombreProveedor = new Map<string, string>((provs ?? []).map(p => [p.id as string, p.nombre as string]))

  // última actualización por (producto, proveedor) — vienen ordenados desc
  const vistos = new Set<string>()
  const costosPorProducto: Record<string, CostoProveedor[]> = {}
  for (const p of precios ?? []) {
    const key = `${p.producto_id}|${p.proveedor_id}`
    if (vistos.has(key)) continue
    vistos.add(key)
    const proveedor = nombreProveedor.get(p.proveedor_id as string)
    if (!proveedor) continue
    ;(costosPorProducto[p.producto_id as string] ??= []).push({ proveedor, precio: Number(p.precio) })
  }

  const multiplos: Record<string, number> = {}
  const bonos: Record<string, BonoModelo> = {}
  for (const row of cfg ?? []) {
    const key = row.key as string
    if (key.startsWith(MULTIPLO_KEY)) {
      const valor = Number(row.value)
      if (Number.isFinite(valor) && valor > 0) multiplos[key.slice(MULTIPLO_KEY.length)] = valor
    } else if (key.startsWith(BONO_KEY)) {
      try {
        const bono = JSON.parse(row.value as string) as BonoModelo
        if (bono && Number(bono.monto) > 0) bonos[key.slice(BONO_KEY.length)] = bono
      } catch { /* valor corrupto: se ignora */ }
    }
  }

  const desde = new Date()
  desde.setDate(desde.getDate() - 30)
  const corte = desde.toISOString().slice(0, 10)
  const ventas30d: Record<string, number> = {}
  for (const v of ventasDiarias) {
    if (v.fecha >= corte) ventas30d[v.modelo] = (ventas30d[v.modelo] ?? 0) + v.ventas
  }

  // Autocuración: garantiza el ToDo "Vto BONO" de cada bono guardado (cubre
  // bonos creados antes de la feature o si el sync del guardado falló)
  try {
    const { data: cfgTodos } = await supabase.from('flujo_config').select('value').eq('key', 'app_todos').single()
    let todos = cfgTodos?.value ? JSON.parse(cfgTodos.value) : {}
    if (!Array.isArray(todos)) {
      const antes = JSON.stringify(todos)
      for (const [id, bono] of Object.entries(bonos)) {
        const nombre = productos.find(p => p.id === id)?.nombre ?? id
        todos = aplicarTodoBono(todos as Record<string, TodoNotas[]>, id, nombre, bono.hasta, Number(bono.monto))
      }
      if (JSON.stringify(todos) !== antes) {
        await supabase.from('flujo_config').upsert({
          key: 'app_todos',
          value: JSON.stringify(todos),
          updated_at: new Date().toISOString(),
        })
      }
    }
  } catch { /* best-effort */ }

  return armarListaPrecios(productos, costosPorProducto, multiplos, preciosTienda, ventas30d, bonos)
}

export async function setBonoListaPrecios(productoId: string, bono: BonoModelo | null) {
  const supabase = createAdminClient()
  const key = `${BONO_KEY}${productoId}`
  if (!bono || !(Number(bono.monto) > 0)) {
    const { error } = await supabase.from('flujo_config').delete().eq('key', key)
    if (error) return { error: error.message }
  } else {
    if (bono.desde && bono.hasta && bono.desde > bono.hasta) {
      return { error: 'La vigencia "desde" no puede ser posterior a "hasta"' }
    }
    const { error } = await supabase.from('flujo_config').upsert({
      key,
      value: JSON.stringify({ monto: Number(bono.monto), desde: bono.desde || undefined, hasta: bono.hasta || undefined }),
      updated_at: new Date().toISOString(),
    })
    if (error) return { error: error.message }
  }
  revalidatePath('/canales/lista-precios')

  // Recordatorio en la pestaña ToDo de /notas: "Vto BONO <modelo>" urgente el
  // día del vencimiento (se muda o borra solo si el bono cambia o se quita)
  try {
    const { data: prod } = await supabase.from('compras_productos').select('nombre').eq('id', productoId).single()
    const nombre = (prod?.nombre as string) ?? productoId
    const { data: cfgTodos } = await supabase.from('flujo_config').select('value').eq('key', 'app_todos').single()
    const todos = cfgTodos?.value ? JSON.parse(cfgTodos.value) : {}
    if (!Array.isArray(todos)) {
      const actualizados = aplicarTodoBono(
        todos as Record<string, TodoNotas[]>,
        productoId,
        nombre,
        bono && Number(bono.monto) > 0 ? bono.hasta || undefined : undefined,
        bono ? Number(bono.monto) : undefined,
      )
      await supabase.from('flujo_config').upsert({
        key: 'app_todos',
        value: JSON.stringify(actualizados),
        updated_at: new Date().toISOString(),
      })
    }
  } catch { /* el recordatorio es best-effort: no bloquea el guardado del bono */ }

  return { ok: true }
}

export async function setMultiploListaPrecios(productoId: string, multiplo: number) {
  if (!Number.isFinite(multiplo) || multiplo <= 0 || multiplo > 10) {
    return { error: 'El múltiplo debe ser un número mayor a 0' }
  }
  const supabase = createAdminClient()
  const { error } = await supabase.from('flujo_config').upsert({
    key: `${MULTIPLO_KEY}${productoId}`,
    value: String(multiplo),
    updated_at: new Date().toISOString(),
  })
  if (error) return { error: error.message }
  revalidatePath('/canales/lista-precios')
  return { ok: true }
}

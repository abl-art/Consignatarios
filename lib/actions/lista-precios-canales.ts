'use server'

// Datos para /canales/lista-precios: costos por proveedor del gestor de
// Compras + múltiplos editables (flujo_config) + precio tienda y ventas de
// GOcelular. Los bonos viven en la tabla lista_precios_bonos (una fila por
// campaña, con historial y PDF de prueba de ventas). El armado puro vive en
// lib/lista-precios.ts.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  fetchPreciosTiendaCelulares,
  fetchVentasPorModelo,
  fetchVentasPropiasPorModelo,
  fetchVentasPropiasConFactura,
} from '@/lib/gocelular'
import { normalizarModelo } from '@/lib/inventario-indicadores'
import { armarNotasCredito, marcaNC, resumenVentasAccion, PROVEEDOR_NC, type GrupoNC } from '@/lib/notas-credito'
import { renderNcAccion } from '@/lib/pdf/nc-accion'
import { renderPruebaVentasBono } from '@/lib/pdf/prueba-ventas-bono'
import {
  ahoraArgentina,
  aplicarTodoBono,
  armarHistorialBonos,
  armarListaPrecios,
  recortarVentasACupo,
  type BonoModelo,
  type BonoRegistro,
  type CostoProveedor,
  type FilaHistorialBono,
  type FilaListaPrecios,
  type ProductoLista,
  type TodoNotas,
} from '@/lib/lista-precios'

const MULTIPLO_KEY = 'listaprecios_multiplo_'
const BONO_KEY = 'listaprecios_bono_'
// JSON array de producto_ids fijados a mano (aparecen aunque no vendan)
const INCLUIDOS_KEY = 'listaprecios_incluidos'

function parseIncluidos(cfg: { key: string; value: string }[] | null | undefined): string[] {
  const row = (cfg ?? []).find(r => r.key === INCLUIDOS_KEY)
  if (!row) return []
  try {
    const ids = JSON.parse(row.value)
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

interface BonoRow {
  id: string
  producto_id: string
  nombre_modelo: string
  monto: string | number
  desde: string | null
  hasta: string | null
  cupo: number | null
  pdf_url: string | null
  pdf_generado_at: string | null
  precio_repuesto_at: string | null
  precio_bono_publicado_at: string | null
  nc_emitida_at: string | null
}

function mapBonoRow(r: BonoRow): BonoRegistro {
  return {
    id: r.id,
    productoId: r.producto_id,
    nombreModelo: r.nombre_modelo,
    monto: Number(r.monto),
    desde: r.desde ?? undefined,
    hasta: r.hasta ?? undefined,
    cupo: r.cupo ?? undefined,
    pdfUrl: r.pdf_url,
    pdfGeneradoAt: r.pdf_generado_at,
    precioRepuestoAt: r.precio_repuesto_at,
    precioBonoPublicadoAt: r.precio_bono_publicado_at,
    ncEmitidaAt: r.nc_emitida_at,
  }
}

function hoyIso(): string {
  // fecha argentina: el bono vale hasta las 23:59 ART del día `hasta`
  return ahoraArgentina().toISOString().slice(0, 10)
}

// El bono que aplica hoy en la lista: la fila cuya vigencia incluye la fecha
// actual (si hubiera más de una —no debería, se valida al guardar— gana la de
// desde más reciente). Sin vigente, el próximo futuro: la lista lo muestra
// como "arranca el X" y el editor lo edita en vez de chocar por solapamiento.
function bonosVigentesPorProducto(registros: BonoRegistro[], dia: string = hoyIso()): Record<string, BonoRegistro> {
  const map: Record<string, BonoRegistro> = {}
  const futuros = registros
    .filter(r => r.desde && r.desde > dia)
    .sort((a, b) => (b.desde ?? '').localeCompare(a.desde ?? '')) // el más próximo pisa al final
  const cubren = registros
    .filter(r => (!r.desde || r.desde <= dia) && (!r.hasta || r.hasta >= dia))
    .sort((a, b) => (a.desde ?? '').localeCompare(b.desde ?? ''))
  for (const r of [...futuros, ...cubren]) map[r.productoId] = r
  return map
}

async function fetchBonosRegistros(supabase: ReturnType<typeof createAdminClient>): Promise<BonoRegistro[]> {
  const { data } = await supabase.from('lista_precios_bonos').select('*')
  return ((data ?? []) as BonoRow[]).map(mapBonoRow)
}

/** Todas las campañas de bono (para el cron de reajuste y otros consumidores). */
export async function getBonosRegistros(): Promise<BonoRegistro[]> {
  return fetchBonosRegistros(createAdminClient())
}

/** Marca campañas como "precio repuesto en tienda" (el cron no las repite). */
export async function marcarPrecioRepuesto(bonoIds: string[]): Promise<void> {
  if (!bonoIds.length) return
  const supabase = createAdminClient()
  await supabase
    .from('lista_precios_bonos')
    .update({ precio_repuesto_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .in('id', bonoIds)
}

/** Marca campañas con el precio con bono ya publicado (el cron no las repite). */
export async function marcarBonoPublicado(bonoIds: string[]): Promise<void> {
  if (!bonoIds.length) return
  const supabase = createAdminClient()
  await supabase
    .from('lista_precios_bonos')
    .update({ precio_bono_publicado_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .in('id', bonoIds)
}

/** Agrega ToDos del cron de reajuste a la pestaña ToDo de /notas (best-effort). */
export async function agregarTodosReajuste(
  entradas: { id: string; texto: string; urgente: boolean }[],
): Promise<void> {
  if (!entradas.length) return
  const supabase = createAdminClient()
  try {
    const { data: cfgTodos } = await supabase.from('flujo_config').select('value').eq('key', 'app_todos').single()
    const todos = cfgTodos?.value ? JSON.parse(cfgTodos.value) : {}
    if (Array.isArray(todos)) return
    const fecha = hoyIso()
    const items: TodoNotas[] = Array.isArray(todos[fecha]) ? todos[fecha] : []
    for (const e of entradas) {
      if (!items.some((t: TodoNotas) => t.id === e.id)) {
        items.push({ id: e.id, text: e.texto, done: false, prioridad: e.urgente ? 'urgente' : 'normal' })
      }
    }
    todos[fecha] = items
    await supabase.from('flujo_config').upsert({
      key: 'app_todos',
      value: JSON.stringify(todos),
      updated_at: new Date().toISOString(),
    })
  } catch { /* best-effort */ }
}

// Migración lazy de las keys viejas listaprecios_bono_<id> de flujo_config a
// la tabla: corre una sola vez (las keys se borran al migrar). Best-effort.
async function migrarBonosLegacy(
  supabase: ReturnType<typeof createAdminClient>,
  cfg: { key: string; value: string }[],
  productos: ProductoLista[],
  registros: BonoRegistro[],
): Promise<BonoRegistro[]> {
  const legacy = cfg.filter(row => row.key.startsWith(BONO_KEY))
  if (legacy.length === 0) return registros

  const nuevos: BonoRegistro[] = []
  for (const row of legacy) {
    const productoId = row.key.slice(BONO_KEY.length)
    try {
      const bono = JSON.parse(row.value) as BonoModelo
      const nombre = productos.find(p => p.id === productoId)?.nombre
      const yaExiste = registros.some(
        r => r.productoId === productoId && r.monto === Number(bono.monto) && (r.hasta ?? null) === (bono.hasta ?? null),
      )
      if (nombre && Number(bono.monto) > 0 && !yaExiste) {
        const { data } = await supabase
          .from('lista_precios_bonos')
          .insert({
            producto_id: productoId,
            nombre_modelo: nombre,
            monto: Number(bono.monto),
            desde: bono.desde ?? null,
            hasta: bono.hasta ?? null,
          })
          .select()
          .single()
        if (data) nuevos.push(mapBonoRow(data as BonoRow))
      }
      await supabase.from('flujo_config').delete().eq('key', row.key)
    } catch {
      /* valor corrupto: se ignora, la key queda para inspección manual */
    }
  }
  return [...registros, ...nuevos]
}

export async function getListaPrecios(opts?: { fechaSimulada?: string }): Promise<FilaListaPrecios[]> {
  // fechaSimulada: solo para el modo dry del cron de reajuste — evalúa la
  // vigencia de bonos como si fuera ese día (ART)
  const ahora = opts?.fechaSimulada ? new Date(`${opts.fechaSimulada}T12:00:00Z`) : ahoraArgentina()
  const supabase = createAdminClient()

  const [{ data: prods }, { data: precios }, { data: provs }, { data: cfg }, registrosBase, preciosTienda, ventasDiarias, ventasPropias] =
    await Promise.all([
      supabase.from('compras_productos').select('id, nombre, codigo, categoria, oculto').eq('categoria', 'Celulares'),
      supabase.from('compras_precios').select('producto_id, proveedor_id, precio, created_at').order('created_at', { ascending: false }),
      supabase.from('compras_proveedores').select('id, nombre'),
      supabase.from('flujo_config').select('key, value').like('key', 'listaprecios_%'),
      fetchBonosRegistros(createAdminClient()),
      fetchPreciosTiendaCelulares().catch(() => ({} as Record<string, number>)),
      fetchVentasPorModelo().catch(() => []),
      fetchVentasPropiasPorModelo().catch(() => []),
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
  for (const row of cfg ?? []) {
    const key = row.key as string
    if (key.startsWith(MULTIPLO_KEY)) {
      const valor = Number(row.value)
      if (Number.isFinite(valor) && valor > 0) multiplos[key.slice(MULTIPLO_KEY.length)] = valor
    }
  }

  const registros = await migrarBonosLegacy(supabase, (cfg ?? []) as { key: string; value: string }[], productos, registrosBase)
  const vigentes = bonosVigentesPorProducto(registros, ahora.toISOString().slice(0, 10))
  const bonos: Record<string, BonoModelo> = {}
  for (const [productoId, r] of Object.entries(vigentes)) bonos[productoId] = r

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
        todos = aplicarTodoBono(todos as Record<string, TodoNotas[]>, id, nombre, bono.hasta, Number(bono.monto), ahoraArgentina())
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

  const incluidos = parseIncluidos((cfg ?? []) as { key: string; value: string }[])
  return armarListaPrecios(productos, costosPorProducto, multiplos, preciosTienda, ventas30d, bonos, ahora, ventasPropias, incluidos)
}

/** Catálogo de celulares (no ocultos) para el desplegable "Agregar modelo". */
export async function getModelosCelulares(): Promise<{ id: string; nombre: string }[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('compras_productos')
    .select('id, nombre, oculto')
    .eq('categoria', 'Celulares')
    .order('nombre')
  return (data ?? [])
    .filter(p => !p.oculto)
    .map(p => ({ id: p.id as string, nombre: p.nombre as string }))
}

/** Fija o quita un modelo agregado a mano en la Lista de Precios. */
export async function setModeloFijado(productoId: string, fijado: boolean) {
  const supabase = createAdminClient()
  const { data } = await supabase.from('flujo_config').select('key, value').eq('key', INCLUIDOS_KEY)
  const actuales = parseIncluidos(data as { key: string; value: string }[])
  const nuevos = fijado ? [...new Set([...actuales, productoId])] : actuales.filter(id => id !== productoId)
  const { error } = await supabase.from('flujo_config').upsert({
    key: INCLUIDOS_KEY,
    value: JSON.stringify(nuevos),
    updated_at: new Date().toISOString(),
  })
  if (error) return { error: error.message }
  revalidatePath('/canales/lista-precios')
  return { ok: true }
}

/** Filas de la pestaña Bonos: historial completo de campañas con estado y NC. */
export async function getHistorialBonos(): Promise<FilaHistorialBono[]> {
  const supabase = createAdminClient()
  const [registros, ventasPropias, { data: cfg }] = await Promise.all([
    fetchBonosRegistros(supabase),
    fetchVentasPropiasPorModelo().catch(() => []),
    supabase.from('flujo_config').select('key, value').like('key', `${MULTIPLO_KEY}%`),
  ])
  const multiplos: Record<string, number> = {}
  for (const row of cfg ?? []) {
    const valor = Number(row.value)
    if (Number.isFinite(valor) && valor > 0) multiplos[(row.key as string).slice(MULTIPLO_KEY.length)] = valor
  }
  return armarHistorialBonos(registros, ventasPropias, multiplos, ahoraArgentina())
}

export interface ResultadoSetBono {
  ok?: true
  error?: string
  // Guía para la UI: publicar el precio del modelo ya mismo (bono vigente
  // guardado/editado o bono vigente quitado) o avisar que queda programado
  publicarAhora?: boolean
  bonoFuturo?: string // desde de un bono que todavía no arranca
}

/** Pestaña Notas de crédito: acciones (NC) agrupadas por marca+vigencia. */
export async function getNotasCredito(): Promise<GrupoNC[]> {
  const supabase = createAdminClient()
  const [registros, ventasPropias, { data: cfg }] = await Promise.all([
    fetchBonosRegistros(supabase),
    fetchVentasPropiasPorModelo().catch(() => []),
    supabase.from('flujo_config').select('key, value').like('key', `${MULTIPLO_KEY}%`),
  ])
  const multiplos: Record<string, number> = {}
  for (const row of cfg ?? []) {
    const valor = Number(row.value)
    if (Number.isFinite(valor) && valor > 0) multiplos[(row.key as string).slice(MULTIPLO_KEY.length)] = valor
  }
  return armarNotasCredito(armarHistorialBonos(registros, ventasPropias, multiplos, ahoraArgentina()))
}

/**
 * PDF de detalle de una acción (grupo de la pestaña Notas de crédito): por
 * modelo, cantidad vendida en la vigencia y precio de venta. Se genera al
 * momento y viaja en base64 (queda detrás del login, no se publica a un
 * bucket). Acción en curso: ventas hasta hoy.
 */
export async function generarPdfAccion(bonoIds: string[]) {
  if (!bonoIds.length) return { error: 'Acción vacía' }
  const supabase = createAdminClient()
  const { data } = await supabase.from('lista_precios_bonos').select('*').in('id', bonoIds)
  if (!data || data.length === 0) return { error: 'Acción no encontrada' }
  const registros = (data as BonoRow[]).map(mapBonoRow).sort((a, b) => a.nombreModelo.localeCompare(b.nombreModelo))

  const marca = marcaNC(registros[0].nombreModelo)
  const proveedor = PROVEEDOR_NC[marca] ?? marca
  const desde = registros[0].desde
  const hasta = registros[0].hasta
  const hoy = hoyIso()

  let ventas
  try {
    ventas = await fetchVentasPropiasPorModelo()
  } catch (e) {
    return { error: `No se pudieron leer las ventas de GOcelular: ${e instanceof Error ? e.message : e}` }
  }
  const filas = resumenVentasAccion(registros, ventas, desde, hasta).map((f, i) => ({
    ...f,
    bono: registros[i].monto,
  }))

  const buffer = await renderNcAccion({ marca, proveedor, desde, hasta, filas, generadoEl: hoy })
  const slug = marca.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return {
    ok: true,
    fileName: `nc-accion-${slug}-${desde ?? 'inicio'}-${hasta ?? 'sin-vto'}.pdf`,
    base64: buffer.toString('base64'),
  }
}

/** Checkbox Emitida de una NC: marca/desmarca todas las campañas del grupo. */
export async function setNcEmitida(bonoIds: string[], emitida: boolean) {
  if (!bonoIds.length) return { error: 'Grupo vacío' }
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('lista_precios_bonos')
    .update({ nc_emitida_at: emitida ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .in('id', bonoIds)
  if (error) return { error: error.message }
  revalidatePath('/canales/lista-precios')
  return { ok: true }
}

export async function setBonoListaPrecios(productoId: string, bono: BonoModelo | null): Promise<ResultadoSetBono> {
  const supabase = createAdminClient()
  const registros = (await fetchBonosRegistros(supabase)).filter(r => r.productoId === productoId)
  let vigente: BonoRegistro | null = bonosVigentesPorProducto(registros)[productoId] ?? null
  // bonosVigentesPorProducto también devuelve el próximo futuro (para editarlo)
  const vigenteEsFuturo = !!vigente?.desde && vigente.desde > hoyIso()

  // Una campaña con cupo agotado es historia congelada: no se edita ni se
  // borra — se cierra (hasta = ayer) y lo nuevo va en una fila aparte.
  if (vigente?.cupo) {
    const ventasPropias = await fetchVentasPropiasPorModelo().catch(() => [])
    const [resumen] = armarHistorialBonos([vigente], ventasPropias, {})
    if (resumen.estado === 'agotado') {
      const ayer = new Date(ahoraArgentina().getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      const cierre = vigente.desde && vigente.desde > ayer ? vigente.desde : ayer
      await supabase
        .from('lista_precios_bonos')
        .update({ hasta: cierre, updated_at: new Date().toISOString() })
        .eq('id', vigente.id)
      vigente.hasta = cierre
      vigente = null
    }
  }

  let publicarAhora = false
  let bonoFuturo: string | undefined
  if (!bono || !(Number(bono.monto) > 0)) {
    // Quitar = borrar solo la campaña vigente; el historial queda intacto
    if (vigente) {
      const { error } = await supabase.from('lista_precios_bonos').delete().eq('id', vigente.id)
      if (error) return { error: error.message }
      // Se quitó un bono que estaba rigiendo: hay que reponer el precio pleno
      publicarAhora = !vigenteEsFuturo
    }
  } else {
    // Sin desde se estampa hoy: sin fecha de inicio no se puede contar el cupo
    const desde = bono.desde || vigente?.desde || hoyIso()
    if (bono.hasta && desde > bono.hasta) {
      return { error: 'La vigencia "desde" no puede ser posterior a "hasta"' }
    }
    const solapado = registros.find(r =>
      r.id !== vigente?.id &&
      (!r.hasta || desde <= r.hasta) &&
      (!bono.hasta || !r.desde || r.desde <= bono.hasta),
    )
    if (solapado) {
      return { error: `La vigencia se solapa con otro bono del modelo (${solapado.desde ?? '…'} → ${solapado.hasta ?? 'sin vto'})` }
    }

    const { data: prod } = await supabase.from('compras_productos').select('nombre').eq('id', productoId).single()
    const valores = {
      producto_id: productoId,
      nombre_modelo: (prod?.nombre as string) ?? productoId,
      monto: Number(bono.monto),
      desde,
      hasta: bono.hasta || null,
      cupo: bono.cupo && bono.cupo > 0 ? Math.floor(bono.cupo) : null,
      precio_repuesto_at: null, // editar/extender el bono rearma el reajuste automático
      precio_bono_publicado_at: null, // y la publicación del precio con bono
      updated_at: new Date().toISOString(),
    }
    const { error } = vigente
      ? await supabase.from('lista_precios_bonos').update(valores).eq('id', vigente.id)
      : await supabase.from('lista_precios_bonos').insert(valores)
    if (error) return { error: error.message }
    if (desde > hoyIso()) bonoFuturo = desde
    else publicarAhora = true
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
        ahoraArgentina(),
      )
      await supabase.from('flujo_config').upsert({
        key: 'app_todos',
        value: JSON.stringify(actualizados),
        updated_at: new Date().toISOString(),
      })
    }
  } catch { /* el recordatorio es best-effort: no bloquea el guardado del bono */ }

  return { ok: true, publicarAhora, bonoFuturo }
}

/**
 * Genera el PDF de prueba de ventas de una campaña (fecha, IMEI, modelo, nro
 * de factura; cortado en las primeras `cupo` unidades), lo sube al bucket
 * 'bonos' y persiste la URL en la fila. Regenerable: pisa el archivo anterior.
 */
export async function generarPdfBono(bonoId: string) {
  const supabase = createAdminClient()
  const { data: row } = await supabase.from('lista_precios_bonos').select('*').eq('id', bonoId).single()
  if (!row) return { error: 'Bono no encontrado' }
  const bono = mapBonoRow(row as BonoRow)

  const hoy = hoyIso()
  const desde = bono.desde ?? '2026-03-23'
  const hasta = bono.hasta && bono.hasta < hoy ? bono.hasta : hoy

  let ventas
  try {
    ventas = await fetchVentasPropiasConFactura(desde, hasta)
  } catch (e) {
    return { error: `No se pudieron leer las ventas de GOcelular: ${e instanceof Error ? e.message : e}` }
  }
  const clave = normalizarModelo(bono.nombreModelo)
  const delModelo = ventas.filter(v => normalizarModelo(v.modelo) === clave)
  const reconocidas = recortarVentasACupo(delModelo, bono.cupo)

  const buffer = await renderPruebaVentasBono({
    bono,
    ventas: reconocidas,
    vendidasTotales: delModelo.length,
    generadoEl: hoy,
  })

  const slug = bono.nombreModelo.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const fileName = `bono-${slug}-${desde}-${bono.hasta ?? 'sin-vto'}-${bono.id.slice(0, 8)}.pdf`
  const { error: uploadErr } = await supabase.storage
    .from('bonos')
    .upload(fileName, buffer, { upsert: true, contentType: 'application/pdf' })
  if (uploadErr) return { error: uploadErr.message }

  const { data: urlData } = supabase.storage.from('bonos').getPublicUrl(fileName)
  const { error: updateErr } = await supabase
    .from('lista_precios_bonos')
    .update({ pdf_url: urlData.publicUrl, pdf_generado_at: new Date().toISOString() })
    .eq('id', bonoId)
  if (updateErr) return { error: updateErr.message }

  revalidatePath('/canales/lista-precios')
  return { ok: true, url: urlData.publicUrl, unidades: reconocidas.length }
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

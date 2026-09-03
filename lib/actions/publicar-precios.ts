'use server'

// Publicación de la Lista de Precios en la tienda GOcelular vía la API de
// precios (ver lib/gocelular-prices.ts). Flujo: preview (diff validado por
// GOcelular, sin escribir) → el usuario destilda lo que no quiere tocar →
// apply con las líneas elegidas. El apply es atómico e idempotente del lado
// de GOcelular; acá solo armamos payloads y traducimos errores.

import { buildTimestamp } from '@/lib/gocelular-webhook'
import {
  armarLineasPrecios,
  enviarListaPrecios,
  fetchCatalogoPrecios,
  mapearProductosTienda,
  type LineaPrecio,
  type PricesRespuesta,
} from '@/lib/gocelular-prices'
import { fetchVentasPropiasPorModelo } from '@/lib/gocelular'
import { ahoraArgentina, bonosParaPublicar, bonosParaReajustar } from '@/lib/lista-precios'
import { getListaPrecios, getBonosRegistros, marcarPrecioRepuesto, marcarBonoPublicado, agregarTodosReajuste } from './lista-precios-canales'

const SOURCE = 'consignacion-app'

export interface PreviewPublicacion {
  error?: string
  batchReference?: string
  lineas?: LineaPrecio[]
  respuesta?: PricesRespuesta | null
  status?: number
  sinMapear?: string[]
  excluidas?: string[]
}

export async function previewPublicacionPrecios(): Promise<PreviewPublicacion> {
  const [filas, cat] = await Promise.all([getListaPrecios(), fetchCatalogoPrecios()])
  if (!cat.ok || !cat.body?.products) {
    return { error: `No se pudo leer el catálogo de la tienda (HTTP ${cat.status}${cat.body?.code ? `, ${cat.body.code}` : ''})` }
  }

  const { mapeadas, sinMapear } = mapearProductosTienda(filas, cat.body.products)
  const { lineas, excluidas } = armarLineasPrecios(mapeadas)
  if (lineas.length === 0) {
    return { error: 'Ningún modelo de la lista mapea contra el catálogo de la tienda', sinMapear: sinMapear.map(f => f.nombre) }
  }
  if (lineas.length > 100) {
    return { error: `La lista tiene ${lineas.length} líneas y el máximo por batch es 100` }
  }

  const hoy = new Date()
  const batchReference = `LISTA-${hoy.toISOString().slice(0, 10)}-${hoy.getTime() % 1000000}`
  const r = await enviarListaPrecios({
    batch_reference: batchReference,
    mode: 'preview',
    source: SOURCE,
    timestamp: buildTimestamp(),
    lines: lineas,
  })

  return {
    batchReference,
    lineas,
    respuesta: r.body,
    status: r.status,
    sinMapear: sinMapear.map(f => f.nombre),
    excluidas: excluidas.map(f => f.nombre),
    error: r.ok ? undefined : mensajeError(r.status, r.body),
  }
}

export interface ResultadoPublicacion {
  error?: string
  respuesta?: PricesRespuesta | null
  status?: number
}

/** Aplica las líneas elegidas (mismo contenido que el preview, quizá un subset). */
export async function aplicarPublicacionPrecios(batchReference: string, lineas: LineaPrecio[]): Promise<ResultadoPublicacion> {
  if (!lineas.length) return { error: 'No hay líneas seleccionadas' }
  const r = await enviarListaPrecios({
    batch_reference: batchReference,
    mode: 'apply',
    source: SOURCE,
    timestamp: buildTimestamp(),
    lines: lineas,
  })
  return { respuesta: r.body, status: r.status, error: r.ok ? undefined : mensajeError(r.status, r.body) }
}

/**
 * Núcleo compartido de publicación puntual: manda a la tienda el precio
 * vigente de la lista (con bono si corresponde) SOLO para los productos
 * objetivo. Preview + apply en un paso, sin intervención del usuario.
 */
async function publicarFilasDeProductos(
  objetivos: { productoId: string; nombre: string }[],
  prefijo: string,
): Promise<{
  publicadas: { productoId: string; nombre: string; precio: number; conBono: boolean }[]
  sinPublicar: string[]
  error?: string
}> {
  const ids = new Set(objetivos.map(o => o.productoId))
  const [filas, cat] = await Promise.all([getListaPrecios(), fetchCatalogoPrecios()])
  if (!cat.ok || !cat.body?.products) {
    return { publicadas: [], sinPublicar: [], error: `catálogo HTTP ${cat.status}${cat.body?.code ? ` ${cat.body.code}` : ''}` }
  }

  const filasObjetivo = filas.filter(f => ids.has(f.productoId))
  const enListaIds = new Set(filasObjetivo.map(f => f.productoId))
  const { mapeadas, sinMapear } = mapearProductosTienda(filasObjetivo, cat.body.products)
  const { lineas, excluidas } = armarLineasPrecios(mapeadas)

  const enLinea = new Set(
    mapeadas.filter(m => lineas.some(l => l.store_product_id === m.producto.store_product_id)).map(m => m.fila.productoId),
  )
  const sinPublicar = objetivos
    .filter(o => !enLinea.has(o.productoId))
    .map(o => `${o.nombre} (${
      !enListaIds.has(o.productoId) ? 'no está en la lista'
      : sinMapear.some(f => f.productoId === o.productoId) ? 'sin producto en la tienda'
      : excluidas.some(f => f.productoId === o.productoId) ? 'sin PVP calculable'
      : 'sin línea'})`)
  if (lineas.length === 0) return { publicadas: [], sinPublicar, error: `sin líneas publicables: ${sinPublicar.join('; ')}` }

  const ahora = ahoraArgentina()
  const batchReference = `${prefijo}-${ahora.toISOString().slice(0, 10)}-${ahora.toISOString().slice(11, 19).replace(/:/g, '')}`
  const base = { batch_reference: batchReference, source: SOURCE, timestamp: buildTimestamp(), lines: lineas }
  const prev = await enviarListaPrecios({ ...base, mode: 'preview' })
  if (!prev.ok) return { publicadas: [], sinPublicar, error: mensajeError(prev.status, prev.body) }
  const r = await enviarListaPrecios({ ...base, mode: 'apply' })
  if (!r.ok) return { publicadas: [], sinPublicar, error: mensajeError(r.status, r.body) }

  const publicadas = mapeadas
    .filter(m => enLinea.has(m.fila.productoId))
    .map(m => ({
      productoId: m.fila.productoId,
      nombre: m.fila.nombre,
      precio: (m.fila.pvpConBono ?? m.fila.pvp)!,
      conBono: m.fila.pvpConBono !== null,
    }))
  return { publicadas, sinPublicar }
}

/**
 * Publica ya mismo el precio vigente de UN modelo (con bono si hay; pleno si
 * se quitó) — lo llama la UI al guardar o quitar un bono. Si lo publicado fue
 * el precio con bono, marca la campaña para que el cron no la repita.
 */
export async function publicarPrecioProducto(
  productoId: string,
  nombre: string,
): Promise<{ nombre?: string; precio?: number; conBono?: boolean; error?: string }> {
  const r = await publicarFilasDeProductos([{ productoId, nombre }], 'BONO')
  if (r.error) return { error: r.error }
  const p = r.publicadas.find(x => x.productoId === productoId)
  if (!p) return { error: r.sinPublicar[0] ?? 'sin línea publicable' }

  if (p.conBono) {
    const registros = (await getBonosRegistros()).filter(b => b.productoId === productoId)
    const hoy = ahoraArgentina().toISOString().slice(0, 10)
    await marcarBonoPublicado(bonosParaPublicar(registros, [], hoy).map(b => b.id))
  }
  return { nombre: p.nombre, precio: p.precio, conBono: p.conBono }
}

export interface ResultadoPublicacionBonos {
  hoy: string
  pendientes: string[]
  publicados?: string[]
  sinPublicar?: string[]
  dry?: boolean
  error?: string
}

/**
 * Cron de publicación del precio con bono: campañas que ya arrancaron y no
 * tienen el precio publicado en la tienda (el caso típico: bono cargado ayer
 * con desde hoy — sale en la corrida de las 00:05 ART). También es la red de
 * seguridad si la publicación inline al guardar falló.
 */
export async function publicarBonosIniciados(opts?: { dry?: boolean; fecha?: string }): Promise<ResultadoPublicacionBonos> {
  const hoy = opts?.fecha ?? ahoraArgentina().toISOString().slice(0, 10)
  const [registros, ventasPropias] = await Promise.all([
    getBonosRegistros(),
    fetchVentasPropiasPorModelo().catch(() => []),
  ])
  const aPublicar = bonosParaPublicar(registros, ventasPropias, hoy)
  const pendientes = aPublicar.map(b => b.nombreModelo)
  if (aPublicar.length === 0) return { hoy, pendientes }
  if (opts?.dry) return { hoy, pendientes, dry: true }

  const r = await publicarFilasDeProductos(
    aPublicar.map(b => ({ productoId: b.productoId, nombre: b.nombreModelo })),
    'BONO-CRON',
  )
  if (r.error) {
    await agregarTodosReajuste(aPublicar.map(b => ({
      id: `cron-bono-fail-${b.id}`,
      texto: `Falló la publicación automática del precio con bono — ${b.nombreModelo}: ${r.error}. Publicar a mano desde Lista de Precios.`,
      urgente: true,
    })))
    return { hoy, pendientes, error: r.error }
  }

  const okIds = new Set(r.publicadas.map(p => p.productoId))
  await marcarBonoPublicado(aPublicar.filter(b => okIds.has(b.productoId)).map(b => b.id))
  await agregarTodosReajuste([
    ...r.publicadas.map(p => ({
      id: `cron-bono-ok-${aPublicar.find(b => b.productoId === p.productoId)!.id}`,
      texto: `Precio con bono publicado en la tienda — ${p.nombre}: $${Math.round(p.precio).toLocaleString('es-AR')}`,
      urgente: false,
    })),
    ...aPublicar.filter(b => !okIds.has(b.productoId)).map(b => ({
      id: `cron-bono-fail-${b.id}`,
      texto: `No se pudo publicar el precio con bono — ${b.nombreModelo}: revisar y publicar a mano.`,
      urgente: true,
    })),
  ])
  return { hoy, pendientes, publicados: r.publicadas.map(p => p.nombre), sinPublicar: r.sinPublicar }
}

export interface ResultadoReajuste {
  hoy: string
  pendientes: { modelo: string; motivo: 'vencido' | 'agotado' }[]
  publicados?: string[]
  sinPublicar?: string[]
  dry?: boolean
  respuesta?: PricesRespuesta | null
  error?: string
}

/**
 * Cron de reposición de precio pleno: campañas vencidas (a la medianoche ART
 * del día siguiente al `hasta`) o con cupo agotado (chequeado cada corrida)
 * se publican en la tienda al PVP sin bono. Con dry=true llega hasta el
 * preview y no escribe ni marca nada.
 */
export async function reajustarPreciosBonos(opts?: { dry?: boolean; fecha?: string }): Promise<ResultadoReajuste> {
  const hoy = opts?.fecha ?? ahoraArgentina().toISOString().slice(0, 10)
  const [registros, ventasPropias] = await Promise.all([
    getBonosRegistros(),
    fetchVentasPropiasPorModelo().catch(() => []),
  ])
  const aReajustar = bonosParaReajustar(registros, ventasPropias, hoy)
  const pendientes = aReajustar.map(p => ({ modelo: p.registro.nombreModelo, motivo: p.motivo }))
  if (aReajustar.length === 0) return { hoy, pendientes }

  const [filas, cat] = await Promise.all([
    getListaPrecios(opts?.fecha ? { fechaSimulada: opts.fecha } : undefined),
    fetchCatalogoPrecios(),
  ])
  const fallar = async (error: string): Promise<ResultadoReajuste> => {
    if (!opts?.dry) {
      await agregarTodosReajuste(aReajustar.map(p => ({
        id: `cron-reajuste-fail-${p.registro.id}`,
        texto: `Falló el reajuste automático de precio — ${p.registro.nombreModelo} (${p.motivo}): ${error}. Publicar a mano desde Lista de Precios.`,
        urgente: true,
      })))
    }
    return { hoy, pendientes, error }
  }

  if (!cat.ok || !cat.body?.products) return fallar(`catálogo HTTP ${cat.status}${cat.body?.code ? ` ${cat.body.code}` : ''}`)

  const objetivo = new Map(aReajustar.map(p => [p.registro.productoId, p.registro]))
  const filasObjetivo = filas.filter(f => objetivo.has(f.productoId))
  const { mapeadas, sinMapear } = mapearProductosTienda(filasObjetivo, cat.body.products)
  const { lineas, excluidas } = armarLineasPrecios(mapeadas)

  const enLinea = new Set(mapeadas.filter(m => lineas.some(l => l.store_product_id === m.producto.store_product_id)).map(m => m.fila.productoId))
  const enListaIds = new Set(filasObjetivo.map(f => f.productoId))
  const sinPublicar = aReajustar
    .filter(p => !enLinea.has(p.registro.productoId))
    .map(p => `${p.registro.nombreModelo} (${!enListaIds.has(p.registro.productoId) ? 'no está en la lista' : sinMapear.some(f => f.productoId === p.registro.productoId) ? 'sin producto en la tienda' : excluidas.some(f => f.productoId === p.registro.productoId) ? 'sin PVP calculable' : 'sin línea'})`)

  if (lineas.length === 0) return fallar(`sin líneas publicables: ${sinPublicar.join('; ')}`)

  const ahora = ahoraArgentina()
  const batchReference = `CRON-${hoy}-${ahora.toISOString().slice(11, 19).replace(/:/g, '')}`
  const base = { batch_reference: batchReference, source: SOURCE, timestamp: buildTimestamp(), lines: lineas }

  const prev = await enviarListaPrecios({ ...base, mode: 'preview' })
  if (!prev.ok) return fallar(`preview: ${mensajeError(prev.status, prev.body)}`)
  if (opts?.dry) return { hoy, pendientes, dry: true, respuesta: prev.body, sinPublicar }

  const r = await enviarListaPrecios({ ...base, mode: 'apply' })
  if (!r.ok) return fallar(`apply: ${mensajeError(r.status, r.body)}`)

  const publicadosIds = aReajustar.filter(p => enLinea.has(p.registro.productoId)).map(p => p.registro.id)
  await marcarPrecioRepuesto(publicadosIds)
  await agregarTodosReajuste([
    ...aReajustar.filter(p => enLinea.has(p.registro.productoId)).map(p => ({
      id: `cron-reajuste-ok-${p.registro.id}`,
      texto: `Precio repuesto en tienda — ${p.registro.nombreModelo} (bono ${p.motivo === 'vencido' ? 'vencido' : 'con cupo agotado'})`,
      urgente: false,
    })),
    ...aReajustar.filter(p => !enLinea.has(p.registro.productoId)).map(p => ({
      id: `cron-reajuste-fail-${p.registro.id}`,
      texto: `No se pudo reponer el precio — ${p.registro.nombreModelo}: revisar y publicar a mano.`,
      urgente: true,
    })),
  ])

  return {
    hoy,
    pendientes,
    publicados: aReajustar.filter(p => enLinea.has(p.registro.productoId)).map(p => p.registro.nombreModelo),
    sinPublicar,
    respuesta: r.body,
  }
}

function mensajeError(status: number, body: PricesRespuesta | null): string {
  const code = body?.code
  switch (code) {
    case 'integration_disabled':
      return 'La publicación todavía no está habilitada por GOcelular (fase de integración). El preview funciona; avisale a Pedro que el checklist está completo.'
    case 'price_drift':
      return 'Alguien cambió un precio en la tienda desde que se armó el preview. Cerrá y volvé a previsualizar.'
    case 'product_mismatch':
      return 'Un producto de la tienda cambió de identidad desde el preview. Cerrá y volvé a previsualizar.'
    case 'price_delta_exceeded':
      return 'Un cambio supera el tope de variación (±50%). Revisá el costo/múltiplo de esa línea; si es legítimo, se carga desde el admin de GOcelular.'
    case 'batch_conflict':
      return 'Esta referencia de lista ya se aplicó con otro contenido. Volvé a previsualizar para generar una lista nueva.'
    case 'product_desconocido':
    case 'product_no_elegible':
      return 'El mapeo con la tienda quedó desactualizado. Cerrá y volvé a previsualizar.'
    case 'secret_no_configurado':
      return 'Falta GOCELULAR_WEBHOOK_SECRET en el entorno.'
    default:
      if (status === 0) return 'Sin respuesta de GOcelular (red). Reintentá: si la lista ya se aplicó, el reintento es seguro.'
      if (status >= 500) return `Error temporal de GOcelular (HTTP ${status}). Reintentá en unos minutos.`
      return `GOcelular rechazó la lista (HTTP ${status}${code ? `, ${code}` : ''})`
  }
}

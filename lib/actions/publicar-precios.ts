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
import { getListaPrecios } from './lista-precios-canales'

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

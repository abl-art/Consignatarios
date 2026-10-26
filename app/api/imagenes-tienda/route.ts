import { NextRequest, NextResponse } from 'next/server'
import sharp, { type OutputInfo } from 'sharp'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  LIENZO_TIENDA,
  quitarFondoSolido,
  bboxAlfa,
  encajeEnLienzo,
  evaluarResolucion,
} from '@/lib/imagenes-tienda'

export const maxDuration = 60

const MAX_BYTES = 15 * 1024 * 1024
const MAX_POR_MODELO = 7

// Recibe una imagen cruda (como se bajó de la web), la convierte al formato
// estándar de la tienda (PNG 2000×2000, fondo transparente, producto centrado
// al 85%) y la guarda en el bucket imagenes-tienda bajo el id del producto.
export async function POST(request: NextRequest) {
  try {
    const supabaseAuth = createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const formData = await request.formData()
    const archivo = formData.get('archivo') as File | null
    const productoId = formData.get('productoId') as string | null
    if (!archivo || !productoId) {
      return NextResponse.json({ error: 'Faltan archivo o productoId' }, { status: 400 })
    }
    if (!/^[\w-]+$/.test(productoId)) {
      return NextResponse.json({ error: 'productoId inválido' }, { status: 400 })
    }
    if (archivo.size > MAX_BYTES) {
      return NextResponse.json({ error: 'La imagen supera los 15MB' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { data: existentes, error: errList } = await supabase.storage
      .from('imagenes-tienda')
      .list(productoId, { limit: MAX_POR_MODELO + 1 })
    if (errList) return NextResponse.json({ error: errList.message }, { status: 500 })
    if ((existentes?.length ?? 0) >= MAX_POR_MODELO) {
      return NextResponse.json(
        { error: `Este modelo ya tiene ${MAX_POR_MODELO} imágenes — borrá alguna antes de subir otra` },
        { status: 400 }
      )
    }

    const entrada = Buffer.from(await archivo.arrayBuffer())
    let raw: { data: Buffer; info: OutputInfo }
    try {
      raw = await sharp(entrada).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    } catch {
      return NextResponse.json({ error: 'No se pudo leer la imagen (formato no soportado)' }, { status: 400 })
    }
    const { width: w, height: h } = raw.info

    const fondoRemovido = quitarFondoSolido(raw.data, w, h)
    const bb = bboxAlfa(raw.data, w, h)
    if (!bb) {
      return NextResponse.json(
        { error: 'La imagen quedó vacía al quitar el fondo — probá con otra foto' },
        { status: 400 }
      )
    }

    const cw = bb.maxx - bb.minx + 1
    const ch = bb.maxy - bb.miny + 1

    // El estándar de la tienda lleva el producto a ~1700px: una foto chica
    // estirada sale borrosa, mejor avisar/rechazar que publicar mousse
    const resolucion = evaluarResolucion(cw, ch)
    if (resolucion.nivel === 'rechazo') {
      return NextResponse.json(
        { error: `La foto es demasiado chica para la tienda (el producto mide ${resolucion.ladoMayor}px y se necesita ~1700px) — buscá una versión más grande: en Google Imágenes usá Herramientas → Tamaño → Grande` },
        { status: 400 }
      )
    }

    const encaje = encajeEnLienzo(cw, ch)
    const contenido = await sharp(raw.data, { raw: { width: w, height: h, channels: 4 } })
      .extract({ left: bb.minx, top: bb.miny, width: cw, height: ch })
      .resize(encaje.ancho, encaje.alto, { fit: 'fill' })
      .png()
      .toBuffer()

    const salida = await sharp({
      create: { width: LIENZO_TIENDA, height: LIENZO_TIENDA, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: contenido, left: encaje.left, top: encaje.top }])
      .png()
      .toBuffer()

    const path = `${productoId}/${Date.now()}.png`
    const { error: errUpload } = await supabase.storage
      .from('imagenes-tienda')
      .upload(path, salida, { contentType: 'image/png' })
    if (errUpload) return NextResponse.json({ error: errUpload.message }, { status: 500 })

    const { data: pub } = supabase.storage.from('imagenes-tienda').getPublicUrl(path)
    const advertencia = resolucion.nivel === 'advertencia'
      ? `la foto original es chica (el producto mide ${resolucion.ladoMayor}px, ideal ≥1700px): puede verse algo borrosa en la tienda — revisala en la vista previa`
      : null
    return NextResponse.json({ path, url: pub.publicUrl, fondoRemovido, advertencia })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error inesperado' }, { status: 500 })
  }
}

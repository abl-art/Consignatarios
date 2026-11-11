import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  LIENZO_TIENDA,
  quitarFondoSolido,
  bboxAlfa,
  encajeEnLienzo,
  evaluarResolucion,
  escalaUpscale,
} from '@/lib/imagenes-tienda'
import { upscaleConReplicate } from '@/lib/replicate-upscale'

export const maxDuration = 60

const MAX_BYTES = 15 * 1024 * 1024
const MAX_POR_MODELO = 7

// Decodifica a RGBA, quita el fondo sólido y devuelve el bbox del producto.
// bb null = la imagen quedó vacía al quitar el fondo.
async function prepararContenido(buf: Buffer) {
  const raw = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: w, height: h } = raw.info
  const fondoRemovido = quitarFondoSolido(raw.data, w, h)
  const bb = bboxAlfa(raw.data, w, h)
  return { data: raw.data, w, h, bb, fondoRemovido }
}

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
    let prep
    try {
      prep = await prepararContenido(entrada)
    } catch {
      return NextResponse.json({ error: 'No se pudo leer la imagen (formato no soportado)' }, { status: 400 })
    }
    if (!prep.bb) {
      return NextResponse.json(
        { error: 'La imagen quedó vacía al quitar el fondo — probá con otra foto' },
        { status: 400 }
      )
    }

    let data = prep.data
    let w = prep.w
    let h = prep.h
    let bb = prep.bb
    const fondoRemovido = prep.fondoRemovido
    let cw = bb.maxx - bb.minx + 1
    let ch = bb.maxy - bb.miny + 1
    // El estándar de la tienda lleva el producto a ~1700px.
    let resolucion = evaluarResolucion(cw, ch)
    let upscaled = false

    // Si el producto viene chico, lo agrandamos con Real-ESRGAN (detalle real)
    // en vez de estirarlo borroso o rechazarlo. Si el servicio falla o no hay
    // token, cae al aviso/rechazo de siempre: nunca deja sin poder publicar.
    if (resolucion.nivel !== 'ok' && process.env.REPLICATE_API_TOKEN) {
      const escala = escalaUpscale(cw, ch)
      if (escala) {
        try {
          const agrandada = await upscaleConReplicate(entrada, escala, archivo.type || 'image/png')
          const prep2 = await prepararContenido(agrandada)
          if (prep2.bb) {
            data = prep2.data
            w = prep2.w
            h = prep2.h
            bb = prep2.bb
            cw = bb.maxx - bb.minx + 1
            ch = bb.maxy - bb.miny + 1
            resolucion = evaluarResolucion(cw, ch)
            upscaled = true
          }
        } catch (e) {
          console.error('imagenes-tienda: upscale falló, sigo con la original —', e)
        }
      }
    }

    if (resolucion.nivel === 'rechazo') {
      // Dos causas distintas piden dos consejos distintos: archivo chico
      // (típico: guardaron la miniatura de Google en vez de la imagen grande)
      // vs imagen grande donde el producto ocupa una esquinita (banners)
      const consejo = Math.max(w, h) < 1200
        ? 'el archivo descargado vino chico — en Google Imágenes hacé CLIC en el resultado para abrirlo en el panel grande, esperá a que cargue nítida y recién ahí botón derecho → Guardar imagen (guardar desde la grilla baja una miniatura). Mejor todavía: bajala de la página del fabricante'
        : 'la imagen es grande pero el producto ocupa una parte chica — buscá una foto donde el producto llene el cuadro'
      return NextResponse.json(
        { error: `Foto demasiado chica para la tienda: el archivo es de ${w}×${h}px y el producto mide ${resolucion.ladoMayor}px (se necesita ~1700px). ${consejo}` },
        { status: 400 }
      )
    }

    const encaje = encajeEnLienzo(cw, ch)
    const contenido = await sharp(data, { raw: { width: w, height: h, channels: 4 } })
      .extract({ left: bb.minx, top: bb.miny, width: cw, height: ch })
      .resize(encaje.ancho, encaje.alto, { fit: 'fill' })
      .png()
      .toBuffer()

    const salida = await sharp({
      create: { width: LIENZO_TIENDA, height: LIENZO_TIENDA, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: contenido, left: encaje.left, top: encaje.top }])
      // PNG quantizado (paleta): mantiene el fondo transparente pero baja el peso
      // de ~4MB a ~0,8MB — las imágenes crudas (sobre todo las que pasaron por el
      // upscale) eran demasiado pesadas para el límite de subida de GOmarket.
      .png({ palette: true, quality: 85, effort: 10, compressionLevel: 9 })
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
    return NextResponse.json({ path, url: pub.publicUrl, fondoRemovido, advertencia, upscaled })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error inesperado' }, { status: 500 })
  }
}

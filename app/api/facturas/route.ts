import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import JSZip from 'jszip'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const mes = url.searchParams.get('mes')
  if (!mes) return NextResponse.json({ error: 'mes requerido' }, { status: 400 })

  const supabase = createClient()

  // Obtener liquidaciones del mes con factura
  const { data: liquidaciones } = await supabase
    .from('liquidaciones')
    .select('id, mes, consignatario_id, factura_url, consignatarios(nombre)')
    .eq('mes', mes)
    .not('factura_url', 'is', null)

  if (!liquidaciones || liquidaciones.length === 0) {
    return NextResponse.json({ error: 'No hay facturas para este mes' }, { status: 404 })
  }

  const zip = new JSZip()

  for (const liq of liquidaciones) {
    const nombre = (liq.consignatarios as unknown as { nombre: string })?.nombre || liq.consignatario_id
    const fileName = `${liq.mes}_${nombre}.pdf`

    // Descargar el PDF desde storage
    const storageFileName = `${liq.mes}_${liq.consignatario_id}.pdf`
    const { data: fileData } = await supabase.storage.from('facturas').download(storageFileName)

    if (fileData) {
      const buffer = await fileData.arrayBuffer()
      zip.file(fileName.replace(/\s+/g, '_'), buffer)
    }
  }

  const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' })

  return new NextResponse(zipBuffer, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="facturas_${mes}.zip"`,
    },
  })
}

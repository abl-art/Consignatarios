import { renderToBuffer } from '@react-pdf/renderer'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ActaAuditoriaPDF } from '@/lib/pdf/acta-auditoria'
import type { AuditoriaItem } from '@/lib/types'

type DispositivoConModelos = {
  id: string
  imei: string
  modelos: { marca: string; modelo: string } | null
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params
  const supabase = createClient()

  // Load auditoria
  const { data: auditoria, error: auditoriaError } = await supabase
    .from('auditorias')
    .select('*')
    .eq('id', id)
    .single()

  if (auditoriaError || !auditoria) {
    return NextResponse.json({ error: 'Auditoria no encontrada' }, { status: 404 })
  }

  // Load consignatario
  const { data: consignatario } = await supabase
    .from('consignatarios')
    .select('nombre')
    .eq('id', auditoria.consignatario_id)
    .single()

  // Load auditoria items
  const { data: auditoriaItems } = await supabase
    .from('auditoria_items')
    .select('dispositivo_id, presente')
    .eq('auditoria_id', id)

  // Resolve firma: if it's already a data URL, pass it directly. Otherwise try to fetch it.
  let firmaBase64: string | undefined
  if (auditoria.firma_url) {
    const url = auditoria.firma_url as string
    if (url.startsWith('data:')) {
      firmaBase64 = url
    } else {
      try {
        const res = await fetch(url)
        if (res.ok) {
          const buffer = await res.arrayBuffer()
          const base64 = Buffer.from(buffer).toString('base64')
          const contentType = res.headers.get('content-type') ?? 'image/png'
          firmaBase64 = `data:${contentType};base64,${base64}`
        }
      } catch {
        // firma optional, continue without it
      }
    }
  }

  // Load dispositivos with modelos for all dispositivo_ids in the auditoria
  const dispositivoIds = (auditoriaItems ?? []).map((ai) => (ai as AuditoriaItem).dispositivo_id)

  let items: { imei: string; marca: string; modelo: string; presente: boolean }[] = []
  if (dispositivoIds.length > 0) {
    const { data: dispositivos } = await supabase
      .from('dispositivos')
      .select('id, imei, modelos(marca, modelo)')
      .in('id', dispositivoIds)

    const dispositivoMap = new Map<string, { imei: string; marca: string; modelo: string }>()
    for (const d of (dispositivos ?? []) as unknown as DispositivoConModelos[]) {
      dispositivoMap.set(d.id, {
        imei: d.imei,
        marca: d.modelos?.marca ?? '',
        modelo: d.modelos?.modelo ?? '',
      })
    }

    items = (auditoriaItems as AuditoriaItem[]).map((ai) => {
      const disp = dispositivoMap.get(ai.dispositivo_id)
      return {
        imei: disp?.imei ?? ai.dispositivo_id,
        marca: disp?.marca ?? '—',
        modelo: disp?.modelo ?? '—',
        presente: ai.presente,
      }
    })
  }

  const element = ActaAuditoriaPDF({
    fecha: auditoria.fecha,
    consignatario: consignatario?.nombre ?? auditoria.consignatario_id,
    realizadaPor: auditoria.realizada_por,
    observaciones: auditoria.observaciones,
    firmaBase64,
    items,
    hideImei: auditoria.tipo === 'auto',
  })

  const buffer = await renderToBuffer(element)

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="auditoria-${id}.pdf"`,
    },
  })
}

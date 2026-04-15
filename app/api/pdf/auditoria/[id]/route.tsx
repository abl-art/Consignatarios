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

  if (!auditoriaItems || auditoriaItems.length === 0) {
    // Render empty PDF
    const element = ActaAuditoriaPDF({
      fecha: auditoria.fecha,
      consignatario: consignatario?.nombre ?? auditoria.consignatario_id,
      realizadaPor: auditoria.realizada_por,
      observaciones: auditoria.observaciones,
      items: [],
    })
    const buffer = await renderToBuffer(element)
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="auditoria-${id}.pdf"`,
      },
    })
  }

  // Load dispositivos with modelos for all dispositivo_ids in the auditoria
  const dispositivoIds = (auditoriaItems as AuditoriaItem[]).map((ai) => ai.dispositivo_id)

  const { data: dispositivos } = await supabase
    .from('dispositivos')
    .select('id, imei, modelos(marca, modelo)')
    .in('id', dispositivoIds)

  // Build a lookup map
  const dispositivoMap = new Map<string, { imei: string; marca: string; modelo: string }>()
  for (const d of (dispositivos ?? []) as unknown as DispositivoConModelos[]) {
    const modelo = d.modelos
    dispositivoMap.set(d.id, {
      imei: d.imei,
      marca: modelo?.marca ?? '',
      modelo: modelo?.modelo ?? '',
    })
  }

  // Build items array
  const items = (auditoriaItems as AuditoriaItem[]).map((ai) => {
    const disp = dispositivoMap.get(ai.dispositivo_id)
    return {
      imei: disp?.imei ?? ai.dispositivo_id,
      marca: disp?.marca ?? '',
      modelo: disp?.modelo ?? '',
      presente: ai.presente,
    }
  })

  // Resolve firma
  let firmaBase64: string | undefined
  if (auditoria.firma_url) {
    try {
      const res = await fetch(auditoria.firma_url)
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

  const element = ActaAuditoriaPDF({
    fecha: auditoria.fecha,
    consignatario: consignatario?.nombre ?? auditoria.consignatario_id,
    realizadaPor: auditoria.realizada_por,
    observaciones: auditoria.observaciones,
    firmaBase64,
    items,
  })

  const buffer = await renderToBuffer(element)

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="auditoria-${id}.pdf"`,
    },
  })
}

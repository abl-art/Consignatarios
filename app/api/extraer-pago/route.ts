import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('imagen') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No se envió imagen' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')

    const mimeType = file.type || 'image/jpeg'
    const isPdf = mimeType === 'application/pdf'

    const fileContent = isPdf
      ? {
          type: 'document' as const,
          source: {
            type: 'base64' as const,
            media_type: 'application/pdf' as const,
            data: base64,
          },
        }
      : {
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
            data: base64,
          },
        }

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: [
            fileContent,
            {
              type: 'text',
              text: `Analizá este comprobante de pago argentino (puede ser un echeq, cheque, orden de pago, o transferencia bancaria).

Extraé los siguientes datos:
1. Monto (número, sin símbolo de moneda)
2. Fecha de cobro o fecha de pago (formato YYYY-MM-DD)
3. CUIT del emisor (formato XX-XXXXXXXX-X)
4. Tipo de comprobante: "echeq", "transferencia", "efectivo", u "orden_pago"

Respondé ÚNICAMENTE con un JSON válido, sin markdown, sin texto adicional:
{
  "monto": <numero o null>,
  "fecha_cobro": "<YYYY-MM-DD o null>",
  "cuit_emisor": "<XX-XXXXXXXX-X o null>",
  "tipo_detectado": "<echeq|transferencia|efectivo|orden_pago o null>",
  "confianza": <numero entre 0 y 1>
}

Si no podés extraer un campo, poné null. La confianza es tu nivel de certeza general (0 = nada seguro, 1 = totalmente seguro).`,
            },
          ],
        },
      ],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const parsed = JSON.parse(text)

    return NextResponse.json(parsed)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

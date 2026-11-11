// Upscale de imágenes con Real-ESRGAN vía Replicate. Devuelve el buffer de la
// imagen agrandada (con detalle real, no el estiramiento borroso de sharp).
// Lanza si falta el token o la predicción no termina OK: la API route de
// imágenes-tienda captura el error y cae al comportamiento previo (aviso).

const MODELO = 'nightmareai/real-esrgan'
const VERSION = 'b3ef194191d13140337468c916c2c5b96dd0cb06dffc032a022a31807f6a5ea8'

interface Prediction {
  status: string
  output?: string | string[] | null
  error?: string | null
  detail?: string
}

export async function upscaleConReplicate(
  imagen: Buffer,
  scale: number,
  mime = 'image/png'
): Promise<Buffer> {
  const token = process.env.REPLICATE_API_TOKEN
  if (!token) throw new Error('REPLICATE_API_TOKEN no configurado')

  const dataUri = `data:${mime};base64,${imagen.toString('base64')}`
  const res = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      // Mantiene la request abierta hasta 50s esperando el resultado (el modelo
      // sobre un recorte de producto tarda pocos segundos). Entra holgado en el
      // maxDuration=60 de la route.
      Prefer: 'wait=50',
    },
    body: JSON.stringify({ version: VERSION, input: { image: dataUri, scale, face_enhance: false } }),
  })

  const pred = (await res.json()) as Prediction
  if (!res.ok) throw new Error(`Replicate ${res.status}: ${pred?.detail || pred?.error || 'error'}`)
  if (pred.status !== 'succeeded' || !pred.output) {
    throw new Error(`Upscale ${MODELO}: estado ${pred.status}${pred.error ? ` (${pred.error})` : ''}`)
  }

  const outUrl = Array.isArray(pred.output) ? pred.output[0] : pred.output
  if (!outUrl) throw new Error('Upscale sin URL de salida')
  const img = await fetch(outUrl)
  if (!img.ok) throw new Error(`No se pudo bajar el upscale (${img.status})`)
  return Buffer.from(await img.arrayBuffer())
}

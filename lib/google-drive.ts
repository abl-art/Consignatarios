// Acceso de solo lectura a Google Drive con service account (sin links públicos).
// Emiliano comparte la carpeta de entrevistas con el mail del service account y
// los videos quedan privados. Requiere en env:
//   GOOGLE_SA_EMAIL   → client_email del JSON del service account
//   GOOGLE_SA_PRIVATE_KEY → private_key del JSON (con \n literales o reales)
import { createSign } from 'crypto'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/drive.readonly'

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function driveConfigurado(): boolean {
  return Boolean(process.env.GOOGLE_SA_EMAIL && process.env.GOOGLE_SA_PRIVATE_KEY)
}

async function accessToken(): Promise<string> {
  const email = process.env.GOOGLE_SA_EMAIL
  const key = process.env.GOOGLE_SA_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!email || !key) throw new Error('Faltan GOOGLE_SA_EMAIL / GOOGLE_SA_PRIVATE_KEY en el entorno')
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = b64url(
    JSON.stringify({ iss: email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 })
  )
  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${payload}`)
  const jwt = `${header}.${payload}.${b64url(signer.sign(key))}`
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${jwt}`,
  })
  if (!res.ok) throw new Error(`Token de Google falló (${res.status}): ${await res.text()}`)
  const data = (await res.json()) as { access_token: string }
  return data.access_token
}

export interface DriveArchivo {
  nombre: string
  bytes: number
  stream: ReadableStream<Uint8Array>
}

// Tamaño de cada Range request a Drive. La descarga es PULL-BASED: el chunk
// siguiente se pide recién cuando el consumidor (upload a AssemblyAI) terminó
// de tragarse el anterior → memoria acotada a ~1 chunk aunque Drive entregue
// mucho más rápido de lo que AssemblyAI acepta. Con el stream directo de
// fetch, videos >1 GB acumulaban la diferencia en RAM y la función de Vercel
// moría por memoria sin llegar al catch (filas en 'pendiente' sin error).
const CHUNK_BYTES = 32 * 1024 * 1024

// Descarga el archivo como stream (no lo materializa en memoria).
export async function descargarDeDrive(fileId: string): Promise<DriveArchivo> {
  const token = await accessToken()
  const meta = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,size&supportsAllDrives=true`,
    { headers: { authorization: `Bearer ${token}` } }
  )
  if (!meta.ok) {
    if (meta.status === 404)
      throw new Error(
        'Drive devolvió 404: el archivo no existe o NO está compartido con el service account. Compartí la carpeta de entrevistas con ' +
          (process.env.GOOGLE_SA_EMAIL || 'el mail del service account')
      )
    throw new Error(`Drive metadata falló (${meta.status}): ${await meta.text()}`)
  }
  const info = (await meta.json()) as { name: string; size?: string }
  const total = Number(info.size || 0)
  if (!total) throw new Error('Drive no informó el tamaño del archivo')

  let offset = 0
  let ultimoLogMb = 0
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (offset >= total) {
        controller.close()
        return
      }
      const hasta = Math.min(offset + CHUNK_BYTES, total) - 1
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
        { headers: { authorization: `Bearer ${token}`, range: `bytes=${offset}-${hasta}` } }
      )
      if (!res.ok) throw new Error(`Drive descarga falló (${res.status}) en el byte ${offset}`)
      const chunk = new Uint8Array(await res.arrayBuffer())
      offset += chunk.byteLength
      controller.enqueue(chunk)
      const mb = Math.floor(offset / (256 * 1024 * 1024))
      if (mb > ultimoLogMb) {
        ultimoLogMb = mb
        console.log(
          `descargarDeDrive ${fileId}: ${Math.round(offset / 1e6)}/${Math.round(total / 1e6)} MB, rss ${Math.round(process.memoryUsage().rss / 1e6)} MB`
        )
      }
    },
  })
  return { nombre: info.name, bytes: total, stream }
}

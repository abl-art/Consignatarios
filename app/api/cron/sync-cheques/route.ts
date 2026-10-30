import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Pestaña "Echeqs" referida por gid: el 29/10/2026 la renombraron (era "cheques")
// y gviz con un nombre inexistente NO falla — devuelve la pestaña activa del
// momento (a veces "Echeqs SyC", 1-2 filas con el mismo header), lo que vació
// la tabla. El gid sobrevive renombres.
const SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1fbcEB5o9nERC6BTmf94nVqOsKpJ3KJ6tVG_UPPbuaqg/gviz/tq?tqx=out:csv&gid=426977699'

/**
 * Parse a CSV line handling quoted fields (fields may contain commas and escaped quotes).
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i++ // skip escaped quote
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        fields.push(current)
        current = ''
      } else {
        current += ch
      }
    }
  }
  fields.push(current)
  return fields
}

/**
 * Convert "$1.500.000,00" -> 1500000.00
 */
function parseImporte(raw: string): number {
  const cleaned = raw
    .replace(/\$/g, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')   // remove thousands dots
    .replace(',', '.')    // decimal comma -> dot
  return parseFloat(cleaned)
}

/**
 * Convert "D/M/YYYY" -> "YYYY-MM-DD"
 */
function parseFechaPago(raw: string): string | null {
  const parts = raw.trim().split('/')
  if (parts.length !== 3) return null
  const day = parseInt(parts[0], 10)
  const month = parseInt(parts[1], 10)
  const year = parseInt(parts[2], 10)
  if (!day || !month || !year || year < 2000) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

interface ChequeRow {
  numero_cheque: string
  estado_cheque: string
  cuit: string
  nombre: string
  fecha_pago: string
  importe: number
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // 1+2. Fetch + parse con reintentos: mientras alguien edita el sheet,
    // gviz sirve snapshots erráticos (se midieron 6KB truncos y 19,5MB
    // completos con minutos de diferencia). Se acepta la primera respuesta
    // que supere el piso de filas; las truncas se descartan y se reintenta.
    const MIN_FILAS = 10_000 // el sheet real tiene ~106k filas y solo crece
    const INTENTOS = 3
    let rows: ChequeRow[] = []
    const intentosFallidos: string[] = []

    for (let intento = 1; intento <= INTENTOS; intento++) {
      const res = await fetch(SHEET_URL, { cache: 'no-store' })
      if (!res.ok) {
        intentosFallidos.push(`intento ${intento}: HTTP ${res.status}`)
        continue
      }
      const csv = await res.text()

      const lines = csv.split('\n').filter(l => l.trim().length > 0)
      const parsed: ChequeRow[] = []
      for (let i = 1; i < lines.length; i++) {
        const fields = parseCsvLine(lines[i])

        const numeroCheque = (fields[0] ?? '').trim()
        const estadoCheque = (fields[2] ?? '').trim()
        const cuit = (fields[3] ?? '').trim()
        const nombre = (fields[4] ?? '').trim()
        const fechaPagoRaw = (fields[6] ?? '').trim()
        const importeRaw = (fields[7] ?? '').trim()

        // Skip rows with empty cuit
        if (!cuit) continue

        // Parse and validate fecha_pago
        const fechaPago = parseFechaPago(fechaPagoRaw)
        if (!fechaPago) continue

        // Parse and validate importe
        const importe = parseImporte(importeRaw)
        if (!importe || importe <= 0) continue

        parsed.push({
          numero_cheque: numeroCheque,
          estado_cheque: estadoCheque,
          cuit,
          nombre,
          fecha_pago: fechaPago,
          importe,
        })
      }

      if (parsed.length >= MIN_FILAS) {
        rows = parsed
        break
      }
      intentosFallidos.push(`intento ${intento}: ${csv.length} chars, ${parsed.length} filas válidas`)
    }

    if (rows.length === 0) {
      return NextResponse.json(
        { error: `Ningún intento superó el piso de ${MIN_FILAS} filas (respuesta trunca o pestaña equivocada): ${intentosFallidos.join(' | ')}` },
        { status: 422 }
      )
    }

    // 3. Reemplazo por generaciones: primero se inserta TODO con el synced_at
    // de esta corrida y recién al final se borra la generación anterior. Si la
    // función muere a mitad de camino (el sheet creció a ~90k filas y el
    // delete-primero de antes dejó la tabla truncada el 2/9/2026), la data
    // vieja queda intacta y la corrida siguiente lo reintenta.
    const admin = createAdminClient()
    const now = new Date().toISOString()

    // Guard de sanidad: una respuesta chica de Google (pestaña equivocada,
    // sheet a medio editar) no debe pisar una generación grande ya cargada.
    const { count: existentes } = await admin
      .from('cheques_proveedor')
      .select('*', { count: 'exact', head: true })
    if ((existentes ?? 0) > 1000 && rows.length < (existentes ?? 0) * 0.5) {
      return NextResponse.json(
        { error: `Sanity check: el sheet trajo ${rows.length} filas vs ${existentes} existentes — no se reemplaza nada` },
        { status: 422 }
      )
    }

    const BATCH = 1000
    const CONCURRENCIA = 8
    const rollback = () => admin.from('cheques_proveedor').delete().eq('synced_at', now)

    for (let i = 0; i < rows.length; i += BATCH * CONCURRENCIA) {
      const ola = []
      for (let j = i; j < Math.min(i + BATCH * CONCURRENCIA, rows.length); j += BATCH) {
        ola.push(admin.from('cheques_proveedor').insert(rows.slice(j, j + BATCH).map(r => ({ ...r, synced_at: now }))))
      }
      const resultados = await Promise.all(ola)
      const fallo = resultados.find(r => r.error)
      if (fallo?.error) {
        await rollback()
        return NextResponse.json(
          { error: `Insert batch failed at offset ${i}: ${fallo.error.message}` },
          { status: 500 }
        )
      }
    }

    // Swap: la generación anterior desaparece recién con la nueva completa
    const { error: delErr } = await admin.from('cheques_proveedor').delete().lt('synced_at', now)
    if (delErr) {
      return NextResponse.json({ error: `Delete failed: ${delErr.message}` }, { status: 500 })
    }

    // 4. Upsert last sync timestamp in flujo_config
    await admin
      .from('flujo_config')
      .upsert(
        { key: 'cheques_last_sync', value: now },
        { onConflict: 'key' }
      )

    return NextResponse.json({ ok: true, count: rows.length })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

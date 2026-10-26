import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db-pool'
import { normalizarTac, evaluarTac, type EvaluacionTac } from '@/lib/catalogo-tac'

export const dynamic = 'force-dynamic'

const TOKEN_CATALOGO = 'catalogo2026go'

export interface RespuestaTac extends EvaluacionTac {
  tac: string
  modelo: string | null
  marca: string | null
}

// Buscador público de TACs del catálogo (/catalogo?token=...): mismo token que
// la página. Consulta toda la base de devices de GOcelular (propios y de
// terceros) + la lista de TACs que Trustonic rechazó.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  if (token !== TOKEN_CATALOGO) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

  const tac = normalizarTac(request.nextUrl.searchParams.get('tac') ?? '')
  if (!tac) {
    return NextResponse.json({ error: 'Ingresá el TAC (8 dígitos) o el IMEI completo' }, { status: 400 })
  }

  const pool = getPool()
  if (!pool) return NextResponse.json({ error: 'Base no disponible' }, { status: 500 })

  const client = await pool.connect()
  try {
    const [estados, modelo, listaNegra] = await Promise.all([
      client.query<{ status: string; count: string }>(
        `SELECT trustonic_status AS status, COUNT(*)::text AS count
         FROM devices WHERE LEFT(imei, 8) = $1 AND is_test_device IS NOT TRUE
         GROUP BY 1`,
        [tac]
      ),
      client.query<{ model: string | null; brand: string | null }>(
        `SELECT model, brand FROM devices
         WHERE LEFT(imei, 8) = $1 AND model IS NOT NULL
         GROUP BY 1, 2 ORDER BY COUNT(*) DESC LIMIT 1`,
        [tac]
      ),
      client.query(`SELECT 1 FROM non_enrollable_tacs WHERE tac = $1 LIMIT 1`, [tac]),
    ])

    const evaluacion = evaluarTac({
      estados: estados.rows.map(r => ({ status: r.status, count: Number(r.count) })),
      enListaNegra: (listaNegra.rowCount ?? 0) > 0,
    })

    const respuesta: RespuestaTac = {
      tac,
      modelo: modelo.rows[0]?.model ?? null,
      marca: modelo.rows[0]?.brand ?? null,
      ...evaluacion,
    }
    return NextResponse.json(respuesta)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error inesperado' }, { status: 500 })
  } finally {
    client.release()
  }
}

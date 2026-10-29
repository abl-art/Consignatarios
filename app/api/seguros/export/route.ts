import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/server'
import { getCertificados, getCierreFilas } from '@/lib/actions/seguros'
import { fetchFacturasBPorOrden } from '@/lib/gocelular'
import { COLUMNAS_BROKER, filasBroker } from '@/lib/seguros-informes'

function xlsxResponse(filas: (string | number | null)[][], filename: string): NextResponse {
  const hoja = XLSX.utils.aoa_to_sheet([COLUMNAS_BROKER, ...filas])
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Seguros')
  const buffer: Uint8Array<ArrayBuffer> = new Uint8Array(XLSX.write(libro, { type: 'array', bookType: 'xlsx' }) as Uint8Array)
  const blob = new Blob([buffer])

  return new NextResponse(blob, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

// Export Excel del broker (seguro por robo): las 19 columnas de COLUMNAS_BROKER,
// una fila por certificado emitido (los 'pendiente' no entran). Lee lo ya
// persistido — no corre sincronizarSeguros() — así que refleja el estado al
// último sync (cron de app/api/cron/seguros-sync).
// Con ?cierre=YYYY-MM sirve el Excel CONGELADO de ese cierre mensual
// (seguros_cierres.filas_excel, nunca re-fetchea certificados ni facturas
// vivos); 404 si ese mes no tiene cierre.
export async function GET(request: Request) {
  try {
    const supabaseAuth = createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const cierre = new URL(request.url).searchParams.get('cierre')
    if (cierre) {
      const filasCongeladas = await getCierreFilas(cierre)
      if (filasCongeladas === null) {
        return NextResponse.json({ error: `No hay cierre congelado para ${cierre}` }, { status: 404 })
      }
      return xlsxResponse(filasCongeladas, `seguros-robo-cierre-${cierre}.xlsx`)
    }

    const certificados = await getCertificados()
    const incluidos = certificados.filter((c) => c.estado !== 'pendiente')
    const ordenIds = incluidos.map((c) => c.gocuotasOrderId)
    const facturas = await fetchFacturasBPorOrden(ordenIds)

    const fecha = new Date().toISOString().slice(0, 10)
    return xlsxResponse(filasBroker(incluidos, facturas), `seguros-robo-${fecha}.xlsx`)
  } catch (err: unknown) {
    console.error('Error en /api/seguros/export:', err)
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

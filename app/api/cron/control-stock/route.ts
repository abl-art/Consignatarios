import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchLecturaControlStock } from '@/lib/gocelular'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Corte del control de stock Andreani vs GOcelular. Corre por pg_cron
// (job control-stock-corte) a los :50 de 00/06/12/18 UTC — 6 minutos después
// de cada corrida del job de Pedro (wh_stock_readings) — y guarda el
// comparable GO medido en ese momento junto a la lectura de Andreani.
// Idempotente: si la corrida ya tiene corte no hace nada (la corrida de las
// 00:44 falla siempre, a las 00:50 la última medida ya está corteada).
// Frescura: si la corrida tiene más de 40 minutos no se cortea (el lado GO
// ya no representaría el mismo momento) salvo ?force=1 para siembra manual.
const MAX_EDAD_MIN = 40

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const force = new URL(request.url).searchParams.get('force') === '1'

  const lectura = await fetchLecturaControlStock()
  if (!lectura.runAt) {
    return NextResponse.json({ ok: true, resultado: 'sin corridas medidas en wh_stock_readings' })
  }

  const admin = createAdminClient()
  const { data: existente } = await admin
    .from('control_stock_cortes')
    .select('id')
    .eq('run_at', lectura.runAt)
    .maybeSingle()
  if (existente) {
    return NextResponse.json({ ok: true, resultado: `la corrida ${lectura.runAt} ya tiene corte` })
  }

  const edadMin = (Date.now() - new Date(lectura.runAt).getTime()) / 60000
  if (edadMin > MAX_EDAD_MIN && !force) {
    return NextResponse.json({
      ok: true,
      resultado: `corrida ${lectura.runAt} tiene ${Math.round(edadMin)} min — muy vieja para cortear (el lado GO ya no es comparable)`,
    })
  }

  const { data: corte, error: corteError } = await admin
    .from('control_stock_cortes')
    .insert({
      run_at: lectura.runAt,
      corte_at: new Date().toISOString(),
      en_cola: lectura.enColaPorModelo,
    })
    .select('id')
    .single()
  if (corteError || !corte) {
    return NextResponse.json({ error: corteError?.message ?? 'no se pudo crear el corte' }, { status: 500 })
  }

  const { error: detalleError } = await admin.from('control_stock_cortes_detalle').insert(
    lectura.filas.map(f => ({
      corte_id: corte.id,
      sku: f.sku,
      nombre: f.nombre,
      and_total: f.andTotal,
      and_disponible: f.andDisponible,
      go_andreani: f.goAndreani,
      go_enviados: f.goEnviados,
      go_local: f.goLocal,
      go_transito: f.goTransito,
      dif: f.dif,
      medido: f.medido,
      error: f.error,
    })),
  )
  if (detalleError) {
    await admin.from('control_stock_cortes').delete().eq('id', corte.id)
    return NextResponse.json({ error: detalleError.message }, { status: 500 })
  }

  const medidas = lectura.filas.filter(f => f.medido)
  return NextResponse.json({
    ok: true,
    runAt: lectura.runAt,
    skus: medidas.length,
    conDiferencia: medidas.filter(f => f.dif !== 0).length,
  })
}

import { createClient } from '@/lib/supabase/server'
import VentasView, { type VentaRow } from '@/components/VentasView'
import type { Consignatario } from '@/lib/types'

type RawVenta = {
  id: string
  consignatario_id: string
  store_name: string | null
  fecha_venta: string
  precio_venta: number
  comision_monto: number
  dispositivos: { imei: string; modelos: { marca: string; modelo: string } | null } | null
}

function mesActual(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function formatMesLabel(ym: string): string {
  const [year, month] = ym.split('-')
  const date = new Date(Number(year), Number(month) - 1, 1)
  return date.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
}

export default async function VentasPage({
  searchParams,
}: {
  searchParams: { mes?: string; consignatario?: string }
}) {
  const supabase = createClient()

  const mesFiltro = searchParams.mes ?? mesActual()
  const [year, month] = mesFiltro.split('-').map(Number)
  const inicio = `${mesFiltro}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const fin = `${mesFiltro}-${String(lastDay).padStart(2, '0')}`

  let q = supabase
    .from('ventas')
    .select('id, consignatario_id, store_name, fecha_venta, precio_venta, comision_monto, dispositivos(imei, modelos(marca, modelo))')
    .gte('fecha_venta', inicio)
    .lte('fecha_venta', fin)
    .order('fecha_venta', { ascending: false })

  if (searchParams.consignatario) q = q.eq('consignatario_id', searchParams.consignatario)

  const [{ data: rawVentas }, { data: consignatarios }] = await Promise.all([
    q,
    supabase
      .from('consignatarios')
      .select('id, nombre')
      .order('nombre')
      .returns<Pick<Consignatario, 'id' | 'nombre'>[]>(),
  ])

  const ventas = (rawVentas ?? []) as unknown as RawVenta[]
  const consigList = consignatarios ?? []

  const consigMap = consigList.reduce<Record<string, string>>((m, c) => {
    m[c.id] = c.nombre
    return m
  }, {})

  const rows: VentaRow[] = ventas.map((v) => ({
    id: v.id,
    consignatario_id: v.consignatario_id,
    consignatario_nombre: consigMap[v.consignatario_id] ?? v.consignatario_id,
    store_name: v.store_name,
    fecha_venta: v.fecha_venta,
    imei: v.dispositivos?.imei ?? '—',
    marca: v.dispositivos?.modelos?.marca ?? '—',
    modelo: v.dispositivos?.modelos?.modelo ?? '—',
    precio_venta: v.precio_venta,
    comision_monto: v.comision_monto,
  }))

  // Build last 12 months for dropdown
  const meses: string[] = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Ventas</h1>
      <p className="text-sm text-gray-500 mb-8">Desglose por consignatario y sucursal</p>

      {/* Filter form */}
      <form
        method="GET"
        className="bg-white border border-gray-200 rounded-xl p-4 mb-6 flex flex-wrap gap-3 items-end"
      >
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Mes</label>
          <select
            name="mes"
            defaultValue={mesFiltro}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            {meses.map((m) => (
              <option key={m} value={m}>{formatMesLabel(m)}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Consignatario</label>
          <select
            name="consignatario"
            defaultValue={searchParams.consignatario ?? ''}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm min-w-[180px]"
          >
            <option value="">Todos</option>
            {consigList.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
        >
          Filtrar
        </button>
      </form>

      <VentasView rows={rows} />
    </div>
  )
}

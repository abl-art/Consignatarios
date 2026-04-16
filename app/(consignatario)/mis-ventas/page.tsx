import { createClient } from '@/lib/supabase/server'
import { getCurrentConsignatario } from '@/lib/consignatario-helpers'
import VentasView, { type VentaRow } from '@/components/VentasView'

type RawVenta = {
  id: string
  consignatario_id: string
  store_name: string | null
  fecha_venta: string
  precio_venta: number
  comision_monto: number
  dispositivos: { imei: string; modelos: { marca: string; modelo: string } | null } | null
}

export default async function MisVentasPage({ searchParams }: { searchParams: { mes?: string } }) {
  const consig = await getCurrentConsignatario()
  const supabase = createClient()

  const now = new Date()
  const mesFiltro = searchParams.mes ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const inicio = `${mesFiltro}-01`
  const [year, month] = mesFiltro.split('-').map(Number)
  const fin = new Date(year, month, 0).toISOString().slice(0, 10)

  const { data: ventas } = await supabase
    .from('ventas')
    .select('id, consignatario_id, store_name, fecha_venta, precio_venta, comision_monto, dispositivos(imei, modelos(marca, modelo))')
    .eq('consignatario_id', consig.id)
    .gte('fecha_venta', inicio)
    .lte('fecha_venta', fin)
    .order('fecha_venta', { ascending: false })

  const rows: VentaRow[] = ((ventas ?? []) as unknown as RawVenta[]).map((v) => ({
    id: v.id,
    consignatario_id: v.consignatario_id,
    consignatario_nombre: consig.nombre,
    store_name: v.store_name,
    fecha_venta: v.fecha_venta,
    imei: v.dispositivos?.imei ?? '-',
    marca: v.dispositivos?.modelos?.marca ?? '-',
    modelo: v.dispositivos?.modelos?.modelo ?? '-',
    precio_venta: v.precio_venta,
    comision_monto: v.comision_monto,
  }))

  const meses: string[] = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Mis ventas</h1>
      <p className="text-sm text-gray-500 mb-6">Desglose por sucursal</p>

      <form className="flex gap-3 mb-6 flex-wrap">
        <select name="mes" defaultValue={mesFiltro} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
          {meses.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <button type="submit" className="px-4 py-2 bg-gray-800 text-white text-sm font-medium rounded-lg hover:bg-gray-900">
          Filtrar
        </button>
      </form>

      <VentasView rows={rows} hideConsignatarioLevel />
    </div>
  )
}

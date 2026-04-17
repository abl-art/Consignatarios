import { createClient } from '@/lib/supabase/server'
import { formatearMoneda } from '@/lib/utils'
import { fetchVentasHoy, type VentaDiaria } from '@/lib/gocelular'

export default async function DashboardPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Dashboard360</h1>
      <p className="text-sm text-gray-500 mb-6">Vista general de GOcelular</p>

      <VentasDelDia />
    </div>
  )
}

async function VentasDelDia() {
  const supabase = createClient()
  const { data: consigs } = await supabase.from('consignatarios').select('nombre, store_prefix')
  const prefixes = (consigs ?? [])
    .filter((c: { store_prefix: string | null }) => c.store_prefix)
    .map((c: { nombre: string; store_prefix: string | null }) => ({
      nombre: c.nombre,
      prefix: c.store_prefix!.toLowerCase(),
    }))

  let ventasHoy: VentaDiaria[] = []
  try {
    ventasHoy = await fetchVentasHoy()
  } catch {
    // GOcelular no disponible
  }

  if (ventasHoy.length === 0) return null

  type Canal = 'gocelular' | 'consignatarios' | 'terceros'
  interface VentaClasificada extends VentaDiaria {
    canal: Canal
    consignatarioNombre?: string
  }

  const clasificadas: VentaClasificada[] = ventasHoy.map((v) => {
    const lower = v.store_name.toLowerCase()
    if (lower.startsWith('ecommerce')) {
      return { ...v, canal: 'gocelular' }
    }
    const match = prefixes.find((p) => lower.startsWith(p.prefix))
    if (match) {
      return { ...v, canal: 'consignatarios', consignatarioNombre: match.nombre }
    }
    return { ...v, canal: 'terceros' }
  })

  const canales: { key: Canal; label: string; color: string; borderColor: string; iconColor: string }[] = [
    { key: 'gocelular', label: 'GOcelular', color: 'bg-magenta-50', borderColor: 'border-magenta-200', iconColor: 'text-magenta-700' },
    { key: 'consignatarios', label: 'Consignatarios', color: 'bg-blue-50', borderColor: 'border-blue-200', iconColor: 'text-blue-700' },
    { key: 'terceros', label: 'Terceros', color: 'bg-gray-50', borderColor: 'border-gray-200', iconColor: 'text-gray-700' },
  ]

  const totalVentas = clasificadas.reduce((s, v) => s + v.ventas, 0)
  const totalMonto = clasificadas.reduce((s, v) => s + v.monto, 0)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Ventas del día — GOcelular</h2>
          <p className="text-xs text-gray-500">{totalVentas} ventas · {formatearMoneda(totalMonto)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {canales.map((canal) => {
          const items = clasificadas.filter((v) => v.canal === canal.key)
          const canalVentas = items.reduce((s, v) => s + v.ventas, 0)
          const canalMonto = items.reduce((s, v) => s + v.monto, 0)

          return (
            <div key={canal.key} className={`rounded-xl border ${canal.borderColor} ${canal.color} p-4`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className={`text-sm font-bold ${canal.iconColor}`}>{canal.label}</h3>
                <div className="text-right">
                  <p className="text-lg font-bold text-gray-900">{canalVentas}</p>
                  <p className="text-xs text-gray-500">ventas</p>
                </div>
              </div>
              <p className={`text-xl font-bold ${canal.iconColor}`}>{formatearMoneda(canalMonto)}</p>

              {items.length === 0 && (
                <p className="text-xs text-gray-400 mt-2">Sin ventas hoy</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

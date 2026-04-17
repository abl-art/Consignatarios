import { formatearMoneda } from '@/lib/utils'
import { fetchFlujoDeFondos, fetchAsistencias, fetchEgresos, fetchCuotasStats, fetchEgresosStats } from '@/lib/actions/finanzas'
import { CargarAsistenciaButton, CargarEgresoButton } from './FinanzasActions'
import FinanzasManual from './FinanzasManual'
import FinanzasTabs from './FinanzasTabs'
import EgresosChart from './EgresosChart'

export default async function FinanzasPage({
  searchParams,
}: {
  searchParams: { mes?: string }
}) {
  const now = new Date()
  const defaultMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const mesSeleccionado = searchParams.mes || defaultMes

  const [allFlujo, asistencias, egresosRaw, cuotasStats, egresosStats] = await Promise.all([
    fetchFlujoDeFondos(),
    fetchAsistencias(),
    fetchEgresos(),
    fetchCuotasStats(),
    fetchEgresosStats(),
  ])

  // Filter by selected month (show selected month + 6 months forward)
  const mesStart = mesSeleccionado + '-01'
  const endDate = new Date(parseInt(mesSeleccionado.split('-')[0]), parseInt(mesSeleccionado.split('-')[1]) - 1 + 7, 0)
  const mesEnd = endDate.toISOString().slice(0, 10)
  const flujo = allFlujo.filter(r => r.cash_date >= mesStart && r.cash_date <= mesEnd)

  // Build month selector options (12 months back, 6 forward)
  const meses: string[] = []
  for (let i = -12; i <= 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const formatFecha = (fecha: string) => {
    const d = new Date(fecha + 'T12:00:00')
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  const pctBar = (pct: number, color: string) => (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-2">
        <div className={`${color} h-2 rounded-full`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-xs font-medium text-gray-600 w-12 text-right">{pct.toFixed(1)}%</span>
    </div>
  )

  // Flujo tab content
  const flujoTab = (
    <div>
      {/* Cuotas stats */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Estado de cuotas vencidas ({cuotasStats.total.toLocaleString('es-AR')} cuotas)</h3>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 w-20">Adelantado</span>
            {pctBar(cuotasStats.pct_adelantado, 'bg-emerald-500')}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 w-20">En término</span>
            {pctBar(cuotasStats.pct_en_termino, 'bg-green-500')}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 w-20">Atrasado</span>
            {pctBar(cuotasStats.pct_atrasado, 'bg-yellow-500')}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 w-20">Pendiente</span>
            {pctBar(cuotasStats.pct_pendiente, 'bg-blue-400')}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 w-20">Vencida</span>
            {pctBar(cuotasStats.pct_vencida, 'bg-red-500')}
          </div>
        </div>
      </div>

      {/* Action buttons and filter */}
      <div className="flex flex-wrap gap-3 items-end mb-6">
        <CargarAsistenciaButton />
        <CargarEgresoButton />
        <form method="GET" className="flex items-end gap-3 ml-auto">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">Mes</label>
            <select
              name="mes"
              defaultValue={mesSeleccionado}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              {meses.map((m) => (
                <option key={m} value={m}>{m}</option>
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
      </div>

      {/* Cash flow table */}
      {flujo.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <p className="text-gray-400 text-sm">Sin datos de flujo de fondos para este período.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-8">
          <div className="overflow-y-auto" style={{ maxHeight: '360px' }}>
            <table className="w-full" style={{ fontSize: '11px' }}>
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                <tr>
                  <th className="text-left px-1.5 py-2 font-semibold text-gray-500">Fecha</th>
                  <th className="text-right px-1.5 py-2 font-semibold text-green-600">Adel.</th>
                  <th className="text-right px-1.5 py-2 font-semibold text-green-600">Térm.</th>
                  <th className="text-right px-1.5 py-2 font-semibold text-green-600">Atras.</th>
                  <th className="text-right px-1.5 py-2 font-semibold text-green-600">Pend.</th>
                  <th className="text-right px-1.5 py-2 font-semibold text-green-600">Asist.</th>
                  <th className="text-right px-1.5 py-2 font-semibold text-red-600">Celul.</th>
                  <th className="text-right px-1.5 py-2 font-semibold text-red-600">Licen.</th>
                  <th className="text-right px-1.5 py-2 font-semibold text-red-600">Desc.</th>
                  <th className="text-right px-1.5 py-2 font-semibold text-red-600">Sueld.</th>
                  <th className="text-right px-1.5 py-2 font-semibold text-red-600">Envíos</th>
                  <th className="text-right px-1.5 py-2 font-semibold text-red-600">Inter.</th>
                  <th className="text-right px-1.5 py-2 font-semibold text-red-600">Otros</th>
                  <th className="text-right px-1.5 py-2 font-semibold text-red-600">Vta3</th>
                  <th className="text-right px-1.5 py-2 font-semibold text-gray-700">Neto</th>
                  <th className="text-right px-1.5 py-2 font-semibold text-gray-700">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {flujo.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-1.5 py-1 text-gray-700 font-medium whitespace-nowrap">{formatFecha(row.cash_date)}</td>
                    <td className="px-1.5 py-1 text-right text-green-700">{row.in_adelantado !== 0 ? formatearMoneda(row.in_adelantado) : ''}</td>
                    <td className="px-1.5 py-1 text-right text-green-700">{row.in_en_termino !== 0 ? formatearMoneda(row.in_en_termino) : ''}</td>
                    <td className="px-1.5 py-1 text-right text-green-700">{row.in_atrasado !== 0 ? formatearMoneda(row.in_atrasado) : ''}</td>
                    <td className="px-1.5 py-1 text-right text-green-700">{row.in_pendiente !== 0 ? formatearMoneda(row.in_pendiente) : ''}</td>
                    <td className="px-1.5 py-1 text-right text-green-700">{row.in_asistencia !== 0 ? formatearMoneda(row.in_asistencia) : ''}</td>
                    <td className="px-1.5 py-1 text-right text-red-700">{row.out_celulares !== 0 ? formatearMoneda(row.out_celulares) : ''}</td>
                    <td className="px-1.5 py-1 text-right text-red-700">{row.out_licencias !== 0 ? formatearMoneda(row.out_licencias) : ''}</td>
                    <td className="px-1.5 py-1 text-right text-red-700">{row.out_descartables !== 0 ? formatearMoneda(row.out_descartables) : ''}</td>
                    <td className="px-1.5 py-1 text-right text-red-700">{row.out_sueldos !== 0 ? formatearMoneda(row.out_sueldos) : ''}</td>
                    <td className="px-1.5 py-1 text-right text-red-700">{row.out_envios !== 0 ? formatearMoneda(row.out_envios) : ''}</td>
                    <td className="px-1.5 py-1 text-right text-red-700">{row.out_interes !== 0 ? formatearMoneda(row.out_interes) : ''}</td>
                    <td className="px-1.5 py-1 text-right text-red-700">{row.out_otros !== 0 ? formatearMoneda(row.out_otros) : ''}</td>
                    <td className="px-1.5 py-1 text-right text-red-700">{row.out_vta3ero !== 0 ? formatearMoneda(row.out_vta3ero) : ''}</td>
                    <td className={`px-1.5 py-1 text-right font-bold ${row.net_flow >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatearMoneda(row.net_flow)}</td>
                    <td className={`px-1.5 py-1 text-right font-bold ${row.cash_balance >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatearMoneda(row.cash_balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Manual entries */}
      <FinanzasManual asistencias={asistencias} egresos={egresosRaw} />
    </div>
  )

  // Egresos tab content
  const egresosTab = (
    <div>
      {/* Breakdown by concepto */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Desglose por concepto</h3>
        <div className="space-y-3">
          {egresosStats.breakdown.map((item) => (
            <div key={item.concepto} className="flex items-center gap-3">
              <span className="text-xs text-gray-600 w-24">{item.concepto}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-2.5">
                <div className="bg-red-500 h-2.5 rounded-full" style={{ width: `${Math.min(item.porcentaje, 100)}%` }} />
              </div>
              <span className="text-xs font-medium text-gray-600 w-12 text-right">{item.porcentaje.toFixed(1)}%</span>
              <span className="text-xs font-bold text-red-700 w-28 text-right">{formatearMoneda(item.monto)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Monthly chart */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Egresos mensuales</h3>
        <EgresosChart data={egresosStats.mensual} />
      </div>
    </div>
  )

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Finanzas</h1>
      <p className="text-sm text-gray-500 mb-6">Flujo de fondos y control de caja</p>

      <FinanzasTabs
        tabs={[
          { id: 'flujo', label: 'Flujo de fondos', content: flujoTab },
          { id: 'egresos', label: 'Egresos', content: egresosTab },
        ]}
      />
    </div>
  )
}
